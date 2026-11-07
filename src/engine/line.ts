import * as THREE from 'three'
import { CRATE_COUNT, PHASE, clamp, crateLife, lerp, remap, smooth } from '#/lib/timeline'
import { playLaunch, playStamp } from '#/lib/sound'
import { INK_LAYER, inkMaterial } from './ink'
import type { Note } from './notes'
import { beltMarks, crateLabel, floorTuned, signLettering, signRedline, stampMark } from './textures'

export const LINE_Z = -46
const BELT_TOP = 1.5
const BELT_LENGTH = 44
const BELT_WIDTH = 4.6
const CRATE = 3
const PRESS_X = 0
const START_X = -19
const FLIPPER_X = 12.5
const HEAD_REST = 7.4
const HEAD_DOWN = BELT_TOP + CRATE

const shade = (v: number) =>
  new THREE.MeshLambertMaterial({ color: new THREE.Color(v, v, v) })

function part(geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(geo, m)
  mesh.position.set(x, y, z)
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}

const box = (w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0) =>
  part(new THREE.BoxGeometry(w, h, d), m, x, y, z)

const barrel = (r: number, len: number, m: THREE.Material, x = 0, y = 0, z = 0) =>
  part(new THREE.CylinderGeometry(r, r, len, 28), m, x, y, z)

function gearGeometry(teeth: number, outer: number, inner: number, depth: number) {
  const shape = new THREE.Shape()
  for (let i = 0; i < teeth; i++) {
    const a = (i / teeth) * Math.PI * 2
    const step = (Math.PI * 2) / teeth
    const pts: [number, number][] = [
      [inner, a],
      [outer, a + step * 0.14],
      [outer, a + step * 0.42],
      [inner, a + step * 0.56],
    ]
    pts.forEach(([r, t], j) => {
      const x = Math.cos(t) * r
      const y = Math.sin(t) * r
      if (i === 0 && j === 0) shape.moveTo(x, y)
      else shape.lineTo(x, y)
    })
  }
  shape.closePath()
  const hole = new THREE.Path()
  hole.absarc(0, 0, inner * 0.36, 0, Math.PI * 2, true)
  shape.holes.push(hole)
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 20 })
  geo.translate(0, 0, -depth / 2)
  return geo
}

/** A crate built from planks and battens, because line art rewards real construction. */
function crateBody(light: THREE.Material, dark: THREE.Material) {
  const crate = new THREE.Group()
  const half = CRATE / 2
  crate.add(box(CRATE - 0.06, CRATE - 0.06, CRATE - 0.06, light))
  const t = 0.26
  const edge = CRATE
  for (const a of [-1, 1]) {
    for (const b of [-1, 1]) {
      crate.add(box(t, edge, t, dark, a * (half - t / 2), 0, b * (half - t / 2)))
      crate.add(box(edge, t, t, dark, 0, a * (half - t / 2), b * (half - t / 2)))
      crate.add(box(t, t, edge, dark, a * (half - t / 2), b * (half - t / 2), 0))
    }
  }
  return crate
}

