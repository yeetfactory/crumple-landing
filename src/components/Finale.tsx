import { useRef } from 'react';

import { playRatchet, unlockAudio } from '#/lib/sound';
import { engine } from '#/lib/store';
import { site } from '#/site';

const THROW_PX = 260;
const FIRE_AT = 0.94;
const TEETH = 9;
const NUDGE = 0.14;

/** Lets the lever visibly slam home before the page starts to crumple. */
const SLAM_MS = 260;

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The lever is a 3D object on the canvas. This is the invisible handle you actually grab. */
export function Finale() {
  const firing = useRef(false);
  const dragging = useRef(false);
  const start = useRef({ x: 0, y: 0 });
  const tooth = useRef(0);

  async function fire() {
    if (firing.current || !engine.current) return;
    firing.current = true;
    dragging.current = false;
    engine.current.pullLever(1);
    await wait(SLAM_MS);
    const root = document.documentElement;
    root.dataset.crumple = 'true';
    await engine.current.crumple();
    delete root.dataset.crumple;
    firing.current = false;
  }

  return (
    <section id="finale" className="relative z-10 h-svh min-h-[34rem]">
      <h2 className="sr-only">Pull to yeet this page</h2>
      <p className="sr-only">
        {site.name}, by {site.people.join(' and ')}.
      </p>
      <button
        type="button"
        aria-label="Pull the lever to crumple this page and throw it"
        className="focus-ring absolute top-[24%] bottom-[8%] left-1/2 w-[min(38rem,92vw)] -translate-x-1/2 cursor-grab touch-none border-0 bg-transparent p-0 active:cursor-grabbing"
        onClick={(e) => {
          // Keyboards can't drag, so Enter and Space pull it in one go. Pointers have to mean it.
          if (e.detail === 0) void fire();
        }}
        onPointerDown={(e) => {
          if (firing.current) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          start.current = { x: e.clientX, y: e.clientY };
          dragging.current = true;
          tooth.current = 0;
          unlockAudio();
          // Give under the hand straight away, so it's obvious this thing moves.
          engine.current?.pullLever(NUDGE);
          playRatchet();
        }}
        onPointerMove={(e) => {
          if (!dragging.current || firing.current) return;

          const pulled =
            e.clientX - start.current.x + (e.clientY - start.current.y) * 0.8;

          const t = Math.min(1, Math.max(NUDGE, NUDGE + pulled / THROW_PX));
          engine.current?.pullLever(t);
          const next = Math.floor(t * TEETH);

          if (next !== tooth.current) {
            tooth.current = next;
            playRatchet();
          }

          if (t >= FIRE_AT) void fire();
        }}
        onPointerUp={() => {
          if (!dragging.current) return;
          dragging.current = false;

          // Let go early and it springs back. Only a full pull counts.
          if (!firing.current) engine.current?.pullLever(0);
        }}
        onPointerCancel={() => {
          dragging.current = false;

          if (!firing.current) engine.current?.pullLever(0);
        }}
      />
    </section>
  );
}
