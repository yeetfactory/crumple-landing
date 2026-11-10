/** Pure scroll maths, shared by the 3D line and the DOM panel so they never disagree. */

export const CRATE_COUNT = 3;
const STAGGER = 0.5;
export const TIMELINE_SPAN = 1 + (CRATE_COUNT - 1) * STAGGER;

/** Phase boundaries inside one crate's 0..1 life. */
export const PHASE = {
  reachPress: 0.35,
  stamped: 0.42,
  leavePress: 0.5,
  reachFlipper: 0.8,
} as const;

export const clamp = (v: number, lo = 0, hi = 1) =>
  Math.min(hi, Math.max(lo, v));

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export const remap = (v: number, a: number, b: number) =>
  clamp((v - a) / (b - a));

export const smooth = (t: number) => t * t * (3 - 2 * t);

/** Crate i's local life for line progress q (0..1). Unclamped: <0 unborn, >1 gone. */
export const crateLife = (q: number, i: number) =>
  q * TIMELINE_SPAN - i * STAGGER;

/** Which crate the DOM panel should describe at line progress q. */
export const activeCrate = (q: number) =>
  clamp(Math.floor((q * TIMELINE_SPAN - 0.2) / STAGGER), 0, CRATE_COUNT - 1);
