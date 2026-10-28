import type { ReactNode } from 'react';

// The frame of the door pages (W6-B, docs/38 §5): the first steps (agree, set the PIN, add a child) and the parent PIN
// gate. The same band as every other screen (family.css `.fam-band`), the app's name above the title, and the form in
// a card pulled up under it. Server or client: it holds no state.
export function GateFrame({ app, title, lead, children }: { app: string; title: string; lead?: string; children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="fam-band rounded-b-[2rem] bg-royal-deep bg-gradient-to-br from-midnight via-royal-deep to-violet px-4 pb-12 pt-6 text-white">
        <span aria-hidden="true" className="fam-band-dots" />
        <div className="mx-auto flex w-full max-w-md flex-col gap-2">
          <p className="fam-eyebrow text-white">{app}</p>
          <h1 className="fam-rise text-3xl font-extrabold leading-tight tracking-tight text-white">{title}</h1>
          {lead && <p className="text-base font-semibold text-white">{lead}</p>}
        </div>
      </header>
      <main className="fam-gate">
        <div className="fam-card fam-rise flex flex-col gap-5 bg-white p-5 text-slate">{children}</div>
      </main>
    </div>
  );
}
