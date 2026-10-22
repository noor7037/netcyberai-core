// The Family app's module registry (docs/family-app/03 §2; M1-6, C252). Every family module is declared here once: its
// tab, the Control flag that switches it, and its entitlement class. The home, the tabs and the APIs read this list;
// nothing hard-codes a module elsewhere. A tab shows only when its first module is live (built and switched on).
//
// Entitlement classes (03 §2): `school_info` always free to a linked family; `learning` per child per subject (free for
// one subject per child; Family Plus or a school's sponsorship later for the rest); `public` free; `plus` Plus only.

export type FamilyTab = 'home' | 'study' | 'english' | 'future' | 'family';
export type Entitlement = 'school_info' | 'learning' | 'public' | 'plus';
// `addOn`: the module only extends others on its tab (M2-9's offline packs extend Understand), so it never shows a tab
// by itself.
export type FamilyModule = { id: string; tab: FamilyTab; flag: string; entitlement: Entitlement; built: boolean; milestone: string; addOn?: true };

export const FAMILY_MODULES: readonly FamilyModule[] = [
  { id: 'understand', tab: 'study', flag: 'understand', entitlement: 'learning', built: true, milestone: 'M1' },
  { id: 'practice', tab: 'study', flag: 'practice', entitlement: 'learning', built: true, milestone: 'M1' },
  { id: 'progress', tab: 'home', flag: 'progress', entitlement: 'public', built: true, milestone: 'M1' },
  { id: 'parent_card', tab: 'family', flag: 'parent_card', entitlement: 'public', built: true, milestone: 'M1' },
  { id: 'english_programme', tab: 'english', flag: 'english_programme', entitlement: 'plus', built: true, milestone: 'C274' },
  { id: 'careers', tab: 'future', flag: 'careers', entitlement: 'public', built: false, milestone: 'M4' },
  { id: 'opportunities', tab: 'future', flag: 'opportunities', entitlement: 'public', built: false, milestone: 'M4' },
  { id: 'school_today', tab: 'home', flag: 'school_today', entitlement: 'school_info', built: false, milestone: 'M3' },
  // M2 (C275): each slice sets its module's `built` when it ships.
  { id: 'plan', tab: 'home', flag: 'plan', entitlement: 'learning', built: true, milestone: 'M2' },
  // m2-3
  { id: 'habit', tab: 'family', flag: 'habit', entitlement: 'public', built: false, milestone: 'M2' },
  // m2-4
  { id: 'worksheets', tab: 'study', flag: 'worksheets', entitlement: 'learning', built: false, milestone: 'M2' },
  // m2-5
  { id: 'videos', tab: 'study', flag: 'videos', entitlement: 'learning', built: false, milestone: 'M2' },
  // m2-6
  { id: 'homework', tab: 'study', flag: 'homework', entitlement: 'learning', built: false, milestone: 'M2' },
  // m2-7
  { id: 'voice_input', tab: 'study', flag: 'voice_input', entitlement: 'learning', built: false, milestone: 'M2' },
  // m2-9
  { id: 'offline', tab: 'study', flag: 'offline', entitlement: 'learning', built: true, milestone: 'M2', addOn: true },
];

export const TABS: readonly FamilyTab[] = ['home', 'study', 'english', 'future', 'family'];

// Home and the family (parent) tab are always there; the others when a module of theirs is built and switched on.
export function visibleTabs(isOn: (flag: string) => boolean): FamilyTab[] {
  return TABS.filter((tab) => tab === 'home' || tab === 'family' || FAMILY_MODULES.some((m) => m.tab === tab && m.built && !m.addOn && isOn(m.flag)));
}

// Every subject the app knows (C264): src/lib/family/subjects.ts. A child studies the subjects of their class.
export { SUBJECT_IDS as SUBJECTS, type Subject } from './subjects';
import type { Subject } from './subjects';

// One free subject per child (a Control setting, family.free_subjects_per_child; 1 at launch). The first subject a child
// opens becomes their free one; the parent may change it once the change window (family.free_subject_change_days) has
// passed. M1 has no Plus yet, so the other subjects say they open with Family Plus later; no price is shown (05 §4).
export type SubjectAccess = { subject: Subject; open: boolean; isFree: boolean };

export function subjectAccess(child: { freeSubject: Subject | null }, subject: Subject): SubjectAccess {
  if (!child.freeSubject) return { subject, open: true, isFree: false };
  return { subject, open: child.freeSubject === subject, isFree: child.freeSubject === subject };
}

export function canChangeFreeSubject(setAt: Date | null, changeDays: number, now = new Date()): boolean {
  return !setAt || now.getTime() - setAt.getTime() >= changeDays * 24 * 60 * 60 * 1000;
}
