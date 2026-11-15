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
 * Browsers block all audio until the visitor interacts, so the opening waits for the YEET press
 * and the first slam can have its sound. `withSound` is false only when the opening is skipped
 * (reduced motion, or arriving partway down the page) and nobody has pressed anything yet.
 */
export function begin(withSound: boolean) {
  if (withSound) unlockAudio();

  if (begun) return;
  begun = true;
  document.documentElement.dataset.started = 'true';

  for (const listener of beginListeners) listener();
}

export const hasBegun = () => begun;
