'use client';

import { useCallback, useState } from 'react';
import { useWords } from '@/components/app-shell/Words';
import { PRIMARY_ACTION, QUIET_ACTION } from '@/components/app-ui/ModulePage';
import { Badge } from '@/components/ui/Badge';
import type { QueueResponse, QueueResponseFull, QueueStatus } from '@/lib/content/response-queue';
import type { MessageKey } from '@/lib/i18n';

// Control → Content → Responses to review (M2-12, C286; docs/family-app/11 L1). The explanations made by AI that
// families asked for, most asked first. Open one to read its blocks in the order and words the family reads them (with
// each question's right answer marked, for the reviewer), then mark it checked or withdraw it. Control may not draw the
// family's own components (scripts/check_family_boundary.py), so the blocks are drawn here as plain text. No child's
// data is on this screen: a cached response is a syllabus topic's teaching only.

const SECTION = 'flex flex-col gap-3 rounded-md border border-slate/10 bg-white p-4';
const LINK = 'inline-flex min-h-[44px] items-center self-start font-semibold text-sapphire underline';

type Age = { oldestDays: number | null; targetDays: number; overdue: boolean };
type Note = { ok: boolean; text: string };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const str = (v: unknown) => (typeof v === 'string' ? v : '');
const arr = (v: unknown): Any[] => (Array.isArray(v) ? v : []);

function BlockText({ b }: { b: Any }) {
  const { t } = useWords();
  const type = str(b?.type);
  const heading = (
    <p className="font-bold" data-queue-block={type}>
      {t(`control.queue.block.${type}` as MessageKey)}
    </p>
  );
  const items = (list: Any[]) => (
    <ol className="flex list-decimal flex-col gap-2 pl-5">
      {list.map((it, i) => (
        <li key={i}>
          <p>{str(it?.question)}</p>
          <ul className="list-disc pl-5">
            {arr(it?.options).map((o, j) => (
              <li key={j} className={j === it?.answer ? 'font-semibold text-emerald-text' : ''}>
                {str(o)}
                {j === it?.answer ? ` (${t('control.queue.block.rightOption')})` : ''}
                {j !== it?.answer && str(arr(it?.wrong)[j]) && <span className="block text-slate/70">{t('control.queue.block.wrongWhy', { text: str(arr(it?.wrong)[j]) })}</span>}
              </li>
            ))}
          </ul>
          {str(it?.hint) && <p className="text-slate/70">{t('control.queue.block.hint', { text: str(it.hint) })}</p>}
          {str(it?.why) && <p className="text-slate/70">{t('control.queue.block.why', { text: str(it.why) })}</p>}
        </li>
      ))}
    </ol>
  );
  switch (type) {
    case 'explanation':
      return (
        <div className="flex flex-col gap-1">
          {heading}
          <p className="font-semibold">{str(b.title)}</p>
          <p>{str(b.idea)}</p>
          {arr(b.paragraphs).map((para, i) => (
            <p key={i}>{str(para)}</p>
          ))}
          {str(b.example) && <p>{t('control.queue.block.example', { text: str(b.example) })}</p>}
          <ol className="list-decimal pl-5">
            {arr(b.steps).map((s, i) => (
              <li key={i}>{str(s)}</li>
            ))}
          </ol>
          {arr(b.terms).length > 0 && (
            <ul className="list-disc pl-5">
              {arr(b.terms).map((x, i) => (
                <li key={i}>{t('control.queue.block.term', { en: str(x?.en), local: str(x?.local) })}</li>
              ))}
            </ul>
          )}
        </div>
      );
    case 'worked_example':
      return (
        <div className="flex flex-col gap-1">
          {heading}
          <p>{str(b.problem)}</p>
          <ol className="list-decimal pl-5">
            {arr(b.steps).map((s, i) => (
              <li key={i}>{[str(s?.text), str(s?.expression), str(s?.result) && `= ${str(s.result)}`].filter(Boolean).join(' ')}</li>
            ))}
          </ol>
          <p className="font-semibold">{t('control.queue.block.answer', { text: str(b.answer) })}</p>
        </div>
      );
    case 'key_points':
      return (
        <div className="flex flex-col gap-1">
          {heading}
          <ul className="list-disc pl-5">
            {arr(b.points).map((p, i) => (
              <li key={i}>{str(p)}</li>
            ))}
          </ul>
        </div>
      );
    case 'diagram':
      return (
        <div className="flex flex-col gap-1">
          {heading}
          <p className="font-semibold">{str(b.title)}</p>
          <ol className="list-decimal pl-5">
            {arr(b.edges).map((e, i) => {
              const label = (id: unknown) => str(arr(b.nodes).find((n) => n?.id === id)?.label);
              return <li key={i}>{[label(e?.from), '→', label(e?.to), str(e?.label) && `(${str(e.label)})`].filter(Boolean).join(' ')}</li>;
            })}
          </ol>
        </div>
      );
    case 'mind_map':
      return (
        <div className="flex flex-col gap-1">
          {heading}
          <p className="font-semibold">{str(b.title)}</p>
          <p>{str(b.root)}</p>
          <ul className="list-disc pl-5">
            {arr(b.branches).map((br, i) => (
              <li key={i}>{[str(br?.label), ...arr(br?.leaves).map(str)].filter(Boolean).join(' → ')}</li>
            ))}
          </ul>
        </div>
      );
    case 'check':
    case 'practice':
      return (
        <div className="flex flex-col gap-1">
          {heading}
          {items(arr(b.items))}
        </div>
      );
    case 'english_moment':
      return (
        <div className="flex flex-col gap-1">
          {heading}
          <ul className="list-disc pl-5">
            {arr(b.words).map((x, i) => (
              <li key={i}>{t('control.queue.block.term', { en: str(x?.en), local: str(x?.meaning) })}</li>
            ))}
          </ul>
          <p>{t('control.queue.block.sentence', { text: str(b.sentence) })}</p>
        </div>
      );
    case 'sources':
      return (
        <div className="flex flex-col gap-1">
          {heading}
          <ul className="list-disc pl-5">
            {arr(b.links).map((l, i) => (
              <li key={i}>
                {str(l?.label)} ({str(l?.url)})
              </li>
            ))}
          </ul>
        </div>
      );
    default:
      return null;
  }
}

