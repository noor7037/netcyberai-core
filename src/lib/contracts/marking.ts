// AI answer-sheet marking (docs/35, C347–C352): the shapes the server and every screen share. The rules live in
// src/lib/marking; the tables in the migration ending _am_1_answer_marking.sql. Nothing here is a mark: a script's
// question marks become the paper's marks only when a person approves it (saveMarks, src/lib/exams/marks.ts).

export const QUESTION_KINDS = ['objective', 'short', 'long', 'numerical', 'diagram'] as const;
export type QuestionKind = (typeof QUESTION_KINDS)[number];

export const MARKING_LANGUAGES = ['en', 'hi', 'mixed'] as const;
export type MarkingLanguage = (typeof MARKING_LANGUAGES)[number];

// The kinds of mistake a question's answer shows (C352): one per question, chosen by the AI and changed by the teacher.
export const ERROR_TYPES = ['none', 'concept', 'calculation', 'incomplete', 'presentation', 'language', 'misread', 'not_attempted'] as const;
export type ErrorType = (typeof ERROR_TYPES)[number];

export const UPLOAD_MODES = ['per_file', 'combined'] as const;
export type UploadMode = (typeof UPLOAD_MODES)[number];

export const PAGE_STATES = ['new', 'read', 'blank', 'unreadable', 'duplicate', 'failed'] as const;
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
export const SHEET_FLAGS = ['identity', 'two_scripts', 'missing_page', 'unreadable', 'not_all_read', 'unsure', 'changed', 'check_child'] as const;
export type SheetFlag = (typeof SHEET_FLAGS)[number];

export const MATCHED_BY = ['seat', 'roll', 'name', 'teacher', 'none'] as const;
export type MatchedBy = (typeof MATCHED_BY)[number];

// The plan's monthly limit of pages AI may read and mark for a school (C347), set in Control → Billing plans and held
// with the school's exams module.
export const AI_MARKING_PAGES_LIMIT = 'ai_marking_pages';

// Limits, shared by the browser (which makes the pictures) and the server (which checks them).
export const PAGE_MAX_EDGE = 2000; // the longest side of a page picture, in pixels
export const PAGE_MIN_EDGE = 200;
export const PAGE_MAX_BYTES = 1_500_000; // one JPEG
export const PAGES_PER_REQUEST = 6; // a few pages a request, under the host's 4.5 MB body limit
export const MAX_FILES_PER_UPLOAD = 500;
export const MAX_PAGES_PER_FILE = 200;
export const MAX_PAGES_PER_UPLOAD = 1500;
export const MAX_QUESTIONS = 200;
export const MAX_SHEET_PAGES = 40; // a script longer than this is split by the teacher, not sent to the AI whole
export const MAX_MARKING_ATTEMPTS = 3; // the AI's tries at one script before a person asks again

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
};

export type MarkingSetup = { language: MarkingLanguage; guidance: string; choiceCounts: Record<string, number> };

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

export type MarkingOverview = {
  paper: MarkingPaper;
  ready: boolean; // the questions add up and marking may start
  problems: StructureProblem[];
  uploads: MarkingUploadRow[];
  pages: Record<PageState, number>;
  sheets: SheetRow[]; // in roll order, then the scripts matched to no one
  withoutScript: RosterChild[]; // candidates on the roll with no live script, in roll order
  absent: string[]; // of them, already marked absent for every part
  reviewBelow: number; // the school's line, 0 to 1: a question the AI was less sure of flags its script
  ai: { on: boolean; why: 'no_limit' | 'switched_off' | 'no_provider' | null; pagesThisMonth: number; limit: number | null };
};

export type SheetPage = { pageId: string; position: number; url: string; width: number; height: number; state: PageState };

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
  pages: SheetPage[];
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
  setup: { language: MarkingLanguage; guidance: string; choiceCounts: Record<string, number> };
  questions: Omit<MarkingQuestion, 'questionId'>[];
};
export type SheetChangeInput = {
  questions?: { questionId: string; marks?: number | null; note?: string | null; errorType?: ErrorType | null }[];
  strengths?: string | null;
  improve?: string | null;
  practice?: { unitId: string | null; text: string }[];
};
export type StartUploadInput = { mode: UploadMode; files: number };
export type StartUploadResult = { uploadId: string };
// One page picture, as multipart form fields: uploadId, fileNo, pageNo, and the JPEG as `page`.
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
