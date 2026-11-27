// User preferences, persisted locally (like the windows; moves into the vault later).
const STORAGE_KEY = "timesheet-settings";

export interface Settings {
  /** Weekly target, in hours. */
  weeklyTargetH: number;
}
const DEFAULTS: Settings = { weeklyTargetH: 40 };
export const TARGET_MIN_H = 1;
export const TARGET_MAX_H = 100;

/** Sync record id of the settings (one per user). */
const RECORD_ID = "settings";

export function useSettings() {
  const settings = useState<Settings>("settings", () => ({ ...DEFAULTS }));
  const ledger = useLedger();

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings.value));
    } catch {
      // storage unavailable — keep in memory
    }
  }

  // Only once changed by the user: defaults never overwrite another device's settings.
  const recordChange = () => {
    try {
      if (localStorage.getItem(STORAGE_KEY) === null) return;
    } catch {
      return;
    }
    ledger.record([{ id: RECORD_ID, kind: "settings", value: settings.value }], ["settings"]);
  };

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) settings.value = { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) };
    } catch {
      settings.value = { ...DEFAULTS };
    }
    recordChange();
  }

  /** Applies settings pulled from sync. */
  function applyRemote(value: Partial<Settings>) {
    settings.value = { ...DEFAULTS, ...value };
    save();
    recordChange();
  }

  function setWeeklyTarget(hours: number) {
    if (!Number.isFinite(hours)) return;
    const h = Math.min(TARGET_MAX_H, Math.max(TARGET_MIN_H, Math.round(hours)));
    settings.value = { ...settings.value, weeklyTargetH: h };
    save();
    recordChange();
  }

  return { settings, load, setWeeklyTarget, applyRemote };
}
