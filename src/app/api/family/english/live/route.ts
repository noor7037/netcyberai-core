import { NextRequest, NextResponse } from 'next/server';
import { FamilySessionRevokedError, withFamilyContext, withFamilyGate, familyClaims } from '@/lib/family/db';
import {
  LIVE_MAX_TURNS,
  checkedRecap,
  cleanChildText,
  cleanReply,
  cleanSummary,
  endSession,
  englishConversationPrompt,
  foldPlan,
  isLiveTopic,
  isUuid,
  keepTurn,
  liveAiContext,
  liveChild,
  liveStatus,
  liveView,
  openSession,
  recapRequest,
  replyRequest,
  startSession,
  summaryRequest,
  wordsTakenUp,
  type LiveRecap,
  type LiveSession,
} from '@/lib/family/english/live';
import { familyRun, jsonBody, requireFamily } from '@/lib/family/request';
import { FAMILY_CHILD_COOKIE, type FamilySession } from '@/lib/family/session';
import { activePromptVersion, prepareModeration, prepareText, type PreparedModeration, type PreparedText, type SentText } from '@/lib/ai/platform';

// The live spoken-English tutor (E1, C382; src/lib/family/english/live.ts).
//   GET                                      what the screen shows: what is set up (speech to text, the reply, the
//                                            safety check), the AI requests and voice seconds left, the open session.
//   POST { action: 'start', topic }          a new session (the child's open one is ended).
//   POST { action: 'say', sessionId, text }  one turn: the child's corrected words → a short role-play reply.
//   POST { action: 'end', sessionId }        the session's recap: what was practised and the words that were new.
// The child is always the one this phone chose, never one the body names. Needs Control's English course switch and
// the parent's English course and voice practice consents (from Class 1). No database connection is held while the AI
// answers (F1-3): the checks, the reads and the platform's own checks in one short transaction; the calls with none;
// the metering and the kept turn in a second one. An error thrown out of a transaction answers 503 (the transaction
// has rolled back). The recording never reaches this route: speech to text is /api/family/english/live/hear.
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const fail = (error: string, status: number, extra: Record<string, unknown> = {}) => NextResponse.json({ error, ...extra }, { status });
const PROFILE = 'family.english_conversation' as const;

const view = (s: LiveSession) => ({ sessionId: s.sessionId, topic: s.topic, turns: s.turns.map((t) => ({ position: t.position, childText: t.childText, reply: t.reply })) });

type Db = Parameters<Parameters<typeof withFamilyContext>[1]>[0];
const aiContext = liveAiContext;

// A refusal of the AI platform as the screen reads it: the daily cap is its own state.
const refused = (reason: string) => fail(`ai_${reason}`, reason === 'cap_reached' ? 429 : 503);

async function guarded(session: FamilySession, fn: () => Promise<NextResponse>): Promise<NextResponse> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof FamilySessionRevokedError) return fail('not_signed_in', 401);
    return fail('failed', 503);
  }
}

export async function GET(req: NextRequest) {
  const g = await requireFamily(req);
  if (g.error) return g.error;
  const session = g.session;
  const chosen = req.cookies.get(FAMILY_CHILD_COOKIE)?.value;
  return guarded(session, () =>
    familyRun(session, async (db) => {
      const r = await liveView(db, session.accountId, chosen);
      return r.ok ? NextResponse.json(r.view) : fail(r.error, r.status);
    })
  );
}

type Recorder = (db: Db) => Promise<void>;
// The metering of calls that went out, written in the next transaction; if the session was signed out everywhere in
// between, still written once through the gate (the calls happened).
async function finish(session: FamilySession, recorders: Recorder[], fn: (db: Db) => Promise<NextResponse>): Promise<NextResponse> {
  try {
    return await withFamilyContext(familyClaims(session), async (db) => {
      for (const r of recorders) await r(db);
      return fn(db);
    });
  } catch (err) {
    if (err instanceof FamilySessionRevokedError) {
      await withFamilyGate(async (db) => {
        for (const r of recorders) await r(db as never);
      }).catch(() => {});
      return fail('not_signed_in', 401);
    }
    throw err;
  }
}