export function createLine(scene: THREE.Scene) {
  const group = new THREE.Group()
  group.position.z = LINE_Z
  scene.add(group)

  const pale = shade(1)
  const mid = shade(0.84)
  const deep = shade(0.56)

  /* The sign, turned to face the end of the camera rail so it reads square-on. */
  const signSize = new THREE.PlaneGeometry(42, 10.5)
  const signA = new THREE.Mesh(signSize, inkMaterial(signLettering()))
  const signB = new THREE.Mesh(signSize, inkMaterial(signRedline(), true))
  for (const s of [signA, signB]) {
    s.rotation.y = 0.5
    s.layers.set(INK_LAYER)
    group.add(s)
  }

  const tuned = new THREE.Mesh(new THREE.PlaneGeometry(14.5, 14.5 * (340 / 2048)), inkMaterial(floorTuned()))
  tuned.rotation.x = -Math.PI / 2
  tuned.layers.set(INK_LAYER)
  group.add(tuned)

  /* Conveyor */
  group.add(box(BELT_LENGTH, 0.3, BELT_WIDTH, mid, 0, BELT_TOP - 0.15, 0))
  const marks = beltMarks()
  marks.repeat.set(BELT_LENGTH / 3.4, 1)
  const belt = new THREE.Mesh(
    new THREE.PlaneGeometry(BELT_LENGTH, BELT_WIDTH),
    inkMaterial(marks, false, 0.5),
  )
  belt.rotation.x = -Math.PI / 2
  belt.position.y = BELT_TOP + 0.01
  belt.layers.set(INK_LAYER)
  group.add(belt)

  for (const side of [-1, 1]) {
    group.add(box(BELT_LENGTH, 0.62, 0.2, pale, 0, BELT_TOP - 0.2, side * (BELT_WIDTH / 2 + 0.1)))
  }
  const rollers: THREE.Mesh[] = []
  for (let x = -BELT_LENGTH / 2 + 1; x < BELT_LENGTH / 2; x += 2) {
    const roller = barrel(0.3, BELT_WIDTH + 0.7, deep, x, BELT_TOP - 0.62, 0)
    roller.rotation.x = Math.PI / 2
    group.add(roller)
    rollers.push(roller)
  }
  for (let x = -BELT_LENGTH / 2 + 2; x < BELT_LENGTH / 2; x += 6) {
    for (const side of [-1, 1]) {
      group.add(box(0.3, 1, 0.3, mid, x, 0.5, side * (BELT_WIDTH / 2 + 0.1)))
      group.add(box(0.9, 0.1, 0.9, deep, x, 0.05, side * (BELT_WIDTH / 2 + 0.1)))
    }
  }

  /* C-frame press: one column behind the belt, so nothing stands between you and the crate. */
  group.add(box(4, 0.4, 3.4, deep, PRESS_X, 0.2, -4.3))
  group.add(box(1.9, 11, 1.5, pale, PRESS_X, 5.9, -4.3))
  group.add(box(0.3, 9.4, 2, mid, PRESS_X - 1.1, 5.4, -4.3))
  group.add(box(0.3, 9.4, 2, mid, PRESS_X + 1.1, 5.4, -4.3))
  group.add(box(1.9, 1.7, 5.6, pale, PRESS_X, 11.2, -1.9))
  group.add(barrel(1.05, 1.5, mid, PRESS_X, 10.1, 0))
  for (const z of [-3.9, -2.4, -0.9]) {
    const bolt = barrel(0.16, 0.2, deep, PRESS_X + 0.98, 11.2, z)
    bolt.rotation.z = Math.PI / 2
    group.add(bolt)
  }

  const hose = new THREE.Mesh(
    new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3([
        new THREE.Vector3(PRESS_X + 1.1, 2.5, -3.7),
        new THREE.Vector3(PRESS_X + 2.6, 5.4, -2.9),
        new THREE.Vector3(PRESS_X + 2.2, 9.9, -1.5),
        new THREE.Vector3(PRESS_X + 1, 10.2, -0.2),
      ]),
      40,
      0.11,
      8,
    ),
    mid,
  )
  hose.castShadow = true
  group.add(hose)

  const gearGeo = gearGeometry(14, 1.65, 1.32, 0.42)
  const gearA = part(gearGeo, pale, PRESS_X, 4.7, -3.36)
  const gearB = part(gearGeometry(9, 1.1, 0.8, 0.42), mid, PRESS_X + 2.28, 6.5, -3.36)
  group.add(gearA, gearB)

  const rod = barrel(0.46, 7, pale)
  group.add(rod)
  const head = new THREE.Group()
  head.add(box(3.7, 0.56, 3.7, pale, 0, 0.42, 0))
  head.add(box(3.1, 0.14, 3.1, deep, 0, 0.07, 0))
  head.add(barrel(0.82, 0.5, mid, 0, 0.92, 0))
  group.add(head)

  /* Flipper */
  const hinge = new THREE.Group()
  hinge.position.set(FLIPPER_X + 3, BELT_TOP + 0.02, 0)
  hinge.add(box(6.2, 0.24, BELT_WIDTH - 0.3, pale, -3.1, 0.14, 0))
  for (let i = 0; i < 4; i++) hinge.add(box(0.2, 0.12, BELT_WIDTH - 0.5, mid, -1 - i * 1.3, 0.3, 0))
  group.add(hinge)
  const pin = barrel(0.34, BELT_WIDTH + 0.9, deep, FLIPPER_X + 3, BELT_TOP + 0.1, 0)
  pin.rotation.x = Math.PI / 2
  group.add(pin)
  group.add(box(0.6, BELT_TOP + 0.3, 0.8, mid, FLIPPER_X + 3, (BELT_TOP + 0.3) / 2, BELT_WIDTH / 2 + 0.4))
  group.add(box(0.6, BELT_TOP + 0.3, 0.8, mid, FLIPPER_X + 3, (BELT_TOP + 0.3) / 2, -BELT_WIDTH / 2 - 0.4))

  /* Crates */
  const stamp = stampMark()
  const crates = Array.from({ length: CRATE_COUNT }, (_, i) => {
    const mesh = crateBody(pale, mid)
    const label = crateLabel(String(i + 1).padStart(3, '0'))
    const faceGeo = new THREE.PlaneGeometry(CRATE * 0.88, CRATE * 0.88)
    const front = new THREE.Mesh(faceGeo, inkMaterial(label))
    front.position.z = CRATE / 2 + 0.01
    const side = new THREE.Mesh(faceGeo, inkMaterial(label))
    side.position.x = CRATE / 2 + 0.01
    side.rotation.y = Math.PI / 2
    const decal = new THREE.Mesh(faceGeo, inkMaterial(stamp, true))
    decal.rotation.x = -Math.PI / 2
    decal.position.y = CRATE / 2 + 0.02
    // The press slams the top, but the ink bleeds down the front where you can read it.
    const bleed = new THREE.Mesh(faceGeo, inkMaterial(stamp, true))
    bleed.position.set(0, -0.72, CRATE / 2 + 0.02)
    bleed.scale.setScalar(0.74)
    decal.visible = bleed.visible = false
    for (const m of [front, side, decal, bleed]) {
      m.layers.set(INK_LAYER)
      mesh.add(m)
    }
    group.add(mesh)
    return { mesh, decal, bleed, wasStamped: false, wasLaunched: false }
  })

  const launchTarget = new THREE.Vector3()
  const worldCam = new THREE.Vector3()
  const pressAnchor = new THREE.Vector3()
  const flipperAnchor = new THREE.Vector3()
  const gearAnchor = new THREE.Vector3()
  const crateAnchors = crates.map(() => new THREE.Vector3())

  function update(q: number, on: boolean, camera: THREE.Camera, onHit: (amount: number) => void) {
    group.visible = on
    if (!on) return
    marks.offset.x = -q * 24
    rollers.forEach((r) => (r.rotation.y = q * 40))
    gearA.rotation.z = q * 9
    gearB.rotation.z = -q * 9 * (14 / 9) + 0.2

    let press = 0
    let flip = 0
    worldCam.copy(camera.position)
    group.worldToLocal(worldCam)

    crates.forEach((c, i) => {
      const life = crateLife(q, i)
      const m = c.mesh
      m.visible = life > -0.02 && life < 1

      // Press stroke is driven by whichever crate is under it right now.
      const stroke = remap(life, PHASE.reachPress, PHASE.leavePress)
      if (stroke > 0 && stroke < 1) press = Math.max(press, Math.sin(stroke * Math.PI))
      const launch = remap(life, PHASE.reachFlipper, 1)
      if (launch > 0 && launch < 1) flip = Math.max(flip, Math.min(1, launch * 3.2))

      const stamped = life >= PHASE.stamped
      c.decal.visible = c.bleed.visible = stamped
      if (stamped && !c.wasStamped) {
        onHit(0.42)
        playStamp()
      }
      c.wasStamped = stamped

      const launched = launch > 0.02
      if (launched && !c.wasLaunched) {
        onHit(0.3)
        playLaunch()
      }
      c.wasLaunched = launched

      if (!m.visible) return

      let x: number
      if (life < PHASE.reachPress) {
        x = lerp(START_X, PRESS_X, remap(life, 0, PHASE.reachPress))
      } else if (life < PHASE.leavePress) {
        x = PRESS_X
      } else {
        x = lerp(PRESS_X, FLIPPER_X, remap(life, PHASE.leavePress, PHASE.reachFlipper))
      }
      const rest = BELT_TOP + CRATE / 2
      m.position.set(x, rest, 0)
      m.rotation.set(0, 0, 0)

      // Squash on press impact.
      const squash =
        stroke > 0.32 && stroke < 0.7 ? 1 - Math.sin(remap(stroke, 0.32, 0.7) * Math.PI) * 0.1 : 1
      m.scale.set(2 - squash, squash, 2 - squash)
      m.position.y = BELT_TOP + (CRATE * squash) / 2

      if (launch > 0) {
        const u = smooth(launch) * 0.3 + launch * 0.7
        launchTarget.copy(worldCam).add(new THREE.Vector3(2.2, 1.7, -3))
        const a = (1 - u) * (1 - u)
        const b = 2 * (1 - u) * u
        const d = u * u
        m.position.set(
          a * FLIPPER_X + b * (FLIPPER_X + 3) + d * launchTarget.x,
          a * rest + b * 19 + d * launchTarget.y,
          b * 3 + d * launchTarget.z,
        )
        m.rotation.set(u * 7, u * 4.4, u * -9)
      }
      crateAnchors[i].copy(m.position).setY(m.position.y + CRATE / 2)
      group.localToWorld(crateAnchors[i])
    })

    const eased = press < 0.5 ? press * 2 : 1
    const headY = lerp(HEAD_REST, HEAD_DOWN, clamp(eased))
    head.position.set(PRESS_X, headY, 0)
    const rodTop = 10
    const rodLen = rodTop - (headY + 1)
    rod.scale.y = rodLen / 7
    rod.position.set(PRESS_X, headY + 1 + rodLen / 2, 0)

    hinge.rotation.z = -flip * 0.95 * (1 - remap(q, 0.985, 1))

    pressAnchor.set(PRESS_X + 1.8, headY + 0.4, 1.8)
    group.localToWorld(pressAnchor)
    flipperAnchor.set(FLIPPER_X + 1, BELT_TOP + 0.3, BELT_WIDTH / 2)
    group.localToWorld(flipperAnchor)
    gearAnchor.set(PRESS_X + 3, 7.3, -3.3)
    group.localToWorld(gearAnchor)
  }

  function notes(q: number): Note[] {
    const list: Note[] = [
      { at: pressAnchor, label: '20', dx: 62, dy: -34 },
      { at: gearAnchor, label: '22', dx: 54, dy: -30 },
      { at: flipperAnchor, label: '26', dx: -40, dy: 62 },
    ]
    crates.forEach((c, i) => {
      const life = crateLife(q, i)
      if (c.mesh.visible && life < PHASE.reachFlipper) {
        list.push({ at: crateAnchors[i], label: `24${"′".repeat(i)}`, dx: -36, dy: -48 })
      }
    })
    return list
  }

  /** Wide screens run the words either side of the press. Tall ones stack them above it. */
  function frame(portrait: boolean) {
    const along = new THREE.Vector3(Math.cos(0.5), 0, -Math.sin(0.5))
    signA.position.set(-9, 9.6, -19)
    signB.position.set(-9, 9.6, -19)
    signA.scale.setScalar(1)
    signB.scale.setScalar(1)
    tuned.position.set(-6.5, 0.02, 4.7)
    tuned.scale.setScalar(1)
    if (portrait) {
      signA.position.addScaledVector(along, 8.1).setY(23.5)
      signB.position.addScaledVector(along, -7.9).setY(18.5)
      signA.scale.setScalar(0.64)
      signB.scale.setScalar(0.64)
      tuned.position.set(1, 0.02, 5.6)
      tuned.scale.setScalar(0.8)
    }
  }

  return { group, update, notes, frame }
}
