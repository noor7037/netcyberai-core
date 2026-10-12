'use client';

import { useCallback, useEffect, useState } from 'react';
import { TeachEmpty } from '@/components/app-ui/TeachEmpty';
import { useT } from '@/components/app-shell/LangContext';
import { useFeesPart } from './FeesFirstLoad';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { useToast } from '@/components/ui/Toast';
import type { MessageKey } from '@/lib/i18n';
import { minorToRupees, rupeesToMinor } from '@/lib/fees/money';

// Dues, concessions and the RTE tag (docs/23 6b, C159). The office picks a
// class and a month and raises that month's dues: one line per student and
// head, gross less approved concessions. Raising a month again adds only
// what is missing. A concession is proposed here and applies to nothing
// until the principal or the school admin approves it.

type Line = { fee_id: string; student_id: string; student_name: string; head_name: string; gross_minor: number; concession_minor: number; net_minor: number; due_date: string; status: string; kinds: string[] };
type Student = { student_id: string; name: string; rte_admission: boolean };
type Setup = { today: string; heads: { head_id: string; name: string; is_active: boolean }[]; classes: { class_id: string; name: string }[]; sessions: { session_id: string; label: string; start_date: string; end_date: string; is_current: boolean }[] };
type Concession = { concession_id: string; student_name: string; class_name: string | null; head_name: string | null; kind: string; percent_off: number | null; amount_off_minor: number | null; reason: string; status: 'proposed' | 'approved' | 'ended'; source?: 'person' | 'rule'; valid_from: string };
const KINDS = ['sibling', 'staff_ward', 'negotiated', 'hardship', 'scholarship'] as const;
const TAP = 'min-h-[44px] rounded-md border border-slate/20 px-4 text-sm font-semibold text-slate';
const PRIMARY = 'min-h-[44px] rounded-md bg-sapphire px-5 text-sm font-semibold text-white disabled:opacity-60';

