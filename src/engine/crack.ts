/**
 * Breaking glass, on a 2D layer above the whole page.
 *
 * Real broken glass isn't lines, it's pieces. Each impact is cut into shards: radial cracks from
 * the hit, crossed by rings that don't line up between neighbouring wedges. Every shard sits at
 * its own tilt, so it catches the light differently and bends the drawing behind it (the offset
 * map is read by the ink shader). After a moment they lose their grip and fall out of the screen.
 */

const HOLD_MS = 2700
const GRAVITY = 2600

type Shard = {
  points: number[]
  cx: number
  cy: number
  light: boolean
  strength: number
  angle: number
  glint: boolean
  delay: number
  vx: number
  vy: number
  spin: number
}

export function createCrackLayer(canvas: HTMLCanvasElement, calm: boolean, onFall: () => void) {
  const ctx = canvas.getContext('2d')
  const offsets = document.createElement('canvas')
  const offsetCtx = offsets.getContext('2d')
  let shards: Shard[] = []
  let pits: { x: number; y: number; r: number }[] = []
  let timer = 0
  let frame = 0
  let dirty = true

  function clearOffsets() {
    if (!offsetCtx) return
    offsetCtx.setTransform(1, 0, 0, 1, 0, 0)
    offsetCtx.fillStyle = 'rgb(128,128,0)'
    offsetCtx.fillRect(0, 0, offsets.width, offsets.height)
    dirty = true
  }

  function resize() {
    const dpr = Math.min(devicePixelRatio, 2)
    canvas.width = innerWidth * dpr
    canvas.height = innerHeight * dpr
    ctx?.setTransform(dpr, 0, 0, dpr, 0, 0)
    offsets.width = Math.ceil(innerWidth / 2)
    offsets.height = Math.ceil(innerHeight / 2)
    clear()
  }

  function trace(c: CanvasRenderingContext2D, p: number[]) {
    c.beginPath()
    c.moveTo(p[0], p[1])
    for (let i = 2; i < p.length; i += 2) c.lineTo(p[i], p[i + 1])
    c.closePath()
  }

  function paint(s: Shard) {
    if (!ctx) return
    const reach = 90
    const gx = Math.cos(s.angle) * reach
    const gy = Math.sin(s.angle) * reach
    const fill = ctx.createLinearGradient(s.cx - gx, s.cy - gy, s.cx + gx, s.cy + gy)
    const tone = s.light ? '255,255,255' : '4,10,44'
    fill.addColorStop(0, `rgba(${tone},${s.strength})`)
    fill.addColorStop(1, `rgba(${tone},${s.strength * 0.12})`)
    trace(ctx, s.points)
    ctx.fillStyle = fill
    ctx.fill()

    // A dark line and a bright line, a pixel apart: the two faces of a broken edge.
    ctx.save()
    ctx.translate(0.7, 0.9)
    ctx.strokeStyle = 'rgba(3,8,36,.5)'
    ctx.lineWidth = 1
    ctx.stroke()
    ctx.restore()
    ctx.strokeStyle = 'rgba(255,255,255,.72)'
    ctx.lineWidth = 0.8
    ctx.stroke()

    if (s.glint) {
      ctx.save()
      ctx.globalCompositeOperation = 'lighter'
      ctx.strokeStyle = 'rgba(255,255,255,.85)'
      ctx.lineWidth = 1.8
      ctx.beginPath()
      ctx.moveTo(s.points[0], s.points[1])
      ctx.lineTo(s.points[2], s.points[3])
      ctx.stroke()
      ctx.restore()
    }
  }

  function paintPits() {
    if (!ctx) return
    for (const p of pits) {
      const crush = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r)
      crush.addColorStop(0, 'rgba(255,255,255,.95)')
      crush.addColorStop(0.3, 'rgba(235,242,255,.6)')
      crush.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.fillStyle = crush
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  function redraw() {
    ctx?.clearRect(0, 0, innerWidth, innerHeight)
    shards.forEach(paint)
    paintPits()
  }

  /** A crack from the impact: straight-ish, with small kinks where the glass gave way. */
  function buildRay(angle: number, length: number) {
    const stops: { r: number; a: number }[] = [{ r: 0, a: angle }]
    let r = 0
    let a = angle
    while (r < length) {
      r += 24 + Math.random() * 62
      a += (Math.random() - 0.5) * 0.09
      stops.push({ r, a })
    }
    return stops
  }

  function along(ray: { r: number; a: number }[], x: number, y: number, from: number, to: number) {
    const out: number[] = []
    const start = { r: from, a: at(ray, from) }
    const end = { r: to, a: at(ray, to) }
    const between = ray.filter((s) => s.r > Math.min(from, to) && s.r < Math.max(from, to))
    if (from > to) between.reverse()
    for (const s of [start, ...between, end]) {
      out.push(x + Math.cos(s.a) * s.r, y + Math.sin(s.a) * s.r)
    }
    return out
  }

  function at(ray: { r: number; a: number }[], r: number) {
    for (let i = 1; i < ray.length; i++) {
      if (ray[i].r >= r) {
        const t = (r - ray[i - 1].r) / (ray[i].r - ray[i - 1].r)
        return ray[i - 1].a + (ray[i].a - ray[i - 1].a) * t
      }
    }
    return ray[ray.length - 1].a
  }

  function crack(x: number, y: number, force: number) {
    if (!ctx || !offsetCtx) return
    const reach = Math.max(innerWidth, innerHeight) * (0.42 + force * 0.8)
    const count = 13 + Math.floor(force * 11)
    const angles = Array.from(
      { length: count },
      (_, i) => ((i + (Math.random() - 0.5) * 0.7) / count) * Math.PI * 2,
    )
    const rays = angles.map((a) => buildRay(a, reach * (0.8 + Math.random() * 0.5)))

    offsetCtx.setTransform(0.5, 0, 0, 0.5, 0, 0)

    rays.forEach((left, i) => {
      const right = rays[(i + 1) % rays.length]
      // Each wedge breaks at its own radii. Aligned rings are what make cracks look drawn.
      let inner = 7 + Math.random() * 7
      while (inner < reach) {
        const outer = inner * (1.42 + Math.random() * 0.75) + 12
        const points = [
          ...along(left, x, y, inner, outer),
          ...along(right, x, y, outer, inner),
        ]
        let cx = 0
        let cy = 0
        for (let p = 0; p < points.length; p += 2) {
          cx += points[p]
          cy += points[p + 1]
        }
        cx /= points.length / 2
        cy /= points.length / 2

        const dist = Math.hypot(cx - x, cy - y)
        const near = Math.max(0, 1 - dist / (reach * 0.5))
        shards.push({
          points,
          cx,
          cy,
          light: Math.random() < 0.62,
          strength: 0.03 + Math.random() * 0.13 + near * 0.12,
          angle: Math.random() * Math.PI * 2,
          glint: Math.random() < 0.16,
          delay: Math.random() * 0.55 + (1 - near) * 0.25,
          vx: (cx - x) * 0.25 + (Math.random() - 0.5) * 120,
          vy: -Math.random() * 120,
          spin: (Math.random() - 0.5) * 3.4,
        })

        // Refraction: tilt each piece a little, so the picture breaks along with the glass.
        const tilt = 0.25 + near * 0.75
        const r = Math.round(128 + (Math.random() - 0.5) * 230 * tilt)
        const g = Math.round(128 + (Math.random() - 0.5) * 230 * tilt)
        offsetCtx.fillStyle = `rgb(${r},${g},0)`
        trace(offsetCtx, points)
        offsetCtx.fill()

        inner = outer
      }
    })

    pits.push({ x, y, r: 16 + force * 22 })
    dirty = true
    redraw()

    canvas.style.opacity = '1'
    canvas.style.transition = 'none'
    cancelAnimationFrame(frame)
    clearTimeout(timer)
    timer = window.setTimeout(release, HOLD_MS)
  }

  /** The cracked pane finally lets go. */
  function release() {
    if (calm) {
      canvas.style.transition = 'opacity .8s linear'
      canvas.style.opacity = '0'
      timer = window.setTimeout(clear, 850)
      return
    }
    onFall()
    clearOffsets()
    pits = []
    const started = performance.now()
    let last = started

    function fall(now: number) {
      const t = (now - started) / 1000
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      ctx?.clearRect(0, 0, innerWidth, innerHeight)
      let alive = 0
      for (const s of shards) {
        if (!ctx) break
        const age = t - s.delay
        if (age > 0) {
          s.vy += GRAVITY * dt
          const dx = s.vx * dt
          const dy = s.vy * dt
          const turn = s.spin * dt
          const cos = Math.cos(turn)
          const sin = Math.sin(turn)
          for (let i = 0; i < s.points.length; i += 2) {
            const px = s.points[i] - s.cx
            const py = s.points[i + 1] - s.cy
            s.points[i] = s.cx + px * cos - py * sin + dx
            s.points[i + 1] = s.cy + px * sin + py * cos + dy
          }
          s.cx += dx
          s.cy += dy
        }
        if (s.cy < innerHeight + 260) {
          alive++
          paint(s)
        }
      }
      if (alive) frame = requestAnimationFrame(fall)
      else clear()
    }
    frame = requestAnimationFrame(fall)
  }

  function clear() {
    shards = []
    pits = []
    cancelAnimationFrame(frame)
    ctx?.clearRect(0, 0, innerWidth, innerHeight)
    clearOffsets()
  }

  resize()
  return {
    crack,
    resize,
    clear,
    offsets,
    /** True once per change, so the shader only re-uploads the map when it has to. */
    takeDirty() {
      const was = dirty
      dirty = false
      return was
    },
    hasGlass: () => shards.length > 0 && pits.length > 0,
    destroy() {
      clearTimeout(timer)
      cancelAnimationFrame(frame)
    },
  }
}
