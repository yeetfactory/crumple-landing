import { hasBegun } from './store';

const GESTURE_THRESHOLD = 24;
const GESTURE_IDLE_MS = 180;

// Matches the `nudge` animation in styles.css.
const NUDGE_MS = 700;

const SCROLL_KEYS = new Set([
  'ArrowDown',
  'ArrowUp',
  'PageDown',
  'PageUp',
  'Home',
  'End',
  ' ',
]);

/**
 * Hold the page at the top until the visitor presses YEET. Trying to scroll first only nudges the
 * button, so it's clear what to do and the page doesn't look frozen. Once released, the gate is
 * gone for the rest of the visit.
 */
export function createIntroGate() {
  const root = document.documentElement;

  // Preserve restored positions and anchor navigation; reduced motion skips the entrance.
  let locked =
    !hasBegun() &&
    scrollY === 0 &&
    !location.hash &&
    !matchMedia('(prefers-reduced-motion: reduce)').matches;

  let revealed = false;
  let lastGesture = -Infinity;
  let wheelDistance = 0;
  let touchY: number | null = null;
  const heldKeys = new Set<string>();
  let releaseTimer: ReturnType<typeof setTimeout> | undefined;
  let nudgeTimer: ReturnType<typeof setTimeout> | undefined;

  function detach() {
    removeEventListener('wheel', onWheel, true);
    removeEventListener('touchstart', onTouchStart, true);
    removeEventListener('touchmove', onTouchMove, true);
    removeEventListener('touchend', onTouchEnd, true);
    removeEventListener('touchcancel', onTouchEnd, true);
    removeEventListener('keydown', onKeyDown, true);
    removeEventListener('keyup', onKeyUp, true);
    removeEventListener('blur', onBlur);
  }

  function unlock() {
    locked = false;
    clearTimeout(releaseTimer);
    clearTimeout(nudgeTimer);
    delete root.dataset.introLocked;
    delete root.dataset.nudge;
    detach();
  }

  function releaseWhenIdle() {
    clearTimeout(releaseTimer);

    if (!locked || !revealed || touchY !== null || heldKeys.size) return;
    const remaining = GESTURE_IDLE_MS - (performance.now() - lastGesture);

    if (remaining > 0) releaseTimer = setTimeout(releaseWhenIdle, remaining);
    else unlock();
  }

  /** Point at the button. A nudge already playing runs to the end rather than restarting. */
  function nudge() {
    if (hasBegun() || root.dataset.nudge) return;
    root.dataset.nudge = 'true';
    nudgeTimer = setTimeout(() => delete root.dataset.nudge, NUDGE_MS);
  }

  function consume(event: Event) {
    event.preventDefault();
    lastGesture = performance.now();
    releaseWhenIdle();
  }

  function onWheel(event: WheelEvent) {
    // Leave browser zoom gestures alone.
    if (event.ctrlKey || event.metaKey) return;

    if (performance.now() - lastGesture > GESTURE_IDLE_MS) wheelDistance = 0;
    consume(event);

    const unit =
      event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? innerHeight : 1;

    wheelDistance = Math.max(0, wheelDistance + event.deltaY * unit);

    if (wheelDistance >= GESTURE_THRESHOLD) {
      wheelDistance = 0;
      nudge();
    }
  }

  function onTouchStart(event: TouchEvent) {
    touchY = event.touches.length === 1 ? event.touches[0].clientY : null;
  }

  function onTouchMove(event: TouchEvent) {
    if (touchY === null || event.touches.length !== 1) return;
    consume(event);

    if (touchY - event.touches[0].clientY >= GESTURE_THRESHOLD) nudge();
  }

  function onTouchEnd(event: TouchEvent) {
    if (event.touches.length) return;
    touchY = null;
    lastGesture = performance.now();
    releaseWhenIdle();
  }

  function onKeyDown(event: KeyboardEvent) {
    if (
      !SCROLL_KEYS.has(event.key) ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey
    )
      return;
    const target = event.target;

    if (
      target instanceof HTMLElement &&
      (target.isContentEditable ||
        target.closest('input, textarea, select') ||
        (event.key === ' ' && target.closest('button, a, [role="button"]')))
    )
      return;
    heldKeys.add(event.key);
    consume(event);

    if (
      ['ArrowDown', 'PageDown', 'End'].includes(event.key) ||
      (event.key === ' ' && !event.shiftKey)
    )
      nudge();
  }

  function onKeyUp(event: KeyboardEvent) {
    if (!heldKeys.delete(event.key)) return;
    lastGesture = performance.now();
    releaseWhenIdle();
  }

  function onBlur() {
    heldKeys.clear();
    touchY = null;
    releaseWhenIdle();
  }

  if (locked) {
    root.dataset.introLocked = 'true';
    addEventListener('wheel', onWheel, { passive: false, capture: true });
    addEventListener('touchstart', onTouchStart, {
      passive: true,
      capture: true,
    });
    addEventListener('touchmove', onTouchMove, {
      passive: false,
      capture: true,
    });
    addEventListener('touchend', onTouchEnd, { passive: true, capture: true });
    addEventListener('touchcancel', onTouchEnd, {
      passive: true,
      capture: true,
    });
    addEventListener('keydown', onKeyDown, true);
    addEventListener('keyup', onKeyUp, true);
    addEventListener('blur', onBlur);
  }

  return {
    complete() {
      revealed = true;
      releaseWhenIdle();
    },
    // Failure and unmount must always leave a scrollable page.
    destroy: unlock,
  };
}
