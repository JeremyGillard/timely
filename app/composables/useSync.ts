import type { Settings } from "./useSettings";
import { deleteKey, loadKey, saveKey } from "../utils/keyStore";
import { supabase } from "../utils/supabase";
import { markAllDirty, markPushed, mergeRemote, type Kind, type RemoteRecord } from "../utils/sync";
import {
  createSyncVault,
  openRecord,
  sealRecord,
  unlockVault,
  unlockWithRecovery,
  VaultError,
  type VaultMeta,
} from "../utils/vault";

// Optional, end-to-end encrypted sync (Supabase). Off until the user signs in from the sync
// sheet; then every local change is pushed and remote changes are pulled in the background.
//
//   off       not signed in: the app is purely local
//   need-key  signed in, but this device doesn't have the data key yet (passkey / recovery key)
//   on        syncing

type Status = "loading" | "off" | "need-key" | "on";

interface Row {
  id: string;
  kind: Kind;
  updated_at: number;
  deleted: boolean;
  payload: string | null;
  server_updated_at: string;
}

const OWNER_KEY = "timesheet-sync-owner"; // user id the local ledger was last synced with
const PAGE = 1000;
const CURSOR_OVERLAP_MS = 5_000; // re-pull a little: commits can land slightly out of order
const PUSH_DEBOUNCE_MS = 1_500;
const PERIODIC_MS = 5 * 60_000;

// Client-module memory only (never in Nuxt state).
let key: CryptoKey | null = null;
let meta: VaultMeta | null = null;
let running: Promise<void> | null = null;
let again = false;
let debounce: ReturnType<typeof setTimeout> | undefined;

const aad = (kind: Kind, id: string) => `${kind}:${id}`;
const message = (e: unknown) =>
  !navigator.onLine ? "You're offline" : e instanceof Error ? e.message : String(e);

