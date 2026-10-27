// AI answer-sheet marking (docs/35, C347–C352): the shapes the server and every screen share. The rules live in
// src/lib/marking; the tables in the migration ending _am_1_answer_marking.sql. Nothing here is a mark: a script's
// question marks become the paper's marks only when a person approves it (saveMarks, src/lib/exams/marks.ts).

export const QUESTION_KINDS = ['objective', 'short', 'long', 'numerical', 'diagram'] as const;
export type QuestionKind = (typeof QUESTION_KINDS)[number];

// One question list for four ways of sitting (docs/36, C361). A choice question (objective, with options) and a
// number question (numerical, with a value) whose correct answer is given are marked by rules on a bubble sheet and
// online (src/lib/marking/answers.ts); every other question by the AI or the teacher.
export const PAPER_SITTINGS = ['written', 'bubble', 'online'] as const; // an answer book; a bubble sheet for the choice questions and the book for the rest; the Family app
export type PaperSitting = (typeof PAPER_SITTINGS)[number];
export const SHEET_SOURCES = ['scan', 'bubble', 'online'] as const;
export type SheetSource = (typeof SHEET_SOURCES)[number];
export const UPLOAD_KINDS = ['scripts', 'bubble'] as const;
export type UploadKind = (typeof UPLOAD_KINDS)[number];
export const DIFFICULTIES = ['easy', 'medium', 'hard'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];
export const OPTION_KEYS = ['A', 'B', 'C', 'D', 'E', 'F'] as const;
export type OptionKey = (typeof OPTION_KEYS)[number];
export type QuestionOption = { key: OptionKey; text: string };
// A choice question: the option keys that are right (one, or more when the question says "choose all"). A number
// question: the value, and how far from it an answer may be and still be right.
export type CorrectAnswer = { keys: OptionKey[] } | { value: number; tolerance: number };
export const OPTIONS_MIN = 2;
export const OPTIONS_MAX = 6;
export const OPTION_TEXT_MAX = 500;
export const SECTION_PATTERN = /^[A-H]$/;
// The most a school may take off for a wrong choice answer (marking_setups.wrong_marks), one decimal place.
export const WRONG_MARKS_MAX = 10;

export const MARKING_LANGUAGES = ['en', 'hi', 'mixed'] as const;
export type MarkingLanguage = (typeof MARKING_LANGUAGES)[number];

// The kinds of mistake a question's answer shows (C352): one per question, chosen by the AI and changed by the teacher.
export const ERROR_TYPES = ['none', 'concept', 'calculation', 'incomplete', 'presentation', 'language', 'misread', 'not_attempted'] as const;
export type ErrorType = (typeof ERROR_TYPES)[number];

// by_child (C230-AJ): the phone's scan screen, child after child in roll order: each file is one child's script, and
// every page names the child the teacher chose (the claim). The AI's reading checks it and never moves the script.
export const UPLOAD_MODES = ['per_file', 'combined', 'by_child'] as const;
export type UploadMode = (typeof UPLOAD_MODES)[number];

// not_answer: the AI's reading says the page is not a page of an answer sheet, or looks like an identity document
// (C230-AG): never marked, and its script is not approved until a person settles it. removed: a person took it out of
// its script; its picture is deleted by the next sweep (src/lib/marking/retention.ts).
export const PAGE_STATES = ['new', 'read', 'blank', 'unreadable', 'duplicate', 'failed', 'not_answer', 'removed'] as const;
export type PageState = (typeof PAGE_STATES)[number];

export const SHEET_STATES = ['waiting', 'marking', 'marked', 'failed', 'approved', 'set_aside'] as const;
export type SheetState = (typeof SHEET_STATES)[number];

// Why a script waits for a person. Any flag keeps it out of "approve every script with no flag".
//   identity      matched to no one, or to a child whose name on the page did not agree
//   two_scripts   two scripts were read as one child: both wait for the teacher
//   missing_page  the printed page numbers skip a page
//   unreadable    a page could not be read
//   not_all_read  a question has no mark from the AI
//   unsure        the AI was less sure than the school's line for at least one question
//   changed       changed after it was approved: approve it again (families do not see it, and the class is not
//                 published, until then)
//   check_child   matched by a roll or exam number alone (no name was read): check it is this child
//   not_answer_page  a page may not be an answer page (an identity document, a form): not marked, and the script is
//                 not approved (the database holds it) until a person keeps the page as an answer page or takes it out
//   mismatch      scanned child by child: the name, roll number or exam number read on the sheet is not the child the
//                 teacher chose. The script stays that child's and is not approved (the database holds it) until a
//                 person confirms the child or chooses another
export const SHEET_FLAGS = ['identity', 'two_scripts', 'missing_page', 'unreadable', 'not_all_read', 'unsure', 'changed', 'check_child', 'not_answer_page', 'mismatch'] as const;
export type SheetFlag = (typeof SHEET_FLAGS)[number];

