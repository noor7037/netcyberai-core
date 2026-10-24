// The Family app's module registry (docs/family-app/03 §2; M1-6, C252). Every family module is declared here once: its
// tab, the Control flag that switches it, and its entitlement class. The home, the tabs, the APIs and Control → Apps read
// this list; nothing hard-codes a module elsewhere. A tab shows only when its first module is live (built and switched
// on). It lives in the contracts (C230-V) so Control lists exactly the modules the app has: a module Control could not
// see could never be switched on.
//
// Entitlement classes (03 §2): `school_info` always free to a linked family; `learning` per child per subject (free for
// one subject per child; Family Plus or a school's sponsorship later for the rest); `public` free; `plus` Plus only.

export type FamilyTab = 'home' | 'study' | 'english' | 'future' | 'family';
export type Entitlement = 'school_info' | 'learning' | 'public' | 'plus';
// `addOn`: the module only extends others on its tab (M2-9's offline packs extend Understand), so it never shows a tab
// by itself.
// `offByDefault`: a built module that stays off until Control saves a switch for it (the Focus Lock, C304: only for the
// closed pilot families whose parents gave written consent). Every other built module is on until switched off (C230-Z).
export type FamilyModule = { id: string; tab: FamilyTab; flag: string; entitlement: Entitlement; built: boolean; milestone: string; addOn?: true; offByDefault?: true };

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
  { id: 'habit', tab: 'family', flag: 'habit', entitlement: 'public', built: true, milestone: 'M2' },
  // m2-4
  { id: 'worksheets', tab: 'study', flag: 'worksheets', entitlement: 'learning', built: true, milestone: 'M2' },
  // m2-5
  { id: 'videos', tab: 'study', flag: 'videos', entitlement: 'learning', built: true, milestone: 'M2' },
  // m2-6
  { id: 'homework', tab: 'study', flag: 'homework', entitlement: 'learning', built: true, milestone: 'M2' },
  // m2-7
  { id: 'voice_input', tab: 'study', flag: 'voice_input', entitlement: 'learning', built: true, milestone: 'M2' },
  // m2-9
  { id: 'offline', tab: 'study', flag: 'offline', entitlement: 'learning', built: true, milestone: 'M2', addOn: true },
  // m2b-1 (C305): the Focus Lock's server (status, lock health, the parent's notices). Off until Control switches it on.
  { id: 'focus_lock', tab: 'family', flag: 'focus_lock', entitlement: 'public', built: true, milestone: 'M2b', offByDefault: true },
];