export async function POST(req: NextRequest) {
  const g = await requireFamily(req);
  if (g.error) return g.error;
  const session = g.session;
  const chosen = req.cookies.get(FAMILY_CHILD_COOKIE)?.value;
  const body = await jsonBody(req);
  if (body.action === 'start') {
    if (!isLiveTopic(body.topic)) return fail('bad_request', 400);
    const topic = body.topic;
    return guarded(session, () =>
      familyRun(session, async (db) => {
        const gate = await liveChild(db, session.accountId, chosen);
        if (!gate.ok) return fail(gate.error, gate.status);
        // Nothing is started that could not answer: speech to text, the reply and the safety check must be set up.
        const status = await liveStatus(db, await aiContext(db, session.accountId, gate.children.map((c) => c.firstName)), gate.child.childId);
        if (status.speech !== 'ready' || status.text !== 'ready' || status.safety !== 'ready') return fail('not_set_up', 503, { status });
        return NextResponse.json({ session: view(await startSession(db, session.accountId, gate.child.childId, gate.track, topic)) });
      })
    );
  }
  if ((body.action !== 'say' && body.action !== 'end') || !isUuid(body.sessionId)) return fail('bad_request', 400);
  const sessionId = body.sessionId;
  return guarded(session, () => (body.action === 'say' ? say(session, chosen, sessionId, body.text) : end(session, chosen, sessionId)));
}

type SayPlan = { childId: string; text: string; reply: PreparedText; fold: { from: number; upto: number; summary: PreparedText } | null; moderation: PreparedModeration };

async function say(session: FamilySession, chosen: string | undefined, sessionId: string, raw: unknown): Promise<NextResponse> {
  const text = cleanChildText(raw);
  if (!text) return fail('no_words', 400);
  // 1. The checks and reads, and the platform's own checks (each call takes its daily-cap place), in one transaction.
  const plan = await withFamilyContext(familyClaims(session), async (db): Promise<SayPlan | NextResponse> => {
    const gate = await liveChild(db, session.accountId, chosen);
    if (!gate.ok) return fail(gate.error, gate.status);
    const live = await openSession(db, session.accountId, gate.child.childId, sessionId);
    if (!live) return fail('no_session', 404);
    if (live.turns.length >= LIVE_MAX_TURNS) return fail('session_full', 409);
    const ctx = await aiContext(db, session.accountId, gate.children.map((c) => c.firstName));
    const ready = await prepareModeration(db, ctx);
    if (!ready.ok) return fail('safety_off', 503);
    const prompt = englishConversationPrompt(await activePromptVersion(db, PROFILE));
    const unsummarised = live.turns.filter((t) => t.position > live.summarisedUpto);
    const reply = await prepareText(db, ctx, PROFILE, replyRequest(prompt, { track: live.track, topic: live.topic, summary: live.summary, turns: unsummarised, text }));
    if (!reply.ok) return refused(reply.reason);
    // The fold, when due: refused (the cap reached, say) it is simply tried again on the next turn.
    const folded = foldPlan(unsummarised);
    const summary = folded.length ? await prepareText(db, ctx, PROFILE, summaryRequest(prompt, live.summary, folded)) : null;
    const fold = summary?.ok ? { from: live.summarisedUpto, upto: folded[folded.length - 1].position, summary: summary.text } : null;
    return { childId: gate.child.childId, text, reply: reply.text, fold, moderation: ready.moderation };
  });
  if (plan instanceof NextResponse) return plan;

  // 2. The safety check on the child's words, the reply (and the summary) and the check on the reply, with no
  // database connection held. Nothing unchecked is shown or kept.
  const recorders: Recorder[] = [(db) => plan.moderation.record(db)];
  let outcome: { error: string; status: number } | null = null;
  let reply = '';
  let summary = '';
  const asked = await plan.moderation.check({ user: plan.text });
  if (!asked) outcome = { error: 'safety_failed', status: 503 };
  else if (!asked.safe) outcome = { error: 'unsafe', status: 422 };
  else {
    const [sent, folded] = await Promise.all([plan.reply.send(), plan.fold ? plan.fold.summary.send() : Promise.resolve(null as SentText | null)]);
    recorders.push((db) => sent.record(db));
    if (folded) {
      recorders.push((db) => folded.record(db));
      if (folded.result.ok) summary = cleanSummary(folded.result.text);
    }
    reply = sent.result.ok ? cleanReply(sent.result.text) : '';
    if (!reply) outcome = { error: 'ai_failed', status: 503 };
    else {
      const checked = await plan.moderation.check({ user: plan.text, assistant: reply });
      if (!checked) outcome = { error: 'safety_failed', status: 503 };
      else if (!checked.safe) outcome = { error: 'unsafe', status: 422 };
    }
  }

  // 3. The metering, and the turn kept (the corrected words and the checked reply only), in a second transaction.
  return finish(session, recorders, async (db) => {
    if (outcome) return fail(outcome.error, outcome.status);
    const fold = plan.fold && summary ? { from: plan.fold.from, upto: plan.fold.upto, summary } : null;
    const position = await keepTurn(db, { accountId: session.accountId, childId: plan.childId, sessionId, text: plan.text, reply, fold });
    if (position === null) return fail('no_session', 409);
    return NextResponse.json({ turn: { position, childText: plan.text, reply } });
  });
}

