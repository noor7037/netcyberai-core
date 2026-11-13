import { NextRequest, NextResponse } from 'next/server';
import { accountSummary } from '@/lib/family/account';
import { callGate } from '@/lib/family/call-gate';
import { sayEvent, type SayBudget } from '@/lib/family/call-say';
import { REFUSAL_MESSAGE, dailyRequestsLeft, prepareModeration } from '@/lib/ai/platform';
import { tutorTurn } from '@/lib/ai/agents/orchestrator';
import { activeChild, boardNameOf, listChildren, type FamilyChild } from '@/lib/family/children';
import { consentState } from '@/lib/family/consent';
import { FamilySessionRevokedError, withFamilyContext, withFamilyGate, familyClaims } from '@/lib/family/db';
import { familyModuleOn } from '@/lib/family/flags';
import { openItem } from '@/lib/family/items';
import { claimSubject } from '@/lib/family/learning';
import { SUBJECTS, type Subject } from '@/lib/family/modules';
import { jsonBody, requireFamily } from '@/lib/family/request';
import { FOLLOW_UPS, generate, syllabusLine, keep, prepareResolve, type FollowUp, type Generated, type Pending, type ResolveInput, type ResolverEvent } from '@/lib/family/resolver';
import { FAMILY_CHILD_COOKIE } from '@/lib/family/session';
import { isTutorKey, resolvePersona } from '@/lib/family/tutors';
import type { Persona } from '@/lib/family/persona';
import { isUuid, readerContext, refreshChatSummary, resolveChat, saveTurn, saveUnanswered, sendableFiles, tutorStorage, unansweredQuestion } from '@/lib/family/tutor';
import { buildScope, parseWhere, scopeKeyOf } from '@/lib/family/tutor-context';
import { syllabusBoardOf } from '@/lib/family/children';
import { attachedText, fetchFiles, filesToRead, givePhotoPlaceBack, preparePhotoReads, readFetched, type Unreadable } from '@/lib/family/tutor-read';
import { TUTOR_READS_FILES } from '@/lib/family/tutor-shape';
import { typedCheckReading } from '@/lib/family/check-work';
import { photoGate } from '@/lib/family/photo-gate';
import { isSubject } from '@/lib/family/subjects';
import { fillVisuals } from '@/lib/family/visuals/fill';
import { indiaDate } from '@/lib/time/india';
import { isMessageKey, t, type MessageKey } from '@/lib/i18n';
import { readDrawMarker } from '@/lib/family/draw-templates';

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
// W16-A4 (the call): `call: true` beside a tutor question answers a spoken turn. The gate is the voice input's own
// (call-gate.ts) and after each checked block a `say` line carries its spoken sentences, sealed for the speak route.
//
// W16-B2 (Check my work): `tutor.mode: 'check'` with exactly one photo of the child's own handwritten working. The photo
// is read line by line (family.homework prompt v2, the same photo rules, day place and vision profile as any tutor
// photo), the chapter is searched on the question the photo showed, and the answer is that working marked step by step
// (src/lib/family/resolver.ts, `check`). It is kept as a tutor message like any other. W18-Q3: the same mode with no
// file when the typed text is the working ("Check my work: 2+3×4=14"); the reading is built from the text, no photo is
// read. The verdicts come first, and when the model's do not pass, our own arithmetic gives them (arithmetic-check.ts).
//
// W18-P3 (the sketch pad): `tutor.sketch: true` with exactly one PNG or JPEG the child drew; it reaches the prompt as
// `ResolverAsk.sketch`, so the tutor marks up the drawing. The file door and the photo rules are the same as any photo.
//
// The files are read first (W4-1, C385; src/lib/family/tutor-read.ts): a PDF's text on the server, a photo through the
// vision profile; what they say joins the question, and what could not be read is said in a `files` line before the
// answer. That reading has its own short transactions around the fetch and the vision calls.
//
// No database connection is held while the AI answers (F1-3): the checks and reads in one short transaction, the call
// with no connection, then the writes (metering, the library line) in a second one.
//
// C508: a plain typed tutor question whose answer then fails on our side (the provider failed or timed out, or nothing
// was shown), after it passed the safety check, is kept alone (tutor.ts saveUnanswered) and the refused line names it
// (`unanswered`), so the window shows "No answer yet" and Try again, after a reload too. Try again sends
// `tutor.retryOf`: the server reads that question's own words back and answers them in its chat; the answer takes its
// place (one question row). A safety refusal, an off-subject or not-study refusal keeps nothing, as before.
// The done line says `autoRead` for a child in Class 3 or below, so the window starts reading a fresh answer aloud.
export const dynamic = 'force-dynamic';

