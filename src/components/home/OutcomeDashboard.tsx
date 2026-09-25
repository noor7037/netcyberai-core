import type { ReactNode } from 'react';
import { Container } from '@/components/ui/Container';
import { SectionHeading, DemoLabel } from '@/components/visual/Primitives';
import { ColumnChart, Funnel, LineChart, Meter } from '@/components/visual/Charts';
import { Icon, type IconName } from '@/components/visual/Icons';
import { tones, type Tone } from '@/lib/semantic';
import { colors } from '@/lib/design-tokens';
import {
  admissionsFunnel,
  classPerformance,
  feeCollectionTrend,
  learningGrowth,
  outcomeTiles,
  parentResponse,
  teacherImpactSignals,
} from '@/demo-fixture/website-demo';

const META: Record<(typeof outcomeTiles)[number]['key'], { tone: Tone; icon: IconName; chart: () => ReactNode }> = {
  learning: {
    tone: 'intelligence',
    icon: 'academics',
    chart: () => (
      <LineChart
        dark
        title="Class average score through the term"
        labels={learningGrowth.labels}
        series={[{ name: 'Class average', color: colors.grape, values: learningGrowth.classAverage }]}
        min={50}
        max={80}
        height={150}
      />
    ),
  },
  parents: {
    tone: 'communication',
    icon: 'chat',
    chart: () => (
      <LineChart
        dark
        title="Parents reading the Daily Learning Pulse, by week"
        labels={parentResponse.labels}
        series={[{ name: 'Read rate', color: colors.cyan, values: parentResponse.read }]}
        min={50}
        max={100}
        unit="%"
        height={150}
      />
    ),
  },
  fees: {
    tone: 'action',
    icon: 'fees',
    chart: () => (
      <ColumnChart
        dark
        title="Fee collection by month, rupees lakh"
        data={feeCollectionTrend.labels.map((l, i) => ({ label: l, value: feeCollectionTrend.values[i] }))}
        color={colors.tangerine}
        unit="L"
        height={150}
      />
    ),
  },
  results: {
    tone: 'product',
    icon: 'exams',
    chart: () => <ColumnChart dark title="Term 1 average score by subject" data={classPerformance} color={colors.electric} max={100} height={150} />,
  },
  teachers: {
    tone: 'success',
    icon: 'sparkle',
    chart: () => (
      <ul className="flex flex-col gap-2.5">
        {teacherImpactSignals.map((s) => (
          <li key={s.label}>
            <div className="flex justify-between text-xs opacity-90">
              <span>{s.label}</span>
              <span className="font-semibold">{`${s.value}%`}</span>
            </div>
            <Meter dark value={s.value} color={colors.turquoise} label={s.label} />
          </li>
        ))}
      </ul>
    ),
  },
  admissions: {
    tone: 'achievement',
    icon: 'admissions',
    chart: () => <Funnel dark title="Admissions funnel" stages={admissionsFunnel} colors={[colors.cyan, colors.electric, colors.grape, colors.gold]} />,
  },
};

export function OutcomeDashboard() {
  return (
    <section aria-labelledby="outcome-title" className="relative overflow-hidden bg-midnight text-white">
      <div aria-hidden="true" className="nca-mesh-dark absolute inset-0" />
      <Container wide className="relative flex flex-col gap-10 py-20">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <SectionHeading
            dark
            id="outcome-title"
            eyebrow="Outcome dashboard"
            tone="success"
            title="What a school can measure, in one place"
            lead="The outcome views a principal gets: learning growth, parent engagement, fee operations, results, teacher signals and admissions."
          />
          <DemoLabel onDark />
        </div>
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {outcomeTiles.map((t) => {
            const meta = META[t.key];
            return (
              <li key={t.key} className="nca-glass flex flex-col gap-4 rounded-3xl p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${tones[meta.tone].solid}`}>
                      <Icon name={meta.icon} className="h-5 w-5" />
                    </span>
                    <p className="font-bold">{t.title}</p>
                  </div>
                </div>
                <div>
                  <p className="text-3xl font-extrabold">{t.value}</p>
                  <p className="text-xs opacity-80">{t.detail}</p>
                </div>
                {meta.chart()}
              </li>
            );
          })}
        </ul>
        <p className="max-w-3xl text-sm opacity-80">
          Every figure in this section is illustrative, drawn from a fictional school. NetCyberAI has not yet published
          results from live schools and does not claim any of these numbers as outcomes.
        </p>
      </Container>
    </section>
  );
}
