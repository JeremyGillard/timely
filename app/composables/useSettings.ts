// User preferences, persisted locally (like the windows; moves into the vault later).
const STORAGE_KEY = "timesheet-settings";

export interface Settings {
  /** Weekly target, in hours. */
  weeklyTargetH: number;
}
const DEFAULTS: Settings = { weeklyTargetH: 40 };
export const TARGET_MIN_H = 1;
export const TARGET_MAX_H = 100;

export function useSettings() {
  const settings = useState<Settings>("settings", () => ({ ...DEFAULTS }));

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) settings.value = { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) };
    } catch {
      settings.value = { ...DEFAULTS };
    }
  }

  function setWeeklyTarget(hours: number) {
    if (!Number.isFinite(hours)) return;
    const h = Math.min(TARGET_MAX_H, Math.max(TARGET_MIN_H, Math.round(hours)));
    settings.value = { ...settings.value, weeklyTargetH: h };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings.value));
    } catch {
      // storage unavailable — keep in memory
    }
  }

  return { settings, load, setWeeklyTarget };
}
