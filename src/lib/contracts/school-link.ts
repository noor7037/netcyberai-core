// School Link's shapes (C230-AA; docs/family-app/03 §4): what the Family app may know of a linked school. Read as the
// guardian the school's office made the connect code for, so only that guardian's own children appear, and only once
// the school's consent ledger allows (the school's parent rules decide). Nothing here is copied into family tables.

export type SchoolDayMark = 'present' | 'absent' | 'late' | 'leave';

export type LinkedSchoolChild = {
  studentId: string;
  name: string;
  className: string;
  // Today's mark, or null when none is recorded yet.
  today: SchoolDayMark | null;
  presentDays: number;
  markedDays: number;
  // Fees owed, in paise; overdue is part of due.
  dueMinor: number;
  overdueMinor: number;
  nextDue: string | null;
  // The homework the school set for the child's class and section (C329): only for a child this app has matched to
  // the student, otherwise null. Read only, as the school shows it to that guardian.
  homework: SchoolHomework[] | null;
  // What the school sent for the child's class or the whole school (C331), for a matched child only, otherwise null:
  // notices the principal approved in the last 30 days, and events the office invited them to, from today on.
  notices: SchoolNotice[] | null;
  events: SchoolEvent[] | null;
  // The class's published timetable (C332), for a matched child only, otherwise null.
  timetable: SchoolPeriod[] | null;
  // The results the school published for the child's class (C333), newest first, for a matched child only, otherwise
  // null. Never a mark still being entered.
  results: SchoolResult[] | null;
  // The Daily Pulse the school sent for the child's class in the last 7 days (C336, R9), newest first, for a matched
  // child only, otherwise null. canAnswer: the school holds the child's consent for messages (C230-AD); without it the
  // Pulse is read only.
  pulse: { items: SchoolPulse[]; canAnswer: boolean } | null;
  // The child's coming exam papers (C351): the open exams' dated papers of the child's class from yesterday on, with
  // the child's own exam number when the exam uses them. For a matched child only, otherwise null.
  examSchedule: SchoolExamPaper[] | null;
};

// One coming paper of the child's exam timetable: the exam and subject in the school's words, the day (yyyy-mm-dd),
// and the child's own exam number (seat number) when the exam uses them.
export type SchoolExamPaper = { exam: string; subject: string; date: string; seatNo: string | null };

// A Daily Pulse as the school sent it (its words never change): the lesson's day (yyyy-mm-dd), the school's English and
// Hindi words, this guardian's answer however it was given (WhatsApp or the app), and whether it can still be answered
// (sent in the last 24 hours, as a WhatsApp answer is tied to its Pulse).
export type PulseAnswer = 'understood' | 'needs_help';
export type SchoolPulse = { pulseId: string; sentOn: string; body: { en: string; hi: string }; answer: PulseAnswer | null; open: boolean };

// A published result, as the report card shows it: each subject's percent and grade by the grading scheme kept with
// the publication (null while a subject's marks are not complete), the overall, the class teacher's remark and the
// co-scholastic grades. A subject whose script the teacher checked and approved (C351) has `checked`: its paper opens
// question by question (SchoolCheckedPaper), while the school lets families see the checked answer sheets.
export type SchoolResult = {
  exam: string;
  term: string | null;
  publishedOn: string;
  subjects: { name: string; percent: number | null; grade: string | null; paperId: string; checked: boolean }[];
  overall: { percent: number | null; grade: string | null };
  remark: string | null;
  coScholastic: { area: string; grade: string }[];
};

// ---- A checked paper (AI answer-sheet marking, C351) -------------------------------------------------------------------
// The child's own approved script of a published paper, as the school published it and only while the publication is
// in force and the school lets families see the checked answer sheets. Only what a family needs: never another child's,
// never a rank, never the answer key, the marking steps, the AI's reasons for the teacher, its confidence, what it read
// on a page, or which provider or model marked it.

// The kind of mistake an answer shows (the teacher's choice when changed, else the AI's), as the marking contract
// names them.
export type SchoolMistake = 'none' | 'concept' | 'calculation' | 'incomplete' | 'presentation' | 'language' | 'misread' | 'not_attempted';

export type SchoolMarkedQuestion = {
  label: string; // as printed: "1", "6(a)"
  question: string | null; // the question as the teacher typed it
  marks: number | null; // the teacher's mark when changed, else the AI's
  max: number;
  counted: boolean; // false: left out by internal choice ("attempt either (a) or (b)")
  note: string | null; // for the child: the teacher's words when changed, else the AI's
  mistake: SchoolMistake | null;
  chapter: string | null;
  topic: string | null;
  // Where the answer is: a page of the script and the band of it (0 top, 1 bottom), for the mark in the margin.
  place: { pageId: string; yFrom: number; yTo: number } | null;
};

// A page picture of the script: its id (fetched through the family's own page route) and its size in pixels.
export type SchoolScriptPage = { pageId: string; width: number; height: number };

export type SchoolCheckedPaper = {
  paperId: string;
  exam: string;
  term: string | null;
  subject: string;
  publishedOn: string;
  // Each part the questions count to (Written, Theory…): the score by the paper's own roll-up, internal choice counted.
  parts: { component: string; name: string; score: number; max: number }[];
  questions: SchoolMarkedQuestion[];
  strengths: string | null;
  improve: string | null;
  practice: { text: string; chapter: string | null; topic: string | null }[];
  pages: SchoolScriptPage[];
};

// One period of the published timetable: ISO weekday (1 is Monday), the period's number, and its subject in the
// school's words.
export type SchoolPeriod = { weekday: number; period: number; subject: string | null };

// A notice as the school sent it (its words never change), and the day it was sent (yyyy-mm-dd, India).
export type SchoolNotice = { body: string; sentOn: string; wholeSchool: boolean };

// An event the school invited the family to: the day (yyyy-mm-dd), its start (HH:MM) when set, and whether the school
// has since cancelled it.
export type SchoolEvent = { title: string; details: string; heldOn: string; startsAt: string | null; cancelled: boolean; wholeSchool: boolean };

// One piece of homework as a linked family reads it: the subject in the school's words, the due day (yyyy-mm-dd), and
// the teacher's done mark for this child when there is one.
export type SchoolHomework = { subject: string | null; title: string; details: string | null; due: string | null; done: boolean | null };

export type LinkedSchool = {
  schoolName: string;
  children: LinkedSchoolChild[];
  // Children of this guardian the school cannot show yet (its consent for their records is not on its ledger).
  awaitingConsent: number;
};

// The school's own syllabus for one student's class, subject by subject, in the school's order (read only).
export type SchoolSyllabus = { subjects: { name: string; chapters: { title: string; topics: string[] }[] }[]; tonight: SchoolTaught[] };

// A topic the child's class covered today (C335, L10), as the teacher recorded it ("taught today", taught or in part),
// with its subject in the school's words and its chapter when the teacher picked it from the school's syllabus. Never the
// teacher's note.
export type SchoolTaught = { subject: string; topic: string; chapter: string | null };

// A connect code as the office reads it once: eight letters and digits in two groups of four, no 0/O/1/I.
export const CONNECT_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const CONNECT_CODE_DAYS = 7;
