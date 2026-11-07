/**
 * A real sheet of paper, simulated.
 *
 * The sheet is a jittered triangle mesh of particles joined by near-inextensible links, pulled
 * around a shrinking sphere. It has far more area than the sphere has surface, so it has no
 * choice but to buckle and fold, which is the only honest way to get creases that look like
 * creases. Sculpting a ball with noise always reads as a rock, a flower or a football. And
 * squeezing without the wrap just flattens the sheet into a pancake.
 *
 * Any edge that bends sharply gets permanently worn, like the emulsion cracking on a real print.
 */

const ROWS = 44
const SUBSTEPS = 2
const ITERATIONS = 4
const DAMPING = 0.93
const STRETCH = 0.95
const BEND = 0.24
const PULL = 0.05

export function createPaper(aspect: number) {
  const cols = Math.max(24, Math.round(ROWS * aspect))
  const nx = cols + 1
  const ny = ROWS + 1
  const count = nx * ny
  const pos = new Float32Array(count * 3)
  const prev = new Float32Array(count * 3)
  const uvs = new Float32Array(count * 2)
  /** Where each particle is headed on the ball, spread so every part of the sheet shrinks evenly. */
  const home = new Float32Array(count * 3)
  const cell = 2 / ROWS

  for (let r = 0; r < ny; r++) {
    for (let c = 0; c < nx; c++) {
      const i = r * nx + c
      const inside = r > 0 && c > 0 && r < ROWS && c < cols
      const x = (c / cols) * 2 * aspect - aspect + (inside ? (Math.random() - 0.5) * cell * 0.62 : 0)
      const y = (r / ROWS) * 2 - 1 + (inside ? (Math.random() - 0.5) * cell * 0.62 : 0)
      // A slight low-frequency warp seeds the buckling, so it doesn't fold along the mesh grid.
      const z = Math.sin(x * 2.3 + 1) * Math.cos(y * 3.1) * 0.012 + (Math.random() - 0.5) * 0.004
      pos.set([x, y, z], i * 3)
      prev.set([x, y, z], i * 3)
      uvs.set([(x / aspect + 1) / 2, (y + 1) / 2], i * 2)

      const sx = x / aspect
      const reach = Math.hypot(sx, y) || 1e-4
      // Measured square-wise, so the sheet's whole edge gathers at the back and closes the ball.
      // Measured by radius, only the corners get there and it stays an open bowl.
      const polar = 2 * Math.asin(Math.min(1, Math.max(Math.abs(sx), Math.abs(y))))
      home.set(
        [(sx / reach) * Math.sin(polar), (y / reach) * Math.sin(polar), Math.cos(polar)],
        i * 3,
      )
    }
  }

  /* Triangles, with randomly flipped diagonals so creases can run in any direction. */
  const tris: number[] = []
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < cols; c++) {
      const a = r * nx + c
      const b = a + 1
      const d = a + nx
      const e = d + 1
      if (Math.random() < 0.5) tris.push(a, b, e, a, e, d)
      else tris.push(a, b, d, b, e, d)
    }
  }
  const triCount = tris.length / 3

  /* Links: one per unique edge, remembering which triangles share it for measuring folds. */
  const edges = new Map<number, { a: number; b: number; t: number[]; slot: number[] }>()
  for (let t = 0; t < triCount; t++) {
    for (let k = 0; k < 3; k++) {
      const a = tris[t * 3 + ((k + 1) % 3)]
      const b = tris[t * 3 + ((k + 2) % 3)]
      const key = Math.min(a, b) * count + Math.max(a, b)
      let edge = edges.get(key)
      if (!edge) {
        edge = { a, b, t: [], slot: [] }
        edges.set(key, edge)
      }
      edge.t.push(t)
      edge.slot.push(k)
    }
  }
  const list = [...edges.values()]

  const distance = (a: number, b: number) =>
    Math.hypot(pos[a * 3] - pos[b * 3], pos[a * 3 + 1] - pos[b * 3 + 1], pos[a * 3 + 2] - pos[b * 3 + 2])

  const linkA = Int32Array.from(list, (e) => e.a)
  const linkB = Int32Array.from(list, (e) => e.b)
  const linkRest = Float32Array.from(list, (e) => distance(e.a, e.b))

  /* Stiffness across two cells: it's what makes large flat facets instead of fine crinkle. */
  const bendA: number[] = []
  const bendB: number[] = []
  for (let r = 0; r < ny; r++) {
    for (let c = 0; c < nx; c++) {
      const i = r * nx + c
      if (c + 3 < nx) bendA.push(i), bendB.push(i + 3)
      if (r + 3 < ny) bendA.push(i), bendB.push(i + 3 * nx)
    }
  }
  const bendRest = Float32Array.from(bendA, (a, i) => distance(a, bendB[i]))

  function solve(a: Int32Array | number[], b: Int32Array | number[], rest: Float32Array, stiffness: number) {
    for (let i = 0; i < rest.length; i++) {
      const ia = a[i] * 3
      const ib = b[i] * 3
      const dx = pos[ib] - pos[ia]
      const dy = pos[ib + 1] - pos[ia + 1]
      const dz = pos[ib + 2] - pos[ia + 2]
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6
      const f = ((d - rest[i]) / d) * 0.5 * stiffness
      pos[ia] += dx * f
      pos[ia + 1] += dy * f
      pos[ia + 2] += dz * f
      pos[ib] -= dx * f
      pos[ib + 1] -= dy * f
      pos[ib + 2] -= dz * f
    }
  }

  /* Render buffers: unindexed, so each triangle can be flat and carry its own edge wear. */
  const positions = new Float32Array(triCount * 9)
  const texcoords = new Float32Array(triCount * 6)
  const barycentric = new Float32Array(triCount * 9)
  const wearAttr = new Float32Array(triCount * 9)
  const normals = new Float32Array(triCount * 3)
  const wear = new Float32Array(list.length)

  for (let t = 0; t < triCount; t++) {
    for (let k = 0; k < 3; k++) {
      const v = tris[t * 3 + k]
      texcoords.set([uvs[v * 2], uvs[v * 2 + 1]], (t * 3 + k) * 2)
      barycentric[(t * 3 + k) * 3 + k] = 1
    }
  }

  function write() {
    for (let t = 0; t < triCount; t++) {
      const a = tris[t * 3] * 3
      const b = tris[t * 3 + 1] * 3
      const c = tris[t * 3 + 2] * 3
      positions[t * 9] = pos[a]
      positions[t * 9 + 1] = pos[a + 1]
      positions[t * 9 + 2] = pos[a + 2]
      positions[t * 9 + 3] = pos[b]
      positions[t * 9 + 4] = pos[b + 1]
      positions[t * 9 + 5] = pos[b + 2]
      positions[t * 9 + 6] = pos[c]
      positions[t * 9 + 7] = pos[c + 1]
      positions[t * 9 + 8] = pos[c + 2]

      const ux = pos[b] - pos[a]
      const uy = pos[b + 1] - pos[a + 1]
      const uz = pos[b + 2] - pos[a + 2]
      const vx = pos[c] - pos[a]
      const vy = pos[c + 1] - pos[a + 1]
      const vz = pos[c + 2] - pos[a + 2]
      const nx3 = uy * vz - uz * vy
      const ny3 = uz * vx - ux * vz
      const nz3 = ux * vy - uy * vx
      const l = Math.sqrt(nx3 * nx3 + ny3 * ny3 + nz3 * nz3) || 1e-6
      normals[t * 3] = nx3 / l
      normals[t * 3 + 1] = ny3 / l
      normals[t * 3 + 2] = nz3 / l
    }

    list.forEach((e, i) => {
      if (e.t.length < 2) return
      const [p, q] = e.t
      const dot =
        normals[p * 3] * normals[q * 3] +
        normals[p * 3 + 1] * normals[q * 3 + 1] +
        normals[p * 3 + 2] * normals[q * 3 + 2]
      // Once creased, always creased. Paper doesn't forget.
      const folded = Math.min(1, Math.max(0, (0.3 - dot) / 0.5))
      if (folded > wear[i]) wear[i] = folded
      for (let s = 0; s < 2; s++) {
        const base = e.t[s] * 9
        const slot = e.slot[s]
        wearAttr[base + slot] = wear[i]
        wearAttr[base + 3 + slot] = wear[i]
        wearAttr[base + 6 + slot] = wear[i]
      }
    })
  }

  write()

  return {
    positions,
    texcoords,
    barycentric,
    wear: wearAttr,
    /** Wraps the sheet around a sphere of this radius, and refreshes the render buffers. */
    squeeze(radius: number, wrap: number) {
      for (let s = 0; s < SUBSTEPS; s++) {
        for (let i = 0; i < count * 3; i++) {
          const p = pos[i]
          pos[i] += (p - prev[i]) * DAMPING + (Math.random() - 0.5) * 0.0007
          prev[i] = p
        }
        for (let it = 0; it < ITERATIONS; it++) {
          solve(linkA, linkB, linkRest, STRETCH)
          solve(bendA, bendB, bendRest, BEND)
          const inner = radius * 0.74 * wrap
          for (let i = 0; i < count; i++) {
            // A gentle pull only. The links fight it, and that fight is what makes the folds.
            pos[i * 3] += (home[i * 3] * radius - pos[i * 3]) * wrap * PULL
            pos[i * 3 + 1] += (home[i * 3 + 1] * radius - pos[i * 3 + 1]) * wrap * PULL
            pos[i * 3 + 2] += (home[i * 3 + 2] * radius - pos[i * 3 + 2]) * wrap * PULL

            const x = pos[i * 3]
            const y = pos[i * 3 + 1]
            const z = pos[i * 3 + 2]
            const d = Math.sqrt(x * x + y * y + z * z) || 1e-6
            if (d > radius || d < inner) {
              const f = (d > radius ? radius : inner) / d
              pos[i * 3] = x * f
              pos[i * 3 + 1] = y * f
              pos[i * 3 + 2] = z * f
            }
          }
        }
      }
      write()
    },
  }
}
