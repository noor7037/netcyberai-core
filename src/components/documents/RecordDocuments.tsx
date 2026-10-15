'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useT } from '@/components/app-shell/LangContext';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { useToast } from '@/components/ui/Toast';
import { RECORD_DOCUMENT_KINDS, type RecordDocument } from '@/lib/contracts/record-documents';
import { explainError } from '@/lib/errors/catalogue';
import type { MessageKey } from '@/lib/i18n';
import { checkBeforeSending, sendRecordFile, type FileCheckProblem, type SendProgress, type SendResult } from './send-record-file';

// The papers on a record (C235-D), on a member of staff's profile and a student's page: each paper with its kind and
// name, its latest version first and the earlier ones under it (who uploaded each, and when). The office adds papers,
// uploads new versions and removes papers; everyone who may read the record's papers opens them. A file opens in a new
// tab through a link that works for five minutes, asked for at the moment it is opened (each one is audited).
// A file is sent straight to the file store (C235-D2, ./send-record-file.ts): checked here first (size and first
// bytes), its progress shown while it is sent, then checked by the server; each refusal is said plainly where it
// happened: in the form for a new paper, on the paper's row for a new version.

const BUTTON =
  'inline-flex min-h-[44px] items-center justify-center rounded-md px-3 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-royal disabled:opacity-60';
const ACCEPT = '.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png';

