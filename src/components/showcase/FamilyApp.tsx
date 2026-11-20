import { lessonColors as c } from '@/lib/design-tokens';
import { familyShowcase as f } from '@/demo-fixture/family-showcase';
import { PhoneShell } from './PhoneShell';

// The Family app's tutor screen as a phone preview: a concept card, then a
// numbered solution, then the check-in question. Colours are the Family
// app's own (warm paper, teal, saffron, plum), from design-tokens.

export function FamilyApp() {
  return (
    <PhoneShell
      label="NetCyberAI Family app, tutor answer (example)"
      bar="slate"
      screen=""
      height="h-[34rem]"
      header={
        <div className="flex items-center gap-2 px-4 py-2" style={{ background: c.card, borderBottom: `1px solid ${c.line}` }}>
          <span aria-hidden="true" className="flex h-8 w-8 items-center justify-center rounded-full text-sm font-extrabold" style={{ background: c.plum, color: c.card }}>
            N
          </span>
          <span className="flex flex-col leading-tight">
            <b className="text-sm" style={{ color: c.ink }}>Tutor</b>
            <span className="text-xs" style={{ color: c.muted }}>{f.subject}</span>
          </span>
        </div>
      }
      footer={
        <ul className="flex items-center justify-between gap-1 px-2 py-1 text-[11px] font-bold" style={{ background: c.card, borderTop: `1px solid ${c.line}`, color: c.muted }}>
          {f.tabs.map((t, i) => (
            <li key={t} className="flex min-h-[44px] flex-1 items-center justify-center rounded-lg" style={i === 0 ? { background: c.teal, color: c.card } : undefined}>
              {t}
            </li>
          ))}
        </ul>
      }
    >
      <div className="flex min-h-full flex-col gap-3 p-3" style={{ background: c.paper }}>
        <p className="ml-auto max-w-[18rem] rounded-2xl rounded-br-sm px-3 py-2 text-sm font-semibold" style={{ background: c.saffron, color: c.ink }}>
          {f.question}
        </p>
        <div className="flex flex-col gap-1 rounded-2xl p-3" style={{ background: c.card, border: `1px solid ${c.line}` }}>
          <span className="w-fit rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ background: c.teal, color: c.card }}>Concept</span>
          <b className="text-sm" style={{ color: c.ink }}>{f.concept.title}</b>
          <p className="text-sm" style={{ color: c.ink }}>{f.concept.body}</p>
        </div>
        <div className="flex flex-col gap-2 rounded-2xl p-3" style={{ background: c.card, border: `1px solid ${c.line}` }}>
          <b className="text-sm" style={{ color: c.ink }}>{f.stepsTitle}</b>
          <ol className="flex flex-col gap-2">
            {f.steps.map((s, i) => (
              <li key={s} className="flex items-start gap-2 text-sm" style={{ color: c.ink }}>
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-extrabold" style={{ background: c.plum, color: c.card }}>{i + 1}</span>
                {s}
              </li>
            ))}
          </ol>
        </div>
        <p className="text-sm font-bold" style={{ color: c.ink }}>{f.followUp}</p>
        <div className="flex flex-wrap gap-2">
          {f.replies.map((r, i) => (
            <span key={r} className="inline-flex min-h-[44px] items-center rounded-full px-4 text-sm font-bold" style={i === 0 ? { background: c.teal, color: c.card } : { background: c.card, color: c.saffronDeep, border: `1.5px solid ${c.saffronDeep}` }}>
              {r}
            </span>
          ))}
        </div>
      </div>
    </PhoneShell>
  );
}
