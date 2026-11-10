/**
 * Every sound is synthesised, with no audio files. Two rules keep it from sounding like an
 * electric zapper:
 *
 * 1. Objects are struck, not buzzed. Hits are sums of decaying sine "modes" at the inharmonic
 *    ratios real materials ring at. No square or saw waves, and no raw high-frequency noise.
 * 2. Everything happens in a room. A dark synthetic reverb and a gentle top-end roll-off do
 *    more for realism than any single voice.
 */

const STORAGE_KEY = 'yeet:sound';

type Rig = { ctx: BaseAudioContext; out: GainNode; noise: AudioBuffer };

type Mode = [ratio: number, gain: number, decay: number];

let rig: Rig | null = null;
let enabled = true;
let lastGlass = -1;

const preferenceListeners = new Set<() => void>();

export function loadSoundPreference() {
  enabled = localStorage.getItem(STORAGE_KEY) !== 'off';

  return enabled;
}

export function setSoundEnabled(next: boolean) {
  enabled = next;
  localStorage.setItem(STORAGE_KEY, next ? 'on' : 'off');

  for (const listener of preferenceListeners) listener();
}

/** Lets the sound toggle re-read the preference whenever it changes. */
export function onSoundPreferenceChange(listener: () => void) {
  preferenceListeners.add(listener);

  return () => {
    preferenceListeners.delete(listener);
  };
}

/** A warehouse: a second of decaying noise that gets darker as it dies away. */
function roomImpulse(ctx: BaseAudioContext) {
  const length = Math.floor(ctx.sampleRate * 1.25);
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);

  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    let smooth = 0;

    for (let i = 0; i < length; i++) {
      const t = i / length;
      const openness = 0.34 * (1 - t) * (1 - t) + 0.015;
      smooth += (Math.random() * 2 - 1 - smooth) * openness;
      data[i] = smooth * Math.pow(1 - t, 3.2);
    }
  }

  return buffer;
}

/** Builds the output chain. Takes any context so it can also be rendered offline for tests. */
export function attachRig(ctx: BaseAudioContext) {
  const out = ctx.createGain();
  out.gain.value = 1.5;

  const tone = ctx.createBiquadFilter();
  tone.type = 'lowpass';
  tone.frequency.value = 4600;
  tone.Q.value = 0.4;

  const room = ctx.createConvolver();
  room.buffer = roomImpulse(ctx);
  const wet = ctx.createGain();
  wet.gain.value = 0.34;

  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -9;
  limiter.ratio.value = 8;
  limiter.attack.value = 0.004;
  limiter.release.value = 0.22;

  out.connect(tone);
  tone.connect(limiter);
  tone.connect(room).connect(wet).connect(limiter);
  limiter.connect(ctx.destination);

  const noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const data = noise.getChannelData(0);

  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

  rig = { ctx, out, noise };
}

/** Must be called from a user gesture. Browsers keep audio locked until then. */
export function unlockAudio() {
  if (rig) {
    if (rig.ctx instanceof AudioContext && rig.ctx.state === 'suspended')
      void rig.ctx.resume();

    return;
  }

  attachRig(new AudioContext());
}

const live = () => (enabled ? rig : null);

function panned(r: Rig, pan: number) {
  const p = r.ctx.createStereoPanner();
  p.pan.value = pan;
  p.connect(r.out);

  return p;
}

/** A low body hit whose pitch falls, with a soft attack so it never clicks. */
function thump(
  r: Rig,
  at: number,
  from: number,
  to: number,
  duration: number,
  gain: number,
) {
  const osc = r.ctx.createOscillator();
  osc.frequency.setValueAtTime(from, at);
  osc.frequency.exponentialRampToValueAtTime(to, at + duration * 0.7);
  const env = r.ctx.createGain();
  env.gain.setValueAtTime(0.0001, at);
  env.gain.exponentialRampToValueAtTime(gain, at + 0.006);
  env.gain.exponentialRampToValueAtTime(0.0001, at + duration);
  osc.connect(env).connect(r.out);
  osc.start(at);
  osc.stop(at + duration + 0.02);
}

