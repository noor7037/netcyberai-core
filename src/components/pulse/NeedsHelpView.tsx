'use client';

import { useCallback, useEffect, useState } from 'react';
import { TeachEmpty } from '@/components/app-ui/TeachEmpty';
import { useT } from '@/components/app-shell/LangContext';
import { InfoTip } from '@/components/app-ui/InfoTip';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { useToast } from '@/components/ui/Toast';
import type { MessageKey } from '@/lib/i18n';

// The "needs help" queue (D6, C148): each item is one student who needs a
// follow-up, why, a suggested follow-up, and (once the teacher has acted)
// what happened. Items are shown in the order they arrived. In P2 a teacher
// or the office adds them; parents' replies add them when WhatsApp starts.

const KINDS = ['did_not_understand', 'homework_help', 'missed_class', 'other'] as const;
type Kind = (typeof KINDS)[number];
type Followup = { followup_id: string; student_name: string; class_name: string; kind: Kind; reason: string | null; source: 'staff' | 'parent_reply'; status: 'open' | 'done' | 'not_needed'; outcome: string | null; created_at: string };
type ClassOption = { class_id: string; name: string };
type Student = { student_id: string; name: string };

const TAP = 'min-h-[48px] rounded-md border px-4 text-sm font-semibold';

export function NeedsHelpView() {
  const { t, tCount, lang } = useT();
  const toast = useToast();
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [open, setOpen] = useState<Followup[]>([]);
  const [decided, setDecided] = useState<Followup[]>([]);
  const [outcomes, setOutcomes] = useState<Record<string, string>>({});
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [classId, setClassId] = useState('');
  const [students, setStudents] = useState<Student[]>([]);
  const [studentId, setStudentId] = useState('');
  const [kind, setKind] = useState<Kind>('did_not_understand');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/app/followups');
      const body = await res.json();
      if (!res.ok) throw new Error('not loaded');
      setOpen(body.open);
      setDecided(body.decided);
      setState('ready');
    } catch {
      setState('failed');
    }
  }, []);

  useEffect(() => {
    void load();
    fetch('/api/app/classes')
      .then((r) => r.json())
      .then((body) => setClasses(body.classes ?? []))
      .catch(() => undefined);
  }, [load]);

  useEffect(() => {
    setStudents([]);
    setStudentId('');
    if (!classId) return;
    fetch(`/api/app/attendance?classId=${classId}`)
      .then((r) => r.json())
      .then((body) => setStudents(((body.roster ?? []) as Student[]).map((s) => ({ student_id: s.student_id, name: s.name }))))
      .catch(() => undefined);
  }, [classId]);

  async function add() {
    if (!studentId) return;
    setBusy(true);
    const res = await fetch('/api/app/followups', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ studentId, kind, reason }) }).catch(() => null);
    const body = (await res?.json().catch(() => null)) ?? {};
    setBusy(false);
    if (!res?.ok) {
      toast.show(t('help2.add.failed'), 'danger');
      return;
    }
    toast.show(t(body.already ? 'help2.add.already' : 'help2.add.done'), 'success');
    setReason('');
    setStudentId('');
    void load();
  }

  async function decide(f: Followup, status: 'done' | 'not_needed') {
    const outcome = (outcomes[f.followup_id] ?? '').trim();
    if (!outcome) {
      toast.show(t('help2.outcome.first'), 'danger');
      document.getElementById(`outcome-${f.followup_id}`)?.focus();
      return;
    }
    const res = await fetch(`/api/app/followups/${f.followup_id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status, outcome }) }).catch(() => null);
    if (!res?.ok) {
      toast.show(t('help2.outcome.failed'), 'danger');
      return;
    }
    toast.show(t('help2.outcome.saved'), 'success');
    void load();
  }

  const kindWord = (k: Kind) => t(`help2.kind.${k}` as MessageKey);
  const day = (iso: string) => new Date(iso).toLocaleDateString(lang === 'hi' ? 'hi-IN' : 'en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });

  return (
    <section lang={lang} className="flex flex-col gap-5">
      {state === 'loading' && (
        <p role="status" className="text-sm text-slate/70">
          {t('help2.loading')}
        </p>
      )}
      {state === 'failed' && <TeachEmpty id="not-loaded" />}

      {state === 'ready' && (
        <>
          <div className="flex flex-wrap items-center gap-x-1">
            <h2 className="text-base font-bold text-slate">{tCount('help2.open', open.length)}</h2>
            <InfoTip>{t('help2.whenParents')}</InfoTip>
          </div>
          {open.length === 0 && <TeachEmpty id="needs-help" />}
          <ul className="flex flex-col gap-3">
            {open.map((f) => (
              <li key={f.followup_id} data-followup className="flex flex-col gap-2 rounded-lg border border-slate/10 bg-white p-4 text-sm text-slate">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-base font-semibold">{`${f.student_name} · ${f.class_name}`}</p>
                  <span className="text-xs text-slate/70">{t(f.source === 'parent_reply' ? 'help2.from.parent' : 'help2.from.staff', { date: day(f.created_at) })}</span>
                </div>
                <p>
                  <span className="font-semibold">{kindWord(f.kind)}</span>
                  {f.reason ? `: ${f.reason}` : ''}
                </p>
                <div className="flex flex-wrap items-center gap-x-1 rounded-md bg-off-white px-3 py-1">
                  <span className="font-semibold">{t('help2.suggested')}</span>
                  <InfoTip label={t('help2.suggested')}>{t(`help2.suggest.${f.kind}` as MessageKey)}</InfoTip>
                </div>
                <Input id={`outcome-${f.followup_id}`} label={t('help2.outcome')} value={outcomes[f.followup_id] ?? ''} onChange={(e) => setOutcomes((o) => ({ ...o, [f.followup_id]: e.target.value }))} />
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="min-h-[48px] rounded-md bg-sapphire px-4 text-sm font-semibold text-white" onClick={() => void decide(f, 'done')}>
                    {t('help2.done')}
                  </button>
                  <button type="button" className={`${TAP} border-slate/20 text-slate`} onClick={() => void decide(f, 'not_needed')}>
                    {t('help2.notNeeded')}
                  </button>
                </div>
              </li>
            ))}
          </ul>

          <div data-add-followup className="flex flex-col gap-3 rounded-lg border border-slate/10 bg-white p-4">
            <h2 className="text-base font-bold text-slate">{t('help2.add.title')}</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <Select id="followup-class" label={t('help2.add.class')} value={classId} onChange={(e) => setClassId(e.target.value)}>
                <option value="">—</option>
                {classes.map((c) => (
                  <option key={c.class_id} value={c.class_id}>
                    {c.name}
                  </option>
                ))}
              </Select>
              <Select id="followup-student" label={t('help2.add.student')} value={studentId} onChange={(e) => setStudentId(e.target.value)} disabled={!classId}>
                <option value="">—</option>
                {students.map((s) => (
                  <option key={s.student_id} value={s.student_id}>
                    {s.name}
                  </option>
                ))}
              </Select>
              <Select id="followup-kind" label={t('help2.add.kind')} value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
                {KINDS.map((k) => (
                  <option key={k} value={k}>
                    {kindWord(k)}
                  </option>
                ))}
              </Select>
              <Input id="followup-reason" label={t('help2.add.reason')} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
            <button type="button" disabled={busy || !studentId} onClick={() => void add()} className={`${TAP} self-start border-sapphire text-sapphire disabled:opacity-60`}>
              {t('help2.add.go')}
            </button>
          </div>

          {decided.length > 0 && (
            <details data-followups-decided className="rounded-lg border border-slate/10 bg-white p-4">
              <summary className="min-h-[48px] cursor-pointer py-3 text-sm font-semibold text-sapphire">{tCount('help2.decided', decided.length)}</summary>
              <ul className="flex flex-col gap-2 pt-1">
                {decided.map((f) => (
                  <li key={f.followup_id} className="flex flex-col gap-1 border-t border-slate/10 pt-2 text-sm text-slate">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{`${f.student_name} · ${f.class_name}`}</span>
                      <Badge variant={f.status === 'done' ? 'success' : 'neutral'}>{t(f.status === 'done' ? 'help2.done' : 'help2.notNeeded')}</Badge>
                    </span>
                    <span>{`${kindWord(f.kind)}${f.reason ? `: ${f.reason}` : ''}`}</span>
                    <span className="text-slate/70">{f.outcome}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </section>
  );
}
