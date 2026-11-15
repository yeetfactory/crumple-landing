import type { Engine } from '#/engine';

import { unlockAudio } from './sound';

/** Handle on the drawing engine, for the few DOM controls that need to poke it. */
interface EngineHandle {
  current: Engine | null;
}

export const engine: EngineHandle = { current: null };

let begun = false;
const beginListeners = new Set<() => void>();

export function onBegin(listener: () => void) {
  beginListeners.add(listener);

  return () => {
    beginListeners.delete(listener);
  };
}

/**
 * The opening waits for the YEET press so browsers can unlock audio before the first slam.
 * `withSound` is false when the opening is skipped (reduced motion, or arriving partway down
 * the page). Blocked audio never holds up the visual reveal or queues old impacts.
 */
export function begin(withSound: boolean) {
  if (withSound) void unlockAudio();

  if (begun) return;
  begun = true;
  document.documentElement.dataset.started = 'true';

  for (const listener of beginListeners) listener();
}

export const hasBegun = () => begun;