type EndPlan = { childId: string; recap: LiveRecap } | { childId: string; live: LiveSession; text: PreparedText; moderation: PreparedModeration };

async function end(session: FamilySession, chosen: string | undefined, sessionId: string): Promise<NextResponse> {
  // 1. The session and, when the AI can write the recap, its call prepared; otherwise the recap by rule alone.
  const plan = await withFamilyContext(familyClaims(session), async (db): Promise<EndPlan | NextResponse> => {
    const gate = await liveChild(db, session.accountId, chosen);
    if (!gate.ok) return fail(gate.error, gate.status);
    const live = await openSession(db, session.accountId, gate.child.childId, sessionId);
    if (!live) return fail('no_session', 404);
    const byRule: LiveRecap = { topic: live.topic, turns: live.turns.length, practised: null, newWords: wordsTakenUp(live.turns) };
    if (live.turns.length === 0) {
      await endSession(db, session.accountId, gate.child.childId, sessionId, null);
      return NextResponse.json({ recap: null });
    }
    const ctx = await aiContext(db, session.accountId, gate.children.map((c) => c.firstName));
    const ready = await prepareModeration(db, ctx);
    const prompt = englishConversationPrompt(await activePromptVersion(db, PROFILE));
    const text = ready.ok ? await prepareText(db, ctx, PROFILE, recapRequest(prompt, live.topic, live.turns)) : null;
    if (!ready.ok || !text?.ok) return { childId: gate.child.childId, recap: byRule };
    return { childId: gate.child.childId, live, text: text.text, moderation: ready.moderation };
  });
  if (plan instanceof NextResponse) return plan;
  if ('recap' in plan) {
    return finish(session, [], async (db) => {
      await endSession(db, session.accountId, plan.childId, sessionId, plan.recap);
      return NextResponse.json({ recap: plan.recap });
    });
  }

  // 2. The recap written and checked (each word in the talk, nothing of a score; the sentence through the safety
  // check), with no database connection held.
  const sent = await plan.text.send();
  let recap = checkedRecap(sent.result.ok ? sent.result.text : '', plan.live.topic, plan.live.turns);
  if (recap.practised) {
    const verdict = await plan.moderation.check({ user: 'Recap of an English practice talk.', assistant: recap.practised });
    if (!verdict?.safe) recap = { ...recap, practised: null };
  }

  // 3. The metering and the ended session, in a second transaction.
  return finish(session, [(db) => sent.record(db), (db) => plan.moderation.record(db)], async (db) => {
    await endSession(db, session.accountId, plan.childId, sessionId, recap);
    return NextResponse.json({ recap });
  });
}
