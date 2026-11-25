import type { PoolClient } from 'pg';
import { withTenantContext } from '@/lib/auth/db';
import type { SessionClaims } from '@/lib/auth/types';
import { streamText, type ChatImage, type ChatMessage } from '@/lib/ai/platform';
import { todayInIndia } from '@/lib/academics/syllabus';
import { searchHelp } from '@/content/help/search';
import { isModuleId } from '@/lib/contracts/modules';
import { createTicket } from '@/lib/support/tickets';
import { jobQueue } from '@/lib/jobs/pg-queue';
import { kickJobs } from '@/lib/jobs/handlers';
import { agentNoPreview } from './ctx';
import { catalogEntry, normalizeEndpoint, type Auth } from './call';
import { checkPlan, MAX_STEPS, readSteps } from './engine';
import { MODULES, catalogFor, systemPrompt } from './prompt';
import { bookFromJson, bookToJson, hideKnownNames, newNameBook, redact, restoreNames, type NameBook } from './redact';
import type { DryRun, Step, StepResult } from './types';

// One turn of the school agent (C546, C549): the person's message (and any photos), the model's rounds of asking for
// routes, reading, looking up the guides and planning, and at the end an answer, a guide, or a change request that was
// checked on a thrown-away copy. Each round is reported as it happens (onEvent), so the screen shows what it is doing.
// A fault in the platform itself (a route that breaks, not a refusal) raises a support ticket to NetCyberAI at once.

export const MAX_ROUNDS = 8;
export const MAX_FIXES = 3;
// Each person's asks in a day (C548): counted on their own conversation, which is all their role can read.
export const TURNS_PER_PERSON_DAY = 100;
export const MAX_IMAGES = 3;
const MAX_RESULT = 7000;
const HISTORY = 10;
export const NO_SUCH_ACTION = 'There is no action in the app for that, so nothing was changed.';
export const NOT_FINISHED = 'I could not finish that. Nothing was changed. Please ask again, one task at a time.';

export type AgentLink = { label: string; href: string };
export type AgentEvent = { type: 'status'; key: 'thinking' | 'routes' | 'reading' | 'guide' | 'checking' | 'fixing' | 'ticket' | 'saving'; detail?: string };
export type AgentReply = {
  say: string;
  requestId: string | null;
  plan: { title: string; summary: string } | null;
  run: DryRun | null;
  links?: AgentLink[];
  ticket?: string | null;
  refused?: 'off' | 'limit' | 'failed' | 'no_photos';
};
type ModelOut = { say?: unknown; modules?: unknown; reads?: unknown; plan?: unknown; question?: unknown; help?: unknown; links?: unknown };

export function parseModel(text: string): ModelOut | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const v = JSON.parse(text.slice(start, end + 1));
    return v && typeof v === 'object' ? (v as ModelOut) : null;
  } catch {
    return null;
  }
}

export function asSteps(v: unknown): Step[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((s): s is Record<string, unknown> => !!s && typeof s === 'object' && typeof (s as Record<string, unknown>).endpoint === 'string')
    .slice(0, MAX_STEPS)
    .map((s) => ({
      endpoint: normalizeEndpoint(String(s.endpoint)),
      ...(s.params && typeof s.params === 'object' ? { params: s.params as Record<string, string> } : {}),
      ...(s.query && typeof s.query === 'object' ? { query: s.query as Record<string, string> } : {}),
      ...(s.body && typeof s.body === 'object' ? { body: s.body as Record<string, unknown> } : {}),
      ...(typeof s.why === 'string' ? { why: s.why.slice(0, 200) } : {}),
    }));
}

// A link the agent may show is a page or file of this school app, never another site.
export function safeLinks(v: unknown): AgentLink[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((l): l is Record<string, unknown> => !!l && typeof l === 'object')
    .map((l) => ({ label: String(l.label ?? '').slice(0, 80), href: String(l.href ?? '') }))
    .filter((l) => l.label && /^\/(app|api\/app)\/[A-Za-z0-9/_?=&.:%-]*$/.test(l.href) && !l.href.includes('..'))
    .slice(0, 6);
}

// An Aadhaar number is never written anywhere by the agent (it may read a card to fill the other fields).
const AADHAAR = /(?<!\d)\d{4}[ -]?\d{4}[ -]?\d{4}(?!\d)/;
export const carriesAadhaar = (steps: readonly Step[]): boolean => AADHAAR.test(JSON.stringify(steps.map((s) => s.body ?? {})));

// A platform fault, not a person's mistake: the route broke (5xx) or reached outside the app.
export const isPlatformFault = (r: StepResult): boolean => r.status >= 500;

