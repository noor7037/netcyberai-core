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
};

// A published result, as the report card shows it: each subject's percent and grade by the grading scheme kept with
// the publication (null while a subject's marks are not complete), the overall, the class teacher's remark and the
// co-scholastic grades.
export type SchoolResult = {
  exam: string;
  term: string | null;
  publishedOn: string;
  subjects: { name: string; percent: number | null; grade: string | null }[];
  overall: { percent: number | null; grade: string | null };
  remark: string | null;
  coScholastic: { area: string; grade: string }[];
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
