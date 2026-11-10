import { afterEach, beforeEach, expect, mock, test } from 'bun:test';

let begun = false;
const starts = [];

mock.module('../src/lib/store', () => ({
  hasBegun: () => begun,
  begin: (withSound) => {
    if (begun) return;
    begun = true;
    starts.push(withSound);
  },
}));

const { createIntroGate } = await import('../src/lib/intro');

let listeners;
let gate;
let reducedMotion;

class Element extends EventTarget {
  constructor(kind) {
    super();
    this.kind = kind;
    this.isContentEditable = false;
  }
  closest(selector) {
    return selector.split(', ').includes(this.kind) ? this : null;
  }
}

function send(type, properties = {}) {
  const event = new Event(type, { cancelable: true });

  for (const [key, value] of Object.entries(properties)) {
    Object.defineProperty(event, key, { value });
  }

  for (const listener of [...(listeners.get(type) ?? [])]) listener(event);

  return event;
}

beforeEach(() => {
  begun = false;
  starts.length = 0;
  reducedMotion = false;
  listeners = new Map();
  Object.assign(globalThis, {
    document: { documentElement: { dataset: {} } },
    HTMLElement: Element,
    scrollY: 0,
    innerHeight: 900,
    location: { hash: '' },
    matchMedia: () => ({ matches: reducedMotion }),
    addEventListener: (type, listener) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(listener);
    },
    removeEventListener: (type, listener) =>
      listeners.get(type)?.delete(listener),
  });
});

afterEach(() => gate?.destroy());

test('a small downward wheel gesture starts the intro without moving the page', () => {
  gate = createIntroGate();
  expect(document.documentElement.dataset.introLocked).toBe('true');
  expect(send('wheel', { deltaY: 8, deltaMode: 0 }).defaultPrevented).toBe(
    true,
  );
  expect(begun).toBe(false);
  expect(send('wheel', { deltaY: 16, deltaMode: 0 }).defaultPrevented).toBe(
    true,
  );
  expect(starts).toEqual([false]);
  send('wheel', { deltaY: 120, deltaMode: 0 });
  expect(starts).toHaveLength(1);
  expect(document.documentElement.dataset.introLocked).toBe('true');
});

test('upward scrolling stays pinned without starting the intro', () => {
  gate = createIntroGate();
  expect(send('wheel', { deltaY: -100, deltaMode: 0 }).defaultPrevented).toBe(
    true,
  );
  expect(begun).toBe(false);
});

test.each([1, 2])('normalizes wheel deltaMode %i', (deltaMode) => {
  gate = createIntroGate();
  send('wheel', { deltaY: 3, deltaMode });
  expect(begun).toBe(true);
});

test('click-started reveal releases immediately when no scroll gesture is active', () => {
  gate = createIntroGate();
  gate.complete();
  expect(document.documentElement.dataset.introLocked).toBeUndefined();
  expect(send('wheel', { deltaY: 100, deltaMode: 0 }).defaultPrevented).toBe(
    false,
  );
});

test('trackpad momentum remains consumed after the reveal until the gesture stops', async () => {
  gate = createIntroGate();
  send('wheel', { deltaY: 100, deltaMode: 0 });
  gate.complete();
  await Bun.sleep(100);
  expect(send('wheel', { deltaY: 8, deltaMode: 0 }).defaultPrevented).toBe(
    true,
  );
  await Bun.sleep(100);
  expect(document.documentElement.dataset.introLocked).toBe('true');
  await Bun.sleep(120);
  expect(document.documentElement.dataset.introLocked).toBeUndefined();
  expect(send('wheel', { deltaY: 100, deltaMode: 0 }).defaultPrevented).toBe(
    false,
  );
});

test('an upward finger swipe starts the intro and stays pinned through touch release', async () => {
  gate = createIntroGate();
  send('touchstart', { touches: [{ clientY: 500 }] });
  expect(
    send('touchmove', { touches: [{ clientY: 470 }] }).defaultPrevented,
  ).toBe(true);
  expect(starts).toEqual([true]);
  gate.complete();
  await Bun.sleep(200);
  expect(document.documentElement.dataset.introLocked).toBe('true');
  send('touchend', { touches: [] });
  await Bun.sleep(220);
  expect(document.documentElement.dataset.introLocked).toBeUndefined();
});

test('holding a scroll key never carries its repeats into page scrolling', async () => {
  gate = createIntroGate();
  expect(send('keydown', { key: 'PageDown' }).defaultPrevented).toBe(true);
  expect(starts).toEqual([true]);
  gate.complete();
  await Bun.sleep(200);
  expect(document.documentElement.dataset.introLocked).toBe('true');
  expect(
    send('keydown', { key: 'PageDown', repeat: true }).defaultPrevented,
  ).toBe(true);
  send('keyup', { key: 'PageDown' });
  await Bun.sleep(220);
  expect(document.documentElement.dataset.introLocked).toBeUndefined();
});

test('Tab, arbitrary clicks, browser zoom, and control activation remain native', () => {
  gate = createIntroGate();
  expect(send('keydown', { key: 'Tab' }).defaultPrevented).toBe(false);
  send('pointerdown');
  expect(send('wheel', { ctrlKey: true, deltaY: 100 }).defaultPrevented).toBe(
    false,
  );
  expect(
    send('keydown', { key: ' ', target: new Element('button') })
      .defaultPrevented,
  ).toBe(false);
  expect(
    send('keydown', { key: 'ArrowDown', target: new Element('input') })
      .defaultPrevented,
  ).toBe(false);
  expect(begun).toBe(false);
});

test('losing focus clears a held key so the gate can release', async () => {
  gate = createIntroGate();
  send('keydown', { key: 'ArrowDown' });
  gate.complete();
  send('blur');
  await Bun.sleep(220);
  expect(document.documentElement.dataset.introLocked).toBeUndefined();
});

test('failure or unmount releases scrolling and removes input listeners', () => {
  gate = createIntroGate();
  send('wheel', { deltaY: 100, deltaMode: 0 });
  gate.destroy();
  expect(document.documentElement.dataset.introLocked).toBeUndefined();
  expect([...listeners.values()].every((set) => set.size === 0)).toBe(true);
  expect(send('wheel', { deltaY: 100, deltaMode: 0 }).defaultPrevented).toBe(
    false,
  );
});

test.each(['reduced motion', 'restored position', 'anchor', 'already started'])(
  'skips the gate for %s',
  (mode) => {
    if (mode === 'reduced motion') reducedMotion = true;

    if (mode === 'restored position') globalThis.scrollY = 450;

    if (mode === 'anchor') location.hash = '#tree';

    if (mode === 'already started') begun = true;
    gate = createIntroGate();
    expect(document.documentElement.dataset.introLocked).toBeUndefined();
    expect(send('wheel', { deltaY: 100, deltaMode: 0 }).defaultPrevented).toBe(
      false,
    );
  },
);
