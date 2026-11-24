import type { PoolClient } from 'pg';
import { withTenantContext } from '@/lib/auth/db';
import type { SessionClaims } from '@/lib/auth/types';
import { streamText, type ChatMessage } from '@/lib/ai/platform';
import { todayInIndia } from '@/lib/academics/syllabus';
import { agentNoPreview } from './ctx';
import type { Auth } from './call';
import { checkPlan, MAX_STEPS, readSteps } from './engine';
import { MODULES, catalogFor, systemPrompt } from './prompt';
import { bookFromJson, bookToJson, hideKnownNames, newNameBook, redact, restoreNames, type NameBook } from './redact';
import type { DryRun, Step } from './types';

// One turn of the school agent (C546): the person's message, the model's rounds of asking for routes, reading and
// planning, and at the end either an answer or a change request that was checked on a thrown-away copy.

export const MAX_ROUNDS = 8;
export const MAX_FIXES = 3;
// Each person's asks in a day (C548): counted on their own conversation, which is all their role can read.
export const TURNS_PER_PERSON_DAY = 100;
const MAX_RESULT = 7000;

export type AgentReply = { say: string; requestId: string | null; plan: { title: string; summary: string } | null; run: DryRun | null; refused?: 'off' | 'limit' | 'failed' };
type ModelOut = { say?: unknown; modules?: unknown; reads?: unknown; plan?: unknown; question?: unknown };

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
      endpoint: String(s.endpoint).trim(),
      ...(s.params && typeof s.params === 'object' ? { params: s.params as Record<string, string> } : {}),
      ...(s.query && typeof s.query === 'object' ? { query: s.query as Record<string, string> } : {}),
      ...(s.body && typeof s.body === 'object' ? { body: s.body as Record<string, unknown> } : {}),
      ...(typeof s.why === 'string' ? { why: s.why.slice(0, 200) } : {}),
    }));
}

const clip = (v: unknown) => {
  const s = JSON.stringify(v);
  return s.length > MAX_RESULT ? `${s.slice(0, MAX_RESULT)}…(cut)` : s;
};

async function inSchool<T>(claims: SessionClaims, fn: (db: PoolClient) => Promise<T>): Promise<T> {
  return agentNoPreview.run(true, () => withTenantContext(claims, fn));
}

async function history(db: PoolClient, claims: SessionClaims): Promise<{ messages: ChatMessage[]; book: NameBook }> {
  const { rows } = await db.query(
    `select role, body, names from agent_messages where school_id = $1 and user_id = $2 and created_at > now() - interval '1 day'
      order by created_at desc limit 12`,
    [claims.schoolId, claims.sub]
  );
  const book = newNameBook();
  for (const r of rows) for (const [t, n] of bookToJson(bookFromJson(r.names))) if (!book.byToken.has(t)) {
    book.byToken.set(t, n);
    book.byName.set(n, t);
  }
  const messages = rows.reverse().map((r: Record<string, unknown>) => ({ role: r.role === 'person' ? 'user' : 'assistant', content: String(r.body) }) as ChatMessage);
  return { messages, book };
}

export async function agentTurn(claims: SessionClaims, text: string | ((book: NameBook) => string), auth: Auth): Promise<AgentReply> {
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
  const messages: ChatMessage[] = [...start.messages, { role: 'user', content: asked }];
  const system = systemPrompt({ schoolName: start.school, role: claims.role, today });
  let say = '';
  let plan: { title: string; summary: string; steps: Step[] } | null = null;
  let run: DryRun | null = null;
  let fixes = 0;

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const ai = await inSchool(claims, (db) => streamText(db, { accountId: claims.schoolId as string, childFirstNames: [], day: today }, 'school_agent.plan', { system, messages, maxTokens: 4000, responseFormat: 'json' }));
    if (!ai.ok) {
      const off = ai.reason === 'not_switched_on' || ai.reason === 'not_cleared_for_minors' || ai.reason === 'not_capable';
      return { say: off ? 'The assistant is not switched on for schools yet.' : 'The assistant could not answer just now. Please try again.', requestId: null, plan: null, run: null, refused: off ? 'off' : 'failed' };
    }
    messages.push({ role: 'assistant', content: ai.text });
    const out = parseModel(ai.text);
    if (!out) {
      messages.push({ role: 'user', content: 'Reply with the one JSON object only.' });
      continue;
    }
    if (typeof out.say === 'string') say = out.say;
    if (typeof out.question === 'string' && out.question.trim()) say = say ? `${say}\n${out.question}` : out.question;

    const modules = Array.isArray(out.modules) ? out.modules.filter((m): m is string => typeof m === 'string' && MODULES.some((x) => x.module === m)).slice(0, 4) : [];
    const reads = asSteps(out.reads).slice(0, 8);
    const planSteps = out.plan && typeof out.plan === 'object' ? asSteps((out.plan as Record<string, unknown>).steps) : [];

    if (planSteps.length > 0) {
      const p = out.plan as Record<string, unknown>;
      plan = { title: String(p.title ?? 'Changes').slice(0, 200), summary: String(p.summary ?? '').slice(0, 2000), steps: planSteps };
      run = await checkPlan(claims, planSteps, auth);
      if (run.ok || fixes >= MAX_FIXES) break;
      fixes++;
      const failed = run.steps.find((s) => !s.ok);
      messages.push({ role: 'user', content: `PLAN CHECK FAILED at step ${run.steps.length} (${failed?.endpoint}): status ${failed?.status}, ${hideKnownNames(String(redact(failed?.error ?? '', book)), book)}. Answer: ${clip(redact(failed?.answer, book))}. Fix the plan (read more if needed) and send it again.` });
      continue;
    }
    if (modules.length === 0 && reads.length === 0) break;
    const parts: string[] = [];
    if (modules.length) parts.push(`ROUTES:\n${catalogFor(modules)}`);
    if (reads.length) {
      const results = await readSteps(claims, reads, auth);
      parts.push(`READ RESULTS:\n${results.map((r, i) => `${i + 1}. ${r.endpoint} → ${r.status}${r.error ? ` (${hideKnownNames(String(redact(r.error, book)), book)})` : ''}: ${clip(redact(r.answer, book))}`).join('\n')}`);
    }
    messages.push({ role: 'user', content: parts.join('\n\n') });
  }

  if (!say) say = plan ? plan.summary || plan.title : 'I could not finish that. Please say it another way.';
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
    await db.query(`insert into agent_messages (school_id, user_id, role, body, names) values ($1, $2, 'person', $3, $4)`, [claims.schoolId, claims.sub, asked, names]);
    await db.query(`insert into agent_messages (school_id, user_id, role, body, names, request_id) values ($1, $2, 'agent', $3, $4, $5)`, [claims.schoolId, claims.sub, say.slice(0, 8000), names, id]);
    return id;
  });
  if (plan && run && !run.ok) say = `${say}\n\nI could not make this work: ${run.steps.find((s) => !s.ok)?.error ?? 'a step failed'}. Nothing was changed.`;
  return { say: restoreNames(say, book), requestId, plan: plan && run?.ok ? { title: restoreNames(plan.title, book), summary: restoreNames(plan.summary, book) } : null, run };
}
