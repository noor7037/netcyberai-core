import type { PoolClient } from 'pg';
import { maskLinks } from '@/lib/documents/copy-link';
import { pipelineCounts } from '@/lib/jobs/pg-queue';
import { JOB_STATUSES, type JobStatus } from '@/lib/jobs/types';
import { BACKLOG_AFTER_MINUTES, healthStatus, jobsHealth } from '@/lib/observability/health';
import { redactText } from '@/lib/observability/redact';
import { MAX_REFUSED_KEPT_PER_HOUR } from '@/lib/whatsapp/delivery';
import { HOLD_HOURS } from '@/lib/whatsapp/held';
import { WEEKLY_CHECK_UP_JOB, weekStart } from '@/lib/auditor/rules';
import { NIGHTLY_CHECK_JOB } from '@/lib/early-warning/rules';
import { BILLING_NIGHTLY_JOB } from './billing-nightly';

// Control → Monitoring (docs/26 slice 8g, C206): everything that can stop without anyone noticing, read in one
// place. As the platform role (the founder's session): these tables belong to no one school.
//
// COUNTS AND AGES ONLY. The loader reads no column that holds a parent's or a child's name, a phone number, an
// email address or the words of a message: not to_phone, body or template_params of the message log, not a
// notice's payload, not a held reply's sealed words. What it returns is how many, how long ago, which school (its
// name, nothing else) and which job type. The few free texts it does return (a job's last error, the reason
// recorded on a message, what was wrong with a refused notice) go through cutContacts first.
//
// A school here is a LIVE school: a test school's messages and nightly runs are left out, as everywhere in Control.
// Jobs and notices belong to the platform, so every one counts.
//
// "Yesterday" is India's. The nightly work is queued just after midnight in India for the day that has begun, so
// by any time today the rows of yesterday's night must exist: a missing one is a night that was missed. (Today's
// own night is not judged here: between midnight and the run it would be a false alarm. If it fails outright, its
// job is in the list of failed jobs at once.)
//
// A missed night is never written afterwards. A fee job that runs late runs for the day it is now
// (src/lib/fees/nightly.ts), so retrying yesterday's job today writes today's row, which does everything
// yesterday's would have done. So a school with no row for yesterday is told apart by what has happened since:
// no run at all (still to be run: this asks for a person) or a later run (brought up to date: shown, and no more).

type Sql = Pick<PoolClient, 'query'>;

// --- What may be shown of a free text ------------------------------------------------------------------------

