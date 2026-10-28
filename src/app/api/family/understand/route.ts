import { NextRequest, NextResponse } from 'next/server';
import { accountSummary } from '@/lib/family/account';
import { dailyRequestsLeft, prepareModeration } from '@/lib/ai/platform';
import { activeChild, listChildren } from '@/lib/family/children';
import { consentState } from '@/lib/family/consent';
import { FamilySessionRevokedError, withFamilyContext, withFamilyGate, familyClaims } from '@/lib/family/db';
import { familyModuleOn } from '@/lib/family/flags';
import { openItem } from '@/lib/family/items';
import { claimSubject } from '@/lib/family/learning';
import { SUBJECTS, type Subject } from '@/lib/family/modules';
import { jsonBody, requireFamily } from '@/lib/family/request';
import { FOLLOW_UPS, generate, keep, prepareResolve, type FollowUp, type Pending, type ResolveInput, type ResolverEvent } from '@/lib/family/resolver';
import { FAMILY_CHILD_COOKIE } from '@/lib/family/session';
import { readerContext, saveTurn, sendableFiles, tutorStorage } from '@/lib/family/tutor';
import { attachedText, fetchFiles, filesToRead, givePhotoPlaceBack, preparePhotoReads, readFetched, type Unreadable } from '@/lib/family/tutor-read';
import { TUTOR_READS_FILES } from '@/lib/family/tutor-shape';
import { photoGate } from '@/lib/family/photo-gate';
import { isSubject } from '@/lib/family/subjects';
import { indiaDate } from '@/lib/time/india';
import { isMessageKey, t, type MessageKey } from '@/lib/i18n';

// Understand (M1-5, C251): POST { kind: 'topic' | 'chapter', key } or { kind: 'question', text }, with an optional
// followUp ('simpler', 'another_example', 'differently', 'practise_more') or retry { token, choice } (a wrong answer:
// explain that exact misunderstanding differently). The answer is a stream of JSON lines (ResolverEvent), one per checked
// block, for the child using the app now. Needs the parent's study_core consent and the module switched on. A typed
// question's subject is decided on the server (resolver.ts): a `subject` the screen sends is not read.
//
// The shared tutor window (S2, C375) sends a typed question with `tutor: { subject, chapterKey?, blockId?, files? }`: the
// subject the window is open in, the chapter reader's chapter and block when asked from its doubt drawer (checked here
// against NetCyber's own chapter; the tutor is told the chapter and section), and the child's ready files. The same
// path answers it (consent, the module switch, moderation, the daily cap); once answered, the question and the answer's
// teaching blocks are kept in the child's conversation of the subject the server decided (src/lib/family/tutor.ts).
// A follow-up or a retry is not kept again. The child is always the one this phone has chosen, never one the body names.
//
// The files are read first (W4-1, C385; src/lib/family/tutor-read.ts): a PDF's text on the server, a photo through the
// vision profile; what they say joins the question, and what could not be read is said in a `files` line before the
// answer. That reading has its own short transactions around the fetch and the vision calls.
//
// No database connection is held while the AI answers (F1-3): the checks and reads in one short transaction, the call
// with no connection, then the writes (metering, the library line) in a second one.
export const dynamic = 'force-dynamic';

const UNREADABLE_WORDS: Record<Unreadable, MessageKey> = {
  no_text: 'fam.tutor.files.no_text',
  photo_limit: 'fam.tutor.files.photo_limit',
  not_set_up: 'fam.tutor.files.not_set_up',
  failed: 'fam.tutor.files.failed',
};

