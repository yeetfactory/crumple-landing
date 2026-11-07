import * as THREE from 'three'
import { lerp } from '#/lib/timeline'

export const STAGE_X = 90
const PIVOT_Y = 1.7
const REST = 0.72
const PULLED = -0.72

const shade = (v: number) =>
  new THREE.MeshLambertMaterial({ color: new THREE.Color(v, v, v) })

function add(parent: THREE.Object3D, geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(geo, m)
  mesh.position.set(x, y, z)
  mesh.castShadow = true
  mesh.receiveShadow = true
  parent.add(mesh)
  return mesh
}

/** Toothed quadrant plate, the bit a real signal-box lever ratchets along. */
function quadrant(depth: number) {
  const shape = new THREE.Shape()
  const inner = 0.6
  const outer = 4
  const from = Math.PI / 2 - 0.95
  const to = Math.PI / 2 + 0.95
  shape.moveTo(Math.cos(from) * inner, Math.sin(from) * inner)
  const teeth = 15
  for (let i = 0; i <= teeth; i++) {
    const a = from + ((to - from) * i) / teeth
    const step = (to - from) / teeth
    shape.lineTo(Math.cos(a) * outer, Math.sin(a) * outer)
    if (i < teeth) {
      shape.lineTo(Math.cos(a + step * 0.5) * outer, Math.sin(a + step * 0.5) * outer)
      shape.lineTo(Math.cos(a + step * 0.5) * (outer - 0.22), Math.sin(a + step * 0.5) * (outer - 0.22))
      shape.lineTo(Math.cos(a + step) * (outer - 0.22), Math.sin(a + step) * (outer - 0.22))
    }
  }
  shape.lineTo(Math.cos(to) * inner, Math.sin(to) * inner)
  shape.closePath()
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false })
  geo.translate(0, 0, -depth / 2)
  return geo
}

export function createLever(scene: THREE.Scene) {
  const group = new THREE.Group()
  group.position.x = STAGE_X
  group.visible = false
  scene.add(group)

  const pale = shade(1)
  const mid = shade(0.84)
  const deep = shade(0.56)
  const red = new THREE.MeshBasicMaterial({ color: 0x0000ff })

  add(group, new THREE.BoxGeometry(9, 0.42, 5), mid, 0, 0.21, 0)
  add(group, new THREE.BoxGeometry(5.4, 0.5, 3.4), pale, 0, 0.67, 0)
  for (const x of [-4, 4]) {
    for (const z of [-2, 2]) {
      add(group, new THREE.CylinderGeometry(0.24, 0.24, 0.16, 6), deep, x, 0.5, z)
    }
  }

  // One quadrant, behind the arm, so the whole lever stays in view as it travels.
  add(group, quadrant(0.26), mid, 0, PIVOT_Y, -0.55)

  const axle = add(group, new THREE.CylinderGeometry(0.5, 0.5, 1.7, 28), mid, 0, PIVOT_Y, 0)
  axle.rotation.x = Math.PI / 2
  add(group, new THREE.BoxGeometry(1.5, 1, 1.3), pale, 0, 1.25, 0)

  const arm = new THREE.Group()
  arm.position.y = PIVOT_Y
  group.add(arm)
  add(arm, new THREE.BoxGeometry(0.42, 5.4, 0.5), pale, 0, 2.7, 0)
  add(arm, new THREE.CylinderGeometry(0.36, 0.36, 1.5, 20), deep, 0, 5.2, 0)
  for (const y of [4.7, 5.2, 5.7]) add(arm, new THREE.CylinderGeometry(0.4, 0.4, 0.09, 20), pale, 0, y, 0)
  add(arm, new THREE.SphereGeometry(0.82, 32, 20), red, 0, 6.5, 0)
  // Sliding latch that drops into the quadrant teeth.
  add(arm, new THREE.BoxGeometry(0.5, 0.5, 0.56), mid, 0, 3.7, 0)

  let target = 0
  let current = 0

  return {
    group,
    pull: (t: number) => {
      target = t
    },
    update(dt: number) {
      current += (target - current) * (1 - Math.exp(-dt * 22))
      arm.rotation.z = lerp(REST, PULLED, current)
    },
  }
}
