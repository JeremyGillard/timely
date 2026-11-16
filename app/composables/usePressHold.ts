/**
 * Distinguishes a tap from a long press on one element.
 * Release before `holdMs` → onTap. Held for `holdMs` → onHold (and the release is ignored).
 * Moving off the element / pointer cancel aborts without firing either.
 */
export function usePressHold(opts: {
  holdMs: number;
  canHold: () => boolean;
  onTap: () => void;
  onHold: () => void;
}) {
  const holding = ref(false);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pressed = false;
  let fired = false;

  function start() {
    if (pressed) return;
    pressed = true;
    fired = false;
    if (!opts.canHold()) return;
    holding.value = true;
    timer = setTimeout(() => {
      fired = true;
      holding.value = false;
      opts.onHold();
    }, opts.holdMs);
  }

  function end() {
    if (!pressed) return;
    pressed = false;
    clearTimeout(timer);
    holding.value = false;
    if (!fired) opts.onTap();
  }

  function cancel() {
    pressed = false;
    clearTimeout(timer);
    holding.value = false;
  }

  onBeforeUnmount(cancel);

  return { holding, start, end, cancel };
}
