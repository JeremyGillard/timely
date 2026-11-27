import { emptyLedger, track, type Item, type Kind, type Ledger } from "~/utils/sync";

// Sync ledger (per-record change stamps + tombstones + pull cursor), persisted locally.
// Stores call `record` after every change; useSync pushes whatever ends up dirty.
const STORAGE_KEY = "timesheet-sync-ledger";

export function useLedger() {
  const ledger = useState<Ledger>("sync-ledger", emptyLedger);

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) ledger.value = { ...emptyLedger(), ...(JSON.parse(raw) as Partial<Ledger>) };
    } catch {
      ledger.value = emptyLedger();
    }
  }

  function set(next: Ledger) {
    if (next === ledger.value) return;
    ledger.value = next;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // storage unavailable — keep in memory
    }
  }

  /** Snapshot of every record of `kinds` after a local change. */
  const record = (items: readonly Item[], kinds: Kind[]) =>
    set(track(ledger.value, items, kinds, Date.now()));

  return { ledger, load, set, record };
}
