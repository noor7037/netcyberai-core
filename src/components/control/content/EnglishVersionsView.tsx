'use client';

import { useCallback, useState } from 'react';
import { useWords } from '@/components/app-shell/Words';
import { PRIMARY_ACTION, QUIET_ACTION } from '@/components/app-ui/ModulePage';
import { Badge } from '@/components/ui/Badge';
import { Textarea } from '@/components/ui/Textarea';
import type { EnglishControlVersion } from '@/lib/content/english-library';
import type { MessageKey } from '@/lib/i18n';

// Control → Content: the English course (docs/family-app/12 §11, C274). Each track's versions through the same review
// as syllabus versions: approve to staff preview, read every lesson, release to everyone, roll back in one step, or
// reject with a note. Course content only; no child's data is on this screen.

const SECTION = 'flex flex-col gap-3 rounded-md border border-slate/10 bg-white p-4';
type Unit = { key: string; position: number; titleEn: string; titleHi: string; canDoEn: string; canDoHi: string; pic: string; lessons: Record<string, unknown>[] };

const statusKey = (v: EnglishControlVersion): MessageKey =>
  v.status === 'published' ? (v.audience === 'everyone' ? 'control.content.status.everyone' : 'control.content.status.staff_preview') : (`control.content.status.${v.status}` as MessageKey);
const statusVariant = (v: EnglishControlVersion) => (v.status === 'published' ? (v.audience === 'everyone' ? 'success' : 'warning') : v.status === 'rejected' || v.status === 'withdrawn' ? 'danger' : 'neutral');

// Every English and Hindi line of a lesson, in file order, for the reviewer to read.
function lines(node: unknown, out: { en?: string; hi?: string }[] = []): { en?: string; hi?: string }[] {
  if (Array.isArray(node)) node.forEach((n) => lines(n, out));
  else if (node && typeof node === 'object') {
    const o = node as Record<string, unknown>;
    if (typeof o.en === 'string') out.push({ en: o.en, hi: typeof o.hi === 'string' ? o.hi : undefined });
    else if (typeof o.model === 'string') out.push({ en: o.model, hi: typeof o.hi === 'string' ? o.hi : undefined });
    else if (typeof o.answer === 'string') out.push({ en: o.answer, hi: typeof o.hi === 'string' ? o.hi : undefined });
    for (const [k, v] of Object.entries(o)) if (k !== 'title' && k !== 'home' && typeof v === 'object') lines(v, out);
  }
  return out;
}

