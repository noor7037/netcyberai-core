'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useT } from '@/components/app-shell/LangContext';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { DEFAULT_ADJUST, decodeImage, processImage, validateImageFile } from '@/lib/certificates/image';
import type { IssuedForPrint, Marks } from '@/lib/documents/cert-doc';
import { BATCH_PDF_NAME, CERT_TYPES, TYPED_FIELDS, certDef, certificateFileName, fieldOptions, type CertificateType } from '@/lib/documents/certificate-rules';
import type { CertificateHome, IssueOutcome, RegisterRow, RosterChild } from '@/lib/documents/certificates';
import { certificatesPdf } from '@/lib/documents/pdf';
import { minorToRupees } from '@/lib/fees/money';
import type { MessageKey } from '@/lib/i18n';
import { downloadBlob } from '@/lib/pdf/browser';

// Documents and certificates (docs/28 row 10e, C228). Issue a certificate from the record for one child or a class,
// behind the fee clearance (for the types the school's Documents settings ask it for, C232 part A) or the principal's
// waiver with a reason; the issue register, newest first, where each certificate is downloaded, sent to its family, or
// withdrawn with a reason (the principal); the school's numbering, set once; the school's seal and each signer's own
// signature, and the school admins the principal names to sign. Every rule is the server's and the database's: this
// screen only asks and shows.

const ERRORS = ['missing', 'too_long', 'option', 'date', 'aadhaar', 'no_children', 'too_many', 'waiver_not_principal', 'waiver_reason', 'reason', 'withdrawn', 'no_number', 'not_a_pdf', 'too_large', 'storage_unavailable', 'not_a_png', 'shape', 'type', 'fixed', 'unchanged', 'prefix', 'start', 'not_admin'];
const NEEDS = ['admissionNo', 'studentName', 'fatherName', 'parentName', 'dob', 'lastClass', 'className', 'year', 'schoolName'];
const TAP = 'min-h-[44px] rounded-md border border-slate/20 bg-white px-4 text-sm font-semibold text-slate disabled:opacity-60';
const PRIMARY = 'min-h-[44px] rounded-md bg-sapphire px-5 text-sm font-semibold text-white disabled:opacity-60';
const FIELD = 'min-h-[44px] w-full rounded-md border border-slate/20 bg-white px-3 text-sm text-slate';
const CARD = 'flex flex-col gap-3 rounded-lg border border-slate/10 bg-white p-4';
const HELD = ['blocked_pilot', 'blocked_consent', 'blocked_budget', 'blocked_quiet_hours', 'blocked_no_template'];

type Note = { ok: boolean; text: string };
type Printable = { list: IssuedForPrint[]; marks: Marks & { unavailable: string[] } };

