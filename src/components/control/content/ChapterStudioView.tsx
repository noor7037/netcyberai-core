'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useWords } from '@/components/app-shell/Words';
import { PRIMARY_ACTION, QUIET_ACTION } from '@/components/app-ui/ModulePage';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import type { StudioOverview, StudioRequest, StudioVersion } from '@/lib/content/chapter-studio';
import type { MessageKey } from '@/lib/i18n';

// Control → Content → Studio (S3, C376). The missing-chapter queue, every chapter version, and the editor of the one
// open: the reviewer types or corrects the blocks (the one block schema, JSON), saves, marks the version reviewed and
// publishes it. The preview below the editor is the family's own reader (the page renders it), so what is previewed is
// what the child gets. A published version never changes: a new version is a copy that keeps the block ids.

const SECTION = 'flex flex-col gap-3 rounded-md border border-slate/10 bg-white p-4';
const CODES = ['not_found', 'bad_request', 'wrong_state', 'open_version', 'exists', 'not_ready', 'problem', 'storage_unavailable'];
const PROBLEMS = ['bad_key', 'bad_subject', 'title_en', 'title_hi', 'blocks_en', 'blocks_hi', 'block_en', 'block_hi', 'ids_en', 'ids_hi', 'no_devanagari_hi'];
const REQUEST_VARIANT = { received: 'neutral', digitizing: 'warning', ready: 'success', declined: 'danger' } as const;
const VERSION_VARIANT = { draft: 'neutral', reviewed: 'warning', published: 'success', retired: 'danger' } as const;
const pretty = (blocks: unknown[]) => JSON.stringify(blocks, null, 2);
const latest = (o: StudioOverview, key: string) => Math.max(...o.chapters.filter((c) => c.chapterKey === key).map((c) => c.versionNo), 1);