export function EnglishVersionsView({ initial }: { initial: EnglishControlVersion[] }) {
  const { t, lang } = useWords();
  const [versions, setVersions] = useState(initial);
  const [shown, setShown] = useState<{ versionId: string; units: Unit[] } | null>(null);
  const [confirm, setConfirm] = useState<{ versionId: string; action: 'release' | 'rollback' } | null>(null);
  const [rejecting, setRejecting] = useState<{ versionId: string; text: string } | null>(null);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const day = (iso: string | null) => (iso ? new Intl.DateTimeFormat(lang === 'hi' ? 'hi-IN' : 'en-IN', { dateStyle: 'medium', timeZone: 'Asia/Kolkata' }).format(new Date(iso)) : '');
  const fill = (key: MessageKey, p: Record<string, string | number>) => t(key).replace(/\{(\w+)\}/g, (w, n: string) => (n in p ? String(p[n]) : w));

  const load = useCallback(async () => {
    const res = await fetch('/api/control/content/english', { cache: 'no-store' }).catch(() => null);
    const got = res?.ok ? ((await res.json().catch(() => null)) as { versions: EnglishControlVersion[] } | null) : null;
    if (got) setVersions(got.versions);
  }, []);

  async function act(versionId: string, action: 'approve' | 'reject' | 'release' | 'rollback', extra: Record<string, string> = {}) {
    setNote(null);
    const res = await fetch(`/api/control/content/english/${versionId}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...extra }) }).catch(() => null);
    const got = res ? await res.json().catch(() => null) : null;
    setConfirm(null);
    setRejecting(null);
    if (res?.ok) {
      const done: Record<string, MessageKey> = { approve: 'control.content.done.approved', reject: 'control.content.done.rejected', release: 'control.content.done.released', rollback: 'control.content.done.rolledBack' };
      setNote({ ok: true, text: t(done[action]) });
      await load();
    } else {
      const code = typeof got?.code === 'string' && /^[a-z_]+$/.test(got.code) ? got.code : 'failed';
      setNote({ ok: false, text: t(`control.content.err.${code}` as MessageKey) });
    }
  }

  async function preview(versionId: string) {
    if (shown?.versionId === versionId) return setShown(null);
    const res = await fetch(`/api/control/content/english/${versionId}`, { cache: 'no-store' }).catch(() => null);
    const got = res?.ok ? ((await res.json().catch(() => null)) as { units: Unit[] } | null) : null;
    if (got) setShown({ versionId, units: got.units });
  }

  return (
    <section className={SECTION} aria-labelledby="english-versions">
      <h2 id="english-versions" className="text-lg font-bold text-slate">
        {t('control.english.title')}
      </h2>
      <p className="text-sm text-slate">{t('control.english.how')}</p>
      {note && (
        <p role="status" className={`rounded-md p-3 text-sm ${note.ok ? 'bg-turquoise/10 text-slate' : 'bg-coral/10 text-slate'}`}>
          {note.text}
        </p>
      )}
      {versions.length === 0 && <p className="text-sm text-slate">{t('control.english.none')}</p>}
      <ul className="flex flex-col gap-3">
        {versions.map((v) => (
          <li key={v.versionId} className="flex flex-col gap-2 rounded-md border border-slate/10 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-slate">{t(`fam.english.track.${v.track}` as MessageKey)}</span>
              <Badge variant={statusVariant(v)}>{t(statusKey(v))}</Badge>
            </div>
            <p className="text-sm text-slate">{fill('control.english.version', { no: v.versionNo, units: v.units, lessons: v.lessons })}</p>
            <p className="text-sm text-slate">{fill('control.english.from', { ref: v.importRef ?? '', date: day(v.importedAt) })}</p>
            {v.releasedAt && <p className="text-sm text-slate">{fill('control.content.version.released', { date: day(v.releasedAt) })}</p>}
            {v.reviewNote && <p className="text-sm text-slate">{fill('control.content.version.note', { note: v.reviewNote })}</p>}
            <div className="flex flex-wrap gap-2">
              <button type="button" className={QUIET_ACTION} onClick={() => void preview(v.versionId)}>
                {shown?.versionId === v.versionId ? t('control.content.preview.hide') : t('control.content.preview.show')}
              </button>
              {v.status === 'in_review' && (
                <>
                  <button type="button" className={PRIMARY_ACTION} onClick={() => void act(v.versionId, 'approve')}>
                    {t('control.content.action.approve')}
                  </button>
                  <button type="button" className={QUIET_ACTION} onClick={() => setRejecting({ versionId: v.versionId, text: '' })}>
                    {t('control.content.action.reject')}
                  </button>
                </>
              )}
              {v.status === 'published' && v.audience === 'staff_preview' && (
                <button type="button" className={PRIMARY_ACTION} onClick={() => setConfirm({ versionId: v.versionId, action: 'release' })}>
                  {t('control.content.action.release')}
                </button>
              )}
              {v.canRollBack && (
                <button type="button" className={QUIET_ACTION} onClick={() => setConfirm({ versionId: v.versionId, action: 'rollback' })}>
                  {t('control.content.action.rollback')}
                </button>
              )}
            </div>
            {confirm?.versionId === v.versionId && (
              <div className="flex flex-wrap items-center gap-2 rounded-md bg-sunshine/20 p-3 text-sm text-slate">
                <span>{t(confirm.action === 'release' ? 'control.content.confirm.release' : 'control.content.confirm.rollback')}</span>
                <button type="button" className={PRIMARY_ACTION} onClick={() => void act(v.versionId, confirm.action)}>
                  {t('control.english.confirm')}
                </button>
                <button type="button" className={QUIET_ACTION} onClick={() => setConfirm(null)}>
                  {t('control.content.reject.cancel')}
                </button>
              </div>
            )}
            {rejecting?.versionId === v.versionId && (
              <div className="flex flex-col gap-2">
                <Textarea label={t('control.content.reject.note')} id={`reject-${v.versionId}`} value={rejecting.text} onChange={(e) => setRejecting({ versionId: v.versionId, text: e.target.value })} maxLength={1000} />
                <div className="flex gap-2">
                  <button type="button" className={PRIMARY_ACTION} onClick={() => void act(v.versionId, 'reject', { note: rejecting.text })}>
                    {t('control.content.reject.send')}
                  </button>
                  <button type="button" className={QUIET_ACTION} onClick={() => setRejecting(null)}>
                    {t('control.content.reject.cancel')}
                  </button>
                </div>
              </div>
            )}
            {shown?.versionId === v.versionId && (
              <ol className="flex flex-col gap-3">
                {shown.units.map((u) => (
                  <li key={u.key} className="rounded-md border border-slate/10 p-3">
                    <details>
                      <summary className="min-h-[44px] cursor-pointer py-2 font-semibold text-slate">
                        {u.pic} {u.position}. {u.titleEn} · {u.titleHi}
                      </summary>
                      <p className="text-sm text-slate">
                        🎯 {u.canDoEn} · {u.canDoHi}
                      </p>
                      {u.lessons.map((l, i) => {
                        const title = l.title as { en: string; hi?: string };
                        return (
                          <div key={i} className="mt-2 flex flex-col gap-1 rounded-md bg-off-white p-2 text-sm text-slate">
                            <span className="font-semibold">
                              {fill('control.english.lesson', { n: i + 1 })} · {String(l.kind)} · {title.en}
                            </span>
                            <span>{fill('control.english.check', { n: Array.isArray(l.check) ? l.check.length : 0 })}</span>
                            <ul className="list-disc pl-5">
                              {lines([l.title, l.steps, l.home]).map((x, k) => (
                                <li key={k}>
                                  <span lang="en">{x.en}</span>
                                  {x.hi && <span lang="hi"> · {x.hi}</span>}
                                </li>
                              ))}
                            </ul>
                            {Array.isArray(l.check) && l.check.length > 0 && (
                              <ol className="list-decimal pl-5">
                                {(l.check as { key: string; prompt?: { en: string; hi?: string }; options?: { text?: string; pic?: string }[]; answer: number | string; hi?: string }[]).map((c) => (
                                  <li key={c.key}>
                                    <span lang="en">{c.prompt?.en ?? c.hi}</span>
                                    {c.options ? (
                                      <span>
                                        {' — '}
                                        {c.options.map((o, oi) => (
                                          <span key={oi} className={oi === c.answer ? 'font-bold underline' : ''}>
                                            {o.text ?? o.pic}
                                            {oi < (c.options?.length ?? 0) - 1 ? ' / ' : ''}
                                          </span>
                                        ))}
                                      </span>
                                    ) : (
                                      <span lang="en" className="font-bold underline">
                                        {' — '}
                                        {String(c.answer)}
                                      </span>
                                    )}
                                  </li>
                                ))}
                              </ol>
                            )}
                          </div>
                        );
                      })}
                    </details>
                  </li>
                ))}
              </ol>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