const clip = (v: unknown) => {
  // JSON.stringify(undefined) is undefined, not a string.
  const s = JSON.stringify(v) ?? 'null';
  return s.length > MAX_RESULT ? `${s.slice(0, MAX_RESULT)}…(cut)` : s;
};

async function inSchool<T>(claims: SessionClaims, fn: (db: PoolClient) => Promise<T>): Promise<T> {
  return agentNoPreview.run(true, () => withTenantContext(claims, fn));
}

// The AI call holds no transaction open while the model thinks: each query the AI platform makes (its profile, key,
// limits and metering) runs in its own short transaction as this person.
export function perQueryDb(claims: SessionClaims): Pick<PoolClient, 'query'> {
  return { query: ((text: unknown, params?: unknown) => inSchool(claims, (db) => db.query(text as string, params as unknown[]))) as PoolClient['query'] };
}

// The conversation so far, as context the model reads, never as words it said a moment ago: the school may have
// changed since, and an old answer must not be repeated as if it were new.
async function history(db: PoolClient, claims: SessionClaims): Promise<{ context: string; book: NameBook }> {
  const { rows } = await db.query(
    `select role, body, names from agent_messages where school_id = $1 and user_id = $2 and created_at > now() - interval '1 day'
      order by created_at desc limit ${HISTORY}`,
    [claims.schoolId, claims.sub]
  );
  const book = newNameBook();
  for (const r of rows) for (const [t, n] of bookToJson(bookFromJson(r.names))) if (!book.byToken.has(t)) {
    book.byToken.set(t, n);
    book.byName.set(n, t);
  }
  const lines = rows.reverse().map((r: Record<string, unknown>) => `${r.role === 'person' ? 'Person' : 'You'}: ${String(r.body).slice(0, 600)}`);
  return { context: lines.join('\n'), book };
}

export function helpText(query: string): { text: string; links: AgentLink[] } {
  const found = searchHelp(query).slice(0, 3);
  if (!found.length) return { text: 'No guide matches. Explain from the routes you know, plainly.', links: [] };
  return {
    text: found.map((a) => `GUIDE "${a.title.en}"${a.start ? ` (starts at ${a.start.href})` : ''}:\n${a.steps.map((s, i) => `${i + 1}. ${s.en}`).join('\n')}`).join('\n\n'),
    links: found.filter((a) => a.start?.href.startsWith('/app')).map((a) => ({ label: a.start!.label.en, href: a.start!.href })),
  };
}

async function raiseTicket(claims: SessionClaims, asked: string, faults: StepResult[], book: NameBook): Promise<string | null> {
  const first = faults[0];
  const entry = catalogEntry(first.endpoint);
  const body = [
    'The school assistant found a problem in the app while doing a task, and raised this ticket by itself.',
    `What was asked: ${hideKnownNames(asked, book).slice(0, 400)}`,
    ...faults.slice(0, 5).map((f) => `Action: ${f.endpoint}; answer ${f.status}; ${hideKnownNames(String(redact(f.error ?? '', book)), book)}`),
  ].join('\n');
  try {
    const r = await inSchool(claims, (db) =>
      createTicket(
        db,
        { userId: claims.sub, role: claims.role as never, side: 'school', schoolId: claims.schoolId as string },
        { category: 'not_working', moduleId: entry && isModuleId(entry.module) ? entry.module : null, subject: `Assistant could not complete: ${first.endpoint}`.slice(0, 120), body },
        jobQueue
      )
    );
    if (!r.ok) return null;
    // NetCyberAI is told by email at once (the ticket's own job); the sweeper covers a missed kick.
    if (r.value.jobKey) await kickJobs([r.value.jobKey]);
    return r.value.ref;
  } catch {
    return null;
  }
}

