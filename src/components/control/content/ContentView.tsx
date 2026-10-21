'use client';

import { useCallback, useMemo, useState } from 'react';
import { useT } from '@/components/app-shell/LangContext';
import { PRIMARY_ACTION, QUIET_ACTION } from '@/components/app-ui/ModulePage';
import { Badge } from '@/components/ui/Badge';
import { Textarea } from '@/components/ui/Textarea';
import type { CatalogProblem } from '@/lib/content/catalog-csv';
import type { SyllabusDiff } from '@/lib/content/diff';
import type { CatalogImport, ControlVersion, VersionPreview } from '@/lib/content/library';
import type { MessageKey } from '@/lib/i18n';

// Control → Content (M1-4, docs/family-app/10 §4, §7; docs/34 §10). The syllabus library: import a catalog CSV ("Check
// file", then "Import as a draft", all or nothing), then each version through review: approve (never by the account
// that imported it) to staff preview, look at it as a family will, compare it with the version before, release it to
// everyone, and roll back in one step. Titles and structure only; no child's data is ever on this screen.

const SECTION = 'flex flex-col gap-3 rounded-md border border-slate/10 bg-white p-4';
const LINK = 'inline-flex min-h-[44px] items-center self-start font-semibold text-sapphire underline';

type Note = { ok: boolean; text: string };
type Shown = { kind: 'preview'; versionId: string; data: VersionPreview } | { kind: 'diff'; versionId: string; data: { from: ControlVersion; to: ControlVersion; diff: SyllabusDiff } };

const statusKey = (v: ControlVersion): MessageKey =>
  v.status === 'published' ? (v.audience === 'everyone' ? 'control.content.status.everyone' : 'control.content.status.staff_preview') : (`control.content.status.${v.status}` as MessageKey);
const statusVariant = (v: ControlVersion) => (v.status === 'published' ? (v.audience === 'everyone' ? 'success' : 'warning') : v.status === 'rejected' || v.status === 'withdrawn' ? 'danger' : 'neutral');