// bubble: the bubble sheet's printed number named the child (C364); online: the child sat the test signed in (C365).
export const MATCHED_BY = ['seat', 'roll', 'name', 'teacher', 'bubble', 'online', 'none'] as const;
export type MatchedBy = (typeof MATCHED_BY)[number];

// The plan's monthly limit of pages AI may read and mark for a school (C347), set in Control → Billing plans and held
// with the school's exams module.
export const AI_MARKING_PAGES_LIMIT = 'ai_marking_pages';

// Limits, shared by the browser (which makes the pictures) and the server (which checks them).
export const PAGE_MAX_EDGE = 2000; // the longest side of a page picture, in pixels
export const PAGE_MIN_EDGE = 200;
export const PAGE_MAX_BYTES = 1_500_000; // one JPEG, the hard cap for every way a page comes in
// The phone's scan screen (C230-AJ): a page is cropped, straightened and evened in a worker, then sent as a grey JPEG
// of this long edge and quality. Chosen by scripts/measure_scan_sizes.mjs (2026-10-27, Chromium's encoder): the smallest
// median size whose pages keep SSIM and edges at 0.95 or more and 0.98 of the pencil pixels against the same page at 2000 px,
// on eight made-up sheets in English and Hindi: median 131 KB, largest 157 KB (today's 2000 px photo: median 302 KB).
// PDFs and photos chosen as files keep PAGE_MAX_EDGE; PAGE_MAX_BYTES is the hard cap for both.
export const SCAN_MAX_EDGE = 1600;
export const SCAN_QUALITY = 0.5;
export const PAGES_PER_REQUEST = 6; // a few pages a request…
export const REQUEST_MAX_BYTES = 4_000_000; // …and never more bytes than this together: the host refuses a body over 4.5 MB
export const MAX_FILES_PER_UPLOAD = 500;
export const MAX_PAGES_PER_FILE = 200;
export const MAX_PAGES_PER_UPLOAD = 1500;
export const MAX_QUESTIONS = 200;
export const MAX_SHEET_PAGES = 40; // a script longer than this is split by the teacher, not sent to the AI whole
// The AI's tries at one script, ever: a person's "Mark again" starts a new job but never a new count, so the AI's
// cost of one script is bounded whatever is pressed (review of #318). One job tries at most MARKING_TRIES_PER_JOB.
export const MAX_MARKING_ATTEMPTS = 6;
export const MARKING_TRIES_PER_JOB = 3;

export type MarkingStep = { step: string; marks: number };

export type MarkingQuestion = {
  questionId: string;
  position: number;
  label: string; // as printed: "1", "2(a)", "11"
  component: string; // the paper's part it counts to (PaperComponent.key)
  maxMarks: number;
  choiceGroup: string | null; // "A": of group A's questions, the best choiceCounts.A count
  unitId: string | null; // its chapter and topic in the class's syllabus map
  kind: QuestionKind;
  prompt: string;
  answerKey: string;
  steps: MarkingStep[];
  options: QuestionOption[]; // a choice question's options, A to F; none on any other kind
  correct: CorrectAnswer | null; // given only where rules can mark it
  difficulty: Difficulty | null;
  section: string | null; // the printed paper's section, A to H
};

// wrongMarks: taken off for a wrong choice or number answer that rules mark (C361); 0 for most school papers.
export type MarkingSetup = { language: MarkingLanguage; guidance: string; choiceCounts: Record<string, number>; wrongMarks: number };

// A paper's questions against its parts: each part's counted marks must equal its maximum before marking starts.
export type StructureProblem =
  | { kind: 'part_total'; component: string; counted: number; max: number }
  | { kind: 'group_count'; group: string } // a group with no count, or a count larger than its questions
  | { kind: 'group_parts'; group: string } // a group's questions count to more than one part
  | { kind: 'no_questions' };

export type MarkingUnit = { unitId: string; chapter: string; topic: string };