export async function agentTurn(
  claims: SessionClaims,
  text: string | ((book: NameBook) => string),
  auth: Auth,
  opts: { images?: ChatImage[]; onEvent?: (e: AgentEvent) => void } = {}
): Promise<AgentReply> {
  const emit = opts.onEvent ?? (() => {});
  const images = (opts.images ?? []).slice(0, MAX_IMAGES);
  const today = todayInIndia();
  const start = await inSchool(claims, async (db) => {
    const used = Number((await db.query(`select count(*)::int as n from agent_messages m where m.school_id = $1 and m.user_id = $2 and m.role = 'person' and m.created_at >= (now() at time zone 'Asia/Kolkata')::date`, [claims.schoolId, claims.sub])).rows[0]?.n ?? 0);
    const school = String((await db.query(`select name from schools where school_id = $1`, [claims.schoolId])).rows[0]?.name ?? 'the school');
    const past = await history(db, claims);
    return { used, school, ...past };
  });
  if (start.used >= TURNS_PER_PERSON_DAY) return { say: "Today's limit for the assistant is used up. It opens again tomorrow.", requestId: null, plan: null, run: null, refused: 'limit' };

  const book = start.book;
  const asked = typeof text === 'function' ? hideKnownNames(text(book), book).slice(0, 7000) : hideKnownNames(text.slice(0, 2000), book);
  const opening = [
    start.context ? `EARLIER IN THIS CONVERSATION (context only. The school may have changed since: read fresh data before answering, and never repeat an earlier answer as it was. If an earlier answer of yours was wrong, say so plainly and give the right one):\n${start.context}\n` : '',
    images.length ? `The person attached ${images.length} photo(s); read them. Never write an Aadhaar number into any field.\n` : '',
    `NOW THE PERSON ASKS:\n${asked}`,
  ].join('\n');
  const messages: ChatMessage[] = [{ role: 'user', content: opening, ...(images.length ? { images } : {}) }];
  const system = systemPrompt({ schoolName: start.school, role: claims.role, today });
  let say = '';
  let plan: { title: string; summary: string; steps: Step[] } | null = null;
  let run: DryRun | null = null;
  let fixes = 0;
  // What the person is told comes from the model's last answer only, never left over from an earlier round.
  let unknownSeen = false;
  let finished = false;
  let links: AgentLink[] = [];
  let ticket: string | null = null;
  const faults: StepResult[] = [];

  for (let round = 0; round < MAX_ROUNDS; round++) {
    emit({ type: 'status', key: 'thinking' });
    const ai = await streamText(perQueryDb(claims), { accountId: claims.schoolId as string, childFirstNames: [], day: today }, 'school_agent.plan', { system, messages, maxTokens: 4000, responseFormat: 'json' });
    if (!ai.ok) {
      if (ai.reason === 'not_capable' && images.length) {
        return { say: 'I cannot read photos yet: the assistant’s current AI cannot see pictures. Type the details instead, or ask NetCyberAI to switch on photo reading.', requestId: null, plan: null, run: null, refused: 'no_photos' };
      }
      const off = ai.reason === 'not_switched_on' || ai.reason === 'not_cleared_for_minors' || ai.reason === 'not_capable';
      return { say: off ? 'The assistant is not switched on for schools yet.' : 'The assistant could not answer just now. Please try again.', requestId: null, plan: null, run: null, refused: off ? 'off' : 'failed' };
    }
    messages.push({ role: 'assistant', content: ai.text });
    const out = parseModel(ai.text);
    if (!out) {
      messages.push({ role: 'user', content: 'Reply with the one JSON object only.' });
      continue;
    }
    say = typeof out.say === 'string' ? out.say : '';
    if (typeof out.question === 'string' && out.question.trim()) say = say ? `${say}\n${out.question}` : out.question;
    links = safeLinks(out.links).length ? safeLinks(out.links) : links;

    const modules = Array.isArray(out.modules) ? out.modules.filter((m): m is string => typeof m === 'string' && MODULES.some((x) => x.module === m)).slice(0, 4) : [];
    const reads = asSteps(out.reads).slice(0, 8);
    const planSteps = out.plan && typeof out.plan === 'object' ? asSteps((out.plan as Record<string, unknown>).steps) : [];
    const help = typeof out.help === 'string' && out.help.trim() ? out.help.trim().slice(0, 200) : '';

    // A plan or read naming a route that is not listed goes back to the model at once, with what it should look at.
    const unknown = [...planSteps, ...reads].filter((s) => !catalogEntry(s.endpoint)).map((s) => s.endpoint);
    if (unknown.length) {
      unknownSeen = true;
      say = '';
      messages.push({ role: 'user', content: `UNKNOWN ROUTES: ${[...new Set(unknown)].join('; ')}. Use only routes exactly as listed in ROUTES (ask for the module in "modules" first), written like "GET classes".` });
      continue;
    }
    if (planSteps.length && carriesAadhaar(planSteps)) {
      say = '';
      messages.push({ role: 'user', content: 'REFUSED: the plan writes a 12-digit number that looks like an Aadhaar number. Never store an Aadhaar number; leave that field out and send the plan again.' });
      continue;
    }

    if (planSteps.length > 0) {
      const p = out.plan as Record<string, unknown>;
      plan = { title: String(p.title ?? 'Changes').slice(0, 200), summary: String(p.summary ?? '').slice(0, 2000), steps: planSteps };
      emit({ type: 'status', key: 'checking', detail: plan.title });
      run = await checkPlan(claims, planSteps, auth);
      faults.push(...run.steps.filter(isPlatformFault));
      if (run.ok || fixes >= MAX_FIXES) {
        finished = true;
        break;
      }
      fixes++;
      emit({ type: 'status', key: 'fixing' });
      if (run.steps.length === 0) {
        messages.push({ role: 'user', content: `PLAN NOT RUN: a plan needs 1 to ${MAX_STEPS} listed routes that change something. Send it again.` });
        continue;
      }
      const failed = run.steps.find((s) => !s.ok);
      messages.push({ role: 'user', content: `PLAN CHECK FAILED at step ${run.steps.length} (${failed?.endpoint}): status ${failed?.status}, ${hideKnownNames(String(redact(failed?.error ?? '', book)), book)}. Answer: ${clip(redact(failed?.answer, book))}. ${failed && isPlatformFault(failed) ? 'This is a fault in the app itself, not your plan: NetCyberAI will be told. Try another way if there is one; otherwise tell the person plainly.' : 'Fix the plan (read more if needed) and send it again.'}` });
      continue;
    }
    if (modules.length === 0 && reads.length === 0 && !help) {
      finished = true;
      break;
    }
    const parts: string[] = [];
    if (help) {
      emit({ type: 'status', key: 'guide', detail: help });
      const h = helpText(help);
      links = links.length ? links : h.links;
      parts.push(`GUIDES:\n${h.text}`);
    }
    if (modules.length) {
      emit({ type: 'status', key: 'routes', detail: modules.join(', ') });
      parts.push(`ROUTES:\n${catalogFor(modules)}`);
    }
    if (reads.length) {
      emit({ type: 'status', key: 'reading', detail: reads.map((r) => r.endpoint.replace(/^GET /, '')).join(', ') });
      const results = await readSteps(claims, reads, auth);
      faults.push(...results.filter(isPlatformFault));
      parts.push(`READ RESULTS:\n${results.map((r, i) => `${i + 1}. ${r.endpoint} → ${r.status}${r.error ? ` (${hideKnownNames(String(redact(r.error, book)), book)})` : ''}: ${clip(redact(r.answer, book))}`).join('\n')}`);
    }
    messages.push({ role: 'user', content: parts.join('\n\n') });
  }

  if (faults.length) {
    emit({ type: 'status', key: 'ticket' });
    ticket = await raiseTicket(claims, asked, faults, book);
  }
  if (!plan && unknownSeen && !say) say = NO_SUCH_ACTION;
  if (!finished && !(plan && run?.ok)) say = NOT_FINISHED;
  if (!say) say = plan ? plan.summary || plan.title : 'I could not finish that. Please say it another way.';
  if (plan && run && !run.ok) say = `${say}\n\nI could not make this work: ${run.steps.find((s) => !s.ok)?.error ?? 'the plan named no route it could run'}. Nothing was changed.`;
  if (ticket) say = `${say}\n\nSomething in the app itself is not working, so I raised ticket ${ticket} with the NetCyberAI team. They will fix it.`;
  else if (faults.length) say = `${say}\n\nSomething in the app itself is not working. Please raise a ticket from Help so the NetCyberAI team can fix it.`;

  emit({ type: 'status', key: 'saving' });
  const requestId = await inSchool(claims, async (db) => {
    let id: string | null = null;
    if (plan && run?.ok && run.tier > 0) {
      id = String(
        (
          await db.query(
            `insert into agent_requests (school_id, title, summary, steps, tier, preview, diff_hash, created_by, created_role)
             values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning request_id`,
            [claims.schoolId, restoreNames(plan.title, book), restoreNames(plan.summary, book), JSON.stringify(plan.steps), run.tier, JSON.stringify({ steps: run.steps.map((s) => ({ endpoint: s.endpoint, status: s.status })), changes: run.changes }), run.hash, claims.sub, claims.role]
          )
        ).rows[0].request_id
      );
    }
    const names = JSON.stringify(bookToJson(book));
    const extras = JSON.stringify({ links, ...(ticket ? { ticket } : {}), ...(images.length ? { photos: images.length } : {}) });
    await db.query(`insert into agent_messages (school_id, user_id, role, body, names, extras) values ($1, $2, 'person', $3, $4, $5)`, [claims.schoolId, claims.sub, asked, names, JSON.stringify(images.length ? { photos: images.length } : {})]);
    await db.query(`insert into agent_messages (school_id, user_id, role, body, names, request_id, extras) values ($1, $2, 'agent', $3, $4, $5, $6)`, [claims.schoolId, claims.sub, say.slice(0, 8000), names, id, extras]);
    return id;
  });
  return {
    say: restoreNames(say, book),
    requestId,
    plan: plan && run?.ok ? { title: restoreNames(plan.title, book), summary: restoreNames(plan.summary, book) } : null,
    run,
    links,
    ticket,
  };
}
