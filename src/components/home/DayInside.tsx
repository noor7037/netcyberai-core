'use client';

import type { ReactNode } from 'react';
import { Container } from '@/components/ui/Container';
import { SectionHeading, DemoLabel } from '@/components/visual/Primitives';
import { Carousel } from '@/components/visual/Carousel';
import { BrowserFrame } from '@/components/visual/Frames';
import {
  FinanceScreen,
  HomeworkScreen,
  ParentPulsePhone,
  PrincipalScreen,
  PulseComposerScreen,
  SchoolHealthScreen,
  StudentProgressScreen,
  TeacherTodayScreen,
} from '@/components/visual/Screens';
import { tones, type Tone } from '@/lib/semantic';
import { dayTimeline } from '@/demo-fixture/website-demo';

const VISUALS: { tone: Tone; visual: ReactNode }[] = [
  { tone: 'product', visual: <BrowserFrame url="app.netcyberai.com/today"><TeacherTodayScreen /></BrowserFrame> },
  { tone: 'product', visual: <BrowserFrame url="app.netcyberai.com/homework"><HomeworkScreen /></BrowserFrame> },
  { tone: 'intelligence', visual: <BrowserFrame url="app.netcyberai.com/pulse"><PulseComposerScreen /></BrowserFrame> },
  { tone: 'communication', visual: <ParentPulsePhone /> },
  { tone: 'action', visual: <BrowserFrame url="app.netcyberai.com/fees"><FinanceScreen /></BrowserFrame> },
  { tone: 'trust', visual: <BrowserFrame url="app.netcyberai.com/principal"><PrincipalScreen /></BrowserFrame> },
  { tone: 'achievement', visual: <BrowserFrame url="app.netcyberai.com/progress"><StudentProgressScreen /></BrowserFrame> },
  { tone: 'success', visual: <BrowserFrame url="app.netcyberai.com/health"><SchoolHealthScreen /></BrowserFrame> },
];

export function DayInside() {
  const slides = dayTimeline.map((d, i) => ({
    id: d.title,
    label: `${d.time} ${d.title}`,
    content: (
      <div className="grid grid-cols-1 items-center gap-8 lg:grid-cols-5">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <span className={`w-fit rounded-full px-3 py-1 text-sm font-extrabold ${tones[VISUALS[i].tone].solid}`}>{d.time}</span>
          <p className="text-3xl font-extrabold">{d.title}</p>
          <p className="text-lg opacity-90">{d.detail}</p>
          <p className="text-sm font-semibold opacity-80">{`Moment ${i + 1} of ${dayTimeline.length}`}</p>
        </div>
        <div className="lg:col-span-3">{VISUALS[i].visual}</div>
      </div>
    ),
  }));

  return (
    <section id="product-tour" aria-labelledby="day-title" className="relative scroll-mt-20 overflow-hidden bg-sapphire text-white">
      <div aria-hidden="true" className="nca-mesh-dark absolute inset-0" />
      <Container wide className="relative flex flex-col gap-10 py-20">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <SectionHeading
            dark
            id="day-title"
            eyebrow="Product tour"
            tone="achievement"
            title="A day inside NetCyberAI"
            lead="From the first attendance mark to the end-of-day health check: eight moments, each shown in the actual product screen."
          />
          <DemoLabel onDark />
        </div>
        <Carousel onDark slides={slides} label="A day inside NetCyberAI" />
      </Container>
    </section>
  );
}
