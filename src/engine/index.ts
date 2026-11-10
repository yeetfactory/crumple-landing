import * as THREE from 'three';

import {
  playClick,
  playCrumple,
  playGlass,
  playShardsFalling,
  playThud,
  playWhoosh,
} from '#/lib/sound';
import { clamp, lerp, remap, smooth } from '#/lib/timeline';
import { site } from '#/site';

import { createCrackLayer } from './crack';
import { WORD_WIDTH, createHero } from './hero';
import { INK_LAYER, createInk, gridMaterial } from './ink';
import { STAGE_X, createLever } from './lever';
import { LINE_Z, createLine } from './line';
import { createNotes } from './notes';

export type Engine = {
  yeetAll: () => void;
  /** Drops the letters in for the first time; resolves once they have landed. */
  start: () => Promise<void>;
  pullLever: (t: number) => void;
  /** Crumples the page, throws it at the viewer. Resolves when the DOM may come back. */
  crumple: () => Promise<void>;
  destroy: () => void;
};

type Options = {
  canvas: HTMLCanvasElement;
  crackCanvas: HTMLCanvasElement;
  notesCanvas: HTMLCanvasElement;
  heroEl: HTMLElement;
  lineEl: HTMLElement;
  treeEl: HTMLElement;
  finaleEl: HTMLElement;
  onFirstGesture: () => void;
};

const BOIL_FPS = 7;
const SUN_OFFSET = new THREE.Vector3(-13, 25, 15);

/** Paper-ball timeline, in seconds. */
const BALL = {
  squeeze: 0.95,
  windup: 1.2,
  impact: 1.5,
  stuck: 1.66,
  gone: 2.6,
  domBack: 1.75,
};