export function ResponseQueueView({ initial, age: initialAge }: { initial: QueueResponse[]; age: Age }) {
  const { t, tCount, lang } = useWords();
  const [status, setStatus] = useState<QueueStatus>('ai_made');
  const [rows, setRows] = useState<QueueResponse[]>(initial);
  const [age, setAge] = useState<Age>(initialAge);
  const [open, setOpen] = useState<QueueResponseFull | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<Note | null>(null);

  const day = (iso: string | null) => (iso ? new Intl.DateTimeFormat(lang === 'hi' ? 'hi-IN' : 'en-IN', { dateStyle: 'medium', timeZone: 'Asia/Kolkata' }).format(new Date(iso)) : '');
  const errorText = (code: unknown) => t(typeof code === 'string' && /^[a-z_]+$/.test(code) ? (`control.queue.err.${code}` as MessageKey) : 'control.queue.err.failed');

  const load = useCallback(async (which: QueueStatus) => {
    const res = await fetch(`/api/control/content/responses?status=${which}`, { cache: 'no-store' }).catch(() => null);
    const got = res?.ok ? ((await res.json().catch(() => null)) as { responses: QueueResponse[]; age: Age } | null) : null;
    if (!got) return setNote({ ok: false, text: t('control.queue.err.failed') });
    setRows(got.responses);
    setAge(got.age);
  }, [t]);

  async function show(id: string) {
    if (open?.responseId === id) return setOpen(null);
    const res = await fetch(`/api/control/content/responses/${id}`, { cache: 'no-store' }).catch(() => null);
    const got = res ? await res.json().catch(() => null) : null;
    if (!res?.ok || !got) return setNote({ ok: false, text: errorText(got?.code) });
    setOpen(got as QueueResponseFull);
  }

  async function act(id: string, action: 'check' | 'withdraw') {
    if (action === 'withdraw' && !window.confirm(t('control.queue.confirmWithdraw'))) return;
    setBusy(true);
    setNote(null);
    const res = await fetch(`/api/control/content/responses/${id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) }).catch(() => null);
    const got = res ? await res.json().catch(() => null) : null;
    setBusy(false);
    if (!res?.ok) return setNote({ ok: false, text: errorText(got?.code) });
    setNote({ ok: true, text: t(action === 'check' ? 'control.queue.done.checked' : 'control.queue.done.withdrawn') });
    setOpen(null);
    await load(status);
  }

  async function switchTo(next: QueueStatus) {
    if (next === status) return;
    setStatus(next);
    setOpen(null);
    await load(next);
  }

  return (
    <div lang={lang} data-queue className="flex flex-col gap-4 text-sm text-slate">
      {note && (
        <p role="status" data-queue-note={note.ok ? 'ok' : 'error'} className={`rounded-md px-3 py-2 font-semibold ${note.ok ? 'bg-off-white text-slate' : 'border border-red-800/30 text-red-800'}`}>
          {note.text}
        </p>
      )}
      <section className={SECTION}>
        <p>{t('control.queue.how')}</p>
        {age.oldestDays !== null && (
          <p data-queue-oldest={age.overdue ? 'overdue' : 'ok'} className={age.overdue ? 'font-semibold text-red-800' : ''}>
            {t('control.queue.oldest', { days: age.oldestDays, target: age.targetDays })} {age.overdue ? t('control.queue.overdue', { target: age.targetDays }) : ''}
          </p>
        )}
        <div role="group" aria-label={t('control.queue.tabs')} className="flex flex-wrap gap-2">
          {(['ai_made', 'checked'] as const).map((s) => (
            <button key={s} type="button" aria-pressed={status === s} data-queue-tab={s} onClick={() => void switchTo(s)} className={status === s ? PRIMARY_ACTION : QUIET_ACTION}>
              {t(`control.queue.tab.${s}`)}
            </button>
          ))}
        </div>
      </section>

      <section className={SECTION} aria-label={t('control.queue.list')} data-queue-list={status}>
        {rows.length === 0 && <p className="text-slate/70">{t(status === 'ai_made' ? 'control.queue.none' : 'control.queue.noneChecked')}</p>}
        {rows.map((r) => (
          <div key={r.responseId} data-queue-row={r.responseId} data-asks={r.asks} className="flex flex-col gap-2 rounded-md border border-slate/10 p-3">
            <p className="flex flex-wrap items-center gap-2">
              <span className="font-bold">{t('control.queue.row.title', { board: r.board, cls: r.classLevel, subject: r.subject, topic: r.topicTitle ?? r.topicKey })}</span>
              <Badge variant={r.status === 'checked' ? 'success' : 'neutral'}>{t(`control.queue.label.${r.status}`)}</Badge>
            </p>
            <p className="text-slate/70">{r.topicKey}</p>
            <p>
              {tCount('control.queue.row.asks', r.asks)} · {tCount('control.queue.row.age', r.ageDays)}
            </p>
            <p className="text-slate/70">{t('control.queue.row.meta', { language: r.language, style: r.style, prompt: r.promptVersion })}</p>
            {r.checkedAt && (
              <p className="text-slate/70">
                {t('control.queue.row.checkedOn', { date: day(r.checkedAt) })} {r.checkedByMe ? t('control.queue.row.byYou') : ''}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <button type="button" data-queue-open onClick={() => void show(r.responseId)} className={QUIET_ACTION}>
                {t(open?.responseId === r.responseId ? 'control.queue.close' : 'control.queue.open')}
              </button>
              {r.status === 'ai_made' && (
                <button type="button" data-queue-check disabled={busy} onClick={() => void act(r.responseId, 'check')} className={PRIMARY_ACTION}>
                  {t('control.queue.check')}
                </button>
              )}
              <button type="button" data-queue-withdraw disabled={busy} onClick={() => void act(r.responseId, 'withdraw')} className={QUIET_ACTION}>
                {t('control.queue.withdraw')}
              </button>
            </div>
            {open?.responseId === r.responseId && (
              <div data-queue-body className="flex flex-col gap-3 rounded-md bg-off-white p-3">
                <p className="font-semibold">{t('control.queue.asFamily')}</p>
                <p className="text-slate/70">{t('control.queue.made', { provider: open.provider, model: open.model })}</p>
                {open.blocks.map((b, i) => (
                  <BlockText key={i} b={b} />
                ))}
              </div>
            )}
          </div>
        ))}
      </section>
      <a href="/control/audit-logs" className={LINK}>
        {t('control.content.history')}
      </a>
    </div>
  );
}