export function RecordDocuments({ record, recordId }: { record: 'staff' | 'student'; recordId: string }) {
  const { t, tCount, lang } = useT();
  const toast = useToast();
  const base = `/api/app/${record === 'staff' ? 'staff' : 'students'}/${recordId}/record-documents`;
  const [docs, setDocs] = useState<RecordDocument[] | null>(null);
  const [mayUpload, setMayUpload] = useState(false);
  const [problem, setProblem] = useState<'not_loaded' | 'not_allowed' | null>(null);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [removing, setRemoving] = useState<RecordDocument | null>(null);
  // The upload under way ('new' or the paper a version is for), and the last refusal, where it happened.
  const [progress, setProgress] = useState<{ target: string; p: SendProgress } | null>(null);
  const [failed, setFailed] = useState<{ target: string; message: string } | null>(null);
  const versionInput = useRef<HTMLInputElement>(null);
  const versionFor = useRef<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(base).catch(() => null);
    if (!res || !res.ok) {
      setProblem(res && (res.status === 403 || res.status === 404) ? 'not_allowed' : 'not_loaded');
      setDocs([]);
      return;
    }
    const body = await res.json();
    setProblem(null);
    setDocs(body.documents ?? []);
    setMayUpload(body.mayUpload === true);
  }, [base]);
  useEffect(() => {
    void load();
  }, [load]);

  const when = (iso: string) => new Intl.DateTimeFormat(lang === 'hi' ? 'hi-IN' : 'en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }).format(new Date(iso));
  const size = (bytes: number) => (bytes >= 1024 * 1024 ? t('rdoc.size.mb', { n: (bytes / (1024 * 1024)).toFixed(1) }) : t('rdoc.size.kb', { n: Math.max(1, Math.round(bytes / 1024)) }));
  const fileType = (mime: string) => t(mime === 'application/pdf' ? 'rdoc.type.pdf' : 'rdoc.type.image');

  // The route's refusal in the person's language: this screen's own words for its own codes, the catalogue's otherwise.
  async function refusal(res: Response): Promise<string> {
    const body = await res.json().catch(() => null);
    const code = body && typeof body === 'object' ? (body as { code?: unknown }).code : null;
    if (code === 'title_too_long') return t('rdoc.err.titleLong');
    if (code === 'title_aadhaar') return t('rdoc.err.titleAadhaar');
    if (code === 'storage_unavailable') return t('rdoc.err.storage');
    if (code === 'upload_expired') return t('rdoc.err.expired');
    if (code === 'upload_missing' || code === 'upload_changed') return t('rdoc.err.notArrived');
    if (code === 'upload_done') return t('rdoc.err.alreadyAdded');
    return explainError(body, t('rdoc.err.upload'), lang, res.status);
  }

  // What is wrong with a file before it is sent, in the catalogue's own words.
  const fileProblemText = (problem: FileCheckProblem) =>
    explainError(
      problem === 'file_too_large' ? { code: problem, params: { field: 'file', maxMb: 10 } } : problem === 'file_type' ? { code: problem, params: { field: 'file', allowed: 'PDF, JPG, PNG' } } : { code: problem },
      t('rdoc.err.upload'),
      lang
    );
  async function failureText(result: Exclude<SendResult, { ok: true }>): Promise<string> {
    if (result.step === 'send') return result.tooLarge ? fileProblemText('file_too_large') : t('rdoc.err.sendFailed');
    return result.res ? refusal(result.res) : t('rdoc.err.sendFailed');
  }

  // Checks the file, sends it, and says how it went where it was asked for. True when it was added.
  async function send(target: string, file: File | null | undefined, paper: { kind: string; title: string } | { documentId: string }): Promise<boolean> {
    setFailed(null);
    const checked = await checkBeforeSending(file);
    if (!checked.ok || !file) {
      setFailed({ target, message: fileProblemText(checked.ok ? 'file_missing' : checked.problem) });
      return false;
    }
    setBusy(target);
    try {
      const result = await sendRecordFile(base, file, checked.mime, paper, (p) => setProgress({ target, p }));
      if (!result.ok) {
        setFailed({ target, message: await failureText(result) });
        return false;
      }
      await load();
      return true;
    } finally {
      setBusy(null);
      setProgress(null);
    }
  }

  async function addDocument(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const file = form.get('file');
    const added = await send('new', file instanceof File && file.name ? file : null, { kind: String(form.get('kind') ?? ''), title: String(form.get('title') ?? '') });
    if (added) {
      setAdding(false);
      toast.show(t('rdoc.added'), 'success');
    }
  }

  async function addVersion(file: File | undefined) {
    const documentId = versionFor.current;
    if (!file || !documentId) return;
    try {
      if (await send(documentId, file, { documentId })) toast.show(t('rdoc.versionAdded'), 'success');
    } finally {
      if (versionInput.current) versionInput.current.value = '';
    }
  }

  // The upload under way for this target: what is happening, and how much of the file has been sent.
  const progressFor = (target: string) => {
    if (progress?.target !== target) return null;
    const percent = progress.p.phase === 'sending' ? progress.p.percent : 100;
    return (
      <div data-upload-progress={progress.p.phase} className="flex flex-col gap-1">
        <p aria-live="polite" className="text-sm font-medium text-slate">
          {progress.p.phase === 'sending' ? t('rdoc.up.sending') : t('rdoc.up.checking')}
          {progress.p.phase === 'sending' && <span aria-hidden="true">{` ${percent}%`}</span>}
        </p>
        <div role="progressbar" aria-label={t('rdoc.up.progressLabel')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} className="h-2 w-full overflow-hidden rounded-full bg-slate/10">
          <div className="h-full bg-sapphire" style={{ width: `${percent}%` }} />
        </div>
      </div>
    );
  };
  const failureFor = (target: string) =>
    failed?.target === target ? (
      <p role="alert" data-upload-failed className="text-sm font-medium text-red-800">
        {failed.message}
      </p>
    ) : null;

  async function remove(doc: RecordDocument) {
    setBusy(doc.documentId);
    try {
      const res = await fetch(`${base}/${doc.documentId}`, { method: 'DELETE' });
      if (!res.ok) return toast.show(await refusal(res), 'danger');
      setRemoving(null);
      toast.show(t('rdoc.removed'), 'success');
      await load();
    } finally {
      setBusy(null);
    }
  }

  // The tab is opened at once (so the browser does not block it), then sent to the link once it is given.
  async function open(documentId: string, versionId: string) {
    const tab = window.open('', '_blank');
    if (tab) tab.opener = null;
    const res = await fetch(`${base}/${documentId}/versions/${versionId}`).catch(() => null);
    const body = res && res.ok ? await res.json().catch(() => null) : null;
    if (!body || typeof body.url !== 'string') {
      tab?.close();
      toast.show(res && !res.ok ? await refusal(res) : t('rdoc.linkFailed'), 'danger');
      return;
    }
    if (tab) tab.location.href = body.url;
    else window.location.assign(body.url);
  }

  const versionLine = (v: RecordDocument['versions'][number]) =>
    `${v.uploadedBy ? t('rdoc.uploaded', { date: when(v.uploadedAt), name: v.uploadedBy }) : t('rdoc.uploadedNoName', { date: when(v.uploadedAt) })} · ${fileType(v.mimeType)} · ${size(v.sizeBytes)}`;

  return (
    <section data-record-documents={record} className="flex flex-col gap-3 rounded-lg border border-slate/10 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-slate">{t('rdoc.title')}</h2>
        {mayUpload && !adding && (
          <button type="button" onClick={() => setAdding(true)} className={`${BUTTON} bg-sapphire text-white`}>
            {t('rdoc.add')}
          </button>
        )}
      </div>
      <p className="max-w-prose text-sm text-slate/70">{t('rdoc.purpose')}</p>

      {adding && (
        <form onSubmit={addDocument} data-record-document-form className="flex flex-col gap-4 rounded-md border border-slate/10 p-3">
          <h3 className="text-sm font-semibold text-slate">{t('rdoc.form.title')}</h3>
          <Select id={`rdoc-kind-${record}`} name="kind" label={t('rdoc.form.kind')} defaultValue="government_id" required>
            {RECORD_DOCUMENT_KINDS.map((k) => (
              <option key={k} value={k}>
                {t(`rdoc.kind.${k}` as MessageKey)}
              </option>
            ))}
          </Select>
          <Input id={`rdoc-title-${record}`} name="title" label={t('rdoc.form.name')} placeholder={t('rdoc.form.namePlaceholder')} helperText={t('rdoc.form.nameHelp')} maxLength={120} required />
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`rdoc-file-${record}`} className="text-sm font-medium text-slate">
              {t('rdoc.form.file')}
            </label>
            <input id={`rdoc-file-${record}`} name="file" type="file" accept={ACCEPT} required aria-describedby={`rdoc-file-${record}-help`} onChange={() => setFailed(null)} className="min-h-[44px] text-sm text-slate file:mr-3 file:min-h-[44px] file:rounded-md file:border-0 file:bg-sapphire/10 file:px-3 file:font-semibold file:text-sapphire" />
            <p id={`rdoc-file-${record}-help`} className="text-sm text-slate/70">
              {t('rdoc.form.fileHelp')}
            </p>
          </div>
          {progressFor('new')}
          {failureFor('new')}
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={busy === 'new'} className={`${BUTTON} bg-sapphire text-white`}>
              {busy === 'new' ? t('rdoc.form.saving') : t('rdoc.form.save')}
            </button>
            <button
              type="button"
              disabled={busy === 'new'}
              onClick={() => {
                setAdding(false);
                setFailed(null);
              }}
              className={`${BUTTON} text-slate/70`}
            >
              {t('rdoc.form.cancel')}
            </button>
          </div>
        </form>
      )}

      {docs === null ? (
        <p className="text-sm text-slate/70">{t('rdoc.loading')}</p>
      ) : problem ? (
        <p role="alert" className="text-sm font-medium text-red-800">
          {t(problem === 'not_allowed' ? 'rdoc.notAllowed' : 'rdoc.notLoaded')}
        </p>
      ) : docs.length === 0 ? (
        <p className="text-sm text-slate/70">{t(mayUpload ? 'rdoc.emptyOffice' : 'rdoc.empty')}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {docs.map((doc) => {
            const [latest, ...earlier] = doc.versions;
            return (
              <li key={doc.documentId} data-record-document={doc.documentId} data-versions={doc.versions.length} className="flex flex-col gap-2 rounded-md border border-slate/10 p-3">
                <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0">
                    <p className="break-words font-semibold text-slate">{doc.title}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <Badge>{t(`rdoc.kind.${doc.kind}` as MessageKey)}</Badge>
                      <span className="text-sm font-medium text-slate">
                        {t('rdoc.version', { n: latest.versionNo })} · {t('rdoc.latest')}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-slate/70">{versionLine(latest)}</p>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <button type="button" onClick={() => void open(doc.documentId, latest.versionId)} aria-label={t('rdoc.openVersion', { n: latest.versionNo, name: doc.title })} className={`${BUTTON} border border-slate/20 text-slate`}>
                      {t('rdoc.open')}
                    </button>
                    {mayUpload && (
                      <>
                        <button
                          type="button"
                          disabled={busy === doc.documentId}
                          onClick={() => {
                            versionFor.current = doc.documentId;
                            versionInput.current?.click();
                          }}
                          aria-label={t('rdoc.newVersionOf', { name: doc.title })}
                          className={`${BUTTON} border border-sapphire text-sapphire`}
                        >
                          {busy === doc.documentId ? t('rdoc.form.saving') : t('rdoc.newVersion')}
                        </button>
                        <button type="button" onClick={() => setRemoving(doc)} aria-label={t('rdoc.removeOf', { name: doc.title })} className={`${BUTTON} text-red-800`}>
                          {t('rdoc.remove')}
                        </button>
                      </>
                    )}
                  </div>
                </div>
                {progressFor(doc.documentId)}
                {failureFor(doc.documentId)}
                {earlier.length > 0 && (
                  <details data-earlier-versions={earlier.length} className="rounded-md bg-slate/5 px-3">
                    <summary className="flex min-h-[44px] cursor-pointer items-center text-sm font-semibold text-slate">{tCount('rdoc.earlier', earlier.length)}</summary>
                    <ul className="flex flex-col gap-1 pb-2">
                      {earlier.map((v) => (
                        <li key={v.versionId} data-record-version={v.versionNo} className="flex flex-col gap-1 border-t border-slate/10 py-2 sm:flex-row sm:items-center sm:justify-between">
                          <p className="text-sm text-slate">
                            <span className="font-medium">{t('rdoc.version', { n: v.versionNo })}</span>
                            <span className="text-slate/70"> · {versionLine(v)}</span>
                          </p>
                          <button type="button" onClick={() => void open(doc.documentId, v.versionId)} aria-label={t('rdoc.openVersion', { n: v.versionNo, name: doc.title })} className={`${BUTTON} self-start border border-slate/20 bg-white text-slate`}>
                            {t('rdoc.open')}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {mayUpload && <input ref={versionInput} type="file" accept={ACCEPT} className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(e) => void addVersion(e.target.files?.[0])} />}

      <Modal open={removing !== null} onClose={() => setRemoving(null)} title={t('rdoc.confirm.title')}>
        <div className="flex flex-col gap-4">
          <p className="text-sm text-slate">{t('rdoc.confirm.body', { name: removing?.title ?? '' })}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={!removing || busy === removing.documentId} onClick={() => removing && void remove(removing)} className={`${BUTTON} bg-red-800 text-white`}>
              {t('rdoc.confirm.yes')}
            </button>
            <button type="button" onClick={() => setRemoving(null)} className={`${BUTTON} text-slate/70`}>
              {t('rdoc.form.cancel')}
            </button>
          </div>
        </div>
      </Modal>
    </section>
  );
}
