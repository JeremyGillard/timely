// One shared 1 s clock for every page/component (single interval, client-only).
let timer: ReturnType<typeof setInterval> | undefined;

export function useNow() {
  const now = useState("now", () => Date.now());
  if (import.meta.client && !timer) {
    now.value = Date.now();
    timer = setInterval(() => (now.value = Date.now()), 1000);
  }
  return now;
}
