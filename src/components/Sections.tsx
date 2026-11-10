import { useEffect, useRef, useState } from 'react';

import { site } from '#/site';

/**
 * The line and the diagram are drawn on the canvas, positioned by these sections' scroll
 * ranges. The markup here gives them their height, and gives everyone else the words.
 */
export function Line() {
  return (
    <section id="line" className="pointer-events-none relative z-10 h-[560vh]">
      <h2 className="sr-only">Projects: upcoming. Stay tuned.</h2>
    </section>
  );
}

export function Tree() {
  return (
    <section id="tree" className="pointer-events-none relative z-10 h-[300vh]">
      <p className="sr-only">
        One domain, {site.domain}, with a subdomain for every project. Upcoming.
        Stay tuned.
      </p>
    </section>
  );
}

function Signature({ name }: { name: string }) {
  // Watch the wrapper: the signature itself starts fully clipped, which reads as "not visible".
  const ref = useRef<HTMLDivElement>(null);
  const [signed, setSigned] = useState(false);

  useEffect(() => {
    const el = ref.current;

    if (!el) return undefined;

    const seen = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setSigned(true);
      },
      { threshold: 0.5 },
    );

    seen.observe(el);

    return () => seen.disconnect();
  }, []);

  return (
    <div ref={ref} className="w-full max-w-[26rem]">
      <span
        data-signed={signed}
        className="signature hand block text-center text-[clamp(5rem,10vw,9rem)]"
      >
        {name}
      </span>
      <div className="mt-1 border-t border-chalk pt-2 text-center font-serif text-[1.1rem] italic">
        Co-founder
      </div>
    </div>
  );
}

export function Signoff() {
  const [first, second] = site.people;

  return (
    <section className="relative z-10 flex min-h-svh flex-col items-center justify-center gap-14 px-6 md:flex-row md:gap-[8vw]">
      <Signature name={first} />
      <Signature name={second} />
    </section>
  );
}