// Left as they are, so the text still says which row and which day: an id of ours, and a calendar date.
const KEEP = /(\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b|\b(?:19|20)\d{2}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])(?![\d-]))/gi;
// The provider's own id for a message carries the number it went to.
const MESSAGE_ID = /\bwamid\.[A-Za-z0-9+/=_-]+/g;
// Eight digits or more, with or without a plus sign, and with up to three spaces, dots, dashes, slashes or
// brackets between one digit and the next: "98123 - 45678" and "981/234/5678" are numbers too.
const PHONE_LIKE = /\(?\+?\d(?:[\s()./-]{0,3}\d){7,}/g;
// What code calls things, and the only kind of quoted value left as it is: small letters and digits joined by at
// least one underscore (a constraint, a template, a purpose, a status). One word alone is not enough to go by:
// "meenakshi" is one word too, and so is the first half of "kabir.iyer".
const A_NAME_IN_CODE = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$/;
const NAME_AT_MOST = 80;
const SHOWN_AT_MOST = 200;
// Every way a text quotes a value, each with what to do when the mark is opened and never closed: what follows it
// is the rest of the value, so it goes to the end of the line. A single mark is also an apostrophe, so it opens a
// quotation only at the start of a word and closes one only at the end of a word: "the school's quiet hours" is
// left alone, and 'Kabir's book' is cut whole.
const QUOTATIONS: readonly RegExp[] = [
  /(")([^"]*)(")|".*$/g,
  /(“)([^”]*)(”)|“.*$/g,
  /(`)([^`]*)(`)|`.*$/g,
  /(‘)(.*?)(’)(?!\w)|‘.*$/g,
  /(?<!\w)(')(.*?)(')(?!\w)|(?<!\w)'(?=\S).*$/g,
];
const quoted = (whole: string, open?: string, inside?: string, close?: string) => {
  if (open === undefined || inside === undefined || close === undefined) return `${whole[0]}<value>`;
  return inside.length <= NAME_AT_MOST && A_NAME_IN_CODE.test(inside) ? whole : `${open}<value>${close}`;
};

// A text that a job, a provider or the send-gate wrote, made fit to show: its first line, with anything that looks
// like an email address or a phone number cut out, and no longer than 200 characters. Null when nothing is left.
//   - an email address, a token and an Indian mobile number go by the rule the logs already use (redactText);
//   - a WhatsApp message id goes, and so does any other run of eight or more digits: that is what a phone number
//     looks like, however it is spaced, so a long amount or an address made of numbers goes with it;
//   - whatever stands in quotation marks goes ("…", “…”, '…', ‘…’ or `…`), unless it is a name in code with an
//     underscore in it ("class_notice", a constraint): an error that quotes what it choked on is quoting
//     somebody's data. A table or a column named in one word is cut with the rest;
//   - a web address keeps its domain only, then "…" (maskLinks, C232 part A): a provider that quotes a message's
//     values quotes the family's certificate link with them, and its key opens the certificate.
// Cutting too much is the safe side. What it cannot do is tell a name written without quotation marks from any
// other word, or a value somebody typed in exactly the shape of a name in code. Names are kept out one step
// earlier: the loader reads no column that holds one, and these texts are written by code and by providers, not
// typed by a family.
export function cutContacts(text: string | null | undefined): string | null {
  if (typeof text !== 'string') return null;
  const line = QUOTATIONS.reduce((soFar, marks) => soFar.replace(marks, quoted), maskLinks(redactText(text.split('\n')[0].trim())));
  const cut = line
    .split(KEEP)
    .map((part, i) => (i % 2 === 1 ? part : part.replace(MESSAGE_ID, '<message id>').replace(PHONE_LIKE, '<number>')))
    .join('')
    .trim();
  if (cut === '') return null;
  return cut.length > SHOWN_AT_MOST ? `${cut.slice(0, SHOWN_AT_MOST - 1).trimEnd()}…` : cut;
}

// --- The answer ----------------------------------------------------------------------------------------------

// Sends, notices and dropped replies are counted over this many days.
export const MONITORING_DAYS = 7;
// How many failed jobs are listed: last night's own two first, then dead ones, then newest first. The counts above
// the list are of all of them.
export const FAILED_JOBS_LISTED = 50;

export type SchoolCount = { schoolName: string; count: number };
// One reason messages did not go: how many, in which schools, and the latest reason recorded (cut by cutContacts).
// `key` is the provider's failure code for a failed message ('' when it gave none) and the gate's own status for
// one held back (blocked_consent, blocked_budget and the rest).
export type SendGroup = { key: string; count: number; schools: SchoolCount[]; latestReason: string | null };
// What a night's job left behind:
//   ran         it finished;
//   queued      it is in the queue and no worker has ever picked it up (no attempt, so no error to read);
//   running     a worker has it now, or stopped part-way (then it is also counted under the stuck jobs);
//   retrying    it failed at least once and waits for another try: only this one is in the list of failed jobs;
//   failed      it gave up (dead);
//   not_queued  nothing was ever queued for that night.
//   not_needed  nothing was queued because there was nothing to check: the billing clock queues a job only once a
//               school has a paid-until day (C204). This is not a fault.
export type NightlyJobState = 'ran' | 'queued' | 'running' | 'retrying' | 'failed' | 'not_queued' | 'not_needed';
export type NightlyJob = { type: string; state: NightlyJobState; attempts: number };
// A school's own scheduled check (C210): Early Warning each night, the School Health Auditor each week, queued as ONE
// JOB A SCHOOL whose module is on (the c210_schedules migration). Read for the night (or the week) that must already
// have been queued: yesterday in India, or the week yesterday was in. Live schools only.
//   state      the jobs of that night (or week) taken together, the worst first: failed if any gave up, then running,
//              retrying, queued; ran when every one finished; not_queued when none was queued though a live school
//              that the scheduler queues for has the module on; not_needed when none has.
//   attempts   the most tries of the jobs in that state.
//   queued     how many schools had a job for it; ran: how many of those finished.
//   lastRanSeconds  how long ago a job of this kind last finished, for any night or week (null: never, or not in
//              the 30 days the queue keeps finished jobs).
export type SchoolCheckRun = { type: string; forDate: string; state: NightlyJobState; attempts: number; queued: number; ran: number; lastRanSeconds: number | null };
export type SchoolCheckRows = { status: JobStatus; attempts: number }[];
// The state of a night's (or a week's) jobs taken together. Pure, so it is tested on its own.
export function schoolCheckState(rows: SchoolCheckRows, moduleOnSomewhere: boolean): { state: NightlyJobState; attempts: number } {
  if (rows.length === 0) return { state: moduleOnSomewhere ? 'not_queued' : 'not_needed', attempts: 0 };
  const of = (match: (r: SchoolCheckRows[number]) => boolean) => rows.filter(match);
  const order: [NightlyJobState, (r: SchoolCheckRows[number]) => boolean][] = [
    ['failed', (r) => r.status === 'dead'],
    ['running', (r) => r.status === 'running'],
    ['retrying', (r) => r.status === 'pending' && r.attempts > 0],
    ['queued', (r) => r.status === 'pending'],
  ];
  for (const [state, match] of order) {
    const found = of(match);
    if (found.length > 0) return { state, attempts: Math.max(...found.map((r) => r.attempts)) };
  }
  return { state: 'ran', attempts: Math.max(...rows.map((r) => r.attempts)) };
}
export type FailedJob = { jobId: string; type: string; state: 'dead' | 'retrying'; attempts: number; maxAttempts: number; error: string | null; forSeconds: number };

export type Monitoring = {
  readAt: string;
  days: number;
  // The same check /api/health runs (src/lib/observability/health.ts). The database answered, or there would be
  // no page at all.
  health: { status: 'ok' | 'degraded'; jobs: 'ok' | 'backlog'; backlogAfterMinutes: number };
  jobs: {
    byType: { type: string; counts: Record<JobStatus, number>; retrying: number }[];
    dead: number;
    // Running past its lease: the worker stopped part-way and nothing has picked the job up again.
    stuck: number;
    stuckLongestSeconds: number | null;
    retrying: number;
    // Pending and due now. A job set for a later time (a message held for quiet hours, a complaint's due time) is not due.
    due: number;
    oldestDueSeconds: number | null;
    lastDoneSeconds: number | null;
    failed: FailedJob[];
  };
  notices: { received: number; refused: number; refusedByOutcome: { outcome: string; count: number }[]; lastSeconds: number | null; refusedKeptPerHour: number };
  sends: { uncertain: SendGroup; failed: SendGroup[]; held: SendGroup[] };
  replies: { heldNow: number; oldestHeldSeconds: number | null; pastTheirTime: number; dropped: number; delivered: number; holdHours: number };
  nightly: {
    date: string; // yesterday in India
    feesJob: NightlyJob;
    billingJob: NightlyJob;
    feeRunsExpected: number; // live schools with a due on record before that day began
    feeRunMissing: string[]; // of those, the names of the schools with no fee run for that day and none since
    feeRunCaughtUp: { schoolName: string; runDate: string }[]; // of those, the schools with none for that day whose first run since brought them up to date
    runsWithProblems: { schoolName: string; runDate: string; problems: number }[]; // each live school's latest run, when its books did not add up
  };
  // Shown in the nightly section, with the fee run and the billing check (C210).
  schoolChecks: { earlyWarning: SchoolCheckRun; auditor: SchoolCheckRun };
  templates: {
    // Every version on record.
    total: number;
    approvedByUs: number;
    waitingForUs: number;
    rejectedByUs: number;
    withMeta: number;
    approvedByMeta: number;
    refusedByMeta: number;
    pausedByMeta: number;
    hindiNotReviewed: number;
    // Of those, the versions that still stand in the way of a message: see the query for the rule.
    inTheWay: { waitingForUs: number; refusedByMeta: number; pausedByMeta: number };
  };
};

export const FEES_NIGHTLY_JOB = 'fees.nightly';
// A message the gate held back for one of these is waiting on NetCyberAI: sending not approved for the school, a
// limit or a rate to set, a template to approve. The others (no consent, quiet hours) are the school's own.
export const HELD_FOR_US: readonly string[] = ['blocked_pilot', 'blocked_budget', 'blocked_no_template'];

const num = (v: unknown) => Number(v ?? 0);

export async function loadMonitoring(db: Sql): Promise<Monitoring> {
  // One clock for every age: the database's, as this transaction sees it.
  const clock = (await db.query(`select now() as at, (((now() at time zone 'Asia/Kolkata')::date) - 1)::text as yesterday`)).rows[0];
  const at = new Date(clock.at as string).getTime();
  const yesterday = clock.yesterday as string;
  // The weekly check-up's week that must already have been queued: the week yesterday was in (on a Monday, last week).
  const lastWeek = weekStart(yesterday);
  const since = (v: unknown): number | null => (v ? Math.max(0, Math.floor((at - new Date(v as string).getTime()) / 1000)) : null);

  // --- Jobs.
  const byType: Monitoring['jobs']['byType'] = [];
  for (const c of await pipelineCounts(db)) {
    let row = byType.find((r) => r.type === c.type);
    if (!row) byType.push((row = { type: c.type, counts: Object.fromEntries(JOB_STATUSES.map((s) => [s, 0])) as Record<JobStatus, number>, retrying: 0 }));
    row.counts[c.status] = num(c.count);
    row.retrying += num(c.retrying);
  }
  const j = (await db.query(
    `select count(*) filter (where status = 'dead')::int as dead,
            count(*) filter (where status = 'running' and locked_until < now())::int as stuck,
            min(locked_until) filter (where status = 'running' and locked_until < now()) as stuck_since,
            count(*) filter (where status = 'pending' and attempts > 0)::int as retrying,
            count(*) filter (where status = 'pending' and next_run_at <= now())::int as due,
            min(next_run_at) filter (where status = 'pending' and next_run_at <= now()) as due_since,
            max(completed_at) filter (where status = 'succeeded') as last_done
       from jobs`
  )).rows[0];
  // Each night's job is queued once, under a key that ends with India's date.
  const nightKeys = [`${FEES_NIGHTLY_JOB}:${yesterday}`, `${BILLING_NIGHTLY_JOB}:${yesterday}`];
  // The jobs a person may have to act on. Last night's own jobs first: the nightly section sends the reader here
  // for their error and their Retry, so however long the list they are on it. Then dead ones, so that many jobs
  // waiting for another try (a provider that is down for an hour) never push a dead one off the list; then newest
  // first. The payload is not read.
  // The schools' own checks of that night and that week (C210) count as last night's own jobs.
  const failed: FailedJob[] = (await db.query(
    `select job_id, type, status, attempts, max_attempts, last_error, updated_at
       from jobs
      where status = 'dead' or (status = 'pending' and attempts > 0)
      order by coalesce(idempotency_key = any($2::text[])
                or (type = $3 and idempotency_key = type || ':' || school_id::text || ':' || $4)
                or (type = $5 and idempotency_key = type || ':' || school_id::text || ':' || $6), false) desc,
               (status = 'dead') desc, updated_at desc, job_id limit $1`,
    [FAILED_JOBS_LISTED, nightKeys, NIGHTLY_CHECK_JOB, yesterday, WEEKLY_CHECK_UP_JOB, lastWeek]
  )).rows.map((p) => ({
    jobId: p.job_id as string,
    type: p.type as string,
    state: p.status === 'dead' ? 'dead' : 'retrying',
    attempts: num(p.attempts),
    maxAttempts: num(p.max_attempts),
    error: cutContacts(p.last_error as string | null),
    forSeconds: since(p.updated_at) ?? 0,
  }));

  // --- Delivery notices. Only that a notice came, whether its signature held and what became of it: never its body.
  const n = (await db.query(
    `select count(*) filter (where created_at > now() - make_interval(days => $1))::int as received,
            count(*) filter (where created_at > now() - make_interval(days => $1) and signature_ok = false)::int as refused,
            max(created_at) as last_at
       from webhook_events`,
    [MONITORING_DAYS]
  )).rows[0];
  const refusedRows = (await db.query(
    `select coalesce(outcome, '') as outcome, count(*)::int as n from webhook_events
      where created_at > now() - make_interval(days => $1) and signature_ok = false
      group by 1 order by 2 desc, 1 limit 20`,
    [MONITORING_DAYS]
  )).rows;
  // Two outcomes that read the same once cut are one line.
  const refusedByOutcome: Monitoring['notices']['refusedByOutcome'] = [];
  for (const r of refusedRows) {
    const outcome = cutContacts(r.outcome as string) ?? '';
    const same = refusedByOutcome.find((o) => o.outcome === outcome);
    if (same) same.count += num(r.n);
    else refusedByOutcome.push({ outcome, count: num(r.n) });
  }

  // --- Messages that did not go, by live school and by reason. The log's number, words and values are not read.
  const sendRows = (await db.query(
    `select s.school_id, s.name,
            case when l.status::text in ('uncertain', 'failed') then l.status::text else 'held' end as kind,
            case when l.status::text = 'failed' then coalesce(l.failure_code, '') when l.status::text = 'uncertain' then '' else l.status::text end as detail,
            count(*)::int as n, max(l.created_at) as latest_at,
            (array_agg(l.reason order by l.created_at desc, l.log_id) filter (where l.reason is not null))[1] as latest_reason
       from communication_log l join schools s on s.school_id = l.school_id
      where not s.is_test_fixture and l.created_at > now() - make_interval(days => $1)
        and (l.status::text in ('uncertain', 'failed') or left(l.status::text, 8) = 'blocked_')
      group by s.school_id, s.name, 3, 4
      order by lower(s.name), s.school_id`,
    [MONITORING_DAYS]
  )).rows;
  const groups = new Map<string, SendGroup & { kind: string; latestAt: number }>();
  for (const r of sendRows) {
    // A provider's code is its own word for what went wrong; it is cut like any other text all the same.
    const key = r.kind === 'failed' ? cutContacts(r.detail as string) ?? '' : (r.detail as string);
    const id = `${r.kind}\n${key}`;
    let g = groups.get(id);
    if (!g) groups.set(id, (g = { kind: r.kind as string, key, count: 0, schools: [], latestReason: null, latestAt: 0 }));
    g.count += num(r.n);
    g.schools.push({ schoolName: r.name as string, count: num(r.n) });
    const latestAt = new Date(r.latest_at as string).getTime();
    if (r.latest_reason && latestAt >= g.latestAt) {
      g.latestAt = latestAt;
      g.latestReason = cutContacts(r.latest_reason as string);
    }
  }
  const group = (kind: string): SendGroup[] =>
    [...groups.values()]
      .filter((g) => g.kind === kind)
      .map(({ key, count, schools, latestReason }) => ({ key, count, schools, latestReason }))
      .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
  // An uncertain message's reason is always the gate's one sentence for an interrupted send: the page says it in
  // its own words, in the reader's language.
  const uncertain: SendGroup = { ...(group('uncertain')[0] ?? { key: '', count: 0, schools: [] }), latestReason: null };

  // --- Replies held while a parent is asked which school. Counts and times; the sealed words are not read.
  const h = (await db.query(
    `select count(*) filter (where status = 'held')::int as held,
            min(received_at) filter (where status = 'held') as oldest,
            count(*) filter (where status = 'held' and expires_at < now())::int as past,
            count(*) filter (where status = 'dropped' and decided_at > now() - make_interval(days => $1))::int as dropped,
            count(*) filter (where status = 'delivered' and decided_at > now() - make_interval(days => $1))::int as delivered
       from held_inbound`,
    [MONITORING_DAYS]
  )).rows[0];

  // --- The nightly work, from what it leaves.
  // The fee run writes one row a school a night (src/lib/fees/nightly.ts). A school is expected to have one for
  // yesterday when it had a due on record before yesterday began: dues raised later were not there to be run.
  // `caught_up_on` is the first run since that night, when there is one.
  const expected = (await db.query(
    `select s.name, exists (select 1 from fee_status_runs r where r.school_id = s.school_id and r.run_date = $1::date) as ran,
            (select min(r.run_date)::text from fee_status_runs r where r.school_id = s.school_id and r.run_date > $1::date) as caught_up_on
       from schools s
      where not s.is_test_fixture
        and exists (select 1 from fees_ledger f where f.school_id = s.school_id and f.created_at < ($1::date::timestamp at time zone 'Asia/Kolkata'))
      order by lower(s.name), s.school_id`,
    [yesterday]
  )).rows;
  const problemRuns = (await db.query(
    `select s.name, r.run_date::text as run_date, r.problems
       from schools s
       join lateral (select x.run_date, x.problems from fee_status_runs x where x.school_id = s.school_id order by x.run_date desc limit 1) r on true
      where not s.is_test_fixture and r.problems > 0
      order by lower(s.name), s.school_id`
  )).rows;
  // The billing check writes nothing else when no school is past its paid-until day, so its own job row is the
  // only thing that says it ran.
  const nightJobs = (await db.query(`select idempotency_key, status, attempts from jobs where idempotency_key = any($1::text[])`, [nightKeys])).rows;
  // The billing clock queues nothing until a school has a paid-until day: no job then is as it should be.
  const anyBilled = (await db.query(`select exists (select 1 from school_subscriptions where paid_until is not null) as billed`)).rows[0]?.billed === true;
  const nightlyJob = (type: string): NightlyJob => {
    const row = nightJobs.find((r) => r.idempotency_key === `${type}:${yesterday}`);
    const state: NightlyJobState = !row ? (type === BILLING_NIGHTLY_JOB && !anyBilled ? 'not_needed' : 'not_queued') : row.status === 'succeeded' ? 'ran' : row.status === 'dead' ? 'failed' : row.status === 'running' ? 'running' : num(row.attempts) > 0 ? 'retrying' : 'queued';
    return { type, state, attempts: num(row?.attempts) };
  };

  // --- The schools' own checks (C210): one job a live school for the night (or the week), keyed by school and day.
  // Counts and ages only: no school is named here.
  const schoolCheck = async (type: string, moduleId: string, forDate: string): Promise<SchoolCheckRun> => {
    const rows = (await db.query(
      `select j.status, j.attempts from jobs j join schools s on s.school_id = j.school_id
        where not s.is_test_fixture and j.type = $1 and j.idempotency_key = j.type || ':' || j.school_id::text || ':' || $2`,
      [type, forDate]
    )).rows.map((r) => ({ status: r.status as JobStatus, attempts: num(r.attempts) }));
    // A live school the scheduler queues for: the module on, and full use or a grace period that has not ended (the
    // enqueue functions' own rule, the c210_schedules migration). A read-only school with the module on is not owed a job.
    const more = (await db.query(
      `select exists (select 1 from school_module_entitlements m join schools s on s.school_id = m.school_id left join school_entitlements e on e.school_id = m.school_id
                       where not s.is_test_fixture and m.module_id = $2 and m.enabled
                         and (coalesce(e.access_mode, 'full') = 'full' or (e.access_mode = 'grace' and (e.grace_ends_at is null or e.grace_ends_at > now())))) as module_on,
              (select max(j.completed_at) from jobs j join schools s on s.school_id = j.school_id where not s.is_test_fixture and j.type = $1 and j.status = 'succeeded') as last_ran`,
      [type, moduleId]
    )).rows[0];
    return { type, forDate, ...schoolCheckState(rows, more?.module_on === true), queued: rows.length, ran: rows.filter((r) => r.status === 'succeeded').length, lastRanSeconds: since(more?.last_ran) };
  };
  const schoolChecks = { earlyWarning: await schoolCheck(NIGHTLY_CHECK_JOB, 'early-warning', yesterday), auditor: await schoolCheck(WEEKLY_CHECK_UP_JOB, 'school-auditor', lastWeek) };

  // --- Templates: every version on record for all schools, as Control → Message templates lists them.
  // A version's words never change: new words are a new version, and the old one stays on record for ever. So the
  // plain counts are of every version, and what asks for a person is counted apart, as the sender chooses
  // (templateToSend, src/lib/whatsapp/templates.ts: the newest version we approved, and for a real account the
  // newest one Meta approved too), for each template and language:
  //   - a version waiting for our approval is in the way until a newer version has our approval;
  //   - a version we approved that Meta refused or paused is in the way until a newer version has our approval
  //     and Meta's. A version we rejected ourselves is never sent, whatever Meta said of it.
  const tpl = (await db.query(
    `with versions as (
       select w.status::text as status, w.meta_status, w.language, w.wording_reviewed,
              exists (select 1 from whatsapp_templates n where n.school_id is null and n.template_name = w.template_name and n.language = w.language and n.version > w.version and n.status = 'approved') as newer_ours,
              exists (select 1 from whatsapp_templates n where n.school_id is null and n.template_name = w.template_name and n.language = w.language and n.version > w.version and n.status = 'approved' and n.meta_status = 'approved') as newer_both
         from whatsapp_templates w where w.school_id is null
     )
     select count(*)::int as total,
            count(*) filter (where status = 'approved')::int as approved,
            count(*) filter (where status = 'pending')::int as waiting,
            count(*) filter (where status = 'rejected')::int as rejected,
            count(*) filter (where meta_status = 'pending')::int as meta_pending,
            count(*) filter (where meta_status = 'approved')::int as meta_approved,
            count(*) filter (where meta_status = 'rejected')::int as meta_rejected,
            count(*) filter (where meta_status = 'paused')::int as meta_paused,
            count(*) filter (where language = 'hi' and not wording_reviewed)::int as hindi_not_reviewed,
            count(*) filter (where status = 'pending' and not newer_ours)::int as waiting_in_the_way,
            count(*) filter (where status = 'approved' and meta_status = 'rejected' and not newer_both)::int as meta_rejected_in_the_way,
            count(*) filter (where status = 'approved' and meta_status = 'paused' and not newer_both)::int as meta_paused_in_the_way
       from versions`
  )).rows[0];

  const jobsOk = await jobsHealth(db);

  return {
    readAt: new Date(at).toISOString(),
    days: MONITORING_DAYS,
    health: { status: healthStatus('ok', jobsOk) === 'ok' ? 'ok' : 'degraded', jobs: jobsOk, backlogAfterMinutes: BACKLOG_AFTER_MINUTES },
    jobs: {
      byType,
      dead: num(j.dead),
      stuck: num(j.stuck),
      stuckLongestSeconds: since(j.stuck_since),
      retrying: num(j.retrying),
      due: num(j.due),
      oldestDueSeconds: since(j.due_since),
      lastDoneSeconds: since(j.last_done),
      failed,
    },
    notices: { received: num(n.received), refused: num(n.refused), refusedByOutcome, lastSeconds: since(n.last_at), refusedKeptPerHour: MAX_REFUSED_KEPT_PER_HOUR },
    sends: { uncertain, failed: group('failed'), held: group('held') },
    replies: { heldNow: num(h.held), oldestHeldSeconds: since(h.oldest), pastTheirTime: num(h.past), dropped: num(h.dropped), delivered: num(h.delivered), holdHours: HOLD_HOURS },
    nightly: {
      date: yesterday,
      feesJob: nightlyJob(FEES_NIGHTLY_JOB),
      billingJob: nightlyJob(BILLING_NIGHTLY_JOB),
      feeRunsExpected: expected.length,
      feeRunMissing: expected.filter((r) => r.ran !== true && !r.caught_up_on).map((r) => r.name as string),
      feeRunCaughtUp: expected.filter((r) => r.ran !== true && r.caught_up_on).map((r) => ({ schoolName: r.name as string, runDate: r.caught_up_on as string })),
      runsWithProblems: problemRuns.map((r) => ({ schoolName: r.name as string, runDate: r.run_date as string, problems: num(r.problems) })),
    },
    schoolChecks,
    templates: {
      total: num(tpl.total),
      approvedByUs: num(tpl.approved),
      waitingForUs: num(tpl.waiting),
      rejectedByUs: num(tpl.rejected),
      withMeta: num(tpl.meta_pending),
      approvedByMeta: num(tpl.meta_approved),
      refusedByMeta: num(tpl.meta_rejected),
      pausedByMeta: num(tpl.meta_paused),
      hindiNotReviewed: num(tpl.hindi_not_reviewed),
      inTheWay: { waitingForUs: num(tpl.waiting_in_the_way), refusedByMeta: num(tpl.meta_rejected_in_the_way), pausedByMeta: num(tpl.meta_paused_in_the_way) },
    },
  };
}

// --- Which sections ask for a person -------------------------------------------------------------------------

export const MONITORING_SECTIONS = ['health', 'jobs', 'notices', 'sends', 'replies', 'nightly', 'templates'] as const;
export type MonitoringSection = (typeof MONITORING_SECTIONS)[number];

// A section "needs a look" when something in it is waiting on NetCyberAI. What runs as intended is counted on the
// page all the same, but does not raise the flag: a message held because a parent has not agreed, or for a
// school's quiet hours; a job waiting for its next try; a reply still inside its 24 hours; a template with Meta.
// Nor does what has already been put right: a school whose missed fee run a later run made good, and a template
// version that a newer version has taken the place of.
export function needsALook(m: Monitoring): Record<MonitoringSection, boolean> {
  const nightOff = (job: NightlyJob) => job.state !== 'ran' && job.state !== 'not_needed';
  return {
    health: m.health.status !== 'ok',
    jobs: m.jobs.dead > 0 || m.jobs.stuck > 0,
    notices: m.notices.refused > 0,
    sends: m.sends.uncertain.count > 0 || m.sends.failed.length > 0 || m.sends.held.some((g) => HELD_FOR_US.includes(g.key)),
    replies: m.replies.pastTheirTime > 0,
    nightly: nightOff(m.nightly.feesJob) || nightOff(m.nightly.billingJob) || nightOff(m.schoolChecks.earlyWarning) || nightOff(m.schoolChecks.auditor) || m.nightly.feeRunMissing.length > 0 || m.nightly.runsWithProblems.length > 0,
    templates: m.templates.inTheWay.waitingForUs > 0 || m.templates.inTheWay.refusedByMeta > 0 || m.templates.inTheWay.pausedByMeta > 0,
  };
}

// --- The one list on the page about a person ---------------------------------------------------------------

// A school invited an email that already has a NetCyberAI account (C98): the invitation waits for NetCyberAI to
// confirm with the account's owner. This list says which school, which role and enough of the email to tell one
// invitation from another: its first letter and its domain, "a…@school.in" (C210). The full address never leaves
// this function, so it is never sent to the browser; the school that typed it has it. It is kept apart from
// loadMonitoring, whose answer holds no person at all.
export type InvitationWaiting = { invitationId: string; schoolName: string; maskedEmail: string; role: string; createdAt: string };

// The first letter of the name, three dots and the domain. Nothing of the name after its first letter, and no
// domain when the address has none ("…" alone when there is nothing to show at all).
export function maskStaffEmail(email: string | null | undefined): string {
  const text = typeof email === 'string' ? email.trim() : '';
  const at = text.lastIndexOf('@');
  const name = at >= 0 ? text.slice(0, at) : text;
  const domain = at >= 0 ? text.slice(at + 1) : '';
  const first = [...name][0] ?? '';
  return domain ? `${first}…@${domain}` : `${first}…`;
}

export async function invitationsWaiting(db: Sql): Promise<InvitationWaiting[]> {
  const { rows } = await db.query(
    `select i.invitation_id, s.name as school_name, i.email, i.role::text as role, i.created_at
       from staff_invitations i join schools s on s.school_id = i.school_id
      where i.status = 'needs_founder' order by i.created_at desc limit 50`
  );
  return rows.map((r) => ({ invitationId: r.invitation_id as string, schoolName: r.school_name as string, maskedEmail: maskStaffEmail(r.email as string), role: r.role as string, createdAt: new Date(r.created_at as string).toISOString() }));
}
