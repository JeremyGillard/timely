// The week browsed on Week + Stats, kept in the URL (?week=YYYY-MM-DD, Monday) so it's
// shared across those pages, survives reloads and works with back. No param = current week.

export function useSelectedWeek() {
  const route = useRoute();
  const router = useRouter();
  const now = useNow();

  const weekStart = computed(() => parseWeekParam(route.query.week, now.value));
  const weekEnd = computed(() => addDays(weekStart.value, 7));
  const isCurrent = computed(() => weekStart.value === startOfWeek(now.value));
  const label = computed(() => weekLabel(weekStart.value, now.value));
  const range = computed(() =>
    new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).formatRange(
      new Date(weekStart.value),
      new Date(weekEnd.value - 1),
    ),
  );

  function go(ms: number) {
    const { week: _, ...query } = route.query;
    const target = Math.min(startOfWeek(ms), startOfWeek(now.value));
    if (target !== startOfWeek(now.value)) query.week = weekParam(target);
    void router.replace({ query });
  }

  return {
    weekStart,
    weekEnd,
    isCurrent,
    label,
    range,
    prev: () => go(addDays(weekStart.value, -7)),
    next: () => !isCurrent.value && go(addDays(weekStart.value, 7)),
    reset: () => go(now.value),
  };
}
