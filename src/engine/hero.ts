import * as CANNON from 'cannon-es';
import * as THREE from 'three';

import { playGlass, playThud } from '#/lib/sound';

import { INK_LAYER, inkMaterial } from './ink';
import type { Dimension, Flight, Note } from './notes';
import { floorLettering, puffMark } from './textures';

const GROUP = { floor: 1, glass: 2, object: 4 };
const ALL = GROUP.floor | GROUP.glass | GROUP.object;

const CAP = 4;
const DEPTH = 1.5;
const GRAVITY = -42;
const SKY = 26;
const MAX_JUNK = 22;
const DUST_POOL = 40;
const TRAIL_POINTS = 44;

type Poly = [number, number][];

/** Hand-drawn block glyphs, so collision boxes can match them exactly. */
const GLYPHS: Record<
  'Y' | 'E' | 'T',
  { width: number; outline: Poly; boxes: number[][] }
> = {
  Y: {
    width: 3.8,
    outline: [
      [1, 0],
      [2.8, 0],
      [2.8, 0.42],
      [2.45, 0.42],
      [2.45, 1.7],
      [3.35, 3.58],
      [3.8, 3.58],
      [3.8, 4],
      [2.35, 4],
      [2.35, 3.58],
      [2.75, 3.58],
      [2.05, 2.15],
      [1.25, 3.58],
      [1.7, 3.58],
      [1.7, 4],
      [0, 4],
      [0, 3.58],
      [0.35, 3.58],
      [1.35, 1.7],
      [1.35, 0.42],
      [1, 0.42],
    ],
    boxes: [
      [1.9, 0.85, 1.1, 1.7],
      [1.9, 2.85, 3.2, 2.3],
    ],
  },
  E: {
    width: 3.1,
    outline: [
      [0, 0],
      [3.1, 0],
      [3.1, 1.2],
      [2.72, 1.2],
      [2.72, 0.5],
      [1.4, 0.5],
      [1.4, 1.72],
      [2, 1.72],
      [2, 1.38],
      [2.36, 1.38],
      [2.36, 2.62],
      [2, 2.62],
      [2, 2.28],
      [1.4, 2.28],
      [1.4, 3.5],
      [2.62, 3.5],
      [2.62, 2.85],
      [3, 2.85],
      [3, 4],
      [0, 4],
      [0, 3.6],
      [0.3, 3.6],
      [0.3, 0.4],
      [0, 0.4],
    ],
    boxes: [[1.55, 2, 3.1, 4]],
  },
  T: {
    width: 3.4,
    outline: [
      [0.72, 0],
      [2.68, 0],
      [2.68, 0.42],
      [2.28, 0.42],
      [2.28, 3.4],
      [3, 3.4],
      [3, 2.85],
      [3.4, 2.85],
      [3.4, 4],
      [0, 4],
      [0, 2.85],
      [0.4, 2.85],
      [0.4, 3.4],
      [1.12, 3.4],
      [1.12, 0.42],
      [0.72, 0.42],
    ],
    boxes: [
      [1.7, 1.7, 1.16, 3.4],
      [1.7, 3.7, 3.4, 0.6],
    ],
  },
};

const WORD = ['Y', 'E', 'E', 'T'] as const;
const GAP = 0.42;

export const WORD_WIDTH =
  WORD.reduce((w, g) => w + GLYPHS[g].width, 0) + GAP * (WORD.length - 1);

type LetterState =
  | 'waiting'
  | 'dropping'
  | 'idle'
  | 'loose'
  | 'splat'
  | 'yoink';

type Letter = {
  body: CANNON.Body;
  mesh: THREE.Mesh;
  home: CANNON.Vec3;
  yaw: number;
  state: LetterState;
  wait: number;
  rest: number;
  trail: THREE.Vector3[];
  trailClock: number;
  name: string;
};

type Puff = {
  sprite: THREE.Sprite;
  life: number;
  vel: THREE.Vector3;
  grow: number;
};

const NUMERALS = ['10', '12', '12\u2032', '14'];

