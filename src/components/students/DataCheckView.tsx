'use client';

import { useCallback, useEffect, useState } from 'react';
import { useT } from '@/components/app-shell/LangContext';
import type { MessageKey } from '@/lib/i18n';
import type { DataCheckList } from '@/lib/students/data-check';
import { DataCheckChild, type Post } from './DataCheckChild';

// The student data check (docs/28 row 10b, C222): every child's name, date of birth and gender in the school record
// against Aadhaar as printed, most serious difference first (the website free tool's own rule, worked out on the
// server). The office types what Aadhaar prints, asks the parent through the send-gate, attaches an answer that came
// another way, and corrects the record or closes the request. A class teacher reads their own class.

type Show = 'attention' | 'untyped' | 'all';
const PAGE = 25;
const FIELD = 'min-h-[44px] rounded-md border border-slate/20 bg-white px-3 text-sm text-slate';
const TAP = 'min-h-[44px] rounded-md border border-slate/20 px-4 text-sm font-semibold text-slate disabled:opacity-60';
const KNOWN = ['aadhaar_number', 'name', 'dob', 'gender', 'empty', 'not_typed', 'fields', 'nothing_to_ask', 'already_open', 'guardian', 'decided', 'noted_already'];

export function DataCheckView() {
  const { t, lang } = useT();
  const [data, setData] = useState<DataCheckList | null>(null);
  // 'refused': this role reads none of it (the accountant, the coordinator); 'failed': it could not be loaded.
  const [failed, setFailed] = useState<'refused' | 'failed' | null>(null);
  const [classId, setClassId] = useState('');
  const [show, setShow] = useState<Show | null>(null);
  const [shown, setShown] = useState(PAGE);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (cls: string) => {
    const res = await fetch(`/api/app/students/data-check${cls ? `?class=${encodeURIComponent(cls)}` : ''}`).catch(() => null);
    const got = res?.ok ? ((await res.json().catch(() => null)) as DataCheckList | null) : null;
    setFailed(got ? null : res?.status === 403 ? 'refused' : 'failed');
    if (!got) return;
    setData(got);
    // The first time: what needs a look, if anything does; otherwise who is still to be typed.
    setShow((s) => s ?? (got.counts.attention + got.counts.open > 0 ? 'attention' : got.counts.typed < got.counts.total ? 'untyped' : 'all'));
  }, []);
  useEffect(() => {
    void load(classId);
  }, [load, classId]);

  // One step on a child or a request. The words of a refusal are the screen's own, in the person's language.
  const post: Post = async (url, payload, action) => {
    setBusy(true);
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).catch(() => null);
    const got = res ? await res.json().catch(() => null) : null;
    setBusy(false);
    if (!res?.ok) {
      const code = typeof got?.code === 'string' ? got.code : '';
      const key = code === 'value' ? (action === 'correct' ? 'sdc.err.correctValue' : 'sdc.err.noteValue') : KNOWN.includes(code) ? `sdc.err.${code}` : 'sdc.err.other';
      return { ok: false, text: t(key as MessageKey) };
    }
    if (action !== 'draft') await load(classId);
    return { ok: true, body: (got ?? {}) as Record<string, unknown> };
  };

  if (failed === 'refused') return <p data-dc-refused className="rounded-md bg-off-white px-3 py-2 text-sm text-slate">{t('sdc.notForYou')}</p>;
  if (failed) return <p role="alert" className="rounded-md bg-off-white px-3 py-2 text-sm text-slate">{t('sdc.failed')}</p>;
  if (!data || !show) return null;
  const list = data.children.filter((c) => (show === 'untyped' ? !c.printed : show === 'attention' ? c.severity > 0 || c.requests.some((r) => r.outcome === null) : true));
  const emptyDo: MessageKey = show === 'attention' ? 'sdc.empty.attention.do' : show === 'untyped' ? 'sdc.empty.untyped.do' : data.office ? 'sdc.empty.all.do' : 'sdc.empty.teacher.do';

  return (
    <div lang={lang} data-data-check className="flex flex-col gap-4 text-sm text-slate">
      <p data-dc-never className="rounded-md border border-slate/10 bg-white px-3 py-2 font-semibold">{t('sdc.never')}</p>
      {!data.office && <p data-dc-teacher className="rounded-md bg-off-white px-3 py-2">{t('sdc.teacherView')}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label htmlFor="dc-class" className="font-semibold">{t('sdc.filter.class')}</label>
          <select id="dc-class" className={FIELD} value={classId} onChange={(e) => { setClassId(e.target.value); setShown(PAGE); }}>
            <option value="">{t('sdc.filter.allClasses')}</option>
            {data.classes.map((c) => (
              <option key={c.class_id} value={c.class_id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="dc-show" className="font-semibold">{t('sdc.filter.show')}</label>
          <select id="dc-show" className={FIELD} value={show} onChange={(e) => { setShow(e.target.value as Show); setShown(PAGE); }}>
            <option value="attention">{t('sdc.show.attention')}</option>
            <option value="untyped">{t('sdc.show.untyped')}</option>
            <option value="all">{t('sdc.show.all')}</option>
          </select>
        </div>
      </div>
      <p data-dc-counts className="text-slate/70">{t('sdc.counts', { typed: data.counts.typed, total: data.counts.total, attention: data.counts.attention, open: data.counts.open, answered: data.counts.answered })}</p>
      {list.length === 0 ? (
        <div data-dc-empty={show} className="flex flex-col items-start gap-2 rounded-xl border border-dashed border-slate/20 bg-white p-5">
          <p className="text-base font-bold text-slate">{t(show === 'attention' ? 'sdc.empty.attention.title' : show === 'untyped' ? 'sdc.empty.untyped.title' : 'sdc.empty.all.title')}</p>
          <p className="max-w-prose text-sm text-slate">{t(emptyDo)}</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {list.slice(0, shown).map((c) => (
            <DataCheckChild key={c.student_id} child={c} office={data.office} busy={busy} post={post} />
          ))}
        </ul>
      )}
      {list.length > shown && (
        <button type="button" data-dc-more className={`${TAP} self-start`} onClick={() => setShown(shown + PAGE)}>
          {t('sdc.more')}
        </button>
      )}
    </div>
  );
}