export async function POST(req: NextRequest) {
  const g = await requireFamily(req);
  if (g.error) return g.error;
  const session = g.session;
  const claims = familyClaims(session);
  const body = await jsonBody(req);
  const followUp = FOLLOW_UPS.includes(body.followUp as FollowUp) ? (body.followUp as FollowUp) : null;
  let input: ResolveInput | null = null;
  if ((body.kind === 'topic' || body.kind === 'chapter') && typeof body.key === 'string') input = { kind: body.kind, key: body.key };
  if (body.kind === 'question' && typeof body.text === 'string') {
    const text = body.text.trim().slice(0, 500);
    if (text.length >= 3) input = { kind: 'question', text, subject: null };
  }
  const retry = body.retry && typeof body.retry === 'object' ? (body.retry as { token?: unknown; choice?: unknown }) : null;
  if (!input && !retry) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  const tutorBody = input?.kind === 'question' && body.tutor && typeof body.tutor === 'object' && !Array.isArray(body.tutor) ? (body.tutor as Record<string, unknown>) : null;
  if (tutorBody && !isSubject(tutorBody.subject)) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  // What is kept once answered (null: nothing): filled in the first transaction, for the child it chose.
  let keepTurn: { childId: string; text: string; chapterKey: string | null; blockId: string | null; files: string[]; windowSubject: string; lang: string } | null = null;
  const chosen = req.cookies.get(FAMILY_CHILD_COOKIE)?.value;

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (e: ResolverEvent) => controller.enqueue(encoder.encode(`${JSON.stringify(e)}\n`));
      const stop = (e: ResolverEvent): null => {
        send(e);
        return null;
      };
      try {
        // 0. The files sent with a tutor question, read before it is asked (W4-1). Not for a follow-up or a retry.
        let attached: string | undefined;
        const fileIds = TUTOR_READS_FILES && tutorBody && !followUp && !retry && Array.isArray(tutorBody.files) && tutorBody.files.length > 0 ? tutorBody.files : null;
        if (fileIds) {
          const asked = await withFamilyContext(claims, async (db) => {
            const children = await listChildren(db, session.accountId);
            const child = activeChild(children, chosen);
            const lang = child?.language ?? 'en';
            if (!child) return { refused: t(lang, 'fam.understand.noChild') };
            const consents = await consentState(db, session.accountId);
            if (!consents.study_core) return { refused: t(lang, 'fam.err.consent_required') };
            // A file goes to a provider only under the homework helper's photo rules (C389), read again now: Class 1
            // up, the parent's photo consent (it may be withdrawn) and the helper's switch.
            const photoRefused = await photoGate(db, session.accountId, child);
            if (photoRefused === 'photo_consent') return { refused: t(lang, 'fam.tutor.err.photo_consent') };
            if (photoRefused) return { refused: t(lang, 'fam.tutor.err.homework_off') };
            if (!(await familyModuleOn(db, 'understand', session.accountId))) return { refused: t(lang, 'fam.understand.off') };
            const files = await filesToRead(db, session.accountId, child.childId, String(tutorBody!.subject), fileIds);
            if (!files) return { refused: t(lang, 'fam.tutor.fileGone') };
            // W4-1 review: whatever would refuse the question is checked before any photo leaves, so a question that will
            // not be answered never sends a photo or spends a place: the reader's chapter and section, the safety check
            // ready (C314, as the homework helper does), and room in the family's day for every photo read and the answer.
            if (tutorBody!.chapterKey !== undefined && !readerContext(String(tutorBody!.subject), tutorBody!.chapterKey, tutorBody!.blockId, child.language)) return { refused: t(lang, 'fam.understand.notFound') };
            const account = await accountSummary(db, session.accountId);
            const ai = { accountId: session.accountId, childFirstNames: children.map((c) => c.firstName), parentEmail: account?.email ?? '', day: indiaDate() };
            if (!(await prepareModeration(db, ai)).ok) return { refused: t(lang, 'fam.understand.safetyOff') };
            const photos = files.filter((f) => f.mime !== 'application/pdf').length;
            if (photos > 0 && (await dailyRequestsLeft(db, session.accountId, ai.day)) < photos + 1) return { refused: t(lang, 'ai.cap_reached') };
            return { files, lang, childId: child.childId, ai };
          });
          if ('refused' in asked) return void send({ t: 'refused', reason: 'not_found', message: asked.refused! });
          const fetched = await fetchFiles(asked.files, (key) => tutorStorage.get(key));
          const calls = await withFamilyContext(claims, (db) => preparePhotoReads(db, asked.ai, asked.childId, fetched));
          const { reads, sent } = await readFetched(fetched, calls);
          await withFamilyContext(claims, async (db) => {
            for (const s of sent) {
              await s.sent.record(db);
              // A photo the provider could not read is not counted against the child's day, as in the homework helper.
              if (!s.sent.result.ok) await givePhotoPlaceBack(db, session.accountId, asked.childId, asked.ai.day);
            }
          });
          const outcome = attachedText(reads);
          attached = outcome.attached ?? undefined;
          const lines = [t(asked.lang, 'fam.tutor.files.read', { read: String(outcome.read), total: String(reads.length) }), ...[...new Set(outcome.unreadable)].map((u) => t(asked.lang, UNREADABLE_WORDS[u]))];
          send({ t: 'files', message: lines.join(' ') });
        }
        // 1. The checks and reads, and the AI platform's own checks (the daily cap taken), in one short transaction.
        const pending = await withFamilyContext(claims, async (db): Promise<Pending | null> => {
          const children = await listChildren(db, session.accountId);
          const child = activeChild(children, chosen);
          const words = (key: string, params?: Record<string, string>) => (isMessageKey(key) ? t(child?.language ?? 'en', key, params) : key);
          if (!child) return stop({ t: 'refused', reason: 'not_found', message: words('fam.understand.noChild') });
          if (!(await consentState(db, session.accountId)).study_core) return stop({ t: 'refused', reason: 'not_found', message: words('fam.err.consent_required') });
          if (!(await familyModuleOn(db, 'understand', session.accountId))) return stop({ t: 'refused', reason: 'not_switched_on', message: words('fam.understand.off') });
          let target = input;
          if (tutorBody && target?.kind === 'question') {
            const subject = String(tutorBody.subject);
            let reader: ReturnType<typeof readerContext> = null;
            if (tutorBody.chapterKey !== undefined) {
              reader = readerContext(subject, tutorBody.chapterKey, tutorBody.blockId, child.language);
              if (!reader) return stop({ t: 'refused', reason: 'not_found', message: words('fam.understand.notFound') });
              target = { ...target, about: reader.about };
            }
            if (attached && target?.kind === 'question') target = { ...target, attached };
            const files = await sendableFiles(db, session.accountId, child.childId, subject, tutorBody.files);
            if (!files) return stop({ t: 'refused', reason: 'not_found', message: words('fam.tutor.fileGone') });
            if (!followUp && !retry) keepTurn = { childId: child.childId, text: target.text, chapterKey: reader?.chapterKey ?? null, blockId: reader?.blockId ?? null, files, windowSubject: subject, lang: child.language };
          }
          let misconception: string | null = null;
          if (retry) {
            const item = openItem(retry.token, { accountId: session.accountId, childId: child.childId });
            const choice = Number(retry.choice);
            const notFound = { t: 'refused', reason: 'not_found', message: words('fam.understand.notFound') } as const;
            // A chapter test's item is sealed for the test route alone (S5): a retry here would tell a wrong choice from
            // the right one, so it is refused before anything is read from it.
            if (!item || item.kind === 'test' || !Number.isInteger(choice) || choice < 0 || choice >= item.w.length || choice === item.a) return stop(notFound);
            misconception = item.w[choice] || item.y;
            if (item.k.endsWith('.question')) {
              // The sealed item's subject was decided by this server when the question was answered.
              if (!SUBJECTS.includes(item.s as Subject)) return stop(notFound);
              target = { kind: 'question', text: words('fam.understand.retryQuestion'), subject: item.s as Subject };
            } else target = { kind: /\.t\d+$/.test(item.k) ? 'topic' : 'chapter', key: item.k };
          }
          const account = await accountSummary(db, session.accountId);
          return prepareResolve(
            db,
            {
              accountId: session.accountId,
              child,
              childFirstNames: children.map((c) => c.firstName),
              parentEmail: account?.email ?? '',
              day: indiaDate(),
              refusalWords: words,
              claimSubject: (tx, subject) => claimSubject(tx, session.accountId, child.childId, subject),
            },
            target!,
            followUp,
            send,
            misconception
          );
        });
        if (!pending) return;
        // 2. The AI answers, block by block, with no database connection held. A child with no free subject claims a
        // typed question's subject just before its first block is shown, in a short transaction of its own.
        const childId = pending.ctx.child.childId;
        const generated = await generate(pending, send, (subject) => withFamilyContext(claims, (db) => claimSubject(db, session.accountId, childId, subject)));
        // 3. The writes, in a second short transaction; the last event only once they are kept.
        let last: ResolverEvent | null;
        try {
          last = await withFamilyContext(claims, (db) => keep(db, pending, generated));
        } catch (err) {
          // Signed out everywhere during the call: the check failed before anything was written, but the call
          // happened, so it is still counted (once: nothing of the refused transaction ran).
          if (err instanceof FamilySessionRevokedError)
            await withFamilyGate(async (db) => {
              await generated.sent.record(db as never);
              await pending.moderation?.record(db as never);
            }).catch(() => {});
          throw err;
        }
        if (generated.error !== null) throw generated.error;
        // The tutor's history (S2): an answered question and its teaching blocks, in a short transaction of its own.
        // The answer was already shown and metered: a history that cannot be written never takes it back. Files are
        // linked only to a question kept in the window's own subject.
        const turn = keepTurn as typeof keepTurn;
        if (turn && last?.t === 'done' && generated.subject && generated.kept.length > 0) {
          const subject = generated.subject;
          await withFamilyContext(claims, (db) => saveTurn(db, { accountId: session.accountId, childId: turn.childId, subject, text: turn.text, chapterKey: turn.chapterKey, blockId: turn.blockId, lang: turn.lang, files: subject === turn.windowSubject ? turn.files : [], blocks: generated.kept })).catch(() => {});
        }
        if (last) send(last);
      } catch (err) {
        send({ t: 'refused', reason: err instanceof FamilySessionRevokedError ? 'not_found' : 'failed', message: t('en', 'fam.err.network') });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' } });
}