export type MarkingPaper = {
  paperId: string;
  examId: string;
  examName: string;
  classId: string;
  className: string;
  subjectId: string;
  subjectName: string;
  date: string | null;
  components: { key: string; name: string; max: number }[];
  units: MarkingUnit[];
  published: boolean;
  mayMark: boolean;
};

export type SetupScreen = {
  paper: MarkingPaper;
  setup: MarkingSetup;
  questions: MarkingQuestion[];
  problems: StructureProblem[];
  // Once a script is approved, a question's number, part, marks and group are fixed (the database holds it).
  locked: boolean;
};

// What the AI read on one page (exams.read_pages). Every field may be missing: nothing is guessed.
export type PageReading = {
  firstPage: boolean; // the page that starts a child's script (it carries the name, roll number or exam number)
  name: string | null;
  rollNo: string | null;
  seatNo: string | null;
  classSection: string | null;
  pageNumber: number | null; // as printed on the page
  blank: boolean;
  legible: boolean;
  // v2 (C230-AG): a page of a handwritten answer sheet, and whether it looks like an identity document. A page that is
  // not an answer page, or looks like one, keeps no name or number (they are dropped as it is read).
  answerPage: boolean;
  idDocument: boolean;
};

// What the AI gave one script (exams.mark), checked against the paper's questions before it is kept.
export type QuestionResult = {
  questionId: string;
  attempted: boolean;
  marks: number | null; // null: the AI gave none (the script is flagged not_all_read)
  steps: { step: string; awarded: number; note: string | null }[];
  note: string | null; // for the child
  reason: string | null; // for the teacher: why these marks
  errorType: ErrorType | null;
  confidence: number | null; // 0 to 1
  pageId: string | null; // where the answer is
  yFrom: number | null; // 0 (top) to 1 (bottom) of that page
  yTo: number | null;
};
export type SheetResult = {
  questions: QuestionResult[];
  strengths: string | null;
  improve: string | null;
  practice: { unitId: string | null; text: string }[];
};

export type MarkingUploadRow = { uploadId: string; mode: UploadMode; createdAt: string; closed: boolean; files: number; pages: number };

export type RosterChild = { studentId: string; name: string; rollNo: string | null; seatNo: string | null };

export type SheetRow = {
  sheetId: string;
  student: RosterChild | null;
  matchedBy: MatchedBy;
  state: SheetState;
  flags: SheetFlag[];
  failure: string | null;
  pages: number;
  total: number | null; // the script's total now (the teacher's marks where changed), all parts; null until marked
  max: number;
  confidence: number | null;
  approvedAt: string | null;
};

// When a paper's answer-sheet pictures go (C230-AJ; the database's marking_picture_deadline): `until` (an India date,
// yyyy-mm-dd) is the school's days (SCRIPT_DAYS_DEFAULT unless it chose 30 to 365) after the publication in force
// ('published'), or, while no result is in force, after the later of the last upload and the last reopening
// ('unpublished' or 'reopened'). `kept`: some picture of the paper is still stored. The screen warns WARN_DAYS before.
export const SCRIPT_DAYS_DEFAULT = 45;
export const PICTURES_WARN_DAYS = 7;
export type PicturesUntil = { until: string | null; basis: 'published' | 'unpublished' | 'reopened'; kept: boolean };

// One thing a person settles before a script goes on (C230-AJ), for the hub's one list, each with a one-tap fix:
//   mismatch         the sheet reads another child than the one chosen while scanning: confirm the child, or open it
//                    to choose another (chooseChild)
//   not_answer_page  a page may not be an answer page (C230-AG): keep it, or take it out (settlePage)
//   unreadable       a page could not be read; missing_page: the printed page numbers skip one. Open the script to look
//   no_child         a script matched to no child (two scripts for one child, or nothing read): open it to choose
export const EXCEPTION_KINDS = ['mismatch', 'not_answer_page', 'unreadable', 'missing_page', 'no_child'] as const;
export type ExceptionKind = (typeof EXCEPTION_KINDS)[number];
export type MarkingException = {
  sheetId: string;
  kind: ExceptionKind;
  student: RosterChild | null; // whose script it is now (the child chosen while scanning, or matched); null: no one
  read: { name: string | null; rollNo: string | null; seatNo: string | null } | null; // what the sheet reads (mismatch)
  page: { pageId: string; position: number; odd: 'id_document' | 'not_answer' } | null; // the page to settle
};