// The tutor window's own additions to the resolver's lines (C508).
type TutorLine = ResolverEvent | (Extract<ResolverEvent, { t: 'refused' }> & { unanswered?: string }) | (Extract<ResolverEvent, { t: 'done' }> & { autoRead?: true });
const AUTO_READ_UPTO = 3;
// C514: the question of a template drawing sent with no words of its own.
const DRAWING_QUESTION = 'Please look at my drawing.';

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
  // C514: a drawing made on one of our templates opens its question with the template's marker ("[draw:<id>] "): only
  // the id is read (and only for a sketch, below); the marker never reaches the tutor or the kept question.
  let drawTemplateId: string | null = null;
  if (body.kind === 'question' && typeof body.text === 'string') {
    const marked = readDrawMarker(body.text.trim());
    drawTemplateId = marked.templateId;
    const text = marked.text.trim().slice(0, 500);
    if (text.length >= 3) input = { kind: 'question', text, subject: null };
    else if (drawTemplateId) input = { kind: 'question', text: DRAWING_QUESTION, subject: null };
  }
  const retry = body.retry && typeof body.retry === 'object' ? (body.retry as { token?: unknown; choice?: unknown }) : null;
  if (!input && !retry) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  const tutorBody = input?.kind === 'question' && body.tutor && typeof body.tutor === 'object' && !Array.isArray(body.tutor) ? (body.tutor as Record<string, unknown>) : null;
  if (tutorBody && !isSubject(tutorBody.subject)) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  // W23-C: where the window was opened (`tutor.where`, tutor-context.ts): the shape is checked here, whether this child may
  // open it and what it says are decided on the server in the first transaction. A `where` that is not a place is a bad request.
  const where = tutorBody && tutorBody.where !== undefined ? parseWhere(tutorBody.where) : null;
  if (tutorBody && tutorBody.where !== undefined && !where) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  // Check my work: one photo, no follow-up, no retry; anything else is a bad request before anything is read.
  // W18-Q3: or no file at all, when the typed text is itself the working ("Check my work: 2+3×4=14", check-work.ts): its
  // reading is built here from the text, line by line, with no photo read and no vision call.
  const asksCheck = tutorBody?.mode === 'check' && !followUp && !retry;
  const noFiles = !Array.isArray(tutorBody?.files) || (tutorBody!.files as unknown[]).length === 0;
  const typedReading = asksCheck && noFiles && input?.kind === 'question' ? typedCheckReading(input.text) : null;
  // Typed words that open like a check but hold nothing our arithmetic can mark (the phone's lighter test said "check") are
  // answered as the ordinary question they are; a check with files needs exactly one.
  const checkMode = asksCheck && (typedReading !== null || !noFiles);
  if (checkMode && !typedReading && !(Array.isArray(tutorBody!.files) && tutorBody!.files.length === 1)) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  // W18-P3 (the sketch pad): `tutor.sketch: true` only with exactly one attached file, never beside Check my work, a follow-up
  // or a retry; the file's type (PNG or JPEG) is checked below, once the stored file is known.
  const sketchMode = tutorBody?.sketch === true && !followUp && !retry;
  if (sketchMode && (checkMode || !(Array.isArray(tutorBody!.files) && tutorBody!.files.length === 1))) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  // C508: Try again on a question with no answer yet: only a plain typed question (no files, no mode, not a call).
  const retryOf = tutorBody && !followUp && !retry && !checkMode && !sketchMode && body.call !== true && noFiles && isUuid(tutorBody.retryOf) ? tutorBody.retryOf : null;
  if (tutorBody && tutorBody.retryOf !== undefined && !retryOf) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  // What is kept once answered (null: nothing): filled in the first transaction, for the child it chose. `plain`: a
  // question that may be kept with no answer yet (C508); `young`: Class 3 or below (the answer is read aloud by itself).
  let keepTurn: { childId: string; text: string; chapterKey: string | null; blockId: string | null; files: string[]; windowSubject: string; lang: string; scope: string | null; plain: boolean; young: boolean } | null = null;
  const chosen = req.cookies.get(FAMILY_CHILD_COOKIE)?.value;
  // W23-C: what the tutor is told about where the window was opened (null: not a place this child may open).
  const scopeOf = (db: Parameters<typeof syllabusLine>[0], child: FamilyChild, subject: string, question: string) =>
    where
      ? buildScope(where, { board: child.board, classLevel: child.classLevel, language: child.language, boardId: syllabusBoardOf(child) }, subject, question, {
          topicLine: async (key) => {
            const line = await syllabusLine(db, child, { kind: 'topic', key });
            return line ? { subject: line.subject, chapterEn: line.chapterEn, topicEn: line.topicEn } : null;
          },
        })
      : Promise.resolve(null);
  // W9-A (C406): the chat a tutor question is asked in (`tutor.chatId` when it is this child's own in the window's
  // subject, else the newest open one) and what the tutor is told of it (its summary and last turns). A new question in
  // a full chat is refused before anything is asked (409 chat_full); a follow-up still sees the chat.
  let chatId: string | null = null;
  // W16-A3: the tutor chosen in the Tutor Hall (`tutor.tutorKey`), or the one the chat named by the window was started with;
  // its persona is one line of the system prompt, and a new chat is kept with its tutor.
  let persona: Persona | null = null;
  let tutorKey: string | null = null;
  // W10 (C411): the chat the window named is kept whatever subject is decided; a chat with turns steers by its own subject.
  let pinned = false;
  let chatSubject: string | null = null;
  if (tutorBody && input?.kind === 'question' && !retry) {
    // C508: Try again asks the kept question's own words again, in its own chat; one already answered (or not this
    // child's) is not asked again.
    if (retryOf) {
      const again = await withFamilyContext(claims, async (db) => {
        const child = activeChild(await listChildren(db, session.accountId), chosen);
        return child ? unansweredQuestion(db, session.accountId, child.childId, retryOf) : null;
      }).catch(() => null);
      if (!again) return NextResponse.json({ error: 'not_found' }, { status: 404 });
      input = { ...input, text: again.text };
      tutorBody.chatId = again.chatId;
    }
    const chat = await withFamilyContext(claims, async (db) => {
      const child = activeChild(await listChildren(db, session.accountId), chosen);
      return child ? resolveChat(db, session.accountId, child.childId, String(tutorBody.subject), tutorBody.chatId, isTutorKey(tutorBody.tutorKey) ? tutorBody.tutorKey : null, where ? scopeKeyOf(where) : null) : null;
    }).catch(() => null);
    const asked = chat ? chat.tutorKey : isTutorKey(tutorBody.tutorKey) ? tutorBody.tutorKey : null;
    // W16-B5: with the Tutor Hall switched off, no tutor is chosen: the question is answered without a persona.
    const hallOn = asked ? await withFamilyContext(claims, (db) => familyModuleOn(db, 'tutor_hall', session.accountId)).catch(() => false) : false;
    if (asked && hallOn) {
      persona = await resolvePersona(claims, (fn) => withFamilyContext(claims, fn), session.accountId, asked).catch(() => null);
      tutorKey = persona ? asked : null;
    }
    if (chat?.full && !followUp) return NextResponse.json({ error: 'chat_full' }, { status: 409 });
    chatId = chat?.chatId ?? null;
    pinned = chat?.pinned ?? false;
    if (chat?.memory) {
      input = { ...input, memory: chat.memory };
      chatSubject = chat.subject;
    }
  }

  // W16-A4: a call's turn (`call: true` beside a tutor question): the same answer, and after each checked block the
  // sentences of it that are spoken, sealed for the speak route (call-say.ts). Behind the voice input's own gate, read
  // again in the first transaction below; `callChild` is the child it was sealed for.
  const callMode = body.call === true && tutorBody !== null && !followUp && !retry;
  let callChild: string | null = null;
  const spoken: SayBudget = { used: 0 };

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const write = (e: TutorLine) => controller.enqueue(encoder.encode(`${JSON.stringify(e)}\n`));
      const send = (e: TutorLine) => {
        write(e);
        if (callChild && e.t === 'block') {
          const say = sayEvent(e.block, { accountId: session.accountId, childId: callChild }, spoken);
          if (say) write(say);
        }
      };
      const stop = (e: ResolverEvent): null => {
        send(e);
        return null;
      };
      // C508: what decides whether a failed answer's question is kept: the question passed the safety check, and the
      // answer was not stopped by a check (a safety or subject refusal).
      let questionPassed = false;
      let stoppedByCheck = false;
      const keepUnanswered = async (): Promise<string | null> => {
        const turn = keepTurn as typeof keepTurn;
        if (!turn || !turn.plain || !questionPassed || stoppedByCheck) return null;
        const kept = await withFamilyContext(claims, (db) =>
          saveUnanswered(db, { accountId: session.accountId, childId: turn.childId, chatId, subject: turn.windowSubject, text: turn.text, chapterKey: turn.chapterKey, blockId: turn.blockId, lang: turn.lang, tutorKey, scope: turn.scope, retryOf, storage: tutorStorage })
        ).catch(() => null);
        return kept?.messageId ?? null;
      };
      try {
        // 0. The files sent with a tutor question, read before it is asked (W4-1). Not for a follow-up or a retry. A typed
        // check's working is its own text (W18-Q3): there is nothing to read.
        let attached: string | undefined = typedReading ?? undefined;
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
            if (where && !(await scopeOf(db, child, String(tutorBody!.subject), String(input && input.kind === 'question' ? input.text : '')))) return { refused: t(lang, 'fam.understand.notFound') };
            const files = await filesToRead(db, session.accountId, child.childId, String(tutorBody!.subject), fileIds);
            if (!files) return { refused: t(lang, 'fam.tutor.fileGone') };
            if (checkMode && files.some((f) => f.mime === 'application/pdf')) return { refused: t(lang, 'fam.check.err.photo_only') };
            if (sketchMode && files.some((f) => f.mime !== 'image/png' && f.mime !== 'image/jpeg')) return { refused: t(lang, 'fam.sketch.err.picture_only') };
            // W4-1 review: whatever would refuse the question is checked before any photo leaves, so a question that will
            // not be answered never sends a photo or spends a place: the reader's chapter and section, the safety check
            // ready (C314, as the homework helper does), and room in the family's day for every photo read and the answer.
            if (tutorBody!.chapterKey !== undefined && !readerContext(String(tutorBody!.subject), tutorBody!.chapterKey, tutorBody!.blockId, child.language)) return { refused: t(lang, 'fam.understand.notFound') };
            const account = await accountSummary(db, session.accountId);
            const ai = { accountId: session.accountId, childFirstNames: children.map((c) => c.firstName), parentEmail: account?.email ?? '', day: indiaDate() };
            if (!(await prepareModeration(db, ai)).ok) return { refused: t(lang, 'fam.understand.safetyOff') };
            const photos = files.filter((f) => f.mime !== 'application/pdf').length;
            if (photos > 0 && (await dailyRequestsLeft(db, session.accountId, ai.day)) < photos + 1) return { refused: t(lang, 'ai.cap_reached') };
            return { files, lang, childId: child.childId, ai, check: { classLevel: child.classLevel, board: boardNameOf(child) } };
          });
          if ('refused' in asked) return void send({ t: 'refused', reason: 'not_found', message: asked.refused! });
          const fetched = await fetchFiles(asked.files, (key) => tutorStorage.get(key));
          const calls = await withFamilyContext(claims, (db) => preparePhotoReads(db, asked.ai, asked.childId, fetched, checkMode ? asked.check : sketchMode ? 'sketch' : undefined));
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
          // Check my work with a photo that could not be read: there is no working to mark, and the line above says why.
          if (checkMode && !attached) return void send({ t: 'refused', reason: 'not_found', message: t(asked.lang, 'fam.check.err.unreadable') });
          // C510: a drawing the tutor could not describe would be answered as if nothing were sent; say so instead.
          if (sketchMode && !attached) return void send({ t: 'refused', reason: 'not_found', message: t(asked.lang, 'fam.sketch.err.unreadable') });
        }
        // W16-A1: the turn runs through the orchestrator (src/lib/ai/agents/orchestrator.ts), which calls the same three
        // steps below in the same order and logs each handoff; nothing it sends or keeps differs. No queue is given: a
        // family session enqueues no job.
        // 1. The checks and reads, and the AI platform's own checks (the daily cap taken), in one short transaction.
        const prepare = () => withFamilyContext(claims, async (db): Promise<Pending | null> => {
          const children = await listChildren(db, session.accountId);
          const child = activeChild(children, chosen);
          const words = (key: string, params?: Record<string, string>) => (isMessageKey(key) ? t(child?.language ?? 'en', key, params) : key);
          if (!child) return stop({ t: 'refused', reason: 'not_found', message: words('fam.understand.noChild') });
          if (!(await consentState(db, session.accountId)).study_core) return stop({ t: 'refused', reason: 'not_found', message: words('fam.err.consent_required') });
          if (!(await familyModuleOn(db, 'understand', session.accountId))) return stop({ t: 'refused', reason: 'not_switched_on', message: words('fam.understand.off') });
          if (callMode) {
            // W16-B5: the call's own switch in Control → Apps; the microphone in Study is voice_input's, not this.
            if (!(await familyModuleOn(db, 'tutor_call', session.accountId))) return stop({ t: 'refused', reason: 'not_switched_on', message: words('fam.call.off') });
            const call = await callGate(db, session.accountId, chosen);
            if (!call.ok) return stop({ t: 'refused', reason: 'not_found', message: words(call.error === 'not_found' ? 'fam.understand.noChild' : `fam.voice.err.${call.error}`) });
            callChild = call.child.childId;
          }
          let target = input;
          if (tutorBody && target?.kind === 'question') {
            const subject = String(tutorBody.subject);
            let reader: ReturnType<typeof readerContext> = null;
            // W23-C: where the window was opened, read from our own content; the question is filed under that chapter and topic.
            const placed = where ? await scopeOf(db, child, subject, target.text) : null;
            if (where && !placed) return stop({ t: 'refused', reason: 'not_found', message: words('fam.understand.notFound') });
            if (placed) target = { ...target, scope: { about: placed.about, text: placed.text, labs: placed.labs } };
            if (tutorBody.chapterKey !== undefined) {
              reader = readerContext(subject, tutorBody.chapterKey, tutorBody.blockId, child.language);
              if (!reader) return stop({ t: 'refused', reason: 'not_found', message: words('fam.understand.notFound') });
              target = { ...target, about: reader.about };
            }
            // W9-B (docs/39 §3): the window's subject and the reader's open chapter steer the library's passages and the
            // teaching plan (src/lib/family/resolver.ts plans the answer and retrieves before the answer call). They never
            // decide the answer's subject. W10 (C411): in a chat with turns, the chat's own subject steers them (a follow-up
            // in a Science chat opened from the Mathematics tab is taught from Science passages).
            target = { ...target, windowSubject: chatSubject ?? subject, ...(reader ? { chapterKey: reader.chapterKey } : {}) };
            if (attached && target?.kind === 'question') target = { ...target, attached, ...(checkMode ? { check: true as const } : {}), ...(sketchMode ? { sketch: true as const, ...(drawTemplateId ? { drawTemplate: drawTemplateId } : {}) } : {}) };
            const files = await sendableFiles(db, session.accountId, child.childId, subject, tutorBody.files);
            if (!files) return stop({ t: 'refused', reason: 'not_found', message: words('fam.tutor.fileGone') });
            if (!followUp && !retry)
              keepTurn = {
                childId: child.childId,
                text: target.text,
                chapterKey: placed?.chapterKey ?? reader?.chapterKey ?? null,
                blockId: placed?.blockId ?? reader?.blockId ?? null,
                files,
                windowSubject: subject,
                lang: child.language,
                scope: where ? scopeKeyOf(where) : null,
                plain: files.length === 0 && !checkMode && !sketchMode && !callMode && !attached,
                young: child.classLevel >= 1 && child.classLevel <= AUTO_READ_UPTO,
              };
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
              ...(persona ? { persona } : {}),
            },
            target!,
            followUp,
            send,
            misconception
          );
        });
        // 2. The AI answers, block by block, with no database connection held. A child with no free subject claims a
        // typed question's subject just before its first block is shown, in a short transaction of its own.
        const answer = async (pending: Pending) => {
          const childId = pending.ctx.child.childId;
          // C508: whether the typed question itself passed the safety check (the first check, the child's words alone):
          // only then may it be kept with no answer yet.
          const checker = pending.moderation;
          if (checker)
            pending.moderation = {
              check: async (turns) => {
                const verdict = await checker.check(turns);
                if (turns.assistant === undefined && verdict?.safe === true) questionPassed = true;
                return verdict;
              },
              record: (db) => checker.record(db),
            };
          const generated = await generate(pending, send, (subject) => withFamilyContext(claims, (db) => claimSubject(db, session.accountId, childId, subject)));
          stoppedByCheck = generated.stopped;
          const unfilled = generated.kept;
          const unfilledShared = generated.shared;
          if (!generated.stopped && generated.error === null) generated.kept = await fillVisuals((fn) => withFamilyContext(claims, fn), generated.kept, { chapterKey: pending.line?.key ?? null, lang: pending.ctx.child.language, ...(pending.line && !checkMode && !sketchMode ? { videos: { line: pending.line, child: pending.ctx.child, accountId: session.accountId } } : {}), emit: (block) => send({ t: 'block', block }) });
          // W22-S3: a block the fill left alone keeps its name-free twin (for a response kept for other children); a filled one has no text of the child's.
          if (generated.kept !== unfilled) generated.shared = generated.kept.map((blk) => { const i = unfilled.indexOf(blk); return i >= 0 ? unfilledShared[i] : blk; });
          return generated;
        };
        // 3. The writes, in a second short transaction; the last event only once they are kept.
        const write = async (pending: Pending, generated: Generated): Promise<ResolverEvent | null> => {
          try {
            return await withFamilyContext(claims, (db) => keep(db, pending, generated));
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
        };
        const done = await tutorTurn(
          { prepare, prepared: (p) => ({ passages: p.teach?.passages.length ?? 0, planAsked: p.teach?.call != null }), answer, keep: write },
          { conversationId: chatId, day: indiaDate(), endsSession: false }
        );
        if (!done) return;
        const { pending, generated } = done;
        let last = done.last;
        if (generated.error !== null) throw generated.error;
        // The tutor's history (S2): an answered question and its teaching blocks, in a short transaction of its own.
        // The answer was already shown and metered: a history that cannot be written never takes it back. Files are
        // linked only to a question kept in the window's own subject.
        // W9-A (C406): kept in the chat it was asked in (or the subject's newest open chat when the server decided another
        // subject, or that chat filled up meanwhile); after every fifth child turn the chat's summary is rewritten once
        // the answer's last line is sent, its own short transactions around the call.
        // W10 (C411): a chat the window named keeps the turn whatever subject was decided; its first answer moves it to
        // that subject (tutor.ts appendTurn). The last line names the chat and its subject, so the window lists it there.
        // W10-4 (C413): the subject's feed keeps its last 30 child turns; the oldest go with this write (tutor.ts trimFeed).
        const turn = keepTurn as typeof keepTurn;
        let kept: Awaited<ReturnType<typeof saveTurn>> = null;
        let failed: TutorLine | null = null;
        if (turn && last?.t === 'done' && generated.subject && generated.kept.length > 0) {
          const subject = generated.subject;
          const same = subject === turn.windowSubject;
          kept = await withFamilyContext(claims, (db) => saveTurn(db, { accountId: session.accountId, childId: turn.childId, chatId: same || pinned ? chatId : null, subject, text: turn.text, chapterKey: turn.chapterKey, blockId: turn.blockId, lang: turn.lang, files: same ? turn.files : [], blocks: generated.kept, storage: tutorStorage, tutorKey, scope: turn.scope, retryOf })).catch(() => null);
        } else if (turn && ((last?.t === 'done' && turn.plain) || (last?.t === 'refused' && last.reason === 'failed'))) {
          // C508: the answer failed on our side (or a plain question's ended with nothing shown): the question is kept
          // with no answer yet.
          const unanswered = await keepUnanswered();
          failed = { t: 'refused', reason: 'failed', message: last.t === 'refused' ? last.message : t(turn.lang === 'hi' ? 'hi' : 'en', REFUSAL_MESSAGE.failed), ...(unanswered ? { unanswered } : {}) };
        }
        if (last?.t === 'done' && kept && isSubject(kept.subject)) last = { ...last, chat: { chatId: kept.chatId, subject: kept.subject } };
        // W18-P1: the answer's own message id, just written for this child, so the window can read it aloud without a reload.
        // Nothing else of the turn leaves the server. C508: `autoRead`, a child in Class 3 or below hears a fresh answer.
        if (last?.t === 'done' && kept) last = { ...last, messageId: kept.messageId, ...(turn?.young ? { autoRead: true as const } : {}) };
        const final: TutorLine | null = failed ?? last;
        if (final) send(final);
        if (kept) await refreshChatSummary((fn) => withFamilyContext(claims, fn), pending.ctx, kept.chatId, kept.turnCount).catch(() => false);
      } catch (err) {
        const revoked = err instanceof FamilySessionRevokedError;
        const unanswered = revoked ? null : await keepUnanswered().catch(() => null);
        send({ t: 'refused', reason: revoked ? 'not_found' : 'failed', message: t('en', 'fam.err.network'), ...(unanswered ? { unanswered } : {}) });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' } });
}