export function FeesDuesView() {
  const { t, lang } = useT();
  const toast = useToast();
  const getConcessions = useFeesPart('concessions', '/api/app/fees/concessions');
  const getSetup = useFeesPart('setup', '/api/app/fees/setup');
  const [setup, setSetup] = useState<Setup | null>(null);
  const [failed, setFailed] = useState(false);
  const [classId, setClassId] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [month, setMonth] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [lines, setLines] = useState<Line[] | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [concessions, setConcessions] = useState<Concession[]>([]);
  const [mayApprove, setMayApprove] = useState(false);
  const [form, setForm] = useState({ studentId: '', kind: 'sibling' as (typeof KINDS)[number], headId: '', measure: 'percent' as 'percent' | 'amount', value: '', reason: '' });
  const [rte, setRte] = useState({ studentId: '', entryClass: '', admittedOn: '' });
  const [busy, setBusy] = useState(false);

  const loadConcessions = useCallback(async () => {
    const res = await getConcessions().catch(() => null);
    const body = (await res?.json().catch(() => null)) ?? {};
    if (res?.ok) {
      setConcessions(body.concessions);
      setMayApprove(body.mayApprove === true);
    }
  }, [getConcessions]);

  useEffect(() => {
    getSetup()
      .then(async (res) => {
        const body = (await res.json()) as Setup;
        if (!res.ok) throw new Error('not loaded');
        setSetup(body);
        setSessionId(body.sessions.find((s) => s.is_current)?.session_id ?? body.sessions[0]?.session_id ?? '');
        setMonth(body.today.slice(0, 7));
      })
      .catch(() => setFailed(true));
    void loadConcessions();
  }, [loadConcessions, getSetup]);

  const loadLines = useCallback(async () => {
    if (!classId || !sessionId || !month) return;
    const res = await fetch(`/api/app/fees/dues?classId=${classId}&sessionId=${sessionId}&month=${month}`).catch(() => null);
    const body = (await res?.json().catch(() => null)) ?? {};
    if (!res?.ok) {
      setLines([]);
      setStudents([]);
      return;
    }
    setLines(body.lines);
    setStudents(body.students);
    setDueDate((d) => d || `${month}-${String(body.dueDay).padStart(2, '0')}`);
  }, [classId, sessionId, month]);
  useEffect(() => {
    setDueDate('');
    void loadLines();
  }, [loadLines]);

  async function send(url: string, body: unknown): Promise<{ ok: boolean; body: Record<string, unknown> }> {
    setBusy(true);
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);
    const answer = (await res?.json().catch(() => null)) ?? {};
    setBusy(false);
    return { ok: !!res?.ok, body: answer };
  }

  async function raise() {
    const r = await send('/api/app/fees/dues', { classId, sessionId, month, dueDate });
    if (!r.ok) {
      const code = String(r.body.code ?? '');
      toast.show(t((['no_structure', 'nothing_due', 'due_date', 'month_outside_session'].includes(code) ? `due.refused.${code}` : 'fee.failed') as MessageKey), 'danger');
      return;
    }
    toast.show(t('due.raised', { raised: Number(r.body.raised), already: Number(r.body.alreadyThere), net: minorToRupees(Number(r.body.netMinor)) }), 'success');
    void loadLines();
  }

  async function propose() {
    const percent = form.measure === 'percent' ? Number(form.value) : null;
    const amount = form.measure === 'amount' ? rupeesToMinor(form.value) : null;
    if (!form.studentId || !form.reason.trim() || (form.measure === 'percent' ? !(percent! > 0 && percent! <= 100) : amount === null || amount === 0)) {
      toast.show(t('con.missing'), 'danger');
      return;
    }
    const r = await send('/api/app/fees/concessions', { studentId: form.studentId, kind: form.kind, headId: form.headId || null, percentOff: percent, amountOffMinor: amount, reason: form.reason, validFrom: setup?.today });
    if (!r.ok) {
      toast.show(t(r.body.code === 'measure' ? 'con.missing' : 'fee.failed'), 'danger');
      return;
    }
    toast.show(t('con.proposed'), 'success');
    setForm({ ...form, value: '', reason: '' });
    void loadConcessions();
  }

  async function decide(c: Concession, action: 'approve' | 'reject' | 'end') {
    const r = await send(`/api/app/fees/concessions/${c.concession_id}`, { action });
    if (!r.ok) toast.show(t(r.body.code === 'own_proposal' ? 'con.ownProposal' : 'fee.failed'), 'danger');
    void loadConcessions();
  }

  async function checkSiblings() {
    const r = await send('/api/app/fees/concessions/sibling', {});
    if (!r.ok) toast.show(t('fee.failed'), 'danger');
    else toast.show(r.body.proposed || r.body.ended ? t('con.sibling.done', { proposed: Number(r.body.proposed), ended: Number(r.body.ended) }) : t('con.sibling.none'), 'success');
    void loadConcessions();
  }

  async function tagRte(student: Student, on: boolean) {
    const r = await send('/api/app/fees/rte', { studentId: student.student_id, rte: on, entryClass: rte.entryClass, admittedOn: rte.admittedOn });
    if (!r.ok) {
      toast.show(t(r.body.code === 'details' ? 'rte.details' : r.body.rule === 'not_allowed' ? 'rte.officeOnly' : 'fee.failed'), 'danger');
      return;
    }
    toast.show(t(on ? 'rte.tagged' : 'rte.untagged'), 'success');
    setRte({ studentId: '', entryClass: '', admittedOn: '' });
    void loadLines();
  }

  if (failed) return <TeachEmpty id="not-loaded" />;
  if (!setup) return null;
  if (setup.classes.length === 0 || setup.sessions.length === 0) return null;

  const total = (k: 'gross_minor' | 'concession_minor' | 'net_minor') => (lines ?? []).reduce((s, l) => s + l[k], 0);
  const measureText = (c: Concession) => (c.percent_off !== null ? t('con.percent', { percent: c.percent_off }) : t('con.amount', { amount: minorToRupees(c.amount_off_minor ?? 0) }));

  return (
    <section lang={lang} className="flex flex-col gap-6">
      <div data-dues className="flex flex-col gap-3 rounded-lg border border-slate/10 bg-white p-4">
        <h2 className="text-base font-bold text-slate">{t('due.title')}</h2>
        <p className="text-sm text-slate/70">{t('due.how')}</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Select id="due-class" label={t('fee.class')} value={classId} onChange={(e) => setClassId(e.target.value)}>
            <option value="">{t('fee.class.choose')}</option>
            {setup.classes.map((c) => (
              <option key={c.class_id} value={c.class_id}>
                {c.name}
              </option>
            ))}
          </Select>
          <Select id="due-session" label={t('fee.session')} value={sessionId} onChange={(e) => setSessionId(e.target.value)}>
            {setup.sessions.map((s) => (
              <option key={s.session_id} value={s.session_id}>
                {s.label}
              </option>
            ))}
          </Select>
          <Input id="due-month" type="month" label={t('due.month')} value={month} onChange={(e) => setMonth(e.target.value)} />
          <Input id="due-date" type="date" label={t('due.dueDate')} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </div>
        <button type="button" data-raise disabled={busy || !classId || !month || !dueDate} className={`${PRIMARY} self-start`} onClick={() => void raise()}>
          {t('due.raise')}
        </button>

        {classId && lines !== null && lines.length === 0 && <TeachEmpty id="fee-dues" compact />}
        {lines !== null && lines.length > 0 && (
          <>
            <p data-dues-total className="text-sm font-semibold text-slate">
              {t('due.total', { gross: minorToRupees(total('gross_minor')), concession: minorToRupees(total('concession_minor')), net: minorToRupees(total('net_minor')) })}
            </p>
            <ul className="flex flex-col gap-1">
              {lines.map((l) => (
                <li key={l.fee_id} data-due-line className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-off-white px-3 py-2 text-sm text-slate">
                  <span className="min-w-0">
                    <span className="font-semibold">{l.student_name}</span> · {l.head_name}
                    {l.kinds.map((k) => (
                      <Badge key={k} variant="neutral" className="ml-2">
                        {t(`con.kind.${k}` as MessageKey)}
                      </Badge>
                    ))}
                  </span>
                  <span className="text-right">
                    <span className="font-semibold">{t('due.net', { net: minorToRupees(l.net_minor) })}</span>
                    {l.concession_minor > 0 && <span className="block text-xs text-slate/70">{t('due.breakdown', { gross: minorToRupees(l.gross_minor), concession: minorToRupees(l.concession_minor) })}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {classId && students.length > 0 && (
        <div data-concessions-form className="flex flex-col gap-3 rounded-lg border border-slate/10 bg-white p-4">
          <h2 className="text-base font-bold text-slate">{t('con.title')}</h2>
          <p className="text-sm text-slate/70">{t('con.how')}</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Select id="con-student" label={t('con.student')} value={form.studentId} onChange={(e) => setForm({ ...form, studentId: e.target.value })}>
              <option value="">{t('con.student.choose')}</option>
              {students.map((s) => (
                <option key={s.student_id} value={s.student_id}>
                  {s.name}
                </option>
              ))}
            </Select>
            <Select id="con-kind" label={t('con.kind')} value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as (typeof KINDS)[number] })}>
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {t(`con.kind.${k}` as MessageKey)}
                </option>
              ))}
            </Select>
            <Select id="con-head" label={t('con.head')} value={form.headId} onChange={(e) => setForm({ ...form, headId: e.target.value })}>
              <option value="">{t('con.head.all')}</option>
              {setup.heads.filter((h) => h.is_active).map((h) => (
                <option key={h.head_id} value={h.head_id}>
                  {h.name}
                </option>
              ))}
            </Select>
            <Select id="con-measure" label={t('con.measure')} value={form.measure} onChange={(e) => setForm({ ...form, measure: e.target.value as 'percent' | 'amount', value: '' })}>
              <option value="percent">{t('con.measure.percent')}</option>
              <option value="amount">{t('con.measure.amount')}</option>
            </Select>
            <Input id="con-value" label={t(form.measure === 'percent' ? 'con.value.percent' : 'fee.rupees')} inputMode="decimal" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} />
            <Input id="con-reason" label={t('con.reason')} maxLength={300} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
          </div>
          <button type="button" data-propose disabled={busy} className={`${PRIMARY} self-start`} onClick={() => void propose()}>
            {t('con.propose')}
          </button>

          <h3 className="pt-2 text-sm font-bold text-slate">{t('rte.title')}</h3>
          <p className="text-sm text-slate/70">{t('rte.how')}</p>
          <ul className="flex flex-col gap-2">
            {students.map((s) => (
              <li key={s.student_id} data-rte-row className="flex flex-col gap-2 text-sm text-slate">
                <span className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex items-center gap-2 font-semibold">
                    {s.name}
                    {s.rte_admission && <Badge variant="success">{t('con.kind.rte')}</Badge>}
                  </span>
                  {s.rte_admission ? (
                    <button type="button" disabled={busy} className={TAP} onClick={() => void tagRte(s, false)}>
                      {t('rte.remove')}
                    </button>
                  ) : (
                    <button type="button" disabled={busy} className={TAP} onClick={() => setRte({ studentId: rte.studentId === s.student_id ? '' : s.student_id, entryClass: '', admittedOn: '' })}>
                      {t('rte.mark')}
                    </button>
                  )}
                </span>
                {rte.studentId === s.student_id && (
                  <span className="grid items-end gap-2 sm:grid-cols-3">
                    <Input id={`rte-class-${s.student_id}`} label={t('rte.entryClass')} maxLength={40} value={rte.entryClass} onChange={(e) => setRte({ ...rte, entryClass: e.target.value })} />
                    <Input id={`rte-date-${s.student_id}`} type="date" label={t('rte.admittedOn')} max={setup.today} value={rte.admittedOn} onChange={(e) => setRte({ ...rte, admittedOn: e.target.value })} />
                    <button type="button" data-rte-save disabled={busy} className={PRIMARY} onClick={() => void tagRte(s, true)}>
                      {t('rte.save')}
                    </button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div data-sibling-rule className="flex flex-col gap-2 rounded-lg border border-slate/10 bg-white p-4">
        <p className="text-sm text-slate/70">{t('con.sibling.how')}</p>
        <button type="button" data-sibling-check disabled={busy} className={`${TAP} self-start`} onClick={() => void checkSiblings()}>
          {t('con.sibling.check')}
        </button>
      </div>

      {concessions.length > 0 && (
        <div data-concessions className="flex flex-col gap-2 rounded-lg border border-slate/10 bg-white p-4">
          <h2 className="text-base font-bold text-slate">{t('con.list')}</h2>
          {concessions.map((c) => (
            <div key={c.concession_id} data-concession={c.status} className="flex flex-wrap items-center justify-between gap-2 border-t border-slate/10 pt-2 text-sm text-slate">
              <span className="min-w-0">
                <span className="font-semibold">{c.student_name}</span>
                {c.class_name ? ` · ${c.class_name}` : ''} · {t(`con.kind.${c.kind}` as MessageKey)} · {measureText(c)} · {c.head_name ?? t('con.head.all')}
                <span className="block text-slate/70">{c.reason}</span>
              </span>
              <span className="flex flex-wrap items-center gap-2">
                {c.source === 'rule' && <Badge variant="neutral">{t('con.source.rule')}</Badge>}
                <Badge variant={c.status === 'approved' ? 'success' : c.status === 'proposed' ? 'warning' : 'neutral'}>{t(`con.status.${c.status}` as MessageKey)}</Badge>
                {mayApprove && c.status === 'proposed' && (
                  <>
                    <button type="button" data-approve disabled={busy} className={PRIMARY} onClick={() => void decide(c, 'approve')}>
                      {t('con.approve')}
                    </button>
                    <button type="button" disabled={busy} className={TAP} onClick={() => void decide(c, 'reject')}>
                      {t('con.reject')}
                    </button>
                  </>
                )}
                {mayApprove && c.status === 'approved' && (
                  <button type="button" disabled={busy} className={TAP} onClick={() => void decide(c, 'end')}>
                    {t('con.end')}
                  </button>
                )}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
