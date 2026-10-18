'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useT } from '@/components/app-shell/LangContext';
import { InfoTip } from '@/components/app-ui/InfoTip';
import { ModuleIcon } from '@/components/app-ui/ModuleIcon';
import { Badge } from '@/components/ui/Badge';
import { AUDITOR_RULE_VERSION, CHECK_META, checkKey, summarise, type CheckResult, type CheckState, type CheckUpLine, type StoredCheckUp } from '@/lib/auditor/rules';
import { moduleById } from '@/lib/contracts/modules';
import { tCount as countWords, type Lang, type MessageKey } from '@/lib/i18n';

// School Health Auditor v1 (docs/26 slice 8i, C208), for the principal and the school admin.
//
// Top to bottom: the result in words ("9 of 11 checks pass", never a percentage or a grade) with "Check again";
// the checks that need attention first, each with its count, "Why this?" and one button to the screen that fixes
// it; any check that could not be run (never shown as passing); the checks that pass; the ones not set up yet,
// each saying what to set up; and the last check-ups, one line a day, which is the trend. A brand-new school, with
// no check-up yet, is told what a check-up does and runs the first one.
//
// Nothing is counted here: every count, state and address is the server's (the screen only adds up how many checks
// are in each state), and every word is in the message files.

export type AuditorData = { today: string; latest: StoredCheckUp | null; history: CheckUpLine[] };
export type AuditorNote = { ok: boolean; text: string } | null;

const PRIMARY = 'inline-flex min-h-[44px] items-center justify-center rounded-md bg-sapphire px-5 text-sm font-semibold text-white disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-royal';
const GO = 'inline-flex min-h-[44px] items-center justify-center rounded-md bg-sapphire px-4 text-sm font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-royal';
const QUIET = 'inline-flex min-h-[44px] items-center font-semibold text-sapphire underline';
const WHY = 'inline-flex min-h-[44px] cursor-pointer items-center font-semibold text-sapphire underline';
const BOX = 'flex min-w-0 flex-col gap-3 rounded-xl border border-slate/10 bg-white p-4';
const ROW = 'flex min-w-0 flex-col gap-2 rounded-xl border border-slate/10 bg-white p-3';

const dayWords = (lang: Lang, iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString(lang === 'hi' ? 'hi-IN' : 'en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const timeWords = (lang: Lang, iso: string) => new Date(iso).toLocaleTimeString(lang === 'hi' ? 'hi-IN' : 'en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });

export function AuditorView() {
  const { t } = useT();
  const [data, setData] = useState<AuditorData | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<AuditorNote>(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/app/school-auditor').catch(() => null);
    const got = res?.ok ? ((await res.json().catch(() => null)) as AuditorData | null) : null;
    setFailed(!got);
    if (got) setData(got);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const run = async () => {
    setBusy(true);
    setNote(null);
    const res = await fetch('/api/app/school-auditor', { method: 'POST' }).catch(() => null);
    const got = res?.ok ? ((await res.json().catch(() => null)) as AuditorData | null) : null;
    setBusy(false);
    if (!got) return setNote({ ok: false, text: t('aud.run.failed') });
    setData(got);
    setNote({ ok: true, text: t('aud.run.done') });
  };

  if (failed) return <p role="alert" className="rounded-md bg-off-white px-3 py-2 text-sm text-slate">{t('aud.failed')}</p>;
  if (!data) return null;
  return <AuditorScreen data={data} busy={busy} note={note} onRun={() => void run()} />;
}

// The screen for given data: drawn the same way in the app and in the tests.
export function AuditorScreen({ data, busy, note, onRun }: { data: AuditorData; busy: boolean; note: AuditorNote; onRun: () => void }) {
  const { t, lang } = useT();
  const latest = data.latest;
  const runButton = (
    <button type="button" data-auditor-run onClick={onRun} disabled={busy} className={PRIMARY}>
      {busy ? t('aud.run.busy') : t(latest ? 'aud.run.again' : 'aud.run.first')}
    </button>
  );
  const shown = note && (
    <p role={note.ok ? 'status' : 'alert'} data-auditor-note={note.ok ? 'ok' : 'failed'} className={`rounded-md px-3 py-2 text-sm font-semibold ${note.ok ? 'bg-off-white text-slate' : 'border border-red-800/30 text-red-800'}`}>
      {note.text}
    </p>
  );

  // A brand-new school: no check-up yet. Say what one does, and run the first.
  if (!latest) {
    return (
      <div lang={lang} data-auditor="empty" className="flex flex-col gap-4 text-sm text-slate">
        {shown}
        <div data-empty="school-auditor" className="flex flex-col items-start gap-2 rounded-xl border border-dashed border-slate/20 bg-white p-5">
          <p className="text-base font-bold text-slate">{t('aud.empty.title')}</p>
          <p className="max-w-prose text-sm text-slate">{t('aud.empty.do')}</p>
          <div className="flex flex-wrap items-center gap-x-1">
            {runButton}
            <InfoTip>
              <p>{t('aud.how')}</p>
              <p data-auditor-weekly>{t('aud.weekly.how')}</p>
            </InfoTip>
          </div>
        </div>
      </div>
    );
  }

  const sum = summarise(latest.results);
  const of = (state: CheckState) => latest.results.filter((r) => r.state === state);
  return (
    <div lang={lang} data-auditor="run" className="flex flex-col gap-4 text-sm text-slate">
      {shown}
      <section data-auditor-summary className={BOX}>
        <h2 data-auditor-result className="text-xl font-extrabold text-slate">
          {latest.applicable === 0 ? t('aud.summary.none') : t('aud.summary', { passed: latest.passed, applicable: latest.applicable })}
        </h2>
        {sum.notSetUp > 0 && <p data-auditor-not-set-up={sum.notSetUp}>{countWords(lang, 'aud.summary.notSetUp', sum.notSetUp)}</p>}
        {sum.notChecked > 0 && <p data-auditor-not-checked={sum.notChecked}>{countWords(lang, 'aud.summary.notChecked', sum.notChecked)}</p>}
        <p data-auditor-recorded-by={latest.byWeeklyCheckUp ? 'weekly' : 'person'} className="text-slate/70">
          {latest.byWeeklyCheckUp
            ? t('aud.checkedOn.weekly', { date: dayWords(lang, latest.date), time: timeWords(lang, latest.recordedAt) })
            : latest.recordedBy
              ? t('aud.checkedOn', { date: dayWords(lang, latest.date), time: timeWords(lang, latest.recordedAt), name: latest.recordedBy })
              : t('aud.checkedOn.noName', { date: dayWords(lang, latest.date), time: timeWords(lang, latest.recordedAt) })}
        </p>
        {latest.date !== data.today && <p data-auditor-older className="rounded-md bg-off-white px-3 py-2">{t('aud.older')}</p>}
        <div className="flex flex-wrap items-center gap-x-1">
          {runButton}
          <InfoTip>
            <p>{t('aud.how')}</p>
            <p data-auditor-weekly>{t('aud.weekly.how')}</p>
          </InfoTip>
        </div>
      </section>

      <Group id="attention" title={t('aud.attention.title')} results={of('needs_attention')} ruleVersion={latest.ruleVersion}
        none={latest.applicable > 0 && sum.notChecked === 0 ? t('aud.attention.none') : null} />
      <Group id="not-checked" title={t('aud.notChecked.title')} results={of('could_not_check')} ruleVersion={latest.ruleVersion} />
      <Group id="passes" title={t('aud.passes.title')} results={of('passes')} ruleVersion={latest.ruleVersion} />
      <Group id="not-set-up" title={t('aud.notSetUp.title')} how={t('aud.notSetUp.how')} results={of('not_set_up')} ruleVersion={latest.ruleVersion} />

      <section data-auditor-history className={BOX}>
        <div className="flex flex-wrap items-center gap-x-1">
          <h2 className="text-base font-bold text-slate">{t('aud.history.title')}</h2>
          <InfoTip>{t(data.history.length > 1 ? 'aud.history.how' : 'aud.history.one')}</InfoTip>
        </div>
        <ul className="flex flex-col divide-y divide-slate/10">
          {data.history.map((line) => (
            <li key={line.date} data-auditor-day={line.date} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span className="font-semibold">{dayWords(lang, line.date)}</span>
              <span>{line.applicable === 0 ? t('aud.history.row.none') : t('aud.history.row', { passed: line.passed, applicable: line.applicable })}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

// One group of checks under its title. Left out when it has none, unless it has words for "none".
function Group({ id, title, how, none = null, results, ruleVersion }: { id: string; title: string; how?: string; none?: string | null; results: CheckResult[]; ruleVersion: number }) {
  const { lang } = useT();
  if (results.length === 0 && !none) return null;
  return (
    <section data-auditor-section={id} className={BOX}>
      <div className="flex flex-wrap items-center gap-x-1">
        <h2 className="text-base font-bold text-slate">{title}</h2>
        {how && <InfoTip>{how}</InfoTip>}
      </div>
      {results.length === 0 ? (
        <p data-auditor-none>{none}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {results.map((r) => (
            <CheckRow key={r.id} result={r} ruleVersion={ruleVersion} lang={lang} />
          ))}
        </ul>
      )}
    </section>
  );
}

function CheckRow({ result: r, ruleVersion, lang }: { result: CheckResult; ruleVersion: number; lang: Lang }) {
  const { t } = useT();
  const mod = moduleById(CHECK_META[r.id].moduleId);
  const k = (part: Parameters<typeof checkKey>[1]) => checkKey(r.id, part) as MessageKey;
  return (
    <li data-check={r.id} data-state={r.state} {...(r.count !== null ? { 'data-count': r.count } : {})} className={ROW}>
      <div className="flex min-w-0 items-start gap-3">
        <ModuleIcon name={mod.icon} tone={mod.tone[0]} size="sm" />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          {r.state === 'needs_attention' && r.count !== null ? (
            <>
              <p className="font-bold text-slate">{countWords(lang, `aud.check.${r.id}.todo`, r.count)}</p>
              <div className="flex flex-wrap items-center gap-x-1">
                <p className="text-slate/70">{t(k('title'))}</p>
                <InfoTip>{t(k('do'))}</InfoTip>
              </div>
            </>
          ) : (
            <p className="font-semibold text-slate">{t(k('title'))}</p>
          )}
          {r.state === 'passes' && (
            <span>
              <Badge variant="success">{t('aud.state.passes')}</Badge>
            </span>
          )}
          {r.state === 'not_set_up' && <p>{r.off ? t('aud.moduleOff', { module: t(`module.${mod.id}` as MessageKey) }) : t(k('setup'))}</p>}
          {r.state === 'could_not_check' && <p>{t('aud.notChecked.do')}</p>}
        </div>
      </div>
      {r.href && r.state === 'needs_attention' && (
        <Link href={r.href} data-check-fix={r.id} className={`${GO} self-start`}>
          {t(k('open'))}
        </Link>
      )}
      {r.href && r.state === 'not_set_up' && !r.off && (
        <Link href={r.href} data-check-setup={r.id} className={`${QUIET} self-start`}>
          {t(k('open'))}
        </Link>
      )}
      <details data-why={r.id} className="text-sm text-slate">
        <summary className={WHY}>{t('myDay.why')}</summary>
        <div className="flex flex-col gap-1 pb-1">
          <p>{t('aud.why.rule', { rule: t(k('rule')) })}</p>
          <p className="text-slate/70">{t('aud.why.where', { where: t(k('where')) })}</p>
          <p className="text-slate/70">{t('aud.why.version', { version: ruleVersion || AUDITOR_RULE_VERSION })}</p>
        </div>
      </details>
    </li>
  );
}