export function ContentView({ initial }: { initial: ControlVersion[] }) {
  const { t, tCount, lang } = useT();
  const [versions, setVersions] = useState<ControlVersion[]>(initial);
  const [csv, setCsv] = useState('');
  const [result, setResult] = useState<CatalogImport | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<Note | null>(null);
  const [shown, setShown] = useState<Shown | null>(null);
  const [rejecting, setRejecting] = useState<{ versionId: string; text: string } | null>(null);

  const day = (iso: string | null) => (iso ? new Intl.DateTimeFormat(lang === 'hi' ? 'hi-IN' : 'en-IN', { dateStyle: 'medium', timeZone: 'Asia/Kolkata' }).format(new Date(iso)) : '');
  const errorText = (code: unknown) => t(typeof code === 'string' && /^[a-z_]+$/.test(code) ? (`control.content.err.${code}` as MessageKey) : 'control.content.err.failed');

  const load = useCallback(async () => {
    const res = await fetch('/api/control/content', { cache: 'no-store' }).catch(() => null);
    const got = res?.ok ? ((await res.json().catch(() => null)) as { versions: ControlVersion[] } | null) : null;
    if (got) setVersions(got.versions);
  }, []);

  async function sendCsv(preview: boolean) {
    if (!csv.trim()) {
      setNote({ ok: false, text: t('control.content.csv.chooseFirst') });
      return;
    }
    setBusy(true);
    setNote(null);
    setResult(null);
    const res = await fetch('/api/control/content/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ csv, preview }) }).catch(() => null);
    const got = res ? await res.json().catch(() => null) : null;
    setBusy(false);
    if (!got || !Array.isArray(got.problems)) {
      setNote({ ok: false, text: errorText(got?.code) });
      return;
    }
    setResult(got as CatalogImport);
    if (got.committed) {
      setCsv('');
      await load();
    }
  }

  async function act(versionId: string, action: 'approve' | 'reject' | 'release' | 'rollback', done: MessageKey, extra: Record<string, unknown> = {}) {
    setBusy(true);
    setNote(null);
    const res = await fetch(`/api/control/content/versions/${versionId}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...extra }) }).catch(() => null);
    const got = res ? await res.json().catch(() => null) : null;
    setBusy(false);
    if (!res?.ok) {
      setNote({ ok: false, text: errorText(got?.code) });
      return;
    }
    setNote({ ok: true, text: t(done) });
    setRejecting(null);
    setShown(null);
    await load();
  }

  async function showPreview(versionId: string) {
    if (shown?.kind === 'preview' && shown.versionId === versionId) return setShown(null);
    const res = await fetch(`/api/control/content/versions/${versionId}`, { cache: 'no-store' }).catch(() => null);
    const got = res?.ok ? ((await res.json().catch(() => null)) as VersionPreview | null) : null;
    if (!got) return setNote({ ok: false, text: t('control.content.err.failed') });
    setShown({ kind: 'preview', versionId, data: got });
  }

  async function showDiff(v: ControlVersion) {
    if (!v.previousVersionId) return;
    if (shown?.kind === 'diff' && shown.versionId === v.versionId) return setShown(null);
    const res = await fetch(`/api/control/content/diff?from=${v.previousVersionId}&to=${v.versionId}`, { cache: 'no-store' }).catch(() => null);
    const got = res?.ok ? await res.json().catch(() => null) : null;
    if (!got?.diff) return setNote({ ok: false, text: t('control.content.err.failed') });
    setShown({ kind: 'diff', versionId: v.versionId, data: got });
  }

  const problemText = (p: CatalogProblem) => t(`control.content.problem.${p.code}` as MessageKey, { value: p.value ?? '', with: p.with ?? '' });

  // Versions grouped by syllabus, in the order the server gives (newest first within each).
  const groups = useMemo(() => {
    const out: { id: string; versions: ControlVersion[] }[] = [];
    for (const v of versions) {
      const id = `${v.board}|${v.classLevel}|${v.subject}|${v.academicYear}`;
      const g = out.find((x) => x.id === id);
      if (g) g.versions.push(v);
      else out.push({ id, versions: [v] });
    }
    return out;
  }, [versions]);

  const versionTitle = (v: ControlVersion) => t('control.content.version.title', { board: v.board, cls: v.classLevel, subject: v.subject, year: v.academicYear });
  const versionNo = (v: { versionNo: number }) => t('control.content.version.no', { no: v.versionNo });
  const twoTitles = (en: string, hi: string | null) => (
    <>
      <span lang="en">{en}</span>
      <span lang="hi" className="block text-slate/70">
        {hi ?? t('control.content.preview.noHindi')}
      </span>
    </>
  );

  return (
    <div lang={lang} data-content className="flex flex-col gap-4 text-sm text-slate">
      {note && (
        <p role="status" data-content-note={note.ok ? 'ok' : 'error'} className={`rounded-md px-3 py-2 font-semibold ${note.ok ? 'bg-off-white text-slate' : 'border border-red-800/30 text-red-800'}`}>
          {note.text}
        </p>
      )}

      <section className={SECTION} data-content-import>
        <h2 className="text-base font-bold">{t('control.content.csv.title')}</h2>
        <p>{t('control.content.csv.how')}</p>
        <input
          type="file"
          accept=".csv,text/csv"
          aria-label={t('control.content.csv.file')}
          data-content-csv-file
          className="min-h-[44px] text-sm text-slate"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            setResult(null);
            setCsv(file ? await file.text() : '');
          }}
        />
        <div className="flex flex-wrap gap-2">
          <button type="button" data-content-check disabled={busy} onClick={() => void sendCsv(true)} className={QUIET_ACTION}>
            {t('control.content.csv.check')}
          </button>
          <button type="button" data-content-import-draft disabled={busy} onClick={() => void sendCsv(false)} className={PRIMARY_ACTION}>
            {t('control.content.csv.import')}
          </button>
        </div>
        {result && (
          <div role="status" data-content-csv-result>
            {result.problems.length === 0 ? (
              result.committed ? (
                <p>{tCount('control.content.csv.imported', result.versions.length)}</p>
              ) : (
                <p>{tCount('control.content.csv.ready', result.rowCount)}</p>
              )
            ) : (
              <div className="rounded-md border border-red-800/30 p-3">
                <p className="font-semibold text-red-800">{t(result.preview ? 'control.content.csv.problems' : 'control.content.csv.nothing')}</p>
                <ul className="mt-1 list-disc pl-5">
                  {result.problems.map((p, i) => (
                    <li key={`${p.line}-${p.code}-${i}`}>
                      {t('control.content.csv.line', { line: p.line })}: {problemText(p)}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </section>

      <section className={SECTION} data-content-versions>
        <h2 className="text-base font-bold">{t('control.content.versions.title')}</h2>
        <p>{t('control.content.versions.how')}</p>
        {groups.length === 0 && <p className="text-slate/70">{t('control.content.versions.none')}</p>}
        {groups.map((g) => (
          <div key={g.id} data-syllabus={g.id} className="flex flex-col gap-3 border-t border-slate/10 pt-3">
            <h3 className="text-base font-bold">{versionTitle(g.versions[0])}</h3>
            {g.versions.map((v) => (
              <div key={v.versionId} data-version={v.versionId} data-status={v.status} data-audience={v.audience ?? ''} className="flex flex-col gap-2 rounded-md border border-slate/10 p-3">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="font-bold">{versionNo(v)}</span>
                  <Badge variant={statusVariant(v)}>{t(statusKey(v))}</Badge>
                </p>
                <p>{t('control.content.version.counts', { units: v.units, chapters: v.chapters, topics: v.topics })}</p>
                <p className="text-slate/70">
                  {v.importSource === 'repository'
                    ? t('control.content.version.fromRepository', { ref: v.importRef ?? '', date: day(v.importedAt) })
                    : t(v.importedByMe ? 'control.content.version.importedByYou' : 'control.content.version.importedByOther', { date: day(v.importedAt) })}
                </p>
                {v.releasedAt && <p className="text-slate/70">{t('control.content.version.released', { date: day(v.releasedAt) })}</p>}
                {v.endedAt && v.status !== 'published' && <p className="text-slate/70">{t('control.content.version.ended', { date: day(v.endedAt) })}</p>}
                {v.reviewNote && <p>{t('control.content.version.note', { note: v.reviewNote })}</p>}

                <div className="flex flex-wrap gap-2">
                  <button type="button" data-content-preview onClick={() => void showPreview(v.versionId)} className={QUIET_ACTION}>
                    {t(shown?.kind === 'preview' && shown.versionId === v.versionId ? 'control.content.preview.hide' : 'control.content.preview.show')}
                  </button>
                  {v.previousVersionId && (
                    <button type="button" data-content-diff onClick={() => void showDiff(v)} className={QUIET_ACTION}>
                      {t('control.content.diff.show')}
                    </button>
                  )}
                  {v.status === 'in_review' && !v.importedByMe && (
                    <button type="button" data-content-approve disabled={busy} onClick={() => void act(v.versionId, 'approve', 'control.content.done.approved')} className={PRIMARY_ACTION}>
                      {t('control.content.action.approve')}
                    </button>
                  )}
                  {v.status === 'in_review' && (
                    <button type="button" data-content-reject disabled={busy} onClick={() => setRejecting({ versionId: v.versionId, text: '' })} className={QUIET_ACTION}>
                      {t('control.content.action.reject')}
                    </button>
                  )}
                  {v.status === 'published' && v.audience === 'staff_preview' && (
                    <button type="button" data-content-release disabled={busy} onClick={() => window.confirm(t('control.content.confirm.release')) && void act(v.versionId, 'release', 'control.content.done.released')} className={PRIMARY_ACTION}>
                      {t('control.content.action.release')}
                    </button>
                  )}
                  {v.canRollBack && (
                    <button type="button" data-content-rollback disabled={busy} onClick={() => window.confirm(t('control.content.confirm.rollback')) && void act(v.versionId, 'rollback', 'control.content.done.rolledBack')} className={QUIET_ACTION}>
                      {t('control.content.action.rollback')}
                    </button>
                  )}
                </div>
                {v.status === 'in_review' && v.importedByMe && <p className="text-slate/70">{t('control.content.version.ownImport')}</p>}

                {rejecting?.versionId === v.versionId && (
                  <div className="flex flex-col gap-2">
                    <Textarea id={`content-reject-${v.versionId}`} label={t('control.content.reject.note')} rows={3} maxLength={1000} value={rejecting.text} onChange={(e) => setRejecting({ versionId: v.versionId, text: e.target.value })} />
                    <div className="flex flex-wrap gap-2">
                      <button type="button" data-content-reject-send disabled={busy || !rejecting.text.trim()} onClick={() => void act(v.versionId, 'reject', 'control.content.done.rejected', { note: rejecting.text })} className={PRIMARY_ACTION}>
                        {t('control.content.reject.send')}
                      </button>
                      <button type="button" onClick={() => setRejecting(null)} className={QUIET_ACTION}>
                        {t('control.content.reject.cancel')}
                      </button>
                    </div>
                  </div>
                )}

                {shown?.kind === 'preview' && shown.versionId === v.versionId && (
                  <div data-content-preview-body className="flex flex-col gap-3 rounded-md bg-off-white p-3">
                    <p className="font-semibold">{t('control.content.preview.title')}</p>
                    {shown.data.units.length === 0 && <p>{t('control.content.preview.empty')}</p>}
                    {shown.data.units.map((u, ui) => (
                      <div key={u.key ?? `loose-${ui}`} className="flex flex-col gap-2">
                        {u.titleEn !== null && <p className="font-bold">{twoTitles(u.titleEn, u.titleHi)}</p>}
                        {u.chapters.length === 0 && <p className="text-slate/70">{t('control.content.preview.noChapters')}</p>}
                        <ol className="flex list-decimal flex-col gap-2 pl-5">
                          {u.chapters.map((c) => (
                            <li key={c.key}>
                              <p className="font-semibold">{twoTitles(c.titleEn, c.titleHi)}</p>
                              {c.topics.length > 0 && (
                                <ul className="mt-1 flex list-disc flex-col gap-1 pl-5">
                                  {c.topics.map((tp) => (
                                    <li key={tp.key}>{twoTitles(tp.titleEn, tp.titleHi)}</li>
                                  ))}
                                </ul>
                              )}
                            </li>
                          ))}
                        </ol>
                      </div>
                    ))}
                  </div>
                )}

                {shown?.kind === 'diff' && shown.versionId === v.versionId && (
                  <div data-content-diff-body className="flex flex-col gap-2 rounded-md bg-off-white p-3">
                    <p className="font-semibold">{t('control.content.diff.title', { from: versionNo(shown.data.from), to: versionNo(shown.data.to) })}</p>
                    <p>
                      {t('control.content.diff.summary', {
                        added: shown.data.diff.added.length,
                        removed: shown.data.diff.removed.length,
                        renamed: shown.data.diff.renamed.length,
                        moved: shown.data.diff.moved.length,
                        unchanged: shown.data.diff.unchanged,
                      })}
                    </p>
                    <ul className="flex list-disc flex-col gap-1 pl-5">
                      {shown.data.diff.added.map((l) => (
                        <li key={`a-${l.key}`}>{t('control.content.diff.added', { key: l.key, title: l.titleEn })}</li>
                      ))}
                      {shown.data.diff.removed.map((l) => (
                        <li key={`r-${l.key}`}>{t('control.content.diff.removed', { key: l.key, title: l.titleEn })}</li>
                      ))}
                      {shown.data.diff.renamed.map((l) => (
                        <li key={`n-${l.key}`}>{t('control.content.diff.renamed', { key: l.key, from: l.from.titleEn, to: l.to.titleEn })}</li>
                      ))}
                      {shown.data.diff.moved.map((l) => (
                        <li key={`m-${l.key}`}>{t('control.content.diff.moved', { key: l.key, fromParent: l.from.parentKey ?? '', fromPosition: l.from.position, toParent: l.to.parentKey ?? '', toPosition: l.to.position })}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ))}
          </div>
        ))}
        <a href="/control/audit-logs" className={LINK}>
          {t('control.content.history')}
        </a>
      </section>
    </div>
  );
}
