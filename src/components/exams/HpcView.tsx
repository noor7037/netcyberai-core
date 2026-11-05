'use client';

import { useCallback, useEffect, useState } from 'react';
import { useT } from '@/components/app-shell/LangContext';
import { Modal } from '@/components/ui/Modal';
import { Textarea } from '@/components/ui/Textarea';
import { HPC_FIELDS, hpcBlocks, type HpcCard, type HpcEntry, type HpcField } from '@/lib/exams/hpc-text';
import type { HpcScreen } from '@/lib/exams/hpc';
import type { MessageKey } from '@/lib/i18n';
import { CardPreview } from './CardPreview';
import { momentWords } from './exam-format';
import { PRIMARY, SECTION, TAP } from './SchemeParts';

// A class's Holistic Progress Cards (W21-M4) for the school's current session. Each child in roll order with the four
// boxes the school fills (the session's remark, health and physical education, the child's self-assessment, the parent's
// feedback), whether their card is published, and a preview of the card as the PDF prints it, made on the server from the
// published results. The office publishes the cards for families, after a confirm, as report cards are published.
// Nothing here compares one child with another.

const MAX = 600;
const LABEL: Record<HpcField, MessageKey> = {
  teacherRemark: 'w21m4.hpc.field.teacherRemark',
  healthNote: 'w21m4.hpc.field.healthNote',
  selfAssessment: 'w21m4.hpc.field.selfAssessment',
  parentFeedback: 'w21m4.hpc.field.parentFeedback',
};
const toWords = (e: HpcEntry): Record<HpcField, string> => ({ teacherRemark: e.teacherRemark ?? '', healthNote: e.healthNote ?? '', selfAssessment: e.selfAssessment ?? '', parentFeedback: e.parentFeedback ?? '' });

