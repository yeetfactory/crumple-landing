import { afterEach, expect, test } from 'bun:test';

import {
  getSoundStatus,
  loadSoundPreference,
  onSoundChange,
  playThud,
  setSoundEnabled,
  unlockAudio,
} from '../src/lib/sound';

const originalAudioContext = globalThis.AudioContext;
const originalStorage = globalThis.localStorage;
const originalAddEventListener = globalThis.addEventListener;
const originalRemoveEventListener = globalThis.removeEventListener;

afterEach(() => {
  globalThis.AudioContext = originalAudioContext;
  globalThis.localStorage = originalStorage;
  globalThis.addEventListener = originalAddEventListener;
  globalThis.removeEventListener = originalRemoveEventListener;
});

test('saved preferences notify subscribers on load, toggle, and storage events', () => {
  let saved = 'off';
  let changes = 0;
  const events = new EventTarget();
  Object.assign(globalThis, {
    localStorage: {
      getItem: () => saved,
      setItem: (_key, value) => {
        saved = value;
      },
    },
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
  });
  const unsubscribe = onSoundChange(() => changes++);

  expect(getSoundStatus()).toBe('off');
  expect(changes).toBe(1);
  setSoundEnabled(true);
  expect(saved).toBe('on');
  expect(getSoundStatus()).toBe('on');
  expect(changes).toBe(2);

  saved = 'off';
  const storageEvent = new Event('storage');
  Object.defineProperty(storageEvent, 'key', { value: 'yeet:sound' });
  events.dispatchEvent(storageEvent);
  expect(getSoundStatus()).toBe('off');
  expect(changes).toBe(3);
  loadSoundPreference();
  expect(changes).toBe(3);

  unsubscribe();
  saved = 'on';
  events.dispatchEvent(storageEvent);
  expect(changes).toBe(3);
  loadSoundPreference();
});

test('blocked audio preserves the enabled preference, discards impacts, and retries on interaction', async () => {
  let unavailable = true;
  let blocked = true;
  let starts = 0;
  let resumes = 0;
  let deferResume = false;
  let finishResume;
  let context;
  let initialState = 'suspended';
  const events = new EventTarget();
  const statuses = [];
  Object.assign(globalThis, {
    localStorage: { getItem: () => 'on' },
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
  });
  const unsubscribe = onSoundChange(() => statuses.push(getSoundStatus()));

  class AudioContextStub extends EventTarget {
    state = initialState;
    sampleRate = 100;
    currentTime = 0;
    destination = {};

    constructor() {
      super();

      if (unavailable) throw new Error('Audio unavailable');
      context = this;
    }

    async resume() {
      resumes++;

      if (deferResume)
        await new Promise((resolve) => {
          finishResume = resolve;
        });

      if (blocked) throw new Error('Playback blocked');
      this.state = 'running';
      this.dispatchEvent(new Event('statechange'));
    }

    createBuffer(_channels, length) {
      return { getChannelData: () => new Float32Array(length) };
    }

    createGain() {
      return node();
    }

    createBiquadFilter() {
      return node();
    }

    createConvolver() {
      return node();
    }

    createDynamicsCompressor() {
      return node();
    }

    createStereoPanner() {
      return node();
    }

    createOscillator() {
      return node();
    }

    createBufferSource() {
      return node();
    }
  }

  function node() {
    const parameter = {
      value: 0,
      setValueAtTime() {},
      exponentialRampToValueAtTime() {},
    };

    return {
      gain: parameter,
      frequency: parameter,
      Q: parameter,
      pan: parameter,
      threshold: parameter,
      ratio: parameter,
      attack: parameter,
      release: parameter,
      connect() {
        return this;
      },
      start() {
        starts++;
      },
      stop() {},
    };
  }

  globalThis.AudioContext = AudioContextStub;
  await unlockAudio();
  expect(getSoundStatus()).toBe('on');
  unavailable = false;
  await unlockAudio();
  expect(getSoundStatus()).toBe('on');
  playThud(1);
  playThud(1);
  expect(resumes).toBe(1);
  expect(starts).toBe(0);

  blocked = false;
  deferResume = true;
  const retry = unlockAudio();
  playThud(1);
  expect(getSoundStatus()).toBe('on');
  expect(starts).toBe(0);
  finishResume();
  await retry;
  expect(context.state).toBe('running');
  expect(getSoundStatus()).toBe('on');
  expect(starts).toBe(0);
  playThud(1);
  expect(starts).toBeGreaterThan(0);

  const played = starts;
  context.state = 'suspended';
  context.dispatchEvent(new Event('statechange'));
  expect(getSoundStatus()).toBe('on');
  playThud(1);
  expect(starts).toBe(played);
  expect(statuses).toEqual([]);
  unsubscribe();

  // A separate page can have autoplay permission before any gesture occurs.
  const autoplaySound = await import('../src/lib/sound.ts?autoplay');
  initialState = 'running';
  const previousResumes = resumes;
  await autoplaySound.unlockAudio();
  expect(resumes).toBe(previousResumes);
  autoplaySound.playThud(1);
  expect(starts).toBeGreaterThan(played);
});