export async function createEngine(o: Options): Promise<Engine> {
  await Promise.all([
    document.fonts.load('700 100px "Old Standard TT"'),
    document.fonts.load('italic 400 20px "Old Standard TT"'),
    document.fonts.load('400 40px "Reenie Beanie"'),
  ]);

  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const coarse = matchMedia('(pointer: coarse)').matches;

  const renderer = new THREE.WebGLRenderer({
    canvas: o.canvas,
    antialias: false,
    powerPreference: 'high-performance',
  });

  renderer.autoClear = false;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(28, 1, 1.5, 300);
  const ink = createInk(renderer, scene, camera);

  // Tuned so an open floor lands on exactly 1.0 tone, which the hatcher leaves as bare paper.
  scene.add(new THREE.AmbientLight('#ffffff', Math.PI * 0.42));
  const sun = new THREE.DirectionalLight('#ffffff', Math.PI * 0.75);
  sun.castShadow = true;
  sun.shadow.mapSize.set(coarse ? 1024 : 2048, coarse ? 1024 : 2048);
  sun.shadow.camera.left = -32;
  sun.shadow.camera.right = 32;
  sun.shadow.camera.top = 28;
  sun.shadow.camera.bottom = -28;
  sun.shadow.camera.far = 100;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);

  const solid = new THREE.MeshLambertMaterial({ color: '#ffffff' });

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(700, 700), solid);
  floor.rotation.x = -Math.PI / 2;
  floor.position.z = -40;
  floor.receiveShadow = true;
  scene.add(floor);

  const grid = new THREE.Mesh(
    new THREE.PlaneGeometry(700, 700),
    gridMaterial(),
  );

  grid.rotation.x = -Math.PI / 2;
  grid.position.set(0, 0.006, -40);
  grid.layers.set(INK_LAYER);
  scene.add(grid);

  const crackLayer = createCrackLayer(o.crackCanvas, calm, playShardsFalling);
  const notes = createNotes(o.notesCanvas, camera);

  let shake = 0;

  const addShake = (a: number) => {
    if (!calm) shake = Math.min(1.2, shake + a);
  };

  const hero = createHero(scene, solid, camera, calm, {
    onCrack: crackLayer.crack,
    onShake: addShake,
  });

  const line = createLine(scene);
  const lever = createLever(scene);

  /* Camera rail: square-on elevation, over the letters, down onto the line. */
  let camPath = new THREE.CatmullRomCurve3([
    new THREE.Vector3(),
    new THREE.Vector3(0, 0, 1),
  ]);

  let lookPath = new THREE.CatmullRomCurve3([
    new THREE.Vector3(),
    new THREE.Vector3(0, 0, 1),
  ]);

  const stageCam = new THREE.Vector3();
  const stageLook = new THREE.Vector3(STAGE_X, 5.2, 0);

  let heroTop = 0;
  let heroH = 1;
  let lineTop = 1;
  let lineH = 1;
  let treeTop = 1;
  let treeH = 1;
  let finaleTop = 1;
  let pixelRatio = 1;

  function applySize() {
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(innerWidth, innerHeight, false);
    ink.resize(innerWidth, innerHeight, pixelRatio);
  }

  function layout() {
    pixelRatio = Math.min(devicePixelRatio, coarse ? 1.5 : 2);
    applySize();
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    crackLayer.resize();
    notes.resize();

    const tanH =
      Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect;

    const fill = camera.aspect < 1 ? 0.92 : 0.74;
    const dist = Math.max(WORD_WIDTH / fill / (2 * tanH), 22);
    const portrait = camera.aspect < 1;
    const lineDist = Math.max(27, (portrait ? 17 : 31) / (2 * tanH));
    line.frame(portrait);

    camPath = new THREE.CatmullRomCurve3([
      // Height scales with distance, so the floor lettering keeps its angle on any screen.
      new THREE.Vector3(0, dist * 0.26, dist),
      new THREE.Vector3(0, Math.max(13, dist * 0.3), dist * 0.5),
      new THREE.Vector3(2, 15, -10),
      new THREE.Vector3(
        lineDist * 0.42,
        lineDist * 0.37,
        LINE_Z + lineDist * 0.84,
      ),
    ]);
    lookPath = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, portrait ? 0.6 : 0.2, 0),
      new THREE.Vector3(0, 1, -6),
      new THREE.Vector3(0, 3, LINE_Z + 6),
      new THREE.Vector3(0.5, portrait ? 9 : 6, LINE_Z),
    ]);
    hero.setGlass(dist - 3.6);

    const stageDist = Math.max(34, 14 / (2 * tanH));
    stageCam.set(STAGE_X + stageDist * 0.3, stageDist * 0.3, stageDist * 0.92);

    const y = scrollY;
    const top = (el: HTMLElement) => el.getBoundingClientRect().top + y;
    heroTop = top(o.heroEl);
    heroH = o.heroEl.offsetHeight;
    lineTop = top(o.lineEl);
    lineH = o.lineEl.offsetHeight;
    treeTop = top(o.treeEl);
    treeH = o.treeEl.offsetHeight;
    finaleTop = top(o.finaleEl);
  }

  layout();
  addEventListener('resize', layout);

  /* Pointer */
  const inHero = () => scrollY < heroH * 0.3;
  let downAt: { x: number; y: number; t: number } | null = null;
  let parallaxX = 0;
  let parallaxY = 0;
  let targetPX = 0;
  let targetPY = 0;

  function onDown(e: PointerEvent) {
    o.onFirstGesture();

    if (!inHero()) return;

    if (hero.grab(e.clientX, e.clientY)) {
      o.canvas.setPointerCapture(e.pointerId);
      o.canvas.style.cursor = 'grabbing';
    } else {
      downAt = { x: e.clientX, y: e.clientY, t: performance.now() };
    }
  }

  function onMove(e: PointerEvent) {
    targetPX = (e.clientX / innerWidth) * 2 - 1;
    targetPY = (e.clientY / innerHeight) * 2 - 1;

    if (hero.isHolding()) {
      hero.drag(e.clientX, e.clientY);
    } else if (e.pointerType === 'mouse' && inHero()) {
      o.canvas.style.cursor = hero.hitTest(e.clientX, e.clientY)
        ? 'grab'
        : 'crosshair';
    }
  }

  const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const floorHit = new THREE.Vector3();

  function onUp(e: PointerEvent) {
    if (hero.isHolding()) {
      hero.release();
      o.canvas.style.cursor = 'grab';

      return;
    }

    if (!downAt) return;
    const moved = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y);

    if (moved < 8 && performance.now() - downAt.t < 400) {
      hero.aim(e.clientX, e.clientY);

      if (hero.ray.ray.intersectPlane(floorPlane, floorHit)) {
        hero.dropJunk(clamp(floorHit.x, -18, 18), clamp(floorHit.z, -6, 8));
      }
    }

    downAt = null;
  }

  /** Touch: claim the gesture only when it starts on a letter, so the page still scrolls. */
  function onTouchStart(e: TouchEvent) {
    const t = e.touches[0];

    if (t && inHero() && hero.hitTest(t.clientX, t.clientY)) e.preventDefault();
  }

  o.canvas.addEventListener('pointerdown', onDown);
  addEventListener('pointermove', onMove);
  addEventListener('pointerup', onUp);
  addEventListener('pointercancel', onUp);
  o.canvas.addEventListener('touchstart', onTouchStart, { passive: false });

  /* The paper ball */
  let ball: {
    t: number;
    rebooted: boolean;
    hit: boolean;
    thrown: boolean;
    release: () => void;
    released: boolean;
  } | null = null;

  const ballMatrix = new THREE.Matrix4();
  const ballPos = new THREE.Vector3();
  const ballQuat = new THREE.Quaternion();
  const ballEuler = new THREE.Euler();
  const ballScale = new THREE.Vector3(1, 1, 1);

  function stepBall(dt: number) {
    if (!ball) return;
    ball.t += dt;
    const t = ball.t;

    // Three hard squeezes rather than one smooth ease: it reads as hands, not a transition.
    const squeeze = clamp(t / BALL.squeeze);
    const c = smooth(squeeze) * 0.8 + (Math.floor(squeeze * 3) / 3) * 0.2;

    ballPos.set(0, 0, 0);
    ballEuler.set(c * 0.5, c * -0.7, c * 0.35);

    if (t > BALL.squeeze && t <= BALL.windup) {
      const u = smooth(remap(t, BALL.squeeze, BALL.windup));
      ballPos.set(0.25 * u, -0.5 * u, -1.9 * u);
      ballEuler.x += u * 0.8;
    } else if (t > BALL.windup && t <= BALL.impact) {
      const u = remap(t, BALL.windup, BALL.impact);
      const fly = u * u;
      ballPos.set(
        lerp(0.25, 0.1, fly),
        lerp(-0.5, 0.1, fly),
        lerp(-1.9, 2.55, fly),
      );
      ballEuler.set(0.8 + u * 7, -0.7 + u * 5, 0.35 + u * 4);
    } else if (t > BALL.impact) {
      // Stuck to the glass for a beat, then it peels off and drops out of frame.
      const u = Math.max(0, t - BALL.stuck);
      ballPos.set(0.1, 0.1 - u * u * 4.2, 2.55);
      ballEuler.set(7.8 + u * 2, 4.3, 4.35 + u);
    }

    ballMatrix.compose(ballPos, ballQuat.setFromEuler(ballEuler), ballScale);
    const aspect = innerWidth / innerHeight;
    const open = Math.hypot(aspect, 1) * 1.03;
    const closed = 0.21 * Math.sqrt(4 * aspect);
    // Keep simulating a moment past the squeeze so the last folds settle.
    ink.setPaper(
      c,
      ballMatrix,
      t < BALL.squeeze + 0.14 ? lerp(open, closed, c) : null,
      c,
    );

    if (t > 0.55 && !ball.rebooted) {
      ball.rebooted = true;
      hero.reboot();
    }

    if (t > BALL.windup && !ball.thrown) {
      ball.thrown = true;
      playWhoosh();
    }

    if (t >= BALL.impact && !ball.hit) {
      ball.hit = true;
      playGlass();
      addShake(1);
      crackLayer.crack(innerWidth * 0.53, innerHeight * 0.46, 1);
    }

    if (t >= BALL.domBack && !ball.released) {
      ball.released = true;
      ball.release();
    }

    if (t >= BALL.gone) {
      ball = null;
      ink.dropPaper();
    }
  }

  /* Loop */
  const camPos = new THREE.Vector3();
  const lookAt = new THREE.Vector3();
  const timer = new THREE.Timer();
  let scroll = scrollY;
  let frame = 0;
  let slow = 0;
  let offsetApplied = false;

  function setOffset(y: number) {
    if (Math.abs(y) < 0.5) {
      if (offsetApplied) camera.clearViewOffset();
      offsetApplied = false;

      return;
    }

    camera.setViewOffset(
      innerWidth,
      innerHeight,
      0,
      y,
      innerWidth,
      innerHeight,
    );
    offsetApplied = true;
  }

  function tick(now: number) {
    frame = requestAnimationFrame(tick);
    timer.update(now);
    const dt = Math.min(timer.getDelta(), 1 / 24);
    const vh = innerHeight;

    scroll += (scrollY - scroll) * (calm ? 1 : 1 - Math.exp(-dt * 12));

    const heroP = clamp((scroll - heroTop) / heroH);
    const lineQ = clamp((scroll - lineTop) / Math.max(1, lineH - vh));
    const flight = smooth(heroP);
    const pastLine = scroll - (lineTop + lineH - vh);
    const finaleIn = finaleTop - scroll;
    const onStage = finaleIn < vh && !ball;

    if (heroP < 0.98) hero.step(dt);
    hero.group.visible = heroP < 0.99;
    lever.group.visible = onStage;
    grid.visible = onStage || pastLine < vh;

    if (onStage) {
      lever.update(dt);
      camPos.copy(stageCam);
      lookAt.copy(stageLook);
      sun.target.position.set(STAGE_X, 0, 0);
    } else {
      camPath.getPoint(flight, camPos);
      lookPath.getPoint(flight, lookAt);
      sun.target.position.set(0, 0, lerp(0, LINE_Z, remap(heroP, 0.3, 0.8)));
      // A slow push-in down the line keeps the shot alive between crates.
      camPos.z -= lineQ * 3.5;
    }

    sun.position.copy(sun.target.position).add(SUN_OFFSET);

    if (!calm) {
      parallaxX += (targetPX - parallaxX) * (1 - Math.exp(-dt * 4));
      parallaxY += (targetPY - parallaxY) * (1 - Math.exp(-dt * 4));
      camPos.x += parallaxX * 0.6;
      camPos.y -= parallaxY * 0.3;
    }

    camera.position.copy(camPos);

    if (shake > 0.002) {
      const s = shake * shake * 0.9;
      camera.position.x += (Math.random() - 0.5) * s;
      camera.position.y += (Math.random() - 0.5) * s;
      shake *= Math.exp(-dt * 7.5);
    }

    camera.lookAt(lookAt);

    // Pinned 3D scenes still have to arrive and leave at scroll speed, like the page around them.
    setOffset(onStage ? -Math.max(0, finaleIn) : Math.max(0, pastLine));
    camera.updateMatrixWorld();

    line.update(
      lineQ,
      heroP > 0.3 && pastLine < vh && !onStage,
      camera,
      addShake,
    );
    stepBall(dt);

    const seed = calm
      ? 1
      : (Math.floor((now / 1000) * BOIL_FPS) % 24) / 24 + 0.04;

    ink.refractThrough(
      crackLayer.offsets,
      crackLayer.takeDirty(),
      crackLayer.hasGlass(),
    );
    ink.render(seed);

    notes.begin(seed);

    if (!ball) {
      if (heroP < 0.4) {
        const t = hero.telemetry();
        notes.annotate(
          t.notes,
          t.flights,
          t.dimension,
          1 - remap(heroP, 0.04, 0.26),
        );
      } else if (pastLine < 40 && innerWidth >= 700) {
        notes.annotate(
          line.notes(lineQ),
          [],
          null,
          remap(heroP, 0.82, 1) * (1 - remap(pastLine, 0, 40)),
        );
      }

      const treeRun = Math.max(1, treeH - vh);
      const inTree = scroll - treeTop;

      const pinned =
        inTree < 0 ? -inTree : inTree > treeRun ? treeRun - inTree : 0;

      notes.tree(pinned, clamp(inTree / treeRun), site.domain);
      notes.finale(finaleIn, site.name, site.people.join(' & '));
    }

    // Cheap adaptive quality: sustained jank drops the resolution once.
    slow = dt > 1 / 40 ? slow + 1 : Math.max(0, slow - 1);

    if (slow > 50 && pixelRatio > 1) {
      pixelRatio = 1;
      applySize();
      slow = 0;
    }
  }

  frame = requestAnimationFrame(tick);

  return {
    yeetAll: hero.yeetAll,
    start: hero.start,
    pullLever: lever.pull,
    crumple: () =>
      new Promise<void>((release) => {
        if (calm) {
          scrollTo(0, 0);
          hero.reboot();
          lever.pull(0);
          release();

          return;
        }

        playThud(0.9);
        playClick();
        playCrumple(BALL.squeeze);
        ink.freezeSheet(notes.copy());
        ball = {
          t: 0,
          rebooted: false,
          hit: false,
          thrown: false,
          released: false,
          release,
        };
        // The sheet now covers everything, so the page can quietly go back to the top behind it.
        scrollTo(0, 0);
        scroll = 0;
        lever.pull(0);
      }),
    destroy: () => {
      cancelAnimationFrame(frame);
      removeEventListener('resize', layout);
      removeEventListener('pointermove', onMove);
      removeEventListener('pointerup', onUp);
      removeEventListener('pointercancel', onUp);
      o.canvas.removeEventListener('pointerdown', onDown);
      o.canvas.removeEventListener('touchstart', onTouchStart);
      crackLayer.destroy();
      ink.dispose();
      renderer.dispose();
    },
  };
}
