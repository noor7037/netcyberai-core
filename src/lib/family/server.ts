import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { isLang, type Lang } from '@/lib/i18n';
import { accountSummary, type AccountSummary } from './account';
import { activeChild, listChildren, type FamilyChild } from './children';
import { consentState, type FamilyPurpose } from './consent';
import { FamilySessionRevokedError, withFamilyContext } from './db';
import { FAMILY_CHILD_COOKIE, FAMILY_LANG_COOKIE, FAMILY_PARENT_COOKIE, FAMILY_SESSION_COOKIE, verifyFamilySession, verifyParentMode, type FamilySession } from './session';

// What every Family app page starts from (M1-2, C248), read in the account's own transaction: the account, its
// consents, its children and which child is using the app, and whether parent mode is open. The app opens in child
// mode; the parent area needs the parent PIN.

export type FamilyPage = {
  session: FamilySession;
  account: AccountSummary;
  consents: Record<FamilyPurpose, boolean>;
  children: FamilyChild[];
  child: FamilyChild | null;
  parentMode: boolean;
  // The words of child mode follow the child's language; the parent area follows the parent's.
  childLang: Lang;
  parentLang: Lang;
};

// The language before sign-in (the sign-in page), from the parent's own choice on this phone.
export function familyLangBeforeSignIn(): Lang {
  const v = cookies().get(FAMILY_LANG_COOKIE)?.value;
  return isLang(v) ? v : 'en';
}

// null without a session. A session whose account is gone (deleted, or signed out everywhere) is sent to the route
// that clears its cookies, so it never loops between sign-in and the app.
export async function requireFamilyPage(): Promise<FamilyPage | null> {
  const jar = cookies();
  const session = await verifyFamilySession(jar.get(FAMILY_SESSION_COOKIE)?.value);
  if (!session) return null;
  let read: Omit<FamilyPage, 'session' | 'parentMode' | 'child' | 'childLang' | 'parentLang'> | null;
  try {
    read = await withFamilyContext({ accountId: session.accountId, tokenVersion: session.tokenVersion }, async (db) => {
      const account = await accountSummary(db, session.accountId);
      if (!account) return null;
      return { account, consents: await consentState(db, session.accountId), children: await listChildren(db, session.accountId) };
    });
  } catch (err) {
    if (err instanceof FamilySessionRevokedError) redirect('/api/family/auth/clear');
    throw err;
  }
  if (!read) redirect('/api/family/auth/clear');
  const child = activeChild(read.children, jar.get(FAMILY_CHILD_COOKIE)?.value);
  const parentMode = await verifyParentMode(jar.get(FAMILY_PARENT_COOKIE)?.value, session);
  return { session, ...read, child, parentMode, childLang: child?.language ?? read.account.uiLanguage, parentLang: read.account.uiLanguage };
}

// Where a family that has not finished the parent's first steps must go next: the consent tap, then the PIN, then the
// first child. null once all three are done.
export function firstStepsNext(p: FamilyPage): string | null {
  if (!p.consents.study_core) return '/family/welcome';
  if (!p.account.hasPin) return '/family/welcome/pin';
  if (p.children.length === 0) return '/family/welcome/child';
  return null;
}
