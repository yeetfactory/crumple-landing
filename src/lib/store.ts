import type { Engine } from '#/engine';

import { unlockAudio } from './sound';

/** Handle on the drawing engine, for the few DOM controls that need to poke it. */
export const engine: { current: Engine | null } = { current: null };

let begun = false;
const beginListeners = new Set<() => void>();

export function onBegin(listener: () => void) {
  beginListeners.add(listener);

  return () => {
    beginListeners.delete(listener);
  };
}

/**
 * Browsers block all audio until the visitor interacts, so the opening waits for that press and
 * the first slam can have its sound. Scrolling isn't a gesture that unlocks audio, so a visitor
 * who scrolls instead still gets the letters, silently.
 */
export function begin(withSound: boolean) {
  if (withSound) unlockAudio();

  if (begun) return;
  begun = true;
  document.documentElement.dataset.started = 'true';

  for (const listener of beginListeners) listener();
}

export const hasBegun = () => begun;
