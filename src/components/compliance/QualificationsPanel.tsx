'use client';

import { useState } from 'react';
import { useT } from '@/components/app-shell/LangContext';
import { InfoTip } from '@/components/app-ui/InfoTip';
import { StatTile } from '@/components/stats/StatTile';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import type { Register, StaffEntry } from '@/lib/compliance/qualifications';
import { RULE_IDS, STAGES, TET_PAPERS, TET_TYPES, type Ending, type ImportStatus, type Qualification } from '@/lib/compliance/register-rules';
import type { MessageKey } from '@/lib/i18n';
import { CARD, dayFormat, FIELD, LINK, PRIMARY, refusal, send, TAP, type Say } from './desk-client';

// The teacher register of the compliance desk (C227): each teaching staff account's qualifications and TET, what is
// missing against the school's rules for each stage, and every certificate or approval ending within the school's
// window or already passed. Saving a row; the CSV import in the website tool's own columns. Every check is the
// server's, by the tool's own rules: the screen never works one out itself.

type Form = Record<keyof Qualification, string>;
const blank = (q: Qualification | null): Form => Object.fromEntries(Object.entries(q ?? {}).map(([k, v]) => [k, v ?? ''])) as Form;
const EMPTY: Form = { stage: '', subjects: '', degree: '', postgraduate_degree: '', professional_qualification: '', tet_type: '', tet_paper: '', tet_certificate_date: '', tet_valid_until: '', other_approval: '', other_valid_until: '' };
type Preview = { rows: { line: number; name: string; status: ImportStatus; replaces: boolean }[]; unreadableDates: number; unknownStages: number; saved: number | null };