/** A struck object: a handful of decaying sines at material-specific ratios. */
function strike(
  r: Rig,
  at: number,
  base: number,
  modes: Mode[],
  level: number,
  pan = 0,
) {
  const bus = panned(r, pan);

  for (const [ratio, gain, decay] of modes) {
    const osc = r.ctx.createOscillator();
    osc.frequency.value = base * ratio * (0.995 + Math.random() * 0.01);
    const env = r.ctx.createGain();
    env.gain.setValueAtTime(0.0001, at);
    env.gain.exponentialRampToValueAtTime(
      Math.max(0.0002, gain * level),
      at + 0.003,
    );
    env.gain.exponentialRampToValueAtTime(0.0001, at + decay);
    osc.connect(env).connect(bus);
    osc.start(at);
    osc.stop(at + decay + 0.02);
  }
}

/** Dark filtered noise: the dull contact at the start of a hit, never a hiss. */
function contact(
  r: Rig,
  at: number,
  cutoff: number,
  duration: number,
  gain: number,
  pan = 0,
) {
  const src = r.ctx.createBufferSource();
  src.buffer = r.noise;
  const filter = r.ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = cutoff;
  const env = r.ctx.createGain();
  env.gain.setValueAtTime(0.0001, at);
  env.gain.exponentialRampToValueAtTime(gain, at + 0.003);
  env.gain.exponentialRampToValueAtTime(0.0001, at + duration);
  src.connect(filter).connect(env).connect(panned(r, pan));
  src.start(at, Math.random());
  src.stop(at + duration + 0.02);
}

// Laptop speakers roll off below ~200 Hz, so the weight has to live in the upper modes too.
const IRON: Mode[] = [
  [1, 0.7, 0.32],
  [1.52, 0.6, 0.24],
  [2.31, 0.5, 0.17],
  [3.1, 0.34, 0.11],
  [4.2, 0.18, 0.07],
];

const WOOD: Mode[] = [
  [1, 0.8, 0.12],
  [2.42, 0.5, 0.07],
  [3.86, 0.26, 0.04],
];

/** Cast iron landing on concrete. `force` is 0..1. */
export function playThud(force: number) {
  const r = live();

  if (!r) return;
  const f = Math.min(1, Math.max(0.1, force));
  const at = r.ctx.currentTime;
  thump(r, at, 118, 46, 0.46, 0.75 * f);
  strike(
    r,
    at,
    210 + Math.random() * 50,
    IRON,
    0.7 * f,
    Math.random() * 0.5 - 0.25,
  );
  contact(r, at, 1500, 0.06, 0.85 * f);
}

/** A press coming down on a wooden crate. */
export function playStamp() {
  const r = live();

  if (!r) return;
  const at = r.ctx.currentTime;
  thump(r, at, 92, 34, 0.5, 0.8);
  strike(r, at, 250, WOOD, 1);
  contact(r, at, 1600, 0.07, 0.9);
}

/** Air moving past something heavy. Low and swept, nothing above the midrange. */
function whoosh(r: Rig, at: number, duration: number, gain: number) {
  const src = r.ctx.createBufferSource();
  src.buffer = r.noise;
  src.loop = true;
  const filter = r.ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.Q.value = 0.9;
  filter.frequency.setValueAtTime(220, at);
  filter.frequency.exponentialRampToValueAtTime(880, at + duration * 0.45);
  filter.frequency.exponentialRampToValueAtTime(200, at + duration);
  const env = r.ctx.createGain();
  env.gain.setValueAtTime(0.0001, at);
  env.gain.exponentialRampToValueAtTime(gain, at + duration * 0.42);
  env.gain.exponentialRampToValueAtTime(0.0001, at + duration);
  src.connect(filter).connect(env).connect(r.out);
  src.start(at);
  src.stop(at + duration + 0.02);
}

