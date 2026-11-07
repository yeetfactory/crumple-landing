import * as THREE from 'three'
import { CHALK, HAND, RED, SERIF } from './palette'
import { remap } from '#/lib/timeline'

/**
 * A 2D drawing layer above the 3D: patent-style callouts pinned to moving objects, the subdomain
 * diagram, and the finale lettering. It lives on a canvas rather than in the DOM so it shares
 * the same line boil, and so the last sheet can be crumpled with its lettering on it.
 */

export type Note = {
  at: THREE.Vector3
  label: string
  /** Where the numeral sits, in pixels from the anchor. */
  dx: number
  dy: number
}

export type Flight = {
  at: THREE.Vector3
  speed: number
  name: string
  trail: THREE.Vector3[]
}

export type Dimension = { from: THREE.Vector3; to: THREE.Vector3; label: string }

type Point = [number, number]

const scratch = new THREE.Vector3()

export function createNotes(canvas: HTMLCanvasElement, camera: THREE.Camera) {
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2d canvas unavailable')
  let w = 1
  let h = 1
  let seed = 0

  function resize() {
    const dpr = Math.min(devicePixelRatio, 2)
    w = innerWidth
    h = innerHeight
    canvas.width = w * dpr
    canvas.height = h * dpr
    ctx?.setTransform(dpr, 0, 0, dpr, 0, 0)
  }

  function project(p: THREE.Vector3) {
    scratch.copy(p).project(camera)
    return { x: ((scratch.x + 1) / 2) * w, y: ((1 - scratch.y) / 2) * h, behind: scratch.z > 1 }
  }

  /** Slow wander along a line, re-rolled with the boil, so ruled strokes still feel drawn. */
  const wander = (i: number) =>
    Math.sin(i * 0.31 + seed * 41) * 0.8 + Math.sin(i * 0.09 + seed * 17) * 0.9

  function pencil(points: Point[], progress = 1, width = 1.7, color = CHALK) {
    const count = Math.floor(points.length * progress)
    if (!ctx || count < 2) return
    ctx.strokeStyle = color
    ctx.lineWidth = width
    ctx.beginPath()
    for (let i = 0; i < count; i++) {
      const [x, y] = points[i]
      ctx[i ? 'lineTo' : 'moveTo'](x + wander(i), y + wander(i + 40))
    }
    ctx.stroke()
  }

  const segment = (a: Point, b: Point, steps = 44): Point[] =>
    Array.from({ length: steps + 1 }, (_, i) => {
      const t = i / steps
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
    })

  const ring = (cx: number, cy: number, r: number): Point[] =>
    Array.from({ length: 73 }, (_, i) => {
      const a = (i / 72) * Math.PI * 2 - Math.PI / 2
      return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]
    })

  function lettering(text: string, x: number, y: number, font: string, color = CHALK, alpha = 1) {
    if (!ctx || alpha <= 0) return
    ctx.globalAlpha = alpha
    ctx.fillStyle = color
    ctx.font = font
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, x, y)
    ctx.globalAlpha = 1
  }

  function begin(boil: number) {
    seed = boil
    ctx?.clearRect(0, 0, w, h)
    if (ctx) {
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
    }
  }

  function annotate(notes: Note[], flights: Flight[], dimension: Dimension | null, alpha: number) {
    if (!ctx || alpha <= 0.01) return
    ctx.globalAlpha = alpha
    const small = w < 700

    if (dimension) {
      const a = project(dimension.from)
      const b = project(dimension.to)
      const y = (a.y + b.y) / 2
      ctx.strokeStyle = CHALK
      ctx.fillStyle = CHALK
      ctx.lineWidth = 1
      const mid = (a.x + b.x) / 2
      ctx.font = `italic 400 ${small ? 12 : 15}px ${SERIF}`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      const gap = ctx.measureText(dimension.label).width / 2 + 10
      ctx.beginPath()
      ctx.moveTo(a.x, y)
      ctx.lineTo(mid - gap, y)
      ctx.moveTo(mid + gap, y)
      ctx.lineTo(b.x, y)
      ctx.moveTo(a.x, y - 8)
      ctx.lineTo(a.x, y + 8)
      ctx.moveTo(b.x, y - 8)
      ctx.lineTo(b.x, y + 8)
      ctx.stroke()
      for (const [x, dir] of [[a.x, 1], [b.x, -1]]) {
        ctx.beginPath()
        ctx.moveTo(x, y)
        ctx.lineTo(x + dir * 10, y - 3)
        ctx.lineTo(x + dir * 10, y + 3)
        ctx.fill()
      }
      ctx.fillText(dimension.label, mid, y)
    }

    notes.forEach((n) => {
      const p = project(n.at)
      if (p.behind || p.x < -40 || p.x > w + 40 || p.y < -40 || p.y > h + 40) return
      const lx = p.x + n.dx
      const ly = p.y + n.dy
      ctx.strokeStyle = CHALK
      ctx.lineWidth = 1.1
      ctx.beginPath()
      ctx.moveTo(lx, ly + (n.dy < 0 ? 12 : -12))
      ctx.quadraticCurveTo(lx + n.dx * 0.1 + 16, (ly + p.y) / 2, p.x, p.y)
      ctx.stroke()
      ctx.fillStyle = CHALK
      ctx.font = `italic 400 ${small ? 15 : 21}px ${SERIF}`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(n.label, lx, ly)
    })

    for (const f of flights) {
      ctx.setLineDash([9, 8])
      pencil(f.trail.map((t) => {
        const p = project(t)
        return [p.x, p.y] as Point
      }), 1, 2, RED)
      ctx.setLineDash([])

      const p = project(f.at)
      if (p.behind) continue
      ctx.fillStyle = RED
      ctx.font = `400 ${small ? 24 : 32}px ${HAND}`
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      ctx.fillText(
        `${f.name} @ ${Math.round(f.speed)} m/s`,
        Math.min(w - 130, Math.max(20, p.x + 46)),
        Math.min(h - 50, Math.max(40, p.y - 50)),
      )
    }
    ctx.globalAlpha = 1
  }

  /** One domain branching into three empty subdomains, drawn stroke by stroke as you scroll. */
  function tree(top: number, progress: number, domain: string) {
    if (!ctx || top > h || top < -h) return
    const cx = w / 2
    const unit = Math.min(w, h * 1.5)
    const rootSize = unit * 0.115
    const rootY = top + h * 0.2
    const busY = top + h * 0.45
    const leafY = top + h * 0.62
    const r = Math.min(w * 0.115, h * 0.115)
    const xs = [w * 0.2, w * 0.5, w * 0.8]

    lettering(domain, cx, rootY, `italic 400 ${rootSize}px ${SERIF}`, CHALK, remap(progress, 0, 0.08))

    const stemTop = rootY + rootSize * 0.62
    pencil(segment([cx, stemTop], [cx, busY]), remap(progress, 0.08, 0.2))
    const bus = remap(progress, 0.2, 0.36)
    pencil(segment([cx, busY], [xs[0], busY]), bus)
    pencil(segment([cx, busY], [xs[2], busY]), bus)

    xs.forEach((x, i) => {
      const start = 0.34 + i * 0.05
      pencil(segment([x, busY], [x, leafY - r]), remap(progress, start, start + 0.1))
      ctx.setLineDash([7, 8])
      pencil(ring(x, leafY, r), remap(progress, start + 0.1, start + 0.26))
      ctx.setLineDash([])
      lettering(
        '?',
        x,
        leafY + r * 0.04,
        `italic 400 ${r * 1.1}px ${SERIF}`,
        CHALK,
        remap(progress, start + 0.24, start + 0.3),
      )
      lettering(
        'upcoming',
        x,
        leafY + r + Math.min(40, h * 0.05),
        `400 ${Math.min(unit * 0.058, 62)}px ${HAND}`,
        RED,
        remap(progress, start + 0.28, start + 0.34),
      )
    })

    lettering(
      'Stay tuned.',
      cx,
      top + h * 0.9,
      `italic 400 ${unit * 0.052}px ${SERIF}`,
      CHALK,
      remap(progress, 0.8, 0.9),
    )
  }

  function finale(top: number, name: string, people: string) {
    if (top > h) return
    const unit = Math.min(w, h * 1.5)
    lettering('Pull to yeet this page', w / 2, top + h * 0.13, `italic 400 ${unit * 0.066}px ${SERIF}`)
    lettering(`${name}, by ${people}`, w / 2, top + h - 34, `italic 400 ${Math.max(15, unit * 0.014)}px ${SERIF}`)
  }

  /** An unchanging copy of the layer, so the sheet keeps its lettering as it's crushed. */
  function copy() {
    const c = document.createElement('canvas')
    c.width = canvas.width
    c.height = canvas.height
    c.getContext('2d')?.drawImage(canvas, 0, 0)
    return c
  }

  resize()
  return { begin, annotate, tree, finale, resize, copy, clear: () => ctx.clearRect(0, 0, w, h) }
}