export type MarkingOverview = {
  paper: MarkingPaper;
  ready: boolean; // the questions add up and marking may start
  problems: StructureProblem[];
  uploads: MarkingUploadRow[];
  pages: Record<PageState, number>;
  sheets: SheetRow[]; // in roll order, then the scripts matched to no one
  candidates: RosterChild[]; // the paper's candidates, in roll order (the scan screen offers them one by one)
  withoutScript: RosterChild[]; // candidates on the roll with no live script, in roll order
  absent: string[]; // of them, already marked absent for every part
  reviewBelow: number; // the school's line, 0 to 1: a question the AI was less sure of flags its script
  pictures: PicturesUntil | null; // null: nothing uploaded yet
  exceptions: MarkingException[]; // in the order of the review list (roll order, then the scripts of no one)
  ai: { on: boolean; why: 'no_limit' | 'switched_off' | 'no_provider' | null; pagesThisMonth: number; limit: number | null };
};

// `odd`: why a 'not_answer' page waits for the teacher (it looks like an identity document, or is not an answer page).
export type SheetPage = { pageId: string; position: number; url: string; width: number; height: number; state: PageState; odd: 'id_document' | 'not_answer' | null };

export type SheetQuestion = MarkingQuestion & {
  ai: { attempted: boolean | null; marks: number | null; steps: QuestionResult['steps']; note: string | null; reason: string | null; confidence: number | null };
  teacher: { marks: number | null; note: string | null; changedAt: string | null };
  errorType: ErrorType | null;
  final: number | null; // the teacher's mark when changed, else the AI's
  counted: boolean; // false: left out by internal choice
  place: { pageId: string; yFrom: number; yTo: number } | null;
};

export type SheetDetail = {
  paper: MarkingPaper;
  sheet: SheetRow;
  match: { read: { name: string | null; rollNo: string | null; seatNo: string | null } | null; candidates: RosterChild[] };
  roster: RosterChild[]; // to choose the child by hand
  pages: SheetPage[]; // the pages whose pictures are kept
  picturesGone: number; // pages whose pictures were deleted after the school's days (the marks stay)
  questions: SheetQuestion[];
  totals: { component: string; name: string; score: number; max: number }[];
  strengths: string | null;
  improve: string | null;
  practice: { unitId: string | null; text: string }[];
  mayChange: boolean;
  next: string | null; // the next script waiting for review, in roll order
};

// The API's request bodies (src/app/api/app/marking/**).
export type SaveSetupInput = {
  setup: { language: MarkingLanguage; guidance: string; choiceCounts: Record<string, number>; wrongMarks?: number };
  questions: (Omit<MarkingQuestion, 'questionId' | 'options' | 'correct' | 'difficulty' | 'section'> & Partial<Pick<MarkingQuestion, 'options' | 'correct' | 'difficulty' | 'section'>>)[];
};
export type SheetChangeInput = {
  questions?: { questionId: string; marks?: number | null; note?: string | null; errorType?: ErrorType | null }[];
  strengths?: string | null;
  improve?: string | null;
  practice?: { unitId: string | null; text: string }[];
};
// A page that may not be an answer page, settled by the teacher: an answer page after all, or taken out of the script.
export type SettlePageInput = { action: 'keep' | 'take_out' };
export type StartUploadInput = { mode: UploadMode; files: number };
export type StartUploadResult = { uploadId: string };
// One page picture, as multipart form fields: uploadId, fileNo, pageNo, and the JPEG as `page`; for a by_child upload
// also `childId`, the child the teacher chose for that file (one per page, the same for every page of a file).
export type PageUploadResult = { pages: { fileNo: number; pageNo: number; pageId: string; duplicate: boolean }[] };

// Candidates and exam numbers (C348).
export type CandidateClass = { classId: string; className: string; onRoll: number; withdrawn: number; candidates: number; numbered: number };
export type Withdrawal = { studentId: string; name: string; className: string; rollNo: string | null; reason: string; withdrawnAt: string };
export type ExamCandidates = {
  examId: string;
  numbering: 'roll' | 'seat';
  seatPrefix: string;
  classes: CandidateClass[];
  withdrawals: Withdrawal[];
  mayChange: boolean;
};

// ---- Bubble (OMR) sheets (docs/36 §1.2, C364; AQ-3) --------------------------------------------------------------------
// A paper sat with a bubble sheet has its choice questions (objective, with options) on a printed sheet, one per
// candidate, read in the teacher's browser by rules (src/lib/bubbles); the rest in the answer book. Rule marks fill the
// AI's columns of marking_marks and are provisional: a person's approval writes marks.

