'use client';

import { useState } from 'react';
import { Tabs } from '@/components/ui/Tabs';
import { Icon } from '@/components/visual/Icons';
import { MODULES, SCHOOL, TECH_STRIP, VISUALS, WORKFLOW_STEPS, type ModuleId } from '@/demo-fixture/principal-dashboard';
import { Card, Chip, splitKpi } from './bits';
import { ModuleVisual } from './ModuleVisual';

// The reference's generic module page: header, banner with the stack,
// four KPIs, then Overview / Records / Features / Automation tabs.

export function ModulePage({ id, onAdd, toast }: { id: ModuleId; onAdd: () => void; toast: (msg: string) => void }) {
  const m = MODULES[id];
  const visual = VISUALS[id];
  const [q, setQ] = useState('');
  const rows = m.rows.filter((r) => r.join(' ').toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[11px] text-slate/70">{SCHOOL.sessionLine}</p>
          <h2 className="text-xl font-extrabold text-slate">{m.title}</h2>
          <p className="text-sm text-slate/70">{m.desc}</p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button type="button" onClick={onAdd} className="nca-lift inline-flex min-h-[36px] items-center gap-1.5 rounded-lg bg-slate px-3 text-sm font-bold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-royal">
            <span aria-hidden="true">＋</span> Add
          </button>
          <button
            type="button"
            onClick={() => toast(`Demo: ${m.title} report exported. Nothing left this page.`)}
            aria-label={`Export ${m.title} report`}
            className="nca-lift inline-flex min-h-[36px] min-w-[36px] items-center justify-center rounded-lg border border-slate/15 bg-white text-slate focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-royal"
          >
            <Icon name="download" className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] gap-3">
        <div className="flex flex-col gap-2 rounded-xl bg-slate p-4 text-white">
          <p className="text-base font-extrabold">{m.title}</p>
          <p className="text-xs opacity-90">{`${m.desc} The screen below connects workflow records to the NetCyberAI intelligence layer.`}</p>
          <ul className="mt-auto flex flex-wrap gap-1.5" aria-label="Platform stack">
            {TECH_STRIP.map((t) => (
              <li key={t} className="rounded-full border border-white/25 px-2 py-0.5 text-[10px] font-semibold">
                {t}
              </li>
            ))}
          </ul>
        </div>
        <ul className="grid grid-cols-2 gap-2">
          {m.kpis.map((k, i) => {
            const { value, label } = splitKpi(k);
            return (
              <li key={k} className="nca-lift flex flex-col rounded-xl border border-slate/10 bg-white p-3">
                <span className="text-[10px] font-bold uppercase tracking-wide text-slate/70">{`Metric ${String(i + 1).padStart(2, '0')}`}</span>
                <span className="text-lg font-extrabold leading-tight text-slate">{value}</span>
                <span className="text-xs font-semibold text-slate">{label}</span>
                <span className="text-[10px] text-slate/70">Current school view</span>
              </li>
            );
          })}
        </ul>
      </div>

      <Tabs
        idPrefix={`m-${id}-`}
        label={`${m.title} views`}
        items={[
          {
            id: 'overview',
            label: 'Overview',
            content: (
              <div className="grid grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] gap-3">
                <Card title="Signature Visual" sub={visual.title} aside={<Chip tone="neutral">{`${m.features.length} capabilities`}</Chip>}>
                  <ModuleVisual blocks={visual.blocks} />
                </Card>
                <Card title="Priority Queue" sub="Records connected to this workflow." aside={<Chip tone="neutral">{`${m.rows.length} active`}</Chip>}>
                  <ul className="flex flex-col">
                    {m.rows.map((r) => (
                      <li key={r.join('|')} className="nca-row flex items-center justify-between gap-2 rounded-md border-b border-slate/5 px-1.5 py-2 last:border-0">
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-bold text-slate">{r[0]}</span>
                          <span className="block truncate text-[11px] text-slate/70">{r.slice(1, -1).join(' · ')}</span>
                        </span>
                        <Chip>{r[r.length - 1]}</Chip>
                      </li>
                    ))}
                  </ul>
                </Card>
              </div>
            ),
          },
          {
            id: 'records',
            label: 'Records',
            content: (
              <Card
                title="Records & Activity"
                sub="Search the active dataset and export the view."
                aside={
                  <label className="flex items-center gap-2 text-xs font-semibold text-slate">
                    <span className="sr-only">{`Search ${m.title} records`}</span>
                    <input
                      type="search"
                      value={q}
                      onChange={(e) => setQ(e.target.value)}
                      placeholder="Search records..."
                      className="min-h-[36px] w-48 rounded-lg border border-slate/20 bg-white px-3 text-sm text-slate focus-visible:outline focus-visible:outline-2 focus-visible:outline-royal"
                    />
                  </label>
                }
              >
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate/10 text-xs text-slate/70">
                      {['Record', 'Context', 'Metric', 'Status'].map((h) => (
                        <th key={h} scope="col" className="px-2 py-2 font-bold">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.join('|')} className="nca-row border-b border-slate/5 last:border-0">
                        <td className="px-2 py-2 font-semibold text-slate">{r[0]}</td>
                        <td className="px-2 py-2 text-slate">{r[1]}</td>
                        <td className="px-2 py-2 text-slate">{r.slice(2, -1).join(' · ') || '—'}</td>
                        <td className="px-2 py-2">
                          <Chip>{r[r.length - 1]}</Chip>
                        </td>
                      </tr>
                    ))}
                    {rows.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-2 py-6 text-center text-sm text-slate/70">
                          No records match that search.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </Card>
            ),
          },
          {
            id: 'features',
            label: 'Features',
            content: (
              <Card title="Complete Feature Map" sub="Everything exposed by this navigation item." aside={<Chip tone="neutral">{`${m.features.length} capabilities`}</Chip>}>
                <ul className="grid grid-cols-3 gap-2">
                  {m.features.map((f, i) => (
                    <li key={f}>
                      <button
                        type="button"
                        onClick={() => toast(`Demo: ${f} · workflow opened.`)}
                        className="nca-lift flex w-full items-center gap-2 rounded-lg border border-slate/10 bg-white px-2.5 py-2 text-left text-xs font-semibold text-slate hover:border-emerald focus-visible:outline focus-visible:outline-2 focus-visible:outline-royal"
                      >
                        <span className="font-extrabold text-emerald">{String(i + 1).padStart(2, '0')}</span>
                        <span className="min-w-0 flex-1">{f}</span>
                        <span aria-hidden="true" className="text-slate/70">
                          →
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </Card>
            ),
          },
          {
            id: 'automation',
            label: 'Automation',
            content: (
              <div className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] gap-3">
                <Card title="Recommended automation" sub="Run a permission-checked workflow using the current module context.">
                  <button
                    type="button"
                    onClick={() => toast('Demo: workflow started with approval and audit controls active.')}
                    className="nca-lift inline-flex min-h-[40px] w-fit items-center gap-2 rounded-lg bg-emerald px-4 text-sm font-bold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-royal"
                  >
                    <Icon name="play" className="h-4 w-4" /> Run workflow
                  </button>
                </Card>
                <Card title="Evidence → Action → Outcome" sub="NetCyberAI keeps evidence, action, approval and outcome feedback connected." aside={<Chip tone="intelligence">Tenant scoped · Audit logged</Chip>}>
                  <ol className="grid grid-cols-5 gap-1.5">
                    {WORKFLOW_STEPS.map((s, i) => (
                      <li key={s} className="nca-lift flex flex-col rounded-lg bg-grape/10 px-2 py-2 text-center">
                        <span className="text-[10px] font-extrabold text-grape-deep">{`0${i + 1}`}</span>
                        <span className="text-xs font-bold text-slate">{s}</span>
                      </li>
                    ))}
                  </ol>
                </Card>
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}