const NOTE_OFFSETS = [
  [-34, -46],
  [30, -50],
  [-26, -50],
  [36, -46],
];

export type HeroCallbacks = {
  onCrack: (x: number, y: number, force: number) => void;
  onShake: (amount: number) => void;
};

function glyphGeometry(glyph: keyof typeof GLYPHS) {
  const { outline, width } = GLYPHS[glyph];

  const profile = new THREE.Shape(
    outline.map(([x, y]) => new THREE.Vector2(x, y)),
  );

  const geo = new THREE.ExtrudeGeometry(profile, {
    depth: DEPTH,
    bevelEnabled: false,
    curveSegments: 1,
  });

  geo.translate(-width / 2, -CAP / 2, -DEPTH / 2);

  return geo;
}

function glyphBody(glyph: keyof typeof GLYPHS) {
  const { boxes, width } = GLYPHS[glyph];

  const body = new CANNON.Body({
    mass: 9,
    angularDamping: 0.12,
    linearDamping: 0.02,
    fixedRotation: true,
    collisionFilterGroup: GROUP.object,
    collisionFilterMask: ALL,
  });

  for (const [cx, cy, w, h] of boxes) {
    body.addShape(
      new CANNON.Box(new CANNON.Vec3(w / 2, h / 2, DEPTH / 2)),
      new CANNON.Vec3(cx - width / 2, cy - CAP / 2, 0),
    );
  }

  body.updateMassProperties();

  return body;
}

function nutGeometry() {
  const hex = new THREE.Shape();

  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    hex[i ? 'lineTo' : 'moveTo'](Math.cos(a) * 0.72, Math.sin(a) * 0.72);
  }

  hex.closePath();
  const hole = new THREE.Path();
  hole.absarc(0, 0, 0.34, 0, Math.PI * 2, true);
  hex.holes.push(hole);

  const geo = new THREE.ExtrudeGeometry(hex, {
    depth: 0.42,
    bevelEnabled: true,
    bevelSize: 0.04,
    bevelThickness: 0.04,
    bevelSegments: 2,
    curveSegments: 18,
  });

  geo.center();

  return geo;
}

