import { useEffect, useRef } from 'react'
import { begin, engine, hasBegun } from '#/lib/store'
import { loadSoundPreference, unlockAudio } from '#/lib/sound'

/** The fixed drawing surface, plus the layers for annotations and screen cracks. */
export function Stage() {
  const canvas = useRef<HTMLCanvasElement>(null)
  const notesCanvas = useRef<HTMLCanvasElement>(null)
  const crackCanvas = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    loadSoundPreference()

    let cancelled = false
    const byId = (id: string) => document.getElementById(id)
    const heroEl = byId('hero')
    const lineEl = byId('line')
    const treeEl = byId('tree')
    const finaleEl = byId('finale')
    if (!canvas.current || !crackCanvas.current || !notesCanvas.current) return
    if (!heroEl || !lineEl || !treeEl || !finaleEl) return

    const args = {
      canvas: canvas.current,
      crackCanvas: crackCanvas.current,
      notesCanvas: notesCanvas.current,
      heroEl,
      lineEl,
      treeEl,
      finaleEl,
      onFirstGesture: unlockAudio,
    }

    // three.js stays out of the first paint. The blue sheet and DOM title are already up.
    import('#/engine')
      .then(({ createEngine }) => createEngine(args))
      .then((created) => {
        if (cancelled) return created.destroy()
        engine.current = created
        document.documentElement.dataset.engine = 'ready'
        if (hasBegun()) created.start()
      })
      .catch((error: unknown) => {
        // No WebGL: the page still reads fine on flat paper.
        console.warn('Drawing engine offline:', error)
      })

    if (matchMedia('(prefers-reduced-motion: reduce)').matches) begin(false)

    const press = () => begin(true)
    const scrolled = () => begin(false)
    addEventListener('pointerdown', press)
    addEventListener('keydown', press)
    addEventListener('scroll', scrolled, { passive: true })
    // Touch screens only unlock audio on release, not on the initial press.
    addEventListener('click', unlockAudio)
    return () => {
      cancelled = true
      removeEventListener('pointerdown', press)
      removeEventListener('keydown', press)
      removeEventListener('scroll', scrolled)
      removeEventListener('click', unlockAudio)
      engine.current?.destroy()
      engine.current = null
      delete document.documentElement.dataset.engine
    }
  }, [])

  return (
    <>
      <canvas ref={canvas} className="stage z-0" aria-hidden="true" />
      <canvas ref={notesCanvas} className="stage pointer-events-none z-[5]" aria-hidden="true" />
      <canvas ref={crackCanvas} className="stage pointer-events-none z-30" aria-hidden="true" />
      <div className="grain" aria-hidden="true" />
      <svg width="0" height="0" className="absolute" aria-hidden="true">
        <filter id="rough">
          <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="4" />
          <feDisplacementMap in="SourceGraphic" scale="5" />
        </filter>
        <filter id="rough-small">
          <feTurbulence type="fractalNoise" baseFrequency="0.09" numOctaves="2" seed="7" />
          <feDisplacementMap in="SourceGraphic" scale="1.6" />
        </filter>
      </svg>
    </>
  )
}
