import { useEffect, useRef } from 'react'
import { begin, engine, hasBegun, onBegin } from '#/lib/store'
import { createIntroGate } from '#/lib/intro'
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

    const intro = createIntroGate()
    let starting = false
    let revealTimer: ReturnType<typeof setTimeout> | undefined
    // A failed or stalled renderer must never trap the visitor at the top.
    let fallbackTimer = setTimeout(() => intro.destroy(), 12_000)
    const startIntro = () => {
      const current = engine.current
      if (!current || starting) return
      starting = true
      fallbackTimer = setTimeout(() => intro.destroy(), 12_000)
      // Match .after-start's 1.5s delay + 0.7s arrival, and wait for the actual letter impacts.
      const controlsVisible = new Promise<void>((resolve) => {
        revealTimer = setTimeout(resolve, matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 2200)
      })
      void Promise.all([current.start(), controlsVisible]).then(() => {
        if (cancelled) return
        clearTimeout(fallbackTimer)
        intro.complete()
      })
    }
    const unsubscribe = onBegin(startIntro)

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
        clearTimeout(fallbackTimer)
        engine.current = created
        document.documentElement.dataset.engine = 'ready'
        if (hasBegun()) startIntro()
      })
      .catch((error: unknown) => {
        // No WebGL: the page still reads fine on flat paper.
        console.warn('Drawing engine offline:', error)
        clearTimeout(fallbackTimer)
        if (!cancelled) intro.destroy()
      })

    if (matchMedia('(prefers-reduced-motion: reduce)').matches || scrollY > 0 || location.hash) begin(false)

    // Touch screens only unlock audio on release, not on the initial press.
    addEventListener('click', unlockAudio)
    return () => {
      cancelled = true
      unsubscribe()
      clearTimeout(revealTimer)
      clearTimeout(fallbackTimer)
      intro.destroy()
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
