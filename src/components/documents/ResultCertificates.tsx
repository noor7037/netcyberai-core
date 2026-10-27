'use client';

import { useCallback, useEffect, useState } from 'react';
import { useT } from '@/components/app-shell/LangContext';
import type { IssuedForPrint, Marks } from '@/lib/documents/cert-doc';
import { certificatesPdf } from '@/lib/documents/pdf';
import type { ResultCertPlan } from '@/lib/documents/result-certificates';
import { downloadBlob, safeFilename } from '@/lib/pdf/browser';
import { SECTION, TAP } from '@/components/exams/SchemeParts';

// Merit and participation certificates on a published class result (C230-AJ part 5): the principal and the school admin see
// who will get which certificate by the rules the school set in Settings → Documents, then make them into the school's
// register (its number, seal and signature). Preview first; a second press makes none; the PDF is drawn on this device
// from the register, as every certificate is. For anyone the server does not answer, the section says nothing.

const PRIMARY = 'inline-flex min-h-[44px] items-center justify-center rounded-md bg-sapphire px-4 text-sm font-semibold text-white disabled:opacity-60';
const BATCH = 100; // the register's print limit

export function ResultCertificates({ examId, classId }: { examId: string; classId: string }) {
  const { t } = useT();
  const [plan, setPlan] = useState<ResultCertPlan | null>(null);
  const [hidden, setHidden] = useState(false);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const url = `/api/app/exams/${examId}/classes/${classId}/certificates`;

  const load = useCallback(async () => {
    const res = await fetch(url, { cache: 'no-store' }).catch(() => null);
    if (res?.ok) setPlan((await res.json().catch(() => null)) as ResultCertPlan | null);
    else if (res && (res.status === 403 || res.status === 404 || res.status === 409)) setHidden(true);
  }, [url]);
  useEffect(() => {
    void load();
  }, [load]);

  if (hidden || !plan) return null;
  const rules = plan.rules;
  const off = rules.merit.basis === 'off' && rules.participation === 'off';
  const toMake = plan.will.merit + plan.will.participation;
  const have = plan.made.merit + plan.made.participation;

  const make = async () => {
    setBusy(true);
    setNote(null);
    const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }).catch(() => null);
    const body = res?.ok ? ((await res.json().catch(() => null)) as { merit: number; participation: number } | null) : null;
    setBusy(false);
    setNote(body ? { ok: true, text: t('ex.cert.done', { merit: body.merit, participation: body.participation }) } : { ok: false, text: t('ex.cert.failed') });
    await load();
  };

  // The certificates of this publication as one PDF, in roll order, drawn on this device from the register.
  const pdf = async () => {
    setBusy(true);
    setNote({ ok: true, text: t('crt.pdf.making') });
    try {
      const ids = plan.children.flatMap((c) => c.certificateIds);
      const list: IssuedForPrint[] = [];
      let marks: (Marks & { unavailable: string[] }) | null = null;
      for (let i = 0; i < ids.length; i += BATCH) {
        const res = await fetch(`/api/app/documents/certificates?view=print&ids=${ids.slice(i, i + BATCH).join(',')}`, { cache: 'no-store' });
        if (!res.ok) throw new Error('print');
        const got = (await res.json()) as { list: IssuedForPrint[]; marks: Marks & { unavailable: string[] } };
        list.push(...got.list);
        marks = marks ?? got.marks;
      }
      if (!list.length || !marks) throw new Error('empty');
      const file = safeFilename(`certificates ${plan.children.length}`, 'pdf');
      downloadBlob(await certificatesPdf(list, marks, file), file);
      setNote({ ok: true, text: marks.unavailable.length ? `${t('crt.pdf.ready')} ${t('crt.marks.unavailable')}` : t('crt.pdf.ready') });
    } catch {
      setNote({ ok: false, text: t('crt.pdf.failed') });
    }
    setBusy(false);
  };

  const ruleWords = [
    rules.merit.basis === 'grade' ? t('ex.cert.rule.merit.grade', { grade: rules.merit.grade }) : rules.merit.basis === 'percent' ? t('ex.cert.rule.merit.percent', { percent: rules.merit.percent }) : t('ex.cert.rule.merit.off'),
    rules.participation === 'everyone' ? t('ex.cert.rule.part.everyone') : rules.participation === 'others' ? t('ex.cert.rule.part.others') : t('ex.cert.rule.part.off'),
  ];

  return (
    <section className={SECTION} data-result-certificates aria-labelledby="result-certs-title">
      <h2 id="result-certs-title" className="text-base font-bold">
        {t('ex.cert.title')}
      </h2>
      <p>{t('ex.cert.lead')}</p>
      <ul className="list-disc ps-5" data-cert-rules>
        {ruleWords.map((w) => (
          <li key={w}>{w}</li>
        ))}
      </ul>
      {off && <p className="rounded-md bg-off-white px-3 py-2">{t('ex.cert.rules.none')}</p>}
      {plan.noSuchGrade && rules.merit.basis === 'grade' && (
        <p role="alert" data-cert-no-grade className="rounded-md border border-red-800/30 px-3 py-2 font-semibold text-red-800">
          {t('ex.cert.noGrade', { grade: rules.merit.grade })}
        </p>
      )}
      {!off && (
        <p data-cert-summary className="font-semibold">
          {t('ex.cert.will', { merit: plan.will.merit, participation: plan.will.participation })}
          {have > 0 ? ` ${t('ex.cert.madeBefore', { merit: plan.made.merit, participation: plan.made.participation })}` : ''}
        </p>
      )}
      {!off && toMake === 0 && have === 0 && !plan.noSuchGrade && <p>{t('ex.cert.nobody')}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" className={TAP} aria-expanded={open} aria-controls="result-certs-list" onClick={() => setOpen(!open)} data-cert-preview>
          {open ? t('ex.cert.hide') : t('ex.cert.preview')}
        </button>
        {toMake > 0 && (
          <button type="button" className={PRIMARY} disabled={busy} onClick={() => void make()} data-cert-make>
            {busy ? t('ex.cert.making') : t('ex.cert.make', { n: toMake })}
          </button>
        )}
        {have > 0 && (
          <button type="button" className={TAP} disabled={busy} onClick={() => void pdf()} data-cert-pdf>
            {t('ex.cert.pdf')}
          </button>
        )}
        <a href="/app/settings" className={TAP} data-cert-settings>
          {t('ex.cert.settings')}
        </a>
      </div>
      {note && (
        <p role={note.ok ? 'status' : 'alert'} className="rounded-md bg-off-white px-3 py-2 font-semibold">
          {note.text}
        </p>
      )}
      {open && (
        <ol id="result-certs-list" className="flex flex-col gap-2" data-cert-list>
          {plan.children
            .filter((c) => c.merit || c.participation)
            .map((c) => (
              <li key={c.studentId} data-cert-child={c.studentId} className="rounded-lg border border-slate/10 bg-white p-3">
                <p className="font-bold">{c.rollNo ? t('ex.entry.child', { roll: c.rollNo, name: c.name }) : c.name}</p>
                <ul className="mt-1 flex flex-col gap-1">
                  {(['merit', 'participation'] as const)
                    .filter((k) => c[k])
                    .map((k) => (
                      <li key={k} className="flex flex-wrap justify-between gap-x-3" data-cert-kind={k} data-cert-state={c[k]}>
                        <span>{t(`ex.cert.kind.${k}`)}</span>
                        <span className="font-semibold">{t(c[k] === 'made' ? 'ex.cert.state.made' : 'ex.cert.state.will')}</span>
                      </li>
                    ))}
                </ul>
              </li>
            ))}
        </ol>
      )}
    </section>
  );
}