export function QualificationsPanel({ register, reload, say }: { register: Register; reload: () => Promise<void>; say: Say }) {
  const { t, tCount, lang } = useT();
  const [editing, setEditing] = useState<{ userId: string; form: Form } | null>(null);
  const [busy, setBusy] = useState(false);
  const [csv, setCsv] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [erasing, setErasing] = useState<string | null>(null);
  const date = dayFormat(lang);
  // CTET and the papers' numerals are names, the same in every language; a State TET is said in the person's language.
  const tetName = (type: string) => (type === 'CTET' ? type : t('cdk.tet.state'));
  const paperName = (paper: string) => (paper === 'both' ? t('cdk.paper.both') : paper);
  const days = register.settings.window;

  const left = (e: Ending) => (e.days < 0 ? tCount('cdk.q.passed', -e.days) : e.days === 0 ? t('cdk.q.endsToday') : tCount('cdk.q.daysLeft', e.days));
  const what = (e: Ending) => (e.kind === 'tet' ? t('cdk.q.tetCertificate', { type: tetName(e.label) }) : e.label || t('cdk.q.otherApproval'));

  const save = async () => {
    if (!editing) return;
    setBusy(true);
    const reply = await send(`/api/app/compliance/qualifications/${editing.userId}`, 'POST', editing.form);
    setBusy(false);
    if (!reply.ok) return say(false, t(refusal(reply)));
    setEditing(null);
    say(true, t('cdk.q.saved'));
    await reload();
  };

  // A person who has left: their row is erased for good, by the database's own function (C232 part B).
  const erase = async (userId: string) => {
    setBusy(true);
    const reply = await send(`/api/app/compliance/qualifications/${userId}`, 'DELETE');
    setBusy(false);
    setErasing(null);
    if (!reply.ok) return say(false, t(refusal(reply)));
    say(true, t('cdk.q.erased'));
    await reload();
  };

  const runImport = async (apply: boolean) => {
    if (csv === null) return;
    setBusy(true);
    const reply = await send('/api/app/compliance/qualifications/import', 'POST', { csv, apply });
    setBusy(false);
    if (!reply.ok) return say(false, t(refusal(reply)));
    const got = reply.body as unknown as Preview;
    setPreview(got);
    if (apply) {
      say(true, tCount('cdk.imp.saved', got.saved ?? 0));
      setCsv(null);
      setPreview(null);
      await reload();
    }
  };

  const tetLine = (q: Qualification | null) => {
    if (!q?.tet_type) return t('cdk.q.noTet');
    const parts = [q.tet_paper ? t('cdk.q.tetWithPaper', { type: tetName(q.tet_type), paper: paperName(q.tet_paper) }) : tetName(q.tet_type)];
    if (q.tet_certificate_date) parts.push(t('cdk.q.certificateOn', { date: date(q.tet_certificate_date) }));
    parts.push(q.tet_valid_until ? t('cdk.q.validUntil', { date: date(q.tet_valid_until) }) : t('cdk.q.noEnd'));
    return parts.join(' · ');
  };

  const field = (key: keyof Qualification, label: MessageKey, max: number) =>
    editing && <Input id={`cdk-q-${key}`} label={t(label)} maxLength={max} value={editing.form[key]} onChange={(e) => setEditing({ ...editing, form: { ...editing.form, [key]: e.target.value } })} />;
  const dateField = (key: keyof Qualification, label: MessageKey, help?: MessageKey) =>
    editing && <Input id={`cdk-q-${key}`} type="date" label={t(label)} helperText={help ? t(help) : undefined} max={key === 'tet_certificate_date' ? register.today : undefined} value={editing.form[key]} onChange={(e) => setEditing({ ...editing, form: { ...editing.form, [key]: e.target.value } })} />;

  const staffCard = (s: StaffEntry) => {
    const open = editing?.userId === s.user_id;
    return (
      <li key={s.user_id} data-cdk-staff={s.user_id} data-cdk-gaps={s.gaps.length} className="flex flex-col gap-2 rounded-md border border-slate/10 p-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="break-words text-base font-bold">{s.name}</p>
            <p>{s.qualification?.stage ? t(`cdk.stage.${s.qualification.stage}` as MessageKey) : t('cdk.stage.none')}</p>
            <p data-cdk-tet className="break-words text-slate/70">{tetLine(s.qualification)}</p>
            {s.qualification?.other_approval && <p className="break-words text-slate/70">{s.qualification.other_valid_until ? t('cdk.q.otherUntil', { name: s.qualification.other_approval, date: date(s.qualification.other_valid_until) }) : s.qualification.other_approval}</p>}
            {s.updated_at && <p className="text-slate/70">{t('cdk.q.changed', { name: s.updated_by ?? '', date: date(s.updated_at) })}</p>}
          </div>
          {!open && (
            <button type="button" data-cdk-edit className={TAP} onClick={() => setEditing({ userId: s.user_id, form: s.qualification ? blank(s.qualification) : { ...EMPTY } })}>
              {t(s.qualification ? 'cdk.q.edit' : 'cdk.q.record')}
            </button>
          )}
        </div>
        {!s.qualification ? (
          <Badge variant="warning" className="self-start">{t('cdk.q.notRecorded')}</Badge>
        ) : s.gaps.length === 0 && s.endings.length === 0 ? (
          <Badge variant="success" className="self-start">{t('cdk.q.complete')}</Badge>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {s.gaps.map((g) => (
              <li key={g}><Badge variant="danger" data-cdk-gap={g}>{t(`cdk.gap.${g}` as MessageKey)}</Badge></li>
            ))}
            {s.endings.map((e) => (
              <li key={`${e.kind}-${e.until}`}><Badge variant={e.days < 0 ? 'danger' : 'warning'} data-cdk-ending={e.kind}>{what(e)} · {left(e)}</Badge></li>
            ))}
          </ul>
        )}
        {open && editing && (
          <div data-cdk-form className="flex flex-col gap-3 rounded-md bg-off-white p-3">
            <Select id="cdk-q-stage" label={t('cdk.f.stage')} value={editing.form.stage} onChange={(e) => setEditing({ ...editing, form: { ...editing.form, stage: e.target.value } })}>
              <option value="">{t('cdk.stage.none')}</option>
              {STAGES.map((st) => (
                <option key={st.id} value={st.id}>{t(`cdk.stage.${st.id}` as MessageKey)}</option>
              ))}
            </Select>
            <div className="grid gap-3 sm:grid-cols-2">
              {field('subjects', 'cdk.f.subjects', 80)}
              {field('degree', 'cdk.f.degree', 60)}
              {field('postgraduate_degree', 'cdk.f.pg', 60)}
              {field('professional_qualification', 'cdk.f.professional', 60)}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Select id="cdk-q-tet_type" label={t('cdk.f.tetType')} value={editing.form.tet_type} onChange={(e) => setEditing({ ...editing, form: e.target.value ? { ...editing.form, tet_type: e.target.value } : { ...editing.form, tet_type: '', tet_paper: '', tet_certificate_date: '', tet_valid_until: '' } })}>
                <option value="">{t('cdk.tet.none')}</option>
                {TET_TYPES.map((x) => (
                  <option key={x} value={x}>{tetName(x)}</option>
                ))}
              </Select>
              <Select id="cdk-q-tet_paper" label={t('cdk.f.tetPaper')} disabled={!editing.form.tet_type} value={editing.form.tet_paper} onChange={(e) => setEditing({ ...editing, form: { ...editing.form, tet_paper: e.target.value } })}>
                <option value="">{t('cdk.paper.none')}</option>
                {TET_PAPERS.map((p) => (
                  <option key={p} value={p}>{paperName(p)}</option>
                ))}
              </Select>
              {editing.form.tet_type && dateField('tet_certificate_date', 'cdk.f.tetDate')}
              {editing.form.tet_type && dateField('tet_valid_until', 'cdk.f.tetUntil', 'cdk.f.tetUntilHelp')}
              {field('other_approval', 'cdk.f.other', 80)}
              {dateField('other_valid_until', 'cdk.f.otherUntil')}
            </div>
            <p className="text-slate/70">{t('cdk.f.noAadhaar')}</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" data-cdk-save disabled={busy} className={PRIMARY} onClick={() => void save()}>{t('cdk.q.save')}</button>
              <button type="button" className={TAP} onClick={() => setEditing(null)}>{t('cdk.cancel')}</button>
            </div>
          </div>
        )}
      </li>
    );
  };

  return (
    <section data-cdk-register className={CARD}>
      <div className="flex flex-wrap items-center gap-x-1">
        <h2 className="text-base font-bold">{t('cdk.q.title')}</h2>
        <InfoTip>{t('cdk.q.how')}</InfoTip>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {([
          ['cdk.q.totalStaff', register.totals.staff, 'staff', 'users', 'royal'],
          ['cdk.q.totalGaps', register.totals.withGaps, 'gaps', 'alert', 'tangerine'],
          ['cdk.q.totalEnding', register.totals.ending, 'ending', 'bell', 'amber'],
          ['cdk.q.totalPassed', register.totals.passed, 'passed', 'alert', 'coral'],
        ] as const).map(([k, v, id, icon, tone]) => (
          <StatTile key={k} icon={icon} tone={tone} label={t(k, { days })} value={v} valueAttrs={{ 'data-cdk-total': id }} />
        ))}
      </div>

      <div data-cdk-endings className="flex flex-col gap-2">
        <h3 className="font-bold">{t('cdk.q.endingTitle', { days })}</h3>
        {register.endings.length === 0 ? (
          <p className="rounded-md bg-off-white px-3 py-2">{t('cdk.q.endingNone', { days })}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {register.endings.map((e) => (
              <li key={`${e.user_id}-${e.kind}`} data-cdk-ending-row={e.days < 0 ? 'passed' : 'ending'} className="flex flex-wrap items-center gap-2 rounded-md border border-slate/10 px-3 py-2">
                <span className="font-semibold">{e.name}</span>
                <span className="break-words">{what(e)}</span>
                <span className="text-slate/70">{t('cdk.q.validUntil', { date: date(e.until) })}</span>
                <Badge variant={e.days < 0 ? 'danger' : 'warning'}>{left(e)}</Badge>
              </li>
            ))}
          </ul>
        )}
      </div>

      {register.staff.length === 0 ? (
        <p data-cdk-no-staff className="rounded-md bg-off-white px-3 py-2">{t('cdk.q.noStaff')}</p>
      ) : (
        <ul className="flex flex-col gap-3">{register.staff.map(staffCard)}</ul>
      )}

      {register.former.length > 0 && (
        <div data-cdk-former className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-x-1">
            <h3 className="font-bold">{t('cdk.q.formerTitle')}</h3>
            <InfoTip>{t('cdk.q.formerHow')}</InfoTip>
          </div>
          <ul className="flex flex-col gap-2">
            {register.former.map((f) => (
              <li key={f.user_id} data-cdk-former-row={f.user_id} className="flex flex-col gap-2 rounded-md border border-slate/10 px-3 py-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="break-words font-semibold">{f.name}</p>
                    <p className="text-slate/70">{t(f.active ? 'cdk.q.formerRole' : 'cdk.q.formerLeft')} · {t('cdk.q.formerChanged', { date: date(f.updated_at) })}</p>
                  </div>
                  {erasing !== f.user_id && (
                    <button type="button" data-cdk-erase={f.user_id} disabled={busy} className={TAP} onClick={() => setErasing(f.user_id)}>{t('cdk.q.erase')}</button>
                  )}
                </div>
                {erasing === f.user_id && (
                  <div data-cdk-erase-confirm className="flex flex-col gap-2 rounded-md bg-off-white p-3">
                    <p className="font-semibold">{t('cdk.q.eraseConfirm', { name: f.name })}</p>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" data-cdk-erase-yes={f.user_id} disabled={busy} className={PRIMARY} onClick={() => void erase(f.user_id)}>{t('cdk.q.eraseYes')}</button>
                      <button type="button" className={TAP} onClick={() => setErasing(null)}>{t('cdk.cancel')}</button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <details data-cdk-rules className="rounded-md border border-slate/10 px-3">
        <summary className="flex min-h-[44px] cursor-pointer items-center font-semibold">{t('cdk.q.rules')}</summary>
        <div className="flex flex-col gap-1 pb-3">
          <ul className="flex flex-col gap-1">
            {STAGES.map((st) => {
              const needs = RULE_IDS.filter((r) => register.settings.rules[st.id][r]);
              return (
                <li key={st.id}>
                  {t(`cdk.stage.${st.id}` as MessageKey)}: {needs.length ? needs.map((r) => t(`cdk.rule.${r}` as MessageKey)).join(', ') : t('cdk.rule.nothing')}
                </li>
              );
            })}
          </ul>
          <a href="/app/settings" className={`${LINK} self-start`}>{t('cdk.q.openSettings')}</a>
        </div>
      </details>

      <details data-cdk-import className="rounded-md border border-slate/10 px-3">
        <summary className="flex min-h-[44px] cursor-pointer items-center font-semibold">{t('cdk.imp.title')}</summary>
        <div className="flex flex-col gap-3 pb-3">
          <p className="text-slate/70">{t('cdk.imp.how')}</p>
          <a href="/api/app/compliance/qualifications/template" className={`${LINK} self-start`}>{t('cdk.imp.template')}</a>
          <label htmlFor="cdk-import-file" className="text-sm font-medium">{t('cdk.imp.file')}</label>
          <input
            id="cdk-import-file"
            type="file"
            accept=".csv,text/csv"
            className={FIELD}
            onChange={async (e) => {
              const f = e.target.files?.[0];
              setPreview(null);
              setCsv(f ? await f.text() : null);
            }}
          />
          <button type="button" data-cdk-import-check disabled={busy || csv === null} className={`${TAP} self-start`} onClick={() => void runImport(false)}>{t('cdk.imp.check')}</button>
          {preview && (
            <div data-cdk-import-preview className="flex flex-col gap-2">
              {(preview.unreadableDates > 0 || preview.unknownStages > 0) && <p className="text-slate/70">{t('cdk.imp.unread', { dates: preview.unreadableDates, stages: preview.unknownStages })}</p>}
              <ul className="flex flex-col gap-1">
                {preview.rows.map((r) => (
                  <li key={r.line} data-cdk-import-row={r.status} className="flex flex-wrap gap-2">
                    <span className="text-slate/70">{t('cdk.imp.row', { n: r.line })}</span>
                    <span className="font-semibold">{r.name || t('cdk.imp.noName')}</span>
                    <span>{r.status === 'ready' ? t(r.replaces ? 'cdk.imp.replaces' : 'cdk.imp.ready') : t(`cdk.imp.status.${r.status}` as MessageKey)}</span>
                  </li>
                ))}
              </ul>
              <button type="button" data-cdk-import-save disabled={busy || !preview.rows.some((r) => r.status === 'ready')} className={`${PRIMARY} self-start`} onClick={() => void runImport(true)}>
                {tCount('cdk.imp.save', preview.rows.filter((r) => r.status === 'ready').length)}
              </button>
            </div>
          )}
        </div>
      </details>
    </section>
  );
}
