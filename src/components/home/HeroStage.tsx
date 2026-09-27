'use client';

import { useState, type ReactNode } from 'react';
import Image from 'next/image';
import { Icon, type IconName } from '@/components/visual/Icons';
import { tones, type Tone } from '@/lib/semantic';
import { HERO_DASH } from '@/demo-fixture/hero-scene';
import type { RoleChatId } from '@/demo-fixture/whatsapp-chats';
import { WhatsAppPhone } from '@/components/showcase/WhatsAppPhone';

// The interactive half of the homepage hero: the principal's dashboard
// card with the school's WhatsApp phone over it, and the role strip that
// switches whose WhatsApp the phone shows. Parents first, as the founder
// asked. Fixture data only.

const ROLES: { id: RoleChatId; label: string; line: string; icon: IconName; tone: Tone }[] = [
  { id: 'principal', label: 'Principal', line: 'Complete control and insights', icon: 'principal', tone: 'product' },
  { id: 'teachers', label: 'Teachers', line: 'Plan, teach, track and communicate', icon: 'teacher', tone: 'action' },
  { id: 'students', label: 'Students', line: 'Learn, grow and track progress', icon: 'student', tone: 'alert' },
  { id: 'parents', label: 'Parents', line: 'Real-time updates on WhatsApp', icon: 'parent', tone: 'success' },
  { id: 'admin', label: 'School Admin', line: 'Manage operations efficiently', icon: 'admin', tone: 'intelligence' },
  { id: 'finance', label: 'Finance', line: 'Fees, expenses and reports', icon: 'finance', tone: 'achievement' },
];

const BADGES: { text: string; icon: IconName; cls: string; pos: string }[] = [
  { text: 'Happier Parents', icon: 'parent', cls: 'bg-emerald text-white', pos: 'left-[-1.5rem] top-[22rem]' },
  { text: 'Higher Learning Growth', icon: 'chart', cls: 'bg-tangerine text-slate', pos: 'left-[13rem] bottom-[-1.25rem]' },
  { text: 'More Satisfied Teachers', icon: 'teacher', cls: 'bg-grape text-white', pos: 'right-[15rem] bottom-[3rem]' },
  { text: 'More Admissions & Growth', icon: 'school', cls: 'bg-royal text-white', pos: 'right-[-1.5rem] bottom-[1rem]' },
];

