// The Family app's module registry (docs/family-app/03 §2; M1-6, C252). Every family module is declared here once: its
// tab, the Control flag that switches it, and its entitlement class. The home, the tabs, the APIs and Control → Apps read
// this list; nothing hard-codes a module elsewhere. A tab shows only when its first module is live (built and switched
// on). It lives in the contracts (C230-V) so Control lists exactly the modules the app has: a module Control could not
// see could never be switched on.
//
// Entitlement classes (03 §2): `school_info` always free to a linked family; `learning` per child per subject (free for
// one subject per child; Family Plus or a school's sponsorship later for the rest); `public` free; `plus` Plus only.

export type FamilyTab = 'home' | 'study' | 'english' | 'draw' | 'future' | 'family';
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
  // H1: the three public hubs are shells (their sections, no entries yet): Career Hub, Schemes & Scholarships (the
  // `opportunities` module) and the Exam Portal. Verified entries are added later from official sources.
  { id: 'careers', tab: 'future', flag: 'careers', entitlement: 'public', built: true, milestone: 'H1' },
  { id: 'opportunities', tab: 'future', flag: 'opportunities', entitlement: 'public', built: true, milestone: 'H1' },
  { id: 'exams_portal', tab: 'future', flag: 'exams_portal', entitlement: 'public', built: true, milestone: 'H1' },
  { id: 'school_today', tab: 'home', flag: 'school_today', entitlement: 'school_info', built: true, milestone: 'M3' },
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
  // M3-7 (C337): the home plan after a parent-teacher meeting; Plus, so also behind Control's family.plus_open until P3.
  { id: 'home_plan', tab: 'family', flag: 'home_plan', entitlement: 'plus', built: true, milestone: 'M3' },
  // m2b-1 (C305): the Focus Lock's server (status, lock health, the parent's notices). Off until Control switches it on.
  { id: 'focus_lock', tab: 'family', flag: 'focus_lock', entitlement: 'public', built: true, milestone: 'M2b', offByDefault: true },
  // W16 (A3, B5): each part of the Tutor programme has its own switch, on by default like the others (C398). Control → Apps
  // lists them; a switched-off part hides its entry points and its route says "This part is switched off".
  // The Tutor Hall (subject tutors to chat with or call); the call; the drawing board and the simulations; the short quiz
  // after a session (B1); the weekly report (B3). The last two may be listed before their screens are.
  { id: 'tutor_hall', tab: 'study', flag: 'tutor_hall', entitlement: 'public', built: true, milestone: 'W16' },
  { id: 'tutor_call', tab: 'study', flag: 'tutor_call', entitlement: 'learning', built: true, milestone: 'W16' },
  { id: 'tutor_board', tab: 'study', flag: 'tutor_board', entitlement: 'learning', built: true, milestone: 'W16' },
  { id: 'tutor_quiz', tab: 'study', flag: 'tutor_quiz', entitlement: 'learning', built: true, milestone: 'W16' },
  { id: 'tutor_reports', tab: 'family', flag: 'tutor_reports', entitlement: 'public', built: true, milestone: 'W16' },
  // C513: the Draw tab, a free art table (its own tab between English and Future). Free, on by default like the others;
  // pre-primary children may use it. Its drawings stay on the device.
  { id: 'draw', tab: 'draw', flag: 'draw', entitlement: 'public', built: true, milestone: 'C513' },
];