// The type is the server's (src/lib/exams/hpc.ts); only the type is imported here.
export function HpcView({ classId }: { classId: string }) {
  const { t, lang } = useT();
  const [data, setData] = useState<HpcScreen | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [words, setWords] = useState<Record<string, Record<HpcField, string>>>({});
  const [shown, setShown] = useState<{ studentId: string; card: HpcCard } | null>(null);
  const base = `/api/app/exams/hpc/${classId}`;

  const load = useCallback(async () => {
    const res = await fetch(base, { cache: 'no-store' }).catch(() => null);
    const got = res?.ok ? ((await res.json().catch(() => null)) as HpcScreen | null) : null;
    setFailed(!got);
    if (got) {
      setData(got);
      setWords(Object.fromEntries(got.children.map((c) => [c.studentId, toWords(c.entry)])));
    }
  }, [base]);
  useEffect(() => {
    void load();
  }, [load]);

  const post = async (payload: unknown, done: (body: Record<string, unknown>) => string) => {
    setBusy(true);
    setNote(null);
    const res = await fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).catch(() => null);
    const body = res ? ((await res.json().catch(() => null)) as Record<string, unknown> | null) : null;
    setBusy(false);
    if (!res?.ok || !body) {
      setNote({ ok: false, text: t('w21m4.hpc.error') });
      return;
    }
    setNote({ ok: true, text: done(body) });
    setShown(null);
    await load();
  };

  const preview = async (studentId: string) => {
    if (shown?.studentId === studentId) return setShown(null);
    const res = await fetch(`${base}?card=${encodeURIComponent(studentId)}`, { cache: 'no-store' }).catch(() => null);
    const card = res?.ok ? ((await res.json().catch(() => null)) as HpcCard | null) : null;
    if (card) setShown({ studentId, card });
    else setNote({ ok: false, text: t('w21m4.hpc.failed') });
  };

  if (failed) return <p role="alert" className="rounded-md bg-off-white px-3 py-2 text-sm text-slate">{t('w21m4.hpc.failed')}</p>;
  if (!data) return null;
  if (!data.session) return <p data-hpc-no-session className="rounded-md bg-off-white px-3 py-2 text-sm text-slate">{t('w21m4.hpc.screen.noSession')}</p>;
  const who = (c: HpcScreen['children'][number]) => (c.rollNo ? t('ex.entry.child', { roll: c.rollNo, name: c.name }) : c.name);
  const set = (studentId: string, f: HpcField, v: string) => setWords((w) => ({ ...w, [studentId]: { ...w[studentId], [f]: v.slice(0, MAX) } }));
  const save = () => post({ action: 'save', entries: data.children.map((c) => ({ studentId: c.studentId, ...words[c.studentId] })) }, (b) => t('w21m4.hpc.saved', { n: Number(b.saved) }));

  return (
    <div lang={lang} data-hpc-view className="flex flex-col gap-4 text-sm text-slate">
      <section className={SECTION}>
        <h2 className="text-base font-bold">{data.title ?? t('w21m4.hpc.title')} · {data.className}</h2>
        <p data-hpc-session>{t('w21m4.hpc.screen.session', { session: data.session.label })}</p>
        <p className="text-slate/80">{t('w21m4.hpc.max')} {t('w21m4.hpc.renameHint')}</p>
        <div className="flex flex-wrap gap-2">
          {data.mayWrite && data.children.length > 0 && (
            <button type="button" data-hpc-save className={PRIMARY} disabled={busy} onClick={() => void save()}>
              {t('w21m4.hpc.save')}
            </button>
          )}
          {data.mayPublish && data.children.length > 0 ? (
            <button type="button" data-hpc-publish className={TAP} disabled={busy} onClick={() => setConfirming(true)}>
              {t('w21m4.hpc.publish')}
            </button>
          ) : (
            <p className="flex min-h-[44px] items-center text-slate/80">{t('w21m4.hpc.officeOnly')}</p>
          )}
        </div>
        {note && (
          <p role={note.ok ? 'status' : 'alert'} data-hpc-note={note.ok ? 'ok' : 'error'} className="rounded-md bg-off-white px-3 py-2">
            {note.text}
          </p>
        )}
      </section>

      {!data.children.length && <p className="rounded-md bg-off-white px-3 py-2">{t('w21m4.hpc.screen.noChildren')}</p>}

      <ol className="flex flex-col gap-3">
        {data.children.map((c) => (
          <li key={c.studentId} data-hpc-child={c.studentId} className={SECTION}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-base font-bold">{who(c)}</p>
              <p data-hpc-status className="text-slate/80">
                {c.card ? t('w21m4.hpc.published', { version: c.card.version, date: momentWords(c.card.publishedAt, lang) }) : t('w21m4.hpc.notPublished')}
              </p>
            </div>
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {HPC_FIELDS.map((f) => (
                <Textarea
                  key={f}
                  id={`hpc-${c.studentId}-${f}`}
                  label={t(LABEL[f])}
                  floating={false}
                  rows={3}
                  maxLength={MAX}
                  disabled={!data.mayWrite || busy}
                  value={words[c.studentId]?.[f] ?? ''}
                  onChange={(e) => set(c.studentId, f, e.target.value)}
                  data-hpc-field={f}
                />
              ))}
            </div>
            <button type="button" data-hpc-preview className={`${TAP} self-start`} aria-expanded={shown?.studentId === c.studentId} onClick={() => void preview(c.studentId)}>
              {shown?.studentId === c.studentId ? t('w21m4.hpc.hide') : t('w21m4.hpc.preview')}
            </button>
            {shown?.studentId === c.studentId && <CardPreview blocks={hpcBlocks(shown.card, lang)} />}
          </li>
        ))}
      </ol>

      <Modal open={confirming} onClose={() => setConfirming(false)} title={t('w21m4.hpc.confirm.title', { className: data.className })}>
        <div data-hpc-publish-confirm className="flex flex-col gap-4">
          <p>{t('w21m4.hpc.confirm.text')}</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              data-hpc-publish-confirm-button
              className={PRIMARY}
              disabled={busy}
              onClick={() => {
                setConfirming(false);
                void post({ action: 'publish' }, (b) => t('w21m4.hpc.done', { n: Number(b.published) }));
              }}
            >
              {t('w21m4.hpc.confirm.yes')}
            </button>
            <button type="button" data-hpc-publish-cancel className={TAP} onClick={() => setConfirming(false)}>
              {t('w21m4.hpc.confirm.no')}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