function DashboardCard() {
  const [active, setActive] = useState(0);
  const d = HERO_DASH;
  const c = d.classes[active];
  return (
    <div className="nca-lift overflow-hidden rounded-2xl border-[6px] border-midnight bg-midnight shadow-2xl shadow-sapphire/25">
      <div className="flex min-h-[25rem] bg-white">
        <aside className="hidden w-28 shrink-0 flex-col gap-0.5 bg-midnight px-1.5 py-3 text-white xl:flex" aria-label="Demo dashboard menu">
          <p className="px-2 pb-2 text-sm font-extrabold">NetCyberAI</p>
          {d.nav.map((n, i) => (
            <a key={n.label} href="#principal-dashboard" className={`flex items-center gap-1.5 rounded-md px-1.5 py-1.5 text-[10px] font-semibold ${i === 0 ? 'bg-royal' : 'hover:bg-white/10'}`}>
              <Icon name={n.icon} className="h-3.5 w-3.5 shrink-0" />
              {n.label}
            </a>
          ))}
        </aside>
        <div className="min-w-0 flex-1 bg-off-white p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-base font-extrabold text-slate">{d.greeting}</p>
              <p className="truncate text-[11px] text-slate/70">{d.sub}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="hidden items-center gap-1.5 rounded-lg bg-white px-2 py-1 shadow-sm sm:flex">
                <span className={`flex h-6 w-6 items-center justify-center rounded-full ${tones.success.soft}`}>
                  <Icon name="check" className="h-3.5 w-3.5" />
                </span>
                <span className="leading-tight">
                  <span className="block text-[9px] text-slate/70">{d.progress.label}</span>
                  <b className="block text-sm text-slate">{d.progress.value}</b>
                </span>
              </span>
              <span className="rounded-lg border border-slate/15 bg-white px-2 py-1 text-[10px] leading-tight text-slate">
                <b className="block">{d.term.year}</b>
                {d.term.term}
              </span>
            </div>
          </div>
          <ul className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {d.kpis.map((k) => (
              <li key={k.label} className="nca-lift rounded-xl bg-white p-2 shadow-sm">
                <span className="flex items-center gap-1.5 text-[10px] text-slate/70">
                  <span className={`flex h-5 w-5 items-center justify-center rounded-md ${tones[k.tone].soft}`}>
                    <Icon name={k.icon} className="h-3 w-3" />
                  </span>
                  {k.label}
                </span>
                <b className="mt-1 block text-xl leading-none text-slate">{k.value}</b>
                <span className={`mt-1 block text-[10px] font-semibold ${tones[k.tone].fg}`}>{k.note}</span>
              </li>
            ))}
          </ul>
          <div className="mt-2.5 grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
            <div className="rounded-xl bg-white p-2.5 shadow-sm">
              <p className="flex justify-between text-[11px] font-bold text-slate">
                Attendance by Class
                <a href="#principal-dashboard" className="font-semibold text-royal hover:underline">
                  View all →
                </a>
              </p>
              <div className="relative mt-2 flex h-28 items-end gap-1.5 border-b border-l border-slate/10 pl-1" role="img" aria-label={d.classes.map((x) => `${x.cls} ${x.pct}`).join(', ')}>
                {d.classes.map((x, i) => (
                  <button
                    key={x.cls}
                    type="button"
                    onMouseEnter={() => setActive(i)}
                    onFocus={() => setActive(i)}
                    onClick={() => setActive(i)}
                    aria-label={`${x.cls}: ${x.pct} present, ${x.absent} absent`}
                    className={`flex-1 rounded-t-md transition-colors ${i === active ? 'bg-sapphire' : 'bg-royal/70 hover:bg-royal'}`}
                    style={{ height: `${x.pct}%` }}
                  />
                ))}
                <span className="pointer-events-none absolute -top-2 rounded-md bg-midnight px-1.5 py-1 text-[9px] font-semibold leading-tight text-white shadow" style={{ left: `calc(${(active / d.classes.length) * 100}% + 4px)` }}>
                  <b className="block">{c.cls}</b>
                  {`${c.pct}% Present`}
                  <br />
                  {`${c.absent} Absent`}
                </span>
              </div>
              <div className="mt-1 flex gap-1.5 pl-1" aria-hidden="true">
                {d.classes.map((x) => (
                  <span key={x.cls} className="flex-1 text-center text-[9px] text-slate/70">
                    {x.cls}
                  </span>
                ))}
              </div>
            </div>
            <div className="rounded-xl bg-white p-2.5 shadow-sm">
              <p className="flex justify-between text-[11px] font-bold text-slate">
                Today’s Learning Highlights
                <a href="#principal-dashboard" className="font-semibold text-royal hover:underline">
                  View all →
                </a>
              </p>
              <ul className="mt-1.5 flex flex-col gap-1">
                {d.highlights.map((h) => (
                  <li key={h.cls} className="nca-row flex items-center gap-2 rounded-md px-1 py-1">
                    <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${tones[h.tone].soft}`}>
                      <Icon name={h.icon} className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 leading-tight">
                      <b className="block truncate text-[11px] text-slate">{`${h.cls} – ${h.subject}`}</b>
                      <span className="block truncate text-[10px] text-slate/70">{h.topic}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function HeroStage({ copy }: { copy: ReactNode }) {
  const [role, setRole] = useState<RoleChatId>('parents');

  const roleButtons = (compact: boolean) =>
    ROLES.map((r) => {
      const on = r.id === role;
      return (
        <li key={r.id}>
          <button
            type="button"
            aria-pressed={on}
            onClick={() => setRole(r.id)}
            className={
              compact
                ? `min-h-[40px] w-full rounded-full px-2 text-xs font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-royal ${on ? 'bg-emerald text-white' : 'bg-white text-slate shadow-sm hover:bg-off-white'}`
                : `nca-lift flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-royal ${on ? 'bg-off-white ring-2 ring-emerald' : 'hover:bg-off-white'}`
            }
          >
            {compact ? (
              r.label
            ) : (
              <>
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tones[r.tone].solid}`}>
                  <Icon name={r.icon} className="h-5 w-5" />
                </span>
                <span className="min-w-0 leading-tight">
                  <b className="block text-sm text-slate">{r.label}</b>
                  <span className="block text-[11px] text-slate/70">{r.line}</span>
                </span>
              </>
            )}
          </button>
        </li>
      );
    });

  return (
    <>
      <div className="relative mx-auto grid w-full max-w-[86rem] grid-cols-1 items-start gap-8 px-4 pb-8 pt-8 sm:px-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.3fr)] lg:gap-6 lg:pb-14 lg:pt-12">
        {copy}

        <div className="relative">
          {/* Phones and tablets: pick an audience, then the phone. */}
          <ul className="mx-auto mb-4 grid max-w-sm grid-cols-3 gap-2 lg:hidden" aria-label="Whose WhatsApp to show">
            {roleButtons(true)}
          </ul>

          <div className="relative lg:min-h-[38rem]">
            <div className="hidden pr-[11rem] pt-10 lg:block xl:pr-[11.5rem]">
              <DashboardCard />
            </div>
            <p
              aria-hidden="true"
              className="nca-float-slow absolute right-[14.5rem] top-[-0.75rem] z-30 hidden rotate-6 rounded-sm bg-sunshine px-4 py-3 text-center text-lg font-extrabold italic leading-tight text-slate shadow-lg lg:block"
            >
              Connected
              <br />
              Schools ★
              <br />
              Brighter
              <br />
              Futures
            </p>
            {BADGES.map((b) => (
              <span
                key={b.text}
                aria-hidden="true"
                className={`nca-float absolute z-20 hidden max-w-[10rem] items-center gap-2 rounded-2xl px-3 py-2 text-sm font-extrabold leading-tight shadow-xl lg:flex ${b.cls} ${b.pos}`}
              >
                <Icon name={b.icon} className="h-6 w-6 shrink-0" />
                {b.text}
              </span>
            ))}
            <div className="relative z-10 lg:absolute lg:right-0 lg:top-16 lg:w-[14.5rem] xl:w-[15rem]">
              <WhatsAppPhone role={role} />
            </div>
          </div>
        </div>
      </div>

      {/* The role strip from the reference; each role switches the phone. */}
      <div className="relative z-10 mx-auto hidden w-full max-w-[86rem] px-4 sm:px-6 lg:block">
        <div className="flex items-center gap-2 rounded-2xl border border-slate/10 bg-white/95 p-2 shadow-xl backdrop-blur">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-emerald/10 text-emerald">
            <Icon name="shield" className="h-8 w-8" />
          </span>
          <Icon name="arrow" className="h-4 w-4 shrink-0 text-slate/70" />
          <ul className="grid flex-1 grid-cols-6 gap-1" aria-label="Whose WhatsApp to show">
            {roleButtons(false)}
          </ul>
        </div>
      </div>
      <HeroPeopleSlot />
    </>
  );
}

// Founder-supplied character artwork (teachers, students, a parent) goes in
// public/brand/hero-people.webp; until it exists nothing renders here.
function HeroPeopleSlot() {
  return process.env.NEXT_PUBLIC_HERO_PEOPLE === '1' ? (
    <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-24 hidden h-64 lg:block">
      <Image src="/brand/hero-people.webp" alt="" fill className="object-contain object-bottom" sizes="100vw" />
    </div>
  ) : null;
}
