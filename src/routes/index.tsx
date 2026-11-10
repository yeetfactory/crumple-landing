import { createFileRoute } from '@tanstack/react-router';

import { Finale } from '#/components/Finale';
import { Hero } from '#/components/Hero';
import { Line, Signoff, Tree } from '#/components/Sections';
import { Stage } from '#/components/Stage';

export const Route = createFileRoute('/')({ component: Home });

function Home() {
  return (
    <>
      <Stage />
      <main>
        <Hero />
        <Line />
        <Tree />
        <Signoff />
        <Finale />
      </main>
    </>
  );
}