export function CertificatesView() {
  const { t, tCount, lang } = useT();
  const [home, setHome] = useState<CertificateHome | null>(null);
  const [failed, setFailed] = useState<'failed' | 'notYours' | null>(null);
  const [type, setType] = useState<CertificateType>('transfer');
  const [classId, setClassId] = useState('');
  const [typed, setTyped] = useState<Record<string, string>>({});
  const [roster, setRoster] = useState<RosterChild[] | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [waivers, setWaivers] = useState<Record<string, string>>({});
  const [outcome, setOutcome] = useState<IssueOutcome | null>(null);
  const [register, setRegister] = useState<RegisterRow[]>([]);
  const [regType, setRegType] = useState('');
  const [regClass, setRegClass] = useState('');
  const [withdraw, setWithdraw] = useState<{ id: string; reason: string } | null>(null);
  const [clearWhite, setClearWhite] = useState(true);
  const [numbering, setNumbering] = useState<{ prefix: string; startAt: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<Note | null>(null);

  const get = async <T,>(query: string): Promise<T | null> => {
    const res = await fetch(`/api/app/documents/certificates${query}`, { cache: 'no-store' }).catch(() => null);
    if (res?.status === 403) {
      setFailed('notYours');
      return null;
    }
    return res?.ok ? ((await res.json().catch(() => null)) as T | null) : null;
  };
  const loadHome = useCallback(async () => {
    const got = await get<CertificateHome>('');
    if (got) setHome(got);
    else setFailed((f) => f ?? 'failed');
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const loadRegister = useCallback(async (ty: string, cl: string) => {
    const got = await get<{ rows: RegisterRow[] }>(`?view=register${ty ? `&type=${ty}` : ''}${cl ? `&classId=${cl}` : ''}`);
    if (got) setRegister(got.rows);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const loadRoster = useCallback(async (ty: CertificateType, cl: string) => {
    setSelected([]);
    setWaivers({});
    if (!cl) return setRoster(null);
    const got = await get<{ children: RosterChild[] }>(`?view=roster&type=${ty}&classId=${cl}`);
    setRoster(got?.children ?? null);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    void loadHome();
    void loadRegister('', '');
  }, [loadHome, loadRegister]);

  const refused = (status: number | undefined, body: Record<string, unknown>): string => {
    if (status === 403) return t('crt.notYours');
    if (status === 404) return t('crt.err.not_found');
    const code = String(body.reason ?? '');
    const field = typeof body.field === 'string' && TYPED_FIELDS[type].some((f) => f.id === body.field) ? t(`crt.field.${body.field}` as MessageKey) : '';
    return ERRORS.includes(code) ? t(`crt.err.${code}` as MessageKey, { field }) : t('crt.err.other');
  };
  const call = async (url: string, init: RequestInit): Promise<Record<string, unknown> | null> => {
    const res = await fetch(url, init).catch(() => null);
    const body = ((res ? await res.json().catch(() => null) : null) ?? {}) as Record<string, unknown>;
    if (res?.ok) return body;
    setNote({ ok: false, text: refused(res?.status, body) });
    return null;
  };
  const printable = async (ids: string[]): Promise<Printable | null> => {
    const got = await get<Printable>(`?view=print&ids=${ids.join(',')}`);
    if (!got || got.list.length === 0) setNote({ ok: false, text: t('crt.err.not_found') });
    return got && got.list.length ? got : null;
  };
  const pdfOf = async (p: Printable, title: string) => {
    try {
      return await certificatesPdf(p.list, p.marks, title);
    } catch {
      setNote({ ok: false, text: t('crt.pdf.failed') });
      return null;
    }
  };

  if (failed) return <p role="alert" data-certificates-failed={failed} className="rounded-md bg-off-white px-3 py-2 text-sm text-slate">{t(failed === 'notYours' ? 'crt.notYours' : 'crt.failed')}</p>;
  if (!home) return null;
  const dayFmt = new Intl.DateTimeFormat(lang === 'hi' ? 'hi-IN' : 'en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric' });
  const date = (iso: string) => dayFmt.format(new Date(iso.length === 10 ? `${iso}T00:00:00+05:30` : iso));
  const money = (minor: number) => minorToRupees(minor);
  const typeName = (ty: string) => t(`crt.type.${ty}` as MessageKey);
  const fields = TYPED_FIELDS[type];
  const needsYear = (type === 'bonafide' || type === 'study') && !home.year;
  const missingTyped = fields.some((f) => f.required && !(typed[f.id] ?? '').trim());
  // A child may be issued one when cleared, or held with the principal's reason typed, and (for a TC) has no live TC.
  const blockedByTc = (c: RosterChild) => type === 'transfer' && c.latest !== null;
  const canIssue = (c: RosterChild) => !blockedByTc(c) && (c.cleared || (home.mayWaive && (waivers[c.student_id] ?? '').trim() !== ''));
  const chosen = (roster ?? []).filter((c) => selected.includes(c.student_id) && canIssue(c));
  const nameOf = (id: string) => roster?.find((c) => c.student_id === id)?.name ?? '';
  const asked = CERT_TYPES.filter((ty) => home.clearance[ty]);
  const notAsked = CERT_TYPES.filter((ty) => !home.clearance[ty]);
  const num = home.numbering;
  const numForm = numbering ?? { prefix: num.prefix ?? '', startAt: String(num.startAt) };

  const busyWith = async (fn: () => Promise<void>) => {
    setBusy(true);
    setNote(null);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  const issue = () =>
    busyWith(async () => {
      const body = await call('/api/app/documents/certificates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, studentIds: chosen.map((c) => c.student_id), typed, waivers: Object.fromEntries(chosen.filter((c) => !c.cleared).map((c) => [c.student_id, waivers[c.student_id]])) }),
      });
      if (!body) return;
      const got = body as unknown as IssueOutcome;
      setOutcome(got);
      setNote({ ok: true, text: [tCount('crt.issue.done', got.issued.length), got.held.length ? tCount('crt.issue.held', got.held.length) : '', got.duplicates.length ? tCount('crt.issue.dup', got.duplicates.length) : ''].filter(Boolean).join(' ') });
      await loadRoster(type, classId);
      await loadRegister(regType, regClass);
    });

  const download = (ids: string[], name: string) =>
    busyWith(async () => {
      setNote({ ok: true, text: t('crt.pdf.making') });
      const p = await printable(ids);
      if (!p) return;
      const blob = await pdfOf(p, name);
      if (!blob) return;
      downloadBlob(blob, ids.length === 1 ? certificateFileName(p.list[0].number) : BATCH_PDF_NAME);
      setNote({ ok: true, text: p.marks.unavailable.length ? `${t('crt.pdf.ready')} ${t('crt.marks.unavailable')}` : t('crt.pdf.ready') });
    });

  const sendToFamily = (row: RegisterRow) =>
    busyWith(async () => {
      setNote({ ok: true, text: t('crt.pdf.making') });
      const p = await printable([row.certificate_id]);
      if (!p) return;
      const blob = await pdfOf(p, row.number);
      if (!blob) return;
      const form = new FormData();
      form.append('file', new File([blob], certificateFileName(row.number), { type: 'application/pdf' }));
      const body = await call(`/api/app/documents/certificates/${row.certificate_id}/send`, { method: 'POST', body: form });
      if (!body) return;
      const status = String(body.status ?? '');
      setNote({ ok: true, text: status === 'queued' ? t('crt.send.queued', { last4: String(body.last4 ?? '') }) : HELD.includes(status) ? t(`msg.held.${status}` as MessageKey) : t('crt.send.other') });
      await loadRegister(regType, regClass);
    });

  const confirmWithdraw = () =>
    busyWith(async () => {
      if (!withdraw) return;
      const row = register.find((r) => r.certificate_id === withdraw.id);
      const body = await call(`/api/app/documents/certificates/${withdraw.id}/withdraw`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: withdraw.reason }) });
      if (!body) return;
      setWithdraw(null);
      setNote({ ok: true, text: t('crt.withdraw.done', { number: row?.number ?? '' }) });
      await loadRegister(regType, regClass);
      if (classId) await loadRoster(type, classId);
    });

  const uploadMark = (kind: 'seal' | 'signature', file: File | undefined) =>
    busyWith(async () => {
      if (!file) return;
      if (await validateImageFile(file)) return setNote({ ok: false, text: t('crt.err.not_a_png') });
      let png: Blob;
      try {
        const image = processImage(await decodeImage(file), { ...DEFAULT_ADJUST, clearWhite }, 600);
        const raw = atob(image.src.slice(image.src.indexOf(',') + 1));
        png = new Blob([Uint8Array.from(raw, (ch) => ch.charCodeAt(0))], { type: 'image/png' });
      } catch {
        return setNote({ ok: false, text: t('crt.err.not_a_png') });
      }
      const form = new FormData();
      form.append('kind', kind);
      form.append('file', new File([png], `${kind}.png`, { type: 'image/png' }));
      if (await call('/api/app/documents/certificates/marks', { method: 'POST', body: form })) {
        setNote({ ok: true, text: t('crt.marks.saved') });
        await loadHome();
      }
    });
  const removeMark = (kind: 'seal' | 'signature') =>
    busyWith(async () => {
      if (await call(`/api/app/documents/certificates/marks?kind=${kind}`, { method: 'DELETE' })) {
        setNote({ ok: true, text: t('crt.marks.removed') });
        await loadHome();
      }
    });

  const saveNumbering = () =>
    busyWith(async () => {
      const body = await call('/api/app/documents/certificates/numbering', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prefix: numForm.prefix.trim() || null, startAt: numForm.startAt.trim() }) });
      if (!body) return;
      setNumbering(null);
      setNote({ ok: true, text: t('crt.num.saved') });
      await loadHome();
    });
  const nameSigner = (userId: string, named: boolean) =>
    busyWith(async () => {
      if (!(await call('/api/app/documents/certificates/signers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId, named }) }))) return;
      setNote({ ok: true, text: t('crt.signers.done') });
      await loadHome();
    });

  const clearanceBadge = (c: RosterChild) =>
    c.cleared_by === 'not_required' ? (
      <Badge data-certificate-clearance="not_required">{t('crt.clear.notRequired')}</Badge>
    ) : c.cleared ? (
      <Badge variant="success" data-certificate-clearance={c.cleared_by ?? ''}>{t(c.cleared_by === 'fee_override' ? 'crt.clear.override' : 'crt.clear.nothing')}</Badge>
    ) : (
      <Badge variant="warning" data-certificate-clearance="held">{t('crt.clear.owes', { amount: money(c.owed_minor) })}</Badge>
    );

  return (
    <div lang={lang} data-certificates className="flex flex-col gap-4 text-sm text-slate">
      {note && <p role="status" data-certificates-note={note.ok ? 'ok' : 'refused'} className={`rounded-md px-3 py-2 font-semibold ${note.ok ? 'bg-off-white text-slate' : 'border border-red-800/30 text-red-800'}`}>{note.text}</p>}

      <section data-certificates-issue className={CARD}>
        <div>
          <h2 className="text-base font-bold">{t('crt.issue.title')}</h2>
          <p className="text-slate/70">{t('crt.issue.how')}</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <label htmlFor="crt-type" className="font-semibold">{t('crt.type.label')}</label>
            <select id="crt-type" className={FIELD} value={type} onChange={(e) => { const ty = e.target.value as CertificateType; setType(ty); setTyped({}); setOutcome(null); void loadRoster(ty, classId); }}>
              {CERT_TYPES.map((ty) => (
                <option key={ty} value={ty}>{typeName(ty)}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="crt-class" className="font-semibold">{t('crt.class.label')}</label>
            <select id="crt-class" className={FIELD} value={classId} onChange={(e) => { setClassId(e.target.value); setOutcome(null); void loadRoster(type, e.target.value); }}>
              <option value="">{t('crt.class.choose')}</option>
              {home.classes.map((c) => (
                <option key={c.class_id} value={c.class_id}>{c.name}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {fields.map((f) => {
            const kind = certDef(type).fields.find((d) => d.id === f.id)?.kind;
            const label = `${t(`crt.field.${f.id}` as MessageKey)}${f.required ? '' : ` ${t('crt.field.optional')}`}`;
            if (kind === 'select') {
              return (
                <div key={f.id} className="flex flex-col gap-1">
                  <label htmlFor={`crt-${f.id}`} className="font-semibold">{label}</label>
                  <select id={`crt-${f.id}`} className={FIELD} value={typed[f.id] ?? ''} onChange={(e) => setTyped({ ...typed, [f.id]: e.target.value })}>
                    <option value="">{t('crt.field.choose')}</option>
                    {fieldOptions(type, f.id).map((o) => (
                      <option key={o} value={o}>{o}</option>
                    ))}
                  </select>
                </div>
              );
            }
            return (
              <Input key={f.id} id={`crt-${f.id}`} type={kind === 'date' ? 'date' : 'text'} max={kind === 'date' ? home.today : undefined} maxLength={certDef(type).fields.find((d) => d.id === f.id)?.max} label={label} helperText={['purpose', 'period', 'discipline'].includes(f.id) ? t(`crt.field.${f.id}Help` as MessageKey) : undefined} value={typed[f.id] ?? ''} onChange={(e) => setTyped({ ...typed, [f.id]: e.target.value })} />
            );
          })}
        </div>
        {(type === 'bonafide' || type === 'study') && <p data-certificates-year className="rounded-md bg-off-white px-3 py-2">{home.year ? t('crt.year.printed', { year: home.year }) : t('crt.year.none')}</p>}
        <p data-certificates-signing={home.signing.iSign ? (home.signing.mySignature ? 'signed' : 'by-hand') : 'principal-by-hand'} className="text-slate/70">
          {t(!home.signing.iSign ? 'crt.issue.unsigned' : home.signing.mySignature ? 'crt.issue.signed' : 'crt.issue.noSignatureYet')}
        </p>
        <div data-certificates-clearance className="flex flex-col gap-1 rounded-md bg-off-white px-3 py-2">
          <p className="font-semibold">{t('crt.clearance.title')}</p>
          {asked.length > 0 && <p>{t('crt.clearance.asked', { types: asked.map(typeName).join(', ') })}</p>}
          {notAsked.length > 0 && <p>{t('crt.clearance.notAsked', { types: notAsked.map(typeName).join(', ') })}</p>}
          {!home.clearance.transfer && <p className="text-slate/70">{t('crt.clearance.tcNote')}</p>}
          <Link href="/app/settings" className="inline-flex min-h-[44px] items-center self-start text-sapphire underline">{t('crt.clearance.change')}</Link>
        </div>

        {!classId ? (
          <p data-certificates-choose className="rounded-md bg-off-white px-3 py-2">{t('crt.roster.choose')}</p>
        ) : roster && roster.length === 0 ? (
          <p data-certificates-empty className="rounded-md bg-off-white px-3 py-2">{t('crt.roster.empty')}</p>
        ) : roster ? (
          <>
            <div className="flex flex-wrap gap-2">
              <button type="button" data-certificates-select-all className={TAP} onClick={() => setSelected(roster.filter((c) => canIssue(c)).map((c) => c.student_id))}>{t('crt.select.all')}</button>
              <button type="button" className={TAP} disabled={selected.length === 0} onClick={() => setSelected([])}>{t('crt.select.none')}</button>
            </div>
            <ul data-certificates-roster className="flex flex-col gap-2">
              {roster.map((c) => {
                const open = waivers[c.student_id] !== undefined;
                return (
                  <li key={c.student_id} data-certificate-child={c.cleared ? 'cleared' : 'held'} className="flex flex-col gap-2 rounded-md border border-slate/10 p-3">
                    <div className="flex items-start gap-3">
                      <input id={`crt-child-${c.student_id}`} type="checkbox" className="mt-2.5 h-6 w-6 shrink-0" disabled={!canIssue(c)} checked={selected.includes(c.student_id) && canIssue(c)} onChange={(e) => setSelected(e.target.checked ? [...selected, c.student_id] : selected.filter((s) => s !== c.student_id))} />
                      <label htmlFor={`crt-child-${c.student_id}`} className="flex min-h-[44px] min-w-0 flex-1 flex-col justify-center gap-1">
                        <span className="break-words font-semibold">{c.name}</span>
                        <span className="text-slate/70">{[c.roll_no ? t('crt.child.roll', { roll: c.roll_no }) : '', c.admission_no ? t('crt.child.adm', { no: c.admission_no }) : ''].filter(Boolean).join(' · ')}</span>
                        <span>{clearanceBadge(c)}</span>
                      </label>
                    </div>
                    {c.latest && <p data-certificate-has className="text-slate/70">{t(blockedByTc(c) ? 'crt.child.hasTc' : 'crt.child.has', { number: c.latest.number, date: date(c.latest.issued_on) })}</p>}
                    {!c.cleared && !blockedByTc(c) && (home.mayWaive ? (
                      open ? (
                        <div className="flex flex-col gap-2">
                          <Input id={`crt-waive-${c.student_id}`} label={t('crt.waive.reason')} helperText={t('crt.waive.help')} maxLength={300} value={waivers[c.student_id]} onChange={(e) => setWaivers({ ...waivers, [c.student_id]: e.target.value })} />
                          <button type="button" className={`${TAP} self-start`} onClick={() => { const next = { ...waivers }; delete next[c.student_id]; setWaivers(next); setSelected(selected.filter((s) => s !== c.student_id)); }}>{t('crt.cancel')}</button>
                        </div>
                      ) : (
                        <button type="button" data-certificate-waive className={`${TAP} self-start`} onClick={() => { setWaivers({ ...waivers, [c.student_id]: '' }); setSelected([...selected, c.student_id]); }}>{t('crt.waive.open')}</button>
                      )
                    ) : (
                      <p className="text-slate/70">{t('crt.waive.principalOnly')}</p>
                    ))}
                  </li>
                );
              })}
            </ul>
            <button type="button" data-certificates-issue-button disabled={busy || chosen.length === 0 || missingTyped || needsYear} className={`${PRIMARY} self-start`} onClick={() => void issue()}>
              {tCount('crt.issue.button', chosen.length)}
            </button>
          </>
        ) : null}

        {outcome && (
          <div data-certificates-outcome className="flex flex-col gap-2 rounded-md bg-off-white px-3 py-2">
            {outcome.aadhaar.map((id) => (
              <p key={id} data-certificate-aadhaar>{t('crt.issue.aadhaar', { name: nameOf(id) })}</p>
            ))}
            {outcome.incomplete.map((i) => (
              <p key={i.studentId} data-certificate-incomplete>{t('crt.issue.incomplete', { name: nameOf(i.studentId), fields: i.fields.map((f) => t(`crt.need.${NEEDS.includes(f) ? f : 'other'}` as MessageKey)).join(', ') })}</p>
            ))}
            {outcome.issued.length > 0 && (
              <>
                <p className="text-slate/70">{t('crt.issue.pdfNote')}</p>
                <button type="button" data-certificates-batch-pdf disabled={busy} className={`${PRIMARY} self-start`} onClick={() => void download((roster ?? []).flatMap((c) => outcome.issued.filter((x) => x.studentId === c.student_id).map((x) => x.certificateId)), typeName(type))}>
                  {t('crt.issue.download')}
                </button>
              </>
            )}
          </div>
        )}
      </section>

      <section data-certificates-register className={CARD}>
        <div>
          <h2 className="text-base font-bold">{t('crt.register.title')}</h2>
          <p className="text-slate/70">{t('crt.register.how')}</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <label htmlFor="crt-reg-type" className="font-semibold">{t('crt.type.label')}</label>
            <select id="crt-reg-type" className={FIELD} value={regType} onChange={(e) => { setRegType(e.target.value); void loadRegister(e.target.value, regClass); }}>
              <option value="">{t('crt.register.allTypes')}</option>
              {CERT_TYPES.map((ty) => (
                <option key={ty} value={ty}>{typeName(ty)}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="crt-reg-class" className="font-semibold">{t('crt.class.label')}</label>
            <select id="crt-reg-class" className={FIELD} value={regClass} onChange={(e) => { setRegClass(e.target.value); void loadRegister(regType, e.target.value); }}>
              <option value="">{t('crt.register.allClasses')}</option>
              {home.classes.map((c) => (
                <option key={c.class_id} value={c.class_id}>{c.name}</option>
              ))}
            </select>
          </div>
        </div>
        {register.length === 0 ? (
          <p data-certificates-register-empty className="rounded-md bg-off-white px-3 py-2">{t('crt.register.empty')}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {register.map((r) => {
              const live = !r.withdrawn_at && !r.erased;
              return (
                <li key={r.certificate_id} data-certificate-row={r.withdrawn_at ? 'withdrawn' : 'valid'} data-certificate-number={r.number} className="flex flex-col gap-2 rounded-md border border-slate/10 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-base font-bold">{r.number}</span>
                    <span>{typeName(r.cert_type)}</span>
                    <Badge variant={r.withdrawn_at ? 'danger' : 'success'}>{t(r.withdrawn_at ? 'crt.row.withdrawnBadge' : 'crt.row.valid')}</Badge>
                  </div>
                  <p className="break-words font-semibold">{r.erased ? t('crt.row.erased') : [r.child, r.class_name, r.admission_no ? t('crt.child.adm', { no: r.admission_no }) : ''].filter(Boolean).join(' · ')}</p>
                  <p className="text-slate/70">{t('crt.row.issued', { date: date(r.issued_on), name: r.issued_by ?? '' })}</p>
                  {r.purpose && <p className="break-words">{t('crt.row.purpose', { purpose: r.purpose })}</p>}
                  <p data-certificate-row-clearance={r.clearance} className="break-words">
                    {r.clearance === 'waived'
                      ? t('crt.row.waived', { amount: money(r.owed_minor), name: r.waived_by ?? '', reason: r.waiver_reason ?? '' })
                      : r.clearance === 'not_required'
                        ? r.owed_minor > 0
                          ? t('crt.row.notRequiredOwed', { amount: money(r.owed_minor) })
                          : t('crt.row.notRequired')
                        : t(r.clearance === 'fee_override' ? 'crt.row.override' : 'crt.row.nothing')}
                  </p>
                  <p data-certificate-row-signed={r.signed_by ? 'signed' : 'by-hand'} className="text-slate/70">{r.signed_by ? t('crt.row.signed', { name: r.signed_by }) : t('crt.row.unsigned')}</p>
                  {r.withdrawn_at && <p data-certificate-withdrawn className="break-words font-semibold text-red-800">{t('crt.row.withdrawn', { date: date(r.withdrawn_at), name: r.withdrawn_by ?? '', reason: r.withdraw_reason ?? '' })}</p>}
                  {r.sent && <p data-certificate-sent={r.sent} className="text-slate/70">{r.sent === 'queued' || r.sent === 'sent' || r.sent === 'delivered' || r.sent === 'read' ? t('crt.row.sent') : HELD.includes(r.sent) ? t(`msg.held.${r.sent}` as MessageKey) : t('crt.row.sentOther')}</p>}
                  {!r.withdrawn_at && (live || home.mayWithdraw) && (
                    <div className="flex flex-wrap gap-2">
                      {live && <button type="button" data-certificate-pdf disabled={busy} className={TAP} onClick={() => void download([r.certificate_id], r.number)}>{t('crt.action.pdf')}</button>}
                      {live && <button type="button" data-certificate-send disabled={busy} className={TAP} onClick={() => void sendToFamily(r)}>{t('crt.action.send')}</button>}
                      {home.mayWithdraw && withdraw?.id !== r.certificate_id && <button type="button" data-certificate-withdraw disabled={busy} className={TAP} onClick={() => setWithdraw({ id: r.certificate_id, reason: '' })}>{t('crt.action.withdraw')}</button>}
                    </div>
                  )}
                  {withdraw?.id === r.certificate_id && (
                    <div data-certificate-withdraw-form className="flex flex-col gap-2 rounded-md bg-off-white p-3">
                      <Input id={`crt-withdraw-${r.certificate_id}`} label={t('crt.withdraw.reason')} helperText={t('crt.withdraw.help')} maxLength={300} value={withdraw.reason} onChange={(e) => setWithdraw({ ...withdraw, reason: e.target.value })} />
                      <div className="flex flex-wrap gap-2">
                        <button type="button" data-certificate-withdraw-confirm disabled={busy || !withdraw.reason.trim()} className={PRIMARY} onClick={() => void confirmWithdraw()}>{t('crt.withdraw.confirm')}</button>
                        <button type="button" className={TAP} onClick={() => setWithdraw(null)}>{t('crt.cancel')}</button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section data-certificates-numbering={num.fixed ? 'fixed' : num.set ? 'open' : 'default'} className={CARD}>
        <div>
          <h2 className="text-base font-bold">{t('crt.num.title')}</h2>
          <p className="text-slate/70">{t('crt.num.how')}</p>
        </div>
        <p className="rounded-md bg-off-white px-3 py-2">
          {!num.set ? t('crt.num.default') : t(num.fixed ? 'crt.num.fixed' : 'crt.num.open', { name: num.setBy ?? '', date: num.setOn ? date(num.setOn) : '' })}
        </p>
        <p data-certificates-next-numbers className="break-words">{t('crt.num.next', { list: CERT_TYPES.map((ty) => `${typeName(ty)} ${num.next[ty]}`).join(' · ') })}</p>
        {!num.fixed && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Input id="crt-num-prefix" label={t('crt.num.prefix')} helperText={t('crt.num.prefixHelp')} maxLength={12} autoCapitalize="characters" value={numForm.prefix} onChange={(e) => setNumbering({ ...numForm, prefix: e.target.value })} />
            <Input id="crt-num-start" label={t('crt.num.start')} helperText={t('crt.num.startHelp')} type="number" inputMode="numeric" min={1} max={999999} value={numForm.startAt} onChange={(e) => setNumbering({ ...numForm, startAt: e.target.value })} />
            <button type="button" data-certificates-numbering-save disabled={busy || numForm.startAt.trim() === ''} className={`${PRIMARY} self-start`} onClick={() => void saveNumbering()}>
              {t('crt.num.save')}
            </button>
          </div>
        )}
      </section>

      <section data-certificates-marks className={CARD}>
        <div>
          <h2 className="text-base font-bold">{t('crt.marks.title')}</h2>
          <p className="text-slate/70">{t('crt.marks.how')}</p>
        </div>
        <div data-certificate-mark="seal" data-certificate-mark-kept={home.marks.seal ? 'yes' : 'no'} className="flex flex-col gap-2 rounded-md border border-slate/10 p-3">
          <p className="font-semibold">{t('crt.marks.seal')}</p>
          <p className="text-slate/70">{t(home.marks.seal ? 'crt.marks.added' : 'crt.marks.noSeal')}</p>
          {home.mayKeepMarks ? (
            <div className="flex flex-wrap items-center gap-2">
              <label htmlFor="crt-mark-seal" className={`${TAP} inline-flex cursor-pointer items-center`}>{t(home.marks.seal ? 'crt.marks.replace' : 'crt.marks.upload')}</label>
              <input id="crt-mark-seal" type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" disabled={busy} onChange={(e) => { void uploadMark('seal', e.target.files?.[0]); e.target.value = ''; }} />
              {home.marks.seal && <button type="button" data-certificate-mark-remove className={TAP} disabled={busy} onClick={() => void removeMark('seal')}>{t('crt.marks.remove')}</button>}
            </div>
          ) : (
            <p className="text-slate/70">{t('crt.marks.principalOnly')}</p>
          )}
        </div>
        <div data-certificate-mark="signature" data-certificate-mark-kept={home.signing.mySignature ? 'yes' : 'no'} className="flex flex-col gap-2 rounded-md border border-slate/10 p-3">
          <p className="font-semibold">{t('crt.marks.signature')}</p>
          {home.signing.iSign ? (
            <>
              <p className="text-slate/70">{t(home.signing.mySignature ? 'crt.marks.signedBy' : 'crt.marks.noSignature')}</p>
              <div className="flex flex-wrap items-center gap-2">
                <label htmlFor="crt-mark-signature" className={`${TAP} inline-flex cursor-pointer items-center`}>{t(home.signing.mySignature ? 'crt.marks.replace' : 'crt.marks.upload')}</label>
                <input id="crt-mark-signature" type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" disabled={busy} onChange={(e) => { void uploadMark('signature', e.target.files?.[0]); e.target.value = ''; }} />
                {home.signing.mySignature && <button type="button" data-certificate-mark-remove className={TAP} disabled={busy} onClick={() => void removeMark('signature')}>{t('crt.marks.remove')}</button>}
              </div>
            </>
          ) : (
            <p data-certificate-not-signer className="text-slate/70">{t('crt.marks.notSigner')}</p>
          )}
        </div>
        {(home.mayKeepMarks || home.signing.iSign) && (
          <label className="flex min-h-[44px] items-center gap-3">
            <input type="checkbox" className="h-6 w-6" checked={clearWhite} onChange={(e) => setClearWhite(e.target.checked)} />
            <span>{t('crt.marks.clearWhite')}</span>
          </label>
        )}
      </section>

      {home.signing.signers && (
        <section data-certificates-signers className={CARD}>
          <div>
            <h2 className="text-base font-bold">{t('crt.signers.title')}</h2>
            <p className="text-slate/70">{t('crt.signers.how')}</p>
          </div>
          {home.signing.signers.length === 0 ? (
            <p className="rounded-md bg-off-white px-3 py-2">{t('crt.signers.none')}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {home.signing.signers.map((g) => (
                <li key={g.user_id} data-certificate-signer={g.named ? 'named' : 'not-named'} className="flex flex-col gap-2 rounded-md border border-slate/10 p-3">
                  <p className="break-words font-semibold">{g.name}</p>
                  <p className="text-slate/70">{[t(g.named ? 'crt.signers.named' : 'crt.signers.notNamed'), g.named ? t(g.hasSignature ? 'crt.signers.hasSignature' : 'crt.signers.noSignature') : ''].filter(Boolean).join(' · ')}</p>
                  <button type="button" data-certificate-signer-toggle className={`${TAP} self-start`} disabled={busy} onClick={() => void nameSigner(g.user_id, !g.named)}>
                    {t(g.named ? 'crt.signers.unname' : 'crt.signers.name', { name: g.name })}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