export function useSync() {
  const status = useState<Status>("sync-status", () => "loading");
  const email = useState<string | null>("sync-email", () => null);
  /** When status is need-key: whether this account already has a key to unlock. */
  const hasVault = useState("sync-has-vault", () => false);
  const hasPasskey = useState("sync-has-passkey", () => false);
  const syncing = useState("sync-syncing", () => false);
  const lastSync = useState<number | null>("sync-last", () => null);
  const error = useState<string | null>("sync-error", () => null);

  const ledger = useLedger();
  const timeWindows = useTimeWindows();
  const prefs = useSettings();

  // ---------- auth ----------

  async function init() {
    try {
      // Don't load the client (or touch the network) for people who never turned sync on.
      const hasSession = Object.keys(localStorage).some((k) => /^sb-.*-auth-token$/.test(k));
      if (!hasSession) {
        status.value = "off";
        return;
      }
      const { data } = await supabase().auth.getSession();
      if (!data.session) {
        status.value = "off";
        return;
      }
      await afterSignIn(data.session.user.id, data.session.user.email ?? null);
    } catch (e) {
      error.value = message(e);
      status.value = "off";
    }
  }

  async function sendCode(address: string) {
    const { error: err } = await supabase().auth.signInWithOtp({
      email: address,
      options: { shouldCreateUser: true },
    });
    if (err) throw err;
  }

  async function verifyCode(address: string, code: string) {
    const { data, error: err } = await supabase().auth.verifyOtp({
      email: address,
      token: code,
      type: "email",
    });
    if (err) throw err;
    if (!data.user) throw new Error("Sign-in failed");
    await afterSignIn(data.user.id, data.user.email ?? address);
  }

  async function afterSignIn(userId: string, address: string | null) {
    email.value = address;
    // Another account than the one this device last synced with: push everything to it.
    if (localStorage.getItem(OWNER_KEY) !== userId) {
      ledger.set(markAllDirty(ledger.ledger.value));
      localStorage.setItem(OWNER_KEY, userId);
      await deleteKey();
    }
    key = await loadKey();
    if (key) {
      status.value = "on";
      void syncNow();
      return;
    }
    await fetchMeta();
    status.value = "need-key";
  }

  async function fetchMeta() {
    const { data, error: err } = await supabase().from("vault_meta").select("meta").maybeSingle();
    if (err) throw err;
    meta = (data?.meta as VaultMeta | undefined) ?? null;
    hasVault.value = meta !== null;
    hasPasskey.value = (meta?.credentials.length ?? 0) > 0;
  }

  // ---------- data key ----------

  async function adoptKey(k: CryptoKey) {
    key = k;
    await saveKey(k);
    status.value = "on";
    void syncNow();
  }

  /** First device: new data key + passkey (or recovery key only). Returns the recovery key. */
  async function createKey(withPasskey: boolean): Promise<string> {
    const created = await createSyncVault(withPasskey ? (email.value ?? "Timely") : null);
    const { error: err } = await supabase().from("vault_meta").insert({ meta: created.meta });
    if (err) {
      if (err.code === "23505") {
        // another device set it up meanwhile
        await fetchMeta();
        throw new VaultError("This account already has a key: unlock it instead");
      }
      throw err;
    }
    meta = created.meta;
    await adoptKey(created.key);
    return created.recoveryKey;
  }

  async function unlockWithPasskey() {
    if (!meta) await fetchMeta();
    if (!meta) throw new VaultError("No key for this account yet");
    await adoptKey(await unlockVault(meta));
  }

  async function unlockWithRecoveryKey(recoveryKey: string) {
    if (!meta) await fetchMeta();
    if (!meta) throw new VaultError("No key for this account yet");
    await adoptKey(await unlockWithRecovery(meta, recoveryKey));
  }

  /** Stops syncing on this device. Local data stays. */
  async function signOut() {
    clearTimeout(debounce);
    await running;
    await supabase().auth.signOut({ scope: "local" });
    await deleteKey();
    key = null;
    meta = null;
    email.value = null;
    error.value = null;
    lastSync.value = null;
    status.value = "off";
  }

  // ---------- sync ----------

  /** Pulls then pushes; concurrent calls coalesce into one extra run. */
  function syncNow(): Promise<void> {
    if (running) {
      again = true;
      return running;
    }
    running = (async () => {
      syncing.value = true;
      try {
        do {
          again = false;
          await pull();
          await push();
        } while (again);
        error.value = null;
        lastSync.value = Date.now();
      } catch (e) {
        error.value = message(e);
      } finally {
        syncing.value = false;
        running = null;
      }
    })();
    return running;
  }

  async function pull() {
    if (!key) return;
    const k = key;
    const cursor = ledger.ledger.value.cursor;
    const since = cursor ? new Date(Date.parse(cursor) - CURSOR_OVERLAP_MS).toISOString() : null;
    let newest = cursor;
    for (let from = 0; ; from += PAGE) {
      let q = supabase()
        .from("records")
        .select("id, kind, updated_at, deleted, payload, server_updated_at")
        .order("server_updated_at")
        .order("id")
        .range(from, from + PAGE - 1);
      if (since) q = q.gt("server_updated_at", since);
      const { data: page, error: err } = await q;
      if (err) throw err;
      const data = page as Row[];

      const records: RemoteRecord[] = [];
      for (const r of data) {
        if (!newest || Date.parse(r.server_updated_at) > Date.parse(newest))
          newest = r.server_updated_at;
        if (r.deleted || !r.payload) {
          records.push({ id: r.id, kind: r.kind, at: Number(r.updated_at), deleted: true });
          continue;
        }
        try {
          const value = await openRecord(k, aad(r.kind, r.id), r.payload);
          records.push({ id: r.id, kind: r.kind, at: Number(r.updated_at), deleted: false, value });
        } catch {
          console.warn(`[sync] skipped a record that failed to decrypt (${r.id})`);
        }
      }
      apply(records);
      if (data.length < PAGE) break;
    }
    if (newest !== cursor) ledger.set({ ...ledger.ledger.value, cursor: newest });
  }

  function apply(records: RemoteRecord[]) {
    if (!records.length) return;
    const { ledger: next, upserts, deletes } = mergeRemote(ledger.ledger.value, records);
    ledger.set(next); // first, so the stores' own tracking sees the applied values as unchanged
    const settings = upserts.find((u) => u.kind === "settings");
    if (settings) prefs.applyRemote(settings.value as Partial<Settings>);
    const rest = upserts.filter((u) => u.kind !== "settings");
    if (rest.length || deletes.length) timeWindows.applyRemote(rest, deletes);
  }

  async function push() {
    if (!key) return;
    const { entries, dirty } = ledger.ledger.value;
    if (!dirty.length) return;
    const { data: auth } = await supabase().auth.getSession();
    const userId = auth.session?.user.id;
    if (!userId) throw new Error("Signed out");

    const values = new Map<string, unknown>([
      ...timeWindows.windows.value.map((w) => [w.id, w] as const),
      ...timeWindows.tags.value.map((t) => [t.id, t] as const),
      ["settings", prefs.settings.value],
    ]);
    const pushed = new Map<string, number>();
    const rows = [];
    for (const id of dirty) {
      const e = entries[id];
      if (!e) continue;
      const value = values.get(id);
      if (!e.deleted && value === undefined) continue;
      rows.push({
        user_id: userId,
        id,
        kind: e.kind,
        updated_at: e.at,
        deleted: !!e.deleted,
        payload: e.deleted ? null : await sealRecord(key, aad(e.kind, id), value),
      });
      pushed.set(id, e.at);
    }
    for (let i = 0; i < rows.length; i += 500) {
      const { error: err } = await supabase()
        .from("records")
        .upsert(rows.slice(i, i + 500), { onConflict: "user_id,id" });
      if (err) throw err;
    }
    ledger.set(markPushed(ledger.ledger.value, pushed));
  }

  /** Background triggers: local changes, coming back to the app, going online, every 5 min. */
  function start() {
    watch(
      () => ledger.ledger.value.dirty.length,
      (n) => {
        if (status.value !== "on" || !n) return;
        clearTimeout(debounce);
        debounce = setTimeout(() => void syncNow(), PUSH_DEBOUNCE_MS);
      },
    );
    const poke = () => {
      if (status.value === "on" && document.visibilityState === "visible") void syncNow();
    };
    document.addEventListener("visibilitychange", poke);
    window.addEventListener("online", poke);
    setInterval(poke, PERIODIC_MS);
    void init();
  }

  return {
    status,
    email,
    hasVault,
    hasPasskey,
    syncing,
    lastSync,
    error,
    start,
    sendCode,
    verifyCode,
    createKey,
    unlockWithPasskey,
    unlockWithRecoveryKey,
    signOut,
    syncNow,
  };
}
