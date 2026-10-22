// The Family app's module registry lives in the contracts (src/lib/contracts/family-modules.ts, C230-V), so Control →
// Apps lists the same modules; the family code reads it from here as before.
import { FAMILY_MODULES, type FamilyTab } from '@/lib/contracts/family-modules';
export { FAMILY_MODULES, type Entitlement, type FamilyModule, type FamilyTab } from '@/lib/contracts/family-modules';

export const TABS: readonly FamilyTab[] = ['home', 'study', 'english', 'future', 'family'];

// Home and the family (parent) tab are always there; the others when a module of theirs is built and switched on.
export function visibleTabs(isOn: (flag: string) => boolean): FamilyTab[] {
  return TABS.filter((tab) => tab === 'home' || tab === 'family' || FAMILY_MODULES.some((m) => m.tab === tab && m.built && !m.addOn && isOn(m.flag)));
}

// Every subject the app knows (C264): src/lib/family/subjects.ts. A child studies the subjects of their class.
export { SUBJECT_IDS as SUBJECTS, type Subject } from './subjects';
import type { Subject } from './subjects';

// One free subject per child (C252). The first subject a child opens becomes their free one; the parent may change it
// once the change window (family.free_subject_change_days) has passed. M1 has no Plus yet, so the other subjects say
// they open with Family Plus later; no price is shown (05 §4). Subjects Control opens to every child
// (`family.open_subjects`, C298: the pilot's EVS) are open whatever the free subject is, and never become it.
export type SubjectAccess = { subject: Subject; open: boolean; isFree: boolean };

export function subjectAccess(child: { freeSubject: Subject | null }, subject: Subject, openToAll: readonly string[] = []): SubjectAccess {
  if (openToAll.includes(subject)) return { subject, open: true, isFree: false };
  if (!child.freeSubject) return { subject, open: true, isFree: false };
  return { subject, open: child.freeSubject === subject, isFree: child.freeSubject === subject };
}

export function canChangeFreeSubject(setAt: Date | null, changeDays: number, now = new Date()): boolean {
  return !setAt || now.getTime() - setAt.getTime() >= changeDays * 24 * 60 * 60 * 1000;
}
