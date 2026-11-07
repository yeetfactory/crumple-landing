import * as THREE from 'three'
import { HAND, SERIF } from './palette'

/** Every texture is white marks on transparent. `inkMaterial` decides which pencil they use. */

function canvas(w: number, h: number) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d')
  if (!ctx) throw new Error('2d canvas unavailable')
  ctx.fillStyle = '#fff'
  ctx.strokeStyle = '#fff'
  return { c, ctx }
}

function toTexture(c: HTMLCanvasElement, repeat = false) {
  const t = new THREE.CanvasTexture(c)
  t.anisotropy = 8
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping
  return t
}

/** A closed loop drawn the way a hand draws one: overshooting where it meets itself. */
function pencilLoop(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number) {
  ctx.beginPath()
  for (let i = 0; i <= 74; i++) {
    const a = (i / 64) * Math.PI * 2 - 2
    const drift = 1 + i * 0.0009 + Math.sin(i * 0.4) * 0.008
    const x = cx + Math.cos(a) * rx * drift
    const y = cy + Math.sin(a) * ry * drift
    ctx[i ? 'lineTo' : 'moveTo'](x, y)
  }
  ctx.stroke()
}

export function floorLettering() {
  const { c, ctx } = canvas(2048, 400)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `700 300px ${SERIF}`
  ctx.letterSpacing = '74px'
  ctx.fillText('FACTORY', c.width / 2 + 37, c.height / 2 + 12)
  return toTexture(c)
}

export function beltMarks() {
  const { c, ctx } = canvas(512, 512)
  ctx.lineWidth = 14
  ctx.lineJoin = 'miter'
  for (let x = -128; x < 640; x += 128) {
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x + 100, 256)
    ctx.lineTo(x, 512)
    ctx.stroke()
  }
  return toTexture(c, true)
}

export function crateLabel(id: string) {
  const { c, ctx } = canvas(512, 512)
  ctx.textAlign = 'center'
  ctx.font = `700 58px ${SERIF}`
  ctx.letterSpacing = '8px'
  ctx.fillText('PROJECT', 256, 118)
  ctx.letterSpacing = '0px'
  ctx.font = `700 150px ${SERIF}`
  ctx.fillText(id, 256, 262)
  return toTexture(c)
}

/** Painted on the floor along the belt, the same way FACTORY is painted in front of the word. */
export function floorTuned() {
  const { c, ctx } = canvas(2048, 340)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `700 230px ${SERIF}`
  ctx.letterSpacing = '56px'
  ctx.fillText('STAY TUNED', c.width / 2 + 28, c.height / 2 + 10)
  return toTexture(c)
}

export function stampMark() {
  const { c, ctx } = canvas(512, 512)
  ctx.translate(256, 256)
  ctx.rotate(-0.16)
  ctx.lineWidth = 11
  ctx.strokeRect(-232, -84, 464, 168)
  ctx.lineWidth = 3
  ctx.strokeRect(-218, -70, 436, 140)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `700 92px ${SERIF}`
  ctx.fillText('UPCOMING', 0, 6)
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.save()
  ctx.globalCompositeOperation = 'destination-out'
  for (let i = 0; i < 1400; i++) {
    ctx.globalAlpha = Math.random() * 0.8
    ctx.beginPath()
    ctx.arc(Math.random() * 512, Math.random() * 512, Math.random() * Math.random() * 6, 0, 7)
    ctx.fill()
  }
  ctx.restore()
  return toTexture(c)
}

/** The sign is split into two words that sit either side of the press. */
export function signLettering() {
  const { c, ctx } = canvas(2048, 512)
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'center'
  ctx.font = `700 150px ${SERIF}`
  ctx.letterSpacing = '4px'
  ctx.fillText('PROJECTS', 400, 266)
  return toTexture(c)
}

export function signRedline() {
  const { c, ctx } = canvas(2048, 512)
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'center'
  ctx.font = `400 270px ${HAND}`
  ctx.fillText('upcoming', 1640, 262)
  ctx.lineWidth = 9
  ctx.lineCap = 'round'
  pencilLoop(ctx, 1640, 262, 372, 170)
  return toTexture(c)
}

/** Comic impact puff: a little outlined cloud, not a soft particle. */
export function puffMark() {
  const { c, ctx } = canvas(128, 128)
  ctx.lineWidth = 5
  ctx.lineCap = 'round'
  ctx.beginPath()
  for (let i = 0; i < 7; i++) {
    const a0 = (i / 7) * Math.PI * 2
    const a1 = ((i + 1) / 7) * Math.PI * 2
    const r = 34 + (i % 2) * 9
    ctx.moveTo(64 + Math.cos(a0) * r, 64 + Math.sin(a0) * r)
    ctx.quadraticCurveTo(
      64 + Math.cos((a0 + a1) / 2) * (r + 20),
      64 + Math.sin((a0 + a1) / 2) * (r + 20),
      64 + Math.cos(a1) * r,
      64 + Math.sin(a1) * r,
    )
  }
  ctx.stroke()
  return toTexture(c)
}
