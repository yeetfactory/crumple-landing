import { useEffect, useRef, useState } from 'react'
import { site } from '#/site'
import { begin, engine } from '#/lib/store'
import { loadSoundPreference, playClick, setSoundEnabled, unlockAudio } from '#/lib/sound'

function SoundToggle() {
  const [on, setOn] = useState(true)
  useEffect(() => setOn(loadSoundPreference()), [])
  return (
    <button
      type="button"
      className="focus-ring pointer-events-auto cursor-pointer border-0 bg-transparent p-1 text-chalk transition-transform duration-100 hover:scale-110 active:scale-90"
      aria-label={on ? 'Turn sound off' : 'Turn sound on'}
      aria-pressed={on}
      onClick={() => {
        unlockAudio()
        setSoundEnabled(!on)
        setOn(!on)
        playClick()
      }}
    >
      <svg
        viewBox="0 0 32 32"
        className="block size-7"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        style={{ filter: 'url(#rough-small)' }}
      >
        <path d="M4 12.5v7h5l8 6.5V6l-8 6.5z" />
        {on ? (
          <>
            <path d="M21 12c1.6 2.4 1.6 5.6 0 8" />
            <path d="M24.5 8.5c3.4 4.4 3.4 10.6 0 15" />
          </>
        ) : (
          <path d="M21 11.5l8 9M29 11.5l-8 9" stroke="var(--color-pencil)" />
        )}
      </svg>
    </button>
  )
}

function Actuator({ className = '', onPress, label = 'YEET' }: { className?: string; onPress: () => void; label?: string }) {
  return (
    <button type="button" className={`actuator pointer-events-auto ${className}`} onClick={onPress} aria-label={label}>
      <svg viewBox="0 0 160 160" aria-hidden="true" style={{ filter: 'url(#rough)' }}>
        <path
          d="M80 12c38-2 68 28 68 66s-28 70-68 70-70-30-68-72C14 42 40 14 84 10"
          fill="none"
          stroke="var(--color-pencil)"
          strokeWidth="5"
          strokeLinecap="round"
        />
        <path
          d="M44 40 112 20M26 58 134 26M18 76 144 38M14 94 148 52M16 110 150 68M20 124 150 84M28 136 146 100M42 146 136 116M64 150 118 132"
          fill="none"
          stroke="var(--color-pencil)"
          strokeWidth="13"
          strokeLinecap="round"
        />
      </svg>
      <span>YEET</span>
    </button>
  )
}

export function Hero() {
  const overlay = useRef<HTMLElement>(null)

  // The lettering dissolves as the camera takes off, so it never sits over the flight.
  useEffect(() => {
    const update = () => {
      const el = overlay.current
      if (!el) return
      const fade = 1 - scrollY / (el.offsetHeight * 0.3)
      el.style.opacity = String(Math.max(0, fade))
      el.style.visibility = fade <= 0 ? 'hidden' : 'visible'
    }
    update()
    addEventListener('scroll', update, { passive: true })
    return () => removeEventListener('scroll', update)
  }, [])

  return (
    <section
      id="hero"
      ref={overlay}
      className="pointer-events-none relative z-10 flex h-svh min-h-[34rem] flex-col justify-between px-6 pt-6 pb-7 sm:px-10 sm:pt-8 sm:pb-9"
    >
      <header className="grid grid-cols-[1fr_auto_1fr] items-baseline gap-4">
        <span />
        <p className="m-0 text-center font-serif text-[clamp(1rem,1.5vw,1.3rem)] font-bold tracking-[0.2em] whitespace-nowrap uppercase sm:tracking-[0.34em]">
          {site.name}
        </p>
        <div className="text-right">
          <SoundToggle />
        </div>
      </header>

      <h1 className="dom-title m-0 text-center font-serif text-[clamp(6rem,27vw,26rem)] leading-[0.86] font-bold">
        <span className="sr-only">{site.name}: </span>
        <span aria-hidden="true">YEET</span>
        <span className="sr-only">
          Fun projects by Rishikesh and Sriram. Projects upcoming, stay tuned.
        </span>
      </h1>

      {/* The opening: an empty sheet, and the one thing that fills it. */}
      <div className="gate absolute inset-x-0 top-[27%] flex flex-col items-center sm:top-[24%]">
        <Actuator className="actuator-large" label="YEET — Click to start" onPress={() => begin(true)} />
        <p className="m-0 mt-4 -rotate-3 font-hand text-[clamp(1.8rem,3vw,2.3rem)] leading-none" aria-hidden="true">
          Click to start
        </p>
      </div>

      <div className="after-start grid grid-cols-[1fr_auto] items-end gap-4 md:grid-cols-[1fr_auto_1fr]">
        <p className="m-0 max-w-[24rem] font-serif text-[clamp(1.45rem,min(2.7vw,4.4vh),2.5rem)] leading-[1.08] italic">
          Fun projects by Rishikesh &amp; Sriram.
        </p>

        <div className="needs-engine relative">
          <p className="hand absolute top-3 left-[108%] m-0 w-40 -rotate-3 text-[2.1rem] max-lg:hidden">
            or throw a letter
          </p>
          <Actuator
            onPress={() => {
              unlockAudio()
              engine.current?.yeetAll()
            }}
          />
        </div>

        <p className="m-0 hidden text-right font-serif text-[clamp(1.45rem,min(2.7vw,4.4vh),2.5rem)] leading-[1.08] italic md:block">
          Projects upcoming.
          <br />
          Stay tuned.
        </p>
      </div>
    </section>
  )
}