export function playLaunch() {
  const r = live();

  if (!r) return;
  const at = r.ctx.currentTime;
  thump(r, at, 130, 58, 0.22, 0.6);
  strike(r, at, 240, IRON, 0.22);
  whoosh(r, at, 0.55, 0.5);
}

export function playWhoosh() {
  const r = live();

  if (r) whoosh(r, r.ctx.currentTime, 0.34, 0.6);
}

/** One tooth of a heavy ratchet. */
export function playRatchet() {
  const r = live();

  if (!r) return;
  const at = r.ctx.currentTime;
  strike(r, at, 310 + Math.random() * 30, WOOD, 0.34);
  contact(r, at, 1400, 0.02, 0.3);
}

export function playClick() {
  const r = live();

  if (r) strike(r, r.ctx.currentTime, 520, WOOD, 0.3);
}

/**
 * Breaking glass as a shower of tiny struck objects: a dull hit, then many separate sine
 * "shards", each with its own pitch, pan and time, thinning out as they land.
 */
export function playGlass() {
  const r = live();

  if (!r) return;
  const at = r.ctx.currentTime;
  const overlapping = at - lastGlass < 0.25;
  lastGlass = at;

  thump(r, at, 170, 58, 0.24, 0.8);
  strike(r, at, 340, IRON, 0.3);
  contact(r, at, 2200, 0.04, 0.7);

  const shards = overlapping ? 9 : 26;

  for (let i = 0; i < shards; i++) {
    const spread = Math.random();
    const when = at + 0.015 + spread * spread * 0.8;
    const pitch = 1250 + Math.random() * Math.random() * 2300;
    const level = (1 - spread * 0.75) * (0.05 + Math.random() * 0.09);
    const ring = 0.05 + Math.random() * 0.13;
    strike(
      r,
      when,
      pitch,
      [
        [1, 1, ring],
        [1.59, 0.45, ring * 0.7],
      ],
      level,
      Math.random() * 1.4 - 0.7,
    );
  }
}

/** The pane letting go: a thin scatter of small pieces landing somewhere below. */
export function playShardsFalling() {
  const r = live();

  if (!r) return;
  const at = r.ctx.currentTime;

  for (let i = 0; i < 22; i++) {
    const when = at + 0.12 + Math.random() * 1;
    const ring = 0.05 + Math.random() * 0.1;
    const pitch = 1100 + Math.random() * 1900;
    strike(
      r,
      when,
      pitch,
      [
        [1, 1, ring],
        [1.59, 0.4, ring * 0.7],
      ],
      0.03 + Math.random() * 0.05,
      Math.random() * 1.4 - 0.7,
    );
  }
}

/** Paper being crushed: soft mid-range crinkles over a low rustle. */
export function playCrumple(duration: number) {
  const r = live();

  if (!r) return;
  const at = r.ctx.currentTime;
  whoosh(r, at, duration, 0.2);

  for (let i = 0; i < 64; i++) {
    const when = at + Math.random() * duration;
    const src = r.ctx.createBufferSource();
    src.buffer = r.noise;
    const filter = r.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 500 + Math.random() * 1500;
    filter.Q.value = 1.1;
    const env = r.ctx.createGain();
    const decay = 0.02 + Math.random() * 0.05;
    env.gain.setValueAtTime(0.0001, when);
    env.gain.exponentialRampToValueAtTime(
      0.1 + Math.random() * 0.22,
      when + 0.004,
    );
    env.gain.exponentialRampToValueAtTime(0.0001, when + decay);
    src
      .connect(filter)
      .connect(env)
      .connect(panned(r, Math.random() - 0.5));
    src.start(when, Math.random());
    src.stop(when + decay + 0.01);
  }
}
