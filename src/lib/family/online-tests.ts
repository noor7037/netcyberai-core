import type { FamilyOnlineSaveResult, FamilyOnlineSitting, FamilyOnlineSubmitResult, FamilyOnlineTest, OnlineAnswer } from '@/lib/contracts/marking';
import { answerFrom, noteOnlineLeave, readOnlineTests, saveOnlineAnswer, SchoolLinkGoneError, startOnlineTest, submitOnlineTest } from '@/lib/online/guardian';
import { activeChild, listChildren } from './children';
import { consentState } from './consent';
import type { FamilyClaims } from './db';
import { activeLinks, matchedStudent, type FamilySchoolLink } from './school';

type Db = Parameters<typeof activeLinks>[0] & Parameters<typeof listChildren>[0];

// Who is sitting, in the account's own transaction: the child using the app now (the one chosen on the parent's phone,
// or the phone's own child), with the parent's consent for the child's learning, and the account's school links. Null
// when there is none (the routes answer 404).
export async function sittingChild(db: Db, accountId: string, chosen: string | undefined): Promise<{ childId: string; links: FamilySchoolLink[] } | null> {
  const child = activeChild(await listChildren(db, accountId), chosen);
  if (!child || !(await consentState(db, accountId)).study_core) return null;
  return { childId: child.childId, links: await activeLinks(db, accountId) };
}

// Online tests in child mode (AQ-4, C365; docs/36 §1.3): the child using the app now, matched to a school student by
// the parent (never a guess), sits their own class's test. Every step is School Link's, as the guardian
// (src/lib/online/guardian.ts, this file's one door): the school's database decides whose test it is, whether it is
// open, and the time. Session kinds: child mode on the parent's phone, and a child's own phone (C342), which reaches its
// own child only, as every School Link read there does. Nothing here is a mark: the result comes at publication.
// A link the school closed meanwhile reads as nothing (an empty list, 'not_found').

export { answerFrom };
export type { FamilySchoolLink };

const gone = <T>(e: unknown, value: T): T => {
  if (e instanceof SchoolLinkGoneError) return value;
  throw e;
};

export async function childOnlineTests(claims: FamilyClaims, links: readonly FamilySchoolLink[], childId: string): Promise<FamilyOnlineTest[]> {
  const m = matchedStudent(links, childId);
  if (!m) return [];
  try {
    return await readOnlineTests(claims, m.linkId, m.studentId);
  } catch (e) {
    return gone(e, []);
  }
}

export async function childStartTest(claims: FamilyClaims, links: readonly FamilySchoolLink[], childId: string, testId: string): Promise<FamilyOnlineSitting> {
  const none: FamilyOnlineSitting = { outcome: 'not_found', attemptId: null, deadlineAt: null, serverNow: new Date().toISOString(), questions: [] };
  const m = matchedStudent(links, childId);
  if (!m) return none;
  try {
    return await startOnlineTest(claims, m.linkId, m.studentId, testId);
  } catch (e) {
    return gone(e, none);
  }
}

export async function childSaveAnswer(
  claims: FamilyClaims,
  links: readonly FamilySchoolLink[],
  childId: string,
  input: { attemptId: string; questionId: string; answer: OnlineAnswer | null; flagged: boolean; seq: number }
): Promise<FamilyOnlineSaveResult> {
  const m = matchedStudent(links, childId);
  if (!m) return 'not_found';
  try {
    return await saveOnlineAnswer(claims, m.linkId, m.studentId, input);
  } catch (e) {
    return gone(e, 'not_found' as const);
  }
}

export async function childSubmitTest(claims: FamilyClaims, links: readonly FamilySchoolLink[], childId: string, attemptId: string): Promise<FamilyOnlineSubmitResult> {
  const m = matchedStudent(links, childId);
  if (!m) return 'not_found';
  try {
    return await submitOnlineTest(claims, m.linkId, m.studentId, attemptId);
  } catch (e) {
    return gone(e, 'not_found' as const);
  }
}

export async function childLeftTest(claims: FamilyClaims, links: readonly FamilySchoolLink[], childId: string, attemptId: string): Promise<'noted' | 'closed' | 'not_found'> {
  const m = matchedStudent(links, childId);
  if (!m) return 'not_found';
  try {
    return await noteOnlineLeave(claims, m.linkId, m.studentId, attemptId);
  } catch (e) {
    return gone(e, 'not_found' as const);
  }
}