export function createHero(
  scene: THREE.Scene,
  solid: THREE.Material,
  camera: THREE.PerspectiveCamera,
  calm: boolean,
  cb: HeroCallbacks,
) {
  // Audio can't play until the visitor does something, so the letters wait for that too.
  let started = false;
  let finishIntro!: () => void;

  const introComplete = new Promise<void>((resolve) => {
    finishIntro = resolve;
  });

  let introFinished = false;

  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, GRAVITY, 0) });
  world.allowSleep = true;
  world.defaultContactMaterial.friction = 0.5;
  world.defaultContactMaterial.restitution = 0.16;

  const floor = new CANNON.Body({
    type: CANNON.Body.STATIC,
    collisionFilterGroup: GROUP.floor,
    collisionFilterMask: GROUP.object,
  });

  floor.addShape(new CANNON.Plane());

  floor.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  world.addBody(floor);

  const glass = new CANNON.Body({
    type: CANNON.Body.STATIC,
    collisionFilterGroup: GROUP.glass,
    collisionFilterMask: GROUP.object,
  });

  glass.addShape(new CANNON.Plane());

  glass.quaternion.setFromEuler(0, Math.PI, 0);
  world.addBody(glass);

  const group = new THREE.Group();
  scene.add(group);

  const lettering = new THREE.Mesh(
    new THREE.PlaneGeometry(
      WORD_WIDTH * 0.98,
      WORD_WIDTH * 0.98 * (400 / 2048),
    ),
    inkMaterial(floorLettering()),
  );

  lettering.rotation.x = -Math.PI / 2;
  lettering.position.set(0, 0.012, 3.1);
  lettering.layers.set(INK_LAYER);
  group.add(lettering);

  // Faces are solid chalk, sides take the hatching. Group 0 of an extrusion is its caps.
  const face = new THREE.MeshBasicMaterial({ color: 0x00ff00 });

  const glyphGeos = {
    Y: glyphGeometry('Y'),
    E: glyphGeometry('E'),
    T: glyphGeometry('T'),
  };

  const letters: Letter[] = [];
  const grabbable: THREE.Object3D[] = [];
  /** The physics body behind each grabbable mesh. */
  const bodies = new WeakMap<THREE.Object3D, CANNON.Body>();

  let cursor = -WORD_WIDTH / 2;
  WORD.forEach((glyph, i) => {
    const width = GLYPHS[glyph].width;
    const home = new CANNON.Vec3(cursor + width / 2, CAP / 2 + 0.01, 0);
    cursor += width + GAP;

    const mesh = new THREE.Mesh(glyphGeos[glyph], [face, solid]);
    mesh.castShadow = true;
    group.add(mesh);
    grabbable.push(mesh);

    const body = glyphBody(glyph);
    world.addBody(body);
    bodies.set(mesh, body);

    const letter: Letter = {
      body,
      mesh,
      home,
      yaw: [-0.07, 0.05, -0.04, 0.08][i],
      state: 'waiting',
      wait: 0.35 + i * 0.3,
      rest: 0,
      trail: [],
      trailClock: 0,
      name: glyph,
    };

    letters.push(letter);
    body.addEventListener('collide', (e: CollideEvent) => onCollide(letter, e));
    park(letter);
  });

  function park(l: Letter) {
    l.body.position.set(l.home.x, SKY + 40, l.home.z);
    l.body.velocity.setZero();
    l.body.angularVelocity.setZero();
    l.body.quaternion.setFromEuler(0, l.yaw, 0);
    l.body.fixedRotation = true;
    l.body.updateMassProperties();
    l.body.collisionFilterMask = ALL;
    l.body.collisionResponse = true;
    l.body.linearDamping = 0.02;
    l.body.wakeUp();
  }

  function drop(l: Letter) {
    park(l);
    l.body.position.set(l.home.x, SKY, l.home.z);
    l.body.velocity.set(0, -14, 0);
    l.state = 'dropping';
  }

  function loosen(l: Letter) {
    if (l.state !== 'idle' && l.state !== 'dropping') return;
    l.state = 'loose';
    l.rest = 0;
    l.body.fixedRotation = false;
    l.body.updateMassProperties();
    l.body.wakeUp();
  }

  function onCollide(l: Letter, e: CollideEvent) {
    const force = Math.abs(e.contact.getImpactVelocityAlongNormal());
    const { x, z } = l.body.position;

    if (e.body === glass) {
      if (force < 7 || l.state === 'splat') return;
      splat(l, force);

      return;
    }

    if (e.body === floor) {
      if (l.state === 'dropping') {
        l.state = 'idle';
        l.body.velocity.setZero();
        cb.onShake(Math.min(1, force / 34));
        playThud(Math.min(1, force / 30));
        dust(x, z, 7, force);

        return;
      }

      if (force > 3) {
        cb.onShake(Math.min(0.7, force / 50));
        playThud(force / 34);
        dust(x, z, Math.min(9, 2 + force / 4), force);
      }

      return;
    }

    if (force > 5) {
      loosen(l);
      playThud(force / 40);
    }
  }

  function splat(l: Letter, force: number) {
    const p = new THREE.Vector3().copy(l.body.position).project(camera);

    const sx = ((p.x + 1) / 2) * innerWidth;
    const sy = ((1 - p.y) / 2) * innerHeight;
    cb.onCrack(sx, sy, Math.min(1, force / 42));
    cb.onShake(1);
    playGlass();
    // Windscreen-bug physics: it stops dead on the glass, then slides out of frame.
    l.state = 'splat';
    l.body.collisionFilterMask = GROUP.glass;
    l.body.velocity.set(l.body.velocity.x * 0.05, -3, 0);
    l.body.angularVelocity.scale(0.15, l.body.angularVelocity);
    l.body.linearDamping = 0.62;
  }

  /* Junk: click empty floor and the hopper drops something shiny. */
  const nutGeo = nutGeometry();
  const ballGeo = new THREE.SphereGeometry(0.6, 32, 20);
  const cubeGeo = new THREE.BoxGeometry(1.05, 1.05, 1.05);
  const junk: { body: CANNON.Body; mesh: THREE.Mesh }[] = [];

  function dropJunk(x: number, z: number) {
    if (junk.length >= MAX_JUNK) {
      const oldest = junk.shift();

      if (oldest) {
        world.removeBody(oldest.body);
        group.remove(oldest.mesh);
        grabbable.splice(grabbable.indexOf(oldest.mesh), 1);
      }
    }

    const kind = Math.floor(Math.random() * 3);
    const geo = [nutGeo, ballGeo, cubeGeo][kind];

    const collider = [
      new CANNON.Cylinder(0.72, 0.72, 0.5, 6),
      new CANNON.Sphere(0.6),
      new CANNON.Box(new CANNON.Vec3(0.525, 0.525, 0.525)),
    ][kind];

    const body = new CANNON.Body({
      mass: 2.5,
      angularDamping: 0.2,
      collisionFilterGroup: GROUP.object,
      collisionFilterMask: ALL,
    });

    body.addShape(collider);

    body.position.set(x, 18 + Math.random() * 4, z);
    body.quaternion.setFromEuler(
      Math.random() * 6,
      Math.random() * 6,
      Math.random() * 6,
    );
    body.angularVelocity.set(
      (Math.random() - 0.5) * 12,
      (Math.random() - 0.5) * 12,
      (Math.random() - 0.5) * 12,
    );
    world.addBody(body);
    const mesh = new THREE.Mesh(geo, solid);
    mesh.castShadow = true;
    bodies.set(mesh, body);
    group.add(mesh);
    grabbable.push(mesh);
    junk.push({ body, mesh });
    body.addEventListener('collide', (e: CollideEvent) => {
      const force = Math.abs(e.contact.getImpactVelocityAlongNormal());

      if (force > 6) playThud(force / 90);

      if (e.body === glass && force > 12) {
        const p = new THREE.Vector3().copy(body.position).project(camera);

        cb.onCrack(
          ((p.x + 1) / 2) * innerWidth,
          ((1 - p.y) / 2) * innerHeight,
          0.25,
        );
        playGlass();
      }
    });
  }

  /* Dust */
  const puffTexture = puffMark();

  const puffs: Puff[] = Array.from({ length: DUST_POOL }, () => {
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: puffTexture,
        color: 0x00ff00,
        transparent: true,
        depthWrite: false,
        opacity: 0,
      }),
    );

    sprite.visible = false;
    sprite.layers.set(INK_LAYER);
    group.add(sprite);

    return { sprite, life: 0, vel: new THREE.Vector3(), grow: 1 };
  });

  let nextPuff = 0;

  function dust(x: number, z: number, count: number, force: number) {
    if (calm) return;

    for (let i = 0; i < count; i++) {
      const p = puffs[nextPuff++ % DUST_POOL];
      const a = Math.random() * Math.PI * 2;
      const speed = 2 + Math.random() * Math.min(9, force / 3);
      p.sprite.visible = true;
      p.sprite.position.set(x + Math.cos(a) * 1.3, 0.25, z + Math.sin(a) * 0.8);
      p.sprite.scale.setScalar(0.35 + Math.random() * 0.4);
      p.vel.set(
        Math.cos(a) * speed,
        0.6 + Math.random() * 1.6,
        Math.sin(a) * speed * 0.6,
      );
      p.grow = 0.7 + Math.random() * 0.9;
      p.life = 1;
    }
  }

  /* Grabbing */
  const mouseBody = new CANNON.Body({ type: CANNON.Body.KINEMATIC });
  mouseBody.collisionResponse = false;
  mouseBody.collisionFilterMask = 0;
  world.addBody(mouseBody);

  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const dragPlane = new THREE.Plane();
  const dragPoint = new THREE.Vector3();
  const trail: { p: THREE.Vector3; t: number }[] = [];
  let joint: CANNON.PointToPointConstraint | null = null;
  let held: CANNON.Body | null = null;

  function aim(clientX: number, clientY: number) {
    ndc.set((clientX / innerWidth) * 2 - 1, -(clientY / innerHeight) * 2 + 1);
    ray.setFromCamera(ndc, camera);
  }

  function hitTest(clientX: number, clientY: number) {
    aim(clientX, clientY);

    return ray.intersectObjects(grabbable, false)[0] ?? null;
  }

  function grab(clientX: number, clientY: number) {
    const hit = hitTest(clientX, clientY);

    if (!hit) return false;
    const body = bodies.get(hit.object);

    if (!body) return false;
    const letter = letters.find((l) => l.body === body);

    if (letter) {
      if (letter.state === 'splat' || letter.state === 'yoink') return false;
      loosen(letter);
    }

    body.wakeUp();
    held = body;
    dragPlane.setFromNormalAndCoplanarPoint(
      camera.getWorldDirection(new THREE.Vector3()).negate(),
      hit.point,
    );
    mouseBody.position.set(hit.point.x, hit.point.y, hit.point.z);

    const pivot = body.pointToLocalFrame(
      new CANNON.Vec3(hit.point.x, hit.point.y, hit.point.z),
    );

    joint = new CANNON.PointToPointConstraint(
      body,
      pivot,
      mouseBody,
      new CANNON.Vec3(),
      900,
    );
    world.addConstraint(joint);
    trail.length = 0;

    return true;
  }

  function drag(clientX: number, clientY: number) {
    if (!joint) return;
    aim(clientX, clientY);

    if (!ray.ray.intersectPlane(dragPlane, dragPoint)) return;
    dragPoint.y = Math.max(0.4, dragPoint.y);
    mouseBody.position.set(dragPoint.x, dragPoint.y, dragPoint.z);
    const t = performance.now();
    trail.push({ p: dragPoint.clone(), t });

    while (trail.length && t - trail[0].t > 110) trail.shift();
  }

  function release() {
    if (!joint || !held) return;
    world.removeConstraint(joint);
    joint = null;

    if (trail.length >= 2) {
      const a = trail[0];
      const b = trail[trail.length - 1];
      const dt = Math.max(0.016, (b.t - a.t) / 1000);
      const v = b.p.clone().sub(a.p).divideScalar(dt);
      const speed = Math.min(v.length(), 90);

      if (speed > 7) {
        v.setLength(speed);
        // A throw always carries some of its energy towards the viewer. That's the whole bit.
        held.velocity.set(v.x * 1.1, v.y * 1.1 + 4, v.z + speed * 0.85);
        held.angularVelocity.set(
          (Math.random() - 0.5) * speed * 0.3,
          (Math.random() - 0.5) * speed * 0.3,
          (Math.random() - 0.5) * speed * 0.3,
        );
      }
    }

    held = null;
  }

  function yeetAll() {
    letters.forEach((l, i) => {
      setTimeout(() => {
        if (l.state === 'waiting' || l.state === 'yoink' || l.state === 'splat')
          return;
        l.state = 'idle';
        loosen(l);
        l.body.velocity.set(
          (l.home.x - l.body.position.x) * 0.4,
          15 + Math.random() * 3,
          40 + Math.random() * 5,
        );
        l.body.angularVelocity.set(
          (Math.random() - 0.5) * 7,
          (Math.random() - 0.5) * 7,
          (Math.random() - 0.5) * 7,
        );
      }, i * 70);
    });
    cb.onShake(0.4);
    playThud(1);
  }

  function reboot() {
    letters.forEach((l, i) => {
      park(l);
      l.state = 'waiting';
      l.wait = 0.2 + i * 0.3;
    });
  }

  function placeStatic() {
    letters.forEach((l) => {
      park(l);
      l.body.position.copy(l.home);
      l.state = 'idle';
    });
  }

  if (calm) placeStatic();

  function setGlass(z: number) {
    glass.position.set(0, 0, z);
  }

  function step(dt: number) {
    world.step(1 / 90, dt, 6);

    for (const l of letters) {
      const b = l.body;

      if (l.state === 'waiting') {
        if (started) l.wait -= dt;

        if (l.wait <= 0) drop(l);
      } else if (l.state === 'loose' && b !== held) {
        const gone =
          Math.abs(b.position.x) > 34 ||
          b.position.z < -26 ||
          b.position.y > 70;

        if (gone) {
          drop(l);
          continue;
        }

        const still = b.velocity.lengthSquared() < 0.5;
        l.rest = still ? l.rest + dt : 0;

        if (l.rest > 2.4) {
          // Grabbed by an unseen crane and hauled back up for another slam.
          l.state = 'yoink';
          b.collisionResponse = false;
        }
      } else if (l.state === 'splat' && b.position.y < -7) {
        drop(l);
      } else if (l.state === 'yoink') {
        b.velocity.set(0, 44, 0);
        b.wakeUp();

        if (b.position.y > SKY) drop(l);
      }

      l.mesh.position.copy(b.position);
      l.mesh.quaternion.copy(b.quaternion);
      // A letter waiting in the sky would still throw its shadow onto the empty sheet.
      l.mesh.visible = l.state !== 'waiting';

      l.trailClock += dt;

      const flying =
        l.state === 'loose' && b !== held && b.velocity.lengthSquared() > 30;

      if (flying && l.trailClock > 0.03) {
        l.trailClock = 0;
        l.trail.push(l.mesh.position.clone());

        if (l.trail.length > TRAIL_POINTS) l.trail.shift();
      } else if (!flying && l.trail.length && l.trailClock > 0.03) {
        l.trailClock = 0;
        l.trail.shift();
      }
    }

    if (
      started &&
      !introFinished &&
      letters.every((l) => l.state !== 'waiting' && l.state !== 'dropping')
    ) {
      introFinished = true;
      finishIntro();
    }

    for (const j of junk) {
      j.mesh.position.copy(j.body.position);
      j.mesh.quaternion.copy(j.body.quaternion);
    }

    for (const p of puffs) {
      if (p.life <= 0) continue;
      p.life -= dt * 2.1;
      p.sprite.position.addScaledVector(p.vel, dt);
      p.vel.multiplyScalar(1 - dt * 2.6);
      p.sprite.scale.addScalar(p.grow * dt);
      p.sprite.material.opacity = Math.min(1, p.life * 2);
      p.sprite.visible = p.life > 0;
    }
  }

  const dimFrom = new THREE.Vector3(-WORD_WIDTH / 2, 0.02, 1.3);
  const dimTo = new THREE.Vector3(WORD_WIDTH / 2, 0.02, 1.3);

  /** What the annotation layer should show this frame. */
  function telemetry() {
    const notes: Note[] = [];
    const flights: Flight[] = [];
    letters.forEach((l, i) => {
      if (l.state === 'waiting' || l.state === 'yoink') return;

      if (l.state === 'idle') {
        const [dx, dy] = NOTE_OFFSETS[i];
        notes.push({
          at: l.mesh.position.clone().setY(l.mesh.position.y + CAP / 2),
          label: NUMERALS[i],
          dx,
          dy,
        });
      }

      if (l.trail.length > 1 && l.state === 'loose') {
        flights.push({
          at: l.mesh.position,
          speed: l.body.velocity.length(),
          name: l.name,
          trail: l.trail,
        });
      }
    });
    const settled = letters.every((l) => l.state === 'idle');

    const dimension: Dimension | null = settled
      ? { from: dimFrom, to: dimTo, label: `${WORD_WIDTH.toFixed(2)} m` }
      : null;

    return { notes, flights, dimension };
  }

  return {
    group,
    start: () => {
      started = true;

      return introComplete;
    },
    telemetry,
    step,
    grab,
    drag,
    release,
    hitTest,
    dropJunk,
    yeetAll,
    reboot,
    setGlass,
    aim,
    ray,
    isHolding: () => joint !== null,
  };
}

type CollideEvent = {
  body: CANNON.Body;
  contact: { getImpactVelocityAlongNormal(): number };
};
