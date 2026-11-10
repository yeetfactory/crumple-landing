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

function Signature({ name }: { name: (typeof site.people)[number] }) {
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
      <div className="mt-1 flex justify-center gap-3 pt-2">
        <a
          href={site.profiles[name].github}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`${name} on GitHub (opens in a new tab)`}
          title={`${name} on GitHub`}
          className="focus-ring inline-flex size-11 items-center justify-center text-chalk hover:text-pencil"
        >
          <svg
            viewBox="0 0 24 24"
            className="size-7"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            style={{ filter: 'url(#rough-small)' }}
          >
            <path d="M9 19c-4.3 1.3-4.3-2.2-6-2.6M15 22v-3.4c0-1-.1-1.7-.6-2.2 3.1-.4 6.3-1.5 6.3-6.8 0-1.5-.5-2.7-1.4-3.7.2-.4.6-1.8-.1-3.6 0 0-1.2-.4-3.8 1.4a13 13 0 0 0-6.8 0C6 1.9 4.8 2.3 4.8 2.3c-.7 1.8-.3 3.2-.1 3.6a5.3 5.3 0 0 0-1.4 3.7c0 5.3 3.2 6.4 6.3 6.8-.4.4-.6 1.1-.6 2.2V22" />
          </svg>
        </a>
        <a
          href={site.profiles[name].website}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`${name}'s website (opens in a new tab)`}
          title={`${name}'s website`}
          className="focus-ring inline-flex size-11 items-center justify-center text-chalk hover:text-pencil"
        >
          <svg
            viewBox="0 0 24 24"
            className="size-7"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            style={{ filter: 'url(#rough-small)' }}
          >
            <path d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM3.5 9h17M3.5 15h17M12 3c-5 5-5 13 0 18 5-5 5-13 0-18Z" />
          </svg>
        </a>
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
