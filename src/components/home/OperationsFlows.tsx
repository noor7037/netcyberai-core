'use client';

import { useState, type KeyboardEvent, type ReactNode } from 'react';
import { FlowStepper, type Step } from '@/components/visual/FlowStepper';
import { Container } from '@/components/ui/Container';
import { SectionHeading, DemoLabel } from '@/components/visual/Primitives';
import { Icon, type IconName } from '@/components/visual/Icons';
import { ColumnChart, Funnel } from '@/components/visual/Charts';
import { FeeBucketsPanel } from '@/components/visual/Screens';
import { tones, type Tone } from '@/lib/semantic';
import { colors } from '@/lib/design-tokens';
import { admissionsFunnel, certificateSteps, feeCollectionTrend, feeFlowSteps } from '@/demo-fixture/website-demo';

const admissionsSteps: Step[] = [
  { title: 'Enquiry', detail: 'From the website, a call or a walk-in' },
  { title: 'Follow-up', detail: 'Owner and next date assigned' },
  { title: 'Campus visit', detail: 'Visit booked and logged' },
  { title: 'Application', detail: 'Documents captured and checked' },
  { title: 'Admission', detail: 'Student record created once' },
];

const TABS: { key: string; label: string; icon: IconName; tone: Tone; body: () => ReactNode }[] = [
  {
    key: 'fees',
    label: 'Fees',
    icon: 'fees',
    tone: 'action',
    body: () => (
      <div className="flex flex-col gap-6">
        <FlowStepper
          steps={feeFlowSteps}
          tones={['action', 'communication', 'product', 'success', 'trust']}
          icons={['bell', 'chat', 'fees', 'certificate', 'chart']}
        />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate/10 bg-white p-4">
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate/70">Collection by month (₹ lakh)</p>
            <ColumnChart
              title="Fee collection by month, rupees lakh"
              data={feeCollectionTrend.labels.map((l, i) => ({ label: l, value: feeCollectionTrend.values[i] }))}
              color={colors.tangerine}
              unit="L"
            />
          </div>
          <div className="rounded-2xl border border-slate/10 bg-white p-4">
            <p className="mb-3 text-xs font-bold uppercase tracking-wide text-slate/70">This term</p>
            <FeeBucketsPanel />
          </div>
        </div>
      </div>
    ),
  },
  {
    key: 'admissions',
    label: 'Admissions',
    icon: 'admissions',
    tone: 'product',
    body: () => (
      <div className="flex flex-col gap-6">
        <FlowStepper
          steps={admissionsSteps}
          tones={['communication', 'action', 'product', 'intelligence', 'success']}
          icons={['chat', 'bell', 'school', 'exams', 'check']}
        />
        <div className="rounded-2xl border border-slate/10 bg-white p-4">
          <p className="mb-3 text-xs font-bold uppercase tracking-wide text-slate/70">Admissions funnel, this season</p>
          <Funnel title="Admissions funnel" stages={admissionsFunnel} colors={[colors.cyan, colors.royal, colors.grape, colors.turquoise]} />
        </div>
      </div>
    ),
  },
  {
    key: 'certificates',
    label: 'Certificates',
    icon: 'certificate',
    tone: 'trust',
    body: () => (
      <div className="flex flex-col gap-6">
        <FlowStepper
          steps={certificateSteps}
          tones={['trust', 'action', 'product', 'communication', 'success']}
          icons={['certificate', 'fees', 'exams', 'chat', 'shield']}
        />
        <p className="rounded-2xl bg-sapphire/10 p-4 text-sm text-sapphire">
          <span className="font-bold">Rule enforced by the product:</span> a Transfer, Bonafide or Character
          certificate is generated only after financial clearance, or a formal waiver recorded by an authorised
          person. The PDF goes to the verified guardian number on WhatsApp, and the audit record keeps who approved
          it and when.
        </p>
      </div>
    ),
  },
];

export function OperationsFlows() {
  const [tab, setTab] = useState(0);

  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'ArrowRight') setTab((t) => (t + 1) % TABS.length);
    if (e.key === 'ArrowLeft') setTab((t) => (t - 1 + TABS.length) % TABS.length);
  }

  return (
    <section aria-labelledby="ops-title" className="nca-mesh-light bg-off-white">
      <Container wide className="flex flex-col gap-10 py-20">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <SectionHeading
            id="ops-title"
            eyebrow="Automation"
            tone="action"
            title="Fees, admissions and certificates, connected end to end"
            lead="Each workflow runs on the same validated record, so a payment, an admission or a certificate never has to be re-entered somewhere else."
          />
          <DemoLabel />
        </div>
        <div role="tablist" aria-label="Workflows" onKeyDown={onKey} className="flex flex-wrap gap-2">
          {TABS.map((t, i) => (
            <button
              key={t.key}
              id={`ops-tab-${t.key}`}
              role="tab"
              type="button"
              aria-selected={i === tab}
              aria-controls={`ops-panel-${t.key}`}
              tabIndex={i === tab ? 0 : -1}
              onClick={() => setTab(i)}
              className={`inline-flex min-h-[44px] items-center gap-2 rounded-full px-4 text-sm font-bold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-royal ${
                i === tab ? `${tones[t.tone].solid} shadow-lg` : 'bg-white text-slate hover:bg-slate/5'
              }`}
            >
              <Icon name={t.icon} className="h-4 w-4" />
              {t.label}
            </button>
          ))}
        </div>
        <div key={TABS[tab].key} id={`ops-panel-${TABS[tab].key}`} role="tabpanel" aria-labelledby={`ops-tab-${TABS[tab].key}`} className="nca-pop">
          {TABS[tab].body()}
        </div>
      </Container>
    </section>
  );
}
