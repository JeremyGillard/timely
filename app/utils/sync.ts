// Sync bookkeeping, independent of storage and network (so it's unit-testable).
//
// The ledger remembers, per record id, when it last changed and what it looked like, so
// stores don't have to stamp every mutation: they hand over a snapshot and `track` works out
// what's new, changed or gone. Merging is last-writer-wins per record on `at` (epoch ms).

export type Kind = "window" | "tag" | "settings";

export interface Item {
  id: string;
  kind: Kind;
  value: unknown;
}

export interface LedgerEntry {
  kind: Kind;
  /** Last change, epoch ms (local clock, or the remote writer's). */
  at: number;
  /** JSON of the value at that time; empty for tombstones. */
  hash: string;
  deleted?: true;
}

export interface Ledger {
  entries: Record<string, LedgerEntry>;
  /** Ids changed locally and not pushed yet. */
  dirty: string[];
  /** Server time of the newest row pulled (ISO), null before the first pull. */
  cursor: string | null;
}

export const emptyLedger = (): Ledger => ({ entries: {}, dirty: [], cursor: null });

const addDirty = (dirty: string[], ids: Iterable<string>) => [...new Set([...dirty, ...ids])];

/**
 * Compares a snapshot of every record of `kinds` with the ledger: new or changed records are
 * stamped `now` and marked dirty; records of those kinds missing from it become tombstones.
 * Returns the same ledger object when nothing changed.
 */
export function track(ledger: Ledger, items: readonly Item[], kinds: Kind[], now: number): Ledger {
  const entries = { ...ledger.entries };
  const changed: string[] = [];
  const seen = new Set<string>();
  for (const { id, kind, value } of items) {
    seen.add(id);
    const hash = JSON.stringify(value);
    const prev = entries[id];
    if (prev && !prev.deleted && prev.hash === hash) continue;
    entries[id] = { kind, at: Math.max(now, (prev?.at ?? 0) + 1), hash };
    changed.push(id);
  }
  for (const [id, e] of Object.entries(entries)) {
    if (seen.has(id) || e.deleted || !kinds.includes(e.kind)) continue;
    entries[id] = { kind: e.kind, at: Math.max(now, e.at + 1), hash: "", deleted: true };
    changed.push(id);
  }
  if (!changed.length) return ledger;
  return { ...ledger, entries, dirty: addDirty(ledger.dirty, changed) };
}

export interface RemoteRecord {
  id: string;
  kind: Kind;
  at: number;
  deleted: boolean;
  /** Decrypted value; absent for tombstones. */
  value?: unknown;
}

export interface MergeResult {
  ledger: Ledger;
  /** Remote records that win: apply them to the stores. */
  upserts: Item[];
  deletes: { id: string; kind: Kind }[];
}

/** Applies pulled records that are newer than what we have (ties keep the local one). */
export function mergeRemote(ledger: Ledger, records: readonly RemoteRecord[]): MergeResult {
  const entries = { ...ledger.entries };
  const won = new Set<string>();
  const upserts: Item[] = [];
  const deletes: MergeResult["deletes"] = [];
  for (const r of records) {
    const local = entries[r.id];
    if (local && local.at >= r.at) continue;
    won.add(r.id);
    if (r.deleted) {
      entries[r.id] = { kind: r.kind, at: r.at, hash: "", deleted: true };
      deletes.push({ id: r.id, kind: r.kind });
    } else {
      entries[r.id] = { kind: r.kind, at: r.at, hash: JSON.stringify(r.value) };
      upserts.push({ id: r.id, kind: r.kind, value: r.value });
    }
  }
  return {
    ledger: { ...ledger, entries, dirty: ledger.dirty.filter((id) => !won.has(id)) },
    upserts,
    deletes,
  };
}

/** After a push: drops the pushed ids from `dirty`, unless they changed again meanwhile. */
export function markPushed(ledger: Ledger, pushed: ReadonlyMap<string, number>): Ledger {
  return {
    ...ledger,
    dirty: ledger.dirty.filter((id) => ledger.entries[id]?.at !== pushed.get(id)),
  };
}

/** Marks every known record dirty (e.g. after signing in to another account). */
export function markAllDirty(ledger: Ledger): Ledger {
  return { ...ledger, dirty: Object.keys(ledger.entries), cursor: null };
}

/** Upserts `items` into `list` by id and removes `deleteIds`. */
export function applyById<T extends { id: string }>(
  list: readonly T[],
  items: readonly T[],
  deleteIds: ReadonlySet<string>,
): T[] {
  const byId = new Map(list.map((x) => [x.id, x]));
  for (const id of deleteIds) byId.delete(id);
  for (const x of items) byId.set(x.id, x);
  return [...byId.values()];
}

/**
 * Two devices may each have a running window after a merge: keep only the latest running,
 * closing the others where the next window starts.
 */
export function closeExtraRunning<T extends { start: number; end: number | null }>(
  sorted: readonly T[],
): T[] {
  const running = sorted.filter((w) => w.end === null);
  if (running.length < 2) return [...sorted];
  const latest = running.at(-1)!;
  return sorted.map((w, i) =>
    w.end === null && w !== latest ? { ...w, end: sorted[i + 1]!.start } : w,
  );
}