export function ChapterStudioView({ initial, selected }: { initial: StudioOverview; selected: StudioVersion | null }) {
  const { t } = useWords();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [declining, setDeclining] = useState<{ id: string; reason: string } | null>(null);
  const [fresh, setFresh] = useState({ key: '', subject: '', title: '' });
  const [edit, setEdit] = useState(() => (selected ? { titleEn: selected.titleEn, titleHi: selected.titleHi, en: pretty(selected.blocks.en), hi: pretty(selected.blocks.hi), note: selected.note ?? '' } : null));
  const open = selected && (selected.status === 'draft' || selected.status === 'reviewed');

  async function act(body: Record<string, unknown>, done: MessageKey, after?: (r: Record<string, unknown>) => void) {
    setBusy(true);
    setNote(null);
    const res = await fetch('/api/control/content/studio', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);
    const got = res ? ((await res.json().catch(() => null)) as Record<string, unknown> | null) : null;
    if (res?.ok && got) {
      setNote({ ok: true, text: t(done) });
      after?.(got);
      router.refresh();
    } else {
      const code = typeof got?.code === 'string' && CODES.includes(got.code) ? got.code : 'other';
      const detail = typeof got?.detail === 'string' ? got.detail : '';
      const kind = detail.split(':')[0];
      const problem = code === 'problem' && PROBLEMS.includes(kind) ? ` ${t(`control.studio.problem.${kind}` as MessageKey)} (${detail})` : code === 'problem' ? ` (${detail})` : '';
      setNote({ ok: false, text: `${t(`control.studio.err.${code}` as MessageKey)}${problem}` });
    }
    setBusy(false);
  }

  async function pdf(requestId: string) {
    const res = await fetch(`/api/control/content/studio/source?requestId=${requestId}`, { cache: 'no-store' }).catch(() => null);
    const got = res?.ok ? ((await res.json().catch(() => null)) as { url?: string } | null) : null;
    if (got?.url) window.open(got.url, '_blank', 'noopener,noreferrer');
    else setNote({ ok: false, text: t('control.studio.err.storage_unavailable') });
  }

  function parse(text: string): unknown[] | null {
    try {
      const v = JSON.parse(text || '[]');
      return Array.isArray(v) ? v : null;
    } catch {
      return null;
    }
  }

  function save() {
    if (!selected || !edit) return;
    const en = parse(edit.en);
    const hi = parse(edit.hi);
    if (!en || !hi) return setNote({ ok: false, text: t('control.studio.err.json') });
    void act({ action: 'save', key: selected.chapterKey, version: selected.versionNo, titleEn: edit.titleEn, titleHi: edit.titleHi, blocks: { en, hi }, note: edit.note }, 'control.studio.done.saved');
  }

  return (
    <div className="flex flex-col gap-4">
      {note && (
        <p role="status" data-studio-note className={`rounded-md p-3 text-sm font-semibold ${note.ok ? 'bg-turquoise/10 text-slate' : 'bg-coral/10 text-slate'}`}>
          {note.text}
        </p>
      )}

      <section className={SECTION} aria-labelledby="studio-queue" data-studio-queue>
        <h2 id="studio-queue" className="text-lg font-bold text-slate">
          {t('control.studio.queue')}
        </h2>
        <p className="text-sm text-slate">{t('control.studio.queueHow')}</p>
        {initial.requests.length === 0 && <p className="text-sm text-slate">{t('control.studio.queueEmpty')}</p>}
        <ul className="flex flex-col gap-3">
          {initial.requests.map((r: StudioRequest) => (
            <li key={r.requestId} data-studio-request={r.requestId} className="flex flex-col gap-2 rounded-md border border-slate/10 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-slate">{r.title}</span>
                <Badge variant={REQUEST_VARIANT[r.status]}>{t(`control.studio.req.${r.status}` as MessageKey)}</Badge>
                <Badge variant="neutral">{t(`control.studio.source.${r.source}` as MessageKey)}</Badge>
              </div>
              <p className="text-sm text-slate">{t('control.studio.reqMeta', { board: r.board, cls: r.classLevel, subject: r.subject })}</p>
              <div className="flex flex-wrap gap-2">
                {r.hasUpload && (r.status === 'received' || r.status === 'digitizing') && (
                  <button type="button" disabled={busy} className={QUIET_ACTION} onClick={() => void pdf(r.requestId)}>
                    {t('control.studio.openPdf')}
                  </button>
                )}
                {r.status === 'received' && (
                  <button type="button" data-studio-claim disabled={busy} className={PRIMARY_ACTION} onClick={() => void act({ action: 'claim', requestId: r.requestId }, 'control.studio.done.claimed')}>
                    {t('control.studio.claim')}
                  </button>
                )}
                {r.status === 'digitizing' && r.chapterKey && (
                  <Link className={PRIMARY_ACTION} href={`/control/content/studio?key=${encodeURIComponent(r.chapterKey)}&version=${latest(initial, r.chapterKey)}`}>
                    {t('control.studio.openDraft')}
                  </Link>
                )}
                {(r.status === 'received' || r.status === 'digitizing') && (
                  <button type="button" disabled={busy} className={QUIET_ACTION} onClick={() => setDeclining({ id: r.requestId, reason: '' })}>
                    {t('control.studio.decline')}
                  </button>
                )}
              </div>
              {declining?.id === r.requestId && (
                <form
                  className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void act({ action: 'decline', requestId: r.requestId, reason: declining.reason }, 'control.studio.done.declined', () => setDeclining(null));
                  }}
                >
                  <Input id={`decline-${r.requestId}`} label={t('control.studio.declineReason')} value={declining.reason} maxLength={300} onChange={(e) => setDeclining({ id: r.requestId, reason: e.target.value })} />
                  <button type="submit" disabled={busy || declining.reason.trim().length === 0} className={PRIMARY_ACTION}>
                    {t('control.studio.declineGo')}
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className={SECTION} aria-labelledby="studio-chapters" data-studio-chapters>
        <h2 id="studio-chapters" className="text-lg font-bold text-slate">
          {t('control.studio.chapters')}
        </h2>
        {initial.chapters.length === 0 && <p className="text-sm text-slate">{t('control.studio.chaptersEmpty')}</p>}
        <ul className="flex flex-col gap-2">
          {initial.chapters.map((c) => (
            <li key={`${c.chapterKey}@${c.versionNo}`} className="flex flex-wrap items-center gap-2 rounded-md border border-slate/10 p-3">
              <span className="break-all font-semibold text-slate">{c.chapterKey}</span>
              <span className="text-sm text-slate">{t('control.studio.version', { n: c.versionNo })}</span>
              <Badge variant={VERSION_VARIANT[c.status]}>{t(`control.studio.status.${c.status}` as MessageKey)}</Badge>
              <span className="text-sm text-slate">{c.titleEn}</span>
              <Link className={`${QUIET_ACTION} ml-auto`} href={`/control/content/studio?key=${encodeURIComponent(c.chapterKey)}&version=${c.versionNo}`}>
                {t('control.studio.open')}
              </Link>
            </li>
          ))}
        </ul>
        <form
          className="grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            void act({ action: 'create', key: fresh.key, subject: fresh.subject, title: fresh.title }, 'control.studio.done.created', () => setFresh({ key: '', subject: '', title: '' }));
          }}
        >
          <Input id="studio-new-key" label={t('control.studio.newKey')} value={fresh.key} maxLength={120} spellCheck={false} onChange={(e) => setFresh({ ...fresh, key: e.target.value.trim() })} />
          <Input id="studio-new-subject" label={t('control.studio.newSubject')} value={fresh.subject} maxLength={40} spellCheck={false} onChange={(e) => setFresh({ ...fresh, subject: e.target.value.trim() })} />
          <Input id="studio-new-title" label={t('control.studio.newTitle')} value={fresh.title} maxLength={120} onChange={(e) => setFresh({ ...fresh, title: e.target.value })} />
          <button type="submit" disabled={busy} className={PRIMARY_ACTION}>
            {t('control.studio.create')}
          </button>
        </form>
      </section>

      {selected && edit && (
        <section className={SECTION} aria-labelledby="studio-editor" data-studio-editor={`${selected.chapterKey}@${selected.versionNo}`}>
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="studio-editor" className="break-all text-lg font-bold text-slate">
              {selected.chapterKey}
            </h2>
            <span className="text-sm text-slate">{t('control.studio.version', { n: selected.versionNo })}</span>
            <Badge variant={VERSION_VARIANT[selected.status]}>{t(`control.studio.status.${selected.status}` as MessageKey)}</Badge>
          </div>
          <p className="text-sm text-slate">{t('control.studio.editHow')}</p>
          {selected.droppedIds.length > 0 && (
            <p role="note" data-studio-dropped className="rounded-md bg-amber/10 p-3 text-sm font-semibold text-slate">
              {t('control.studio.dropped', { n: selected.droppedIds.length })}
            </p>
          )}
          <div className="grid gap-2 md:grid-cols-2">
            <Input id="studio-title-en" label={t('control.studio.titleEn')} value={edit.titleEn} disabled={!open || busy} maxLength={120} onChange={(e) => setEdit({ ...edit, titleEn: e.target.value })} />
            <Input id="studio-title-hi" lang="hi" label={t('control.studio.titleHi')} value={edit.titleHi} disabled={!open || busy} maxLength={120} onChange={(e) => setEdit({ ...edit, titleHi: e.target.value })} />
          </div>
          <div className="grid gap-2 lg:grid-cols-2">
            <Textarea id="studio-blocks-en" label={t('control.studio.blocksEn')} rows={14} spellCheck={false} className="font-mono text-xs" value={edit.en} disabled={!open || busy} onChange={(e) => setEdit({ ...edit, en: e.target.value })} />
            <Textarea id="studio-blocks-hi" lang="hi" label={t('control.studio.blocksHi')} rows={14} spellCheck={false} className="font-mono text-xs" value={edit.hi} disabled={!open || busy} onChange={(e) => setEdit({ ...edit, hi: e.target.value })} />
          </div>
          <Input id="studio-note" label={t('control.studio.note')} value={edit.note} disabled={!open || busy} maxLength={500} onChange={(e) => setEdit({ ...edit, note: e.target.value })} />
          <div className="flex flex-wrap gap-2">
            {open && (
              <button type="button" data-studio-save disabled={busy} className={PRIMARY_ACTION} onClick={save}>
                {t('control.studio.save')}
              </button>
            )}
            {selected.status === 'draft' && (
              <button type="button" data-studio-review disabled={busy} className={QUIET_ACTION} onClick={() => void act({ action: 'review', key: selected.chapterKey, version: selected.versionNo }, 'control.studio.done.reviewed')}>
                {t('control.studio.review')}
              </button>
            )}
            {selected.status === 'reviewed' && (
              <button type="button" data-studio-publish disabled={busy} className={PRIMARY_ACTION} onClick={() => void act({ action: 'publish', key: selected.chapterKey, version: selected.versionNo }, 'control.studio.done.published')}>
                {t('control.studio.publish')}
              </button>
            )}
            {selected.status === 'published' && (
              <button type="button" disabled={busy} className={QUIET_ACTION} onClick={() => void act({ action: 'retire', key: selected.chapterKey }, 'control.studio.done.retired')}>
                {t('control.studio.retire')}
              </button>
            )}
            {(selected.status === 'published' || selected.status === 'retired') && (
              <button
                type="button"
                data-studio-new-version
                disabled={busy}
                className={QUIET_ACTION}
                onClick={() => void act({ action: 'new_version', key: selected.chapterKey }, 'control.studio.done.newVersion', (r) => typeof r.versionNo === 'number' && router.push(`/control/content/studio?key=${encodeURIComponent(selected.chapterKey)}&version=${r.versionNo}`))}
              >
                {t('control.studio.newVersion')}
              </button>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