// What the browser read on one sheet, sent with its page (checked strictly on the server, src/lib/bubbles/reading.ts).
export type BubbleReading = {
  layout: string; // the answer grid's fingerprint the sheet was read against (src/lib/bubbles/layout.ts)
  sheetNo: number | null; // the pre-shaded sheet number; null: not read (the check digit disagreed, or a smudge)
  roll: string | null; // the roll number shaded on a blank sheet (digits); null: none
  rollUnclear: boolean;
  answers: Record<string, OptionKey[]>; // per question number: the options clearly filled (none: blank)
  unclear: string[]; // questions with a bubble between empty and filled: no answer is read
  multiple: string[]; // questions with two or more filled
  confidence: number; // 0 to 1
};

// How a read sheet found its child: its printed number (bubble), the roll number shaded on a blank sheet (roll), a
// person (teacher), or not yet (none).
export type BubbleMatch = 'bubble' | 'roll' | 'teacher' | 'none';

export type BubbleWaiting = {
  readId: string;
  pageId: string;
  url: string | null; // null: the picture was deleted after the school's days
  sheetNo: number | null;
  rollNo: string | null;
  offered: string[]; // children the sheet may be (its printed child, the roll shaded), student ids
  why: 'identity' | 'two_scripts';
  readAt: string;
};

export type BubbleScreen = {
  paperId: string;
  sitting: PaperSitting;
  mayChange: boolean;
  questions: { label: string; options: number }[]; // the questions on the sheet, in order
  layoutKey: string | null;
  onlyChoice: boolean; // every question is on the sheet: each read sheet is the child's script
  problem: 'no_choice' | 'sheet_full' | 'questions' | null; // why sheets cannot be printed or read yet
  wrongMarks: number;
  printed: { candidates: number; blanks: number; replaced: number; lastAt: string | null };
  sheets: { sheetNo: number; studentId: string | null }[]; // the sheets in use, for the scan screen to name the child
  reads: { total: number; matched: number; flagged: number };
  waiting: BubbleWaiting[]; // a mixed paper's read sheets that name no child yet, for a person to settle
  candidates: RosterChild[]; // in roll order
};

// What printing gives the browser to draw (one page per sheet, the candidates in roll order, then the blank sheets).
export type BubblePrint = {
  school: string;
  examName: string;
  className: string;
  subjectName: string;
  date: string | null;
  layoutKey: string;
  questions: { label: string; options: number }[];
  sheets: { sheetNo: number; child: { name: string; rollNo: string | null; seatNo: string | null } | null }[];
};

// One page of a bubble upload, as the server kept it.
//   script     a paper of only choice questions: the read made the child's script (or one for the teacher to settle)
//   filled     a mixed paper: the read filled the child's answer-book script's choice questions
//   kept       a mixed paper: the child's answer-book script is not in yet; the read waits for it
//   waiting    the sheet names no child yet (or is a second sheet of one child): a person settles it on the hub
//   duplicate  the same picture was already on the paper
export type BubblePageResult = {
  fileNo: number;
  pageNo: number;
  pageId: string;
  outcome: 'script' | 'filled' | 'kept' | 'waiting' | 'duplicate';
  sheetNo: number | null;
  child: { studentId: string; name: string; rollNo: string | null } | null;
  flagged: boolean; // an unclear bubble, two marks, or a child to check
};
export type BubblePagesResult = { pages: BubblePageResult[] };

// One question of a read sheet on the review screen, with its bubbles placed on the kept picture (percent of the page).
export type BubbleQuestionView = {
  questionId: string;
  label: string;
  keys: OptionKey[];
  read: OptionKey[]; // filled
  state: 'answer' | 'blank' | 'unclear' | 'multiple';
  correct: OptionKey[] | null;
  right: boolean | null; // null: not marked by rules (unclear, two marks, or no correct answer given)
  row: { left: number; top: number; width: number; height: number } | null; // null: the questions changed since
  bubbles: { key: OptionKey; left: number; top: number; size: number }[];
};
export type BubbleSheetView = {
  readId: string;
  pageId: string;
  url: string | null;
  width: number;
  height: number;
  sheetNo: number | null;
  rollNo: string | null;
  matchedBy: BubbleMatch;
  confidence: number;
  sameQuestions: boolean; // the sheet was read against today's questions (else the picture shows no bubble places)
  applied: boolean; // its rule marks are on this script
  questions: BubbleQuestionView[];
  mayChange: boolean;
};
export type BubbleSheetDetail = { source: SheetSource; view: BubbleSheetView | null; pending: boolean };
