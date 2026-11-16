export interface TimeEntry {
  id: string;
  date: string; // YYYY-MM-DD
  hours: number;
  note: string;
}

type Status = "loading" | "unsupported" | "empty" | "locked" | "unlocked";

const AUTO_LOCK_MS = 5 * 60_000;

// Data key lives only in client module memory (never in Nuxt state/payload).
let key: CryptoKey | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;

export function useVault() {
  const status = useState<Status>("vault-status", () => "loading");
  const entries = useState<TimeEntry[]>("vault-entries", () => []);
  const error = useState<string | null>("vault-error", () => null);
  const busy = useState("vault-busy", () => false);

  const touch = () => {
    clearTimeout(timer);
    if (key) timer = setTimeout(lock, AUTO_LOCK_MS);
  };

  async function run(fn: () => Promise<void>) {
    error.value = null;
    busy.value = true;
    try {
      await fn();
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
    } finally {
      busy.value = false;
    }
  }

  const init = () =>
    run(async () => {
      if (!isSupported()) {
        status.value = "unsupported";
        return;
      }
      await navigator.storage.persist?.();
      status.value = (await readMeta()) ? "locked" : "empty";
    });

  const create = (name: string) =>
    run(async () => {
      key = await createVault(name);
      entries.value = [];
      status.value = "unlocked";
      touch();
    });

  const unlock = () =>
    run(async () => {
      const meta = await readMeta();
      if (!meta) throw new VaultError("No vault found");
      key = await unlockVault(meta);
      entries.value = await readData<TimeEntry[]>(key);
      status.value = "unlocked";
      touch();
    });

  function lock() {
    clearTimeout(timer);
    key = null;
    entries.value = [];
    if (status.value === "unlocked") status.value = "locked";
  }

  const save = async (next: TimeEntry[]) => {
    if (!key) throw new VaultError("Vault is locked");
    await writeData(key, next);
    entries.value = next;
    touch();
  };

  const add = (e: Omit<TimeEntry, "id">) =>
    run(() =>
      save(
        [...entries.value, { ...e, id: crypto.randomUUID() }].sort((a, b) =>
          b.date.localeCompare(a.date),
        ),
      ),
    );

  const remove = (id: string) => run(() => save(entries.value.filter((e) => e.id !== id)));

  const reset = () =>
    run(async () => {
      lock();
      await destroyVault();
      status.value = "empty";
    });

  return { status, entries, error, busy, init, create, unlock, lock, add, remove, reset };
}
