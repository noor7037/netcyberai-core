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
};

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
export type SchoolSyllabus = { subjects: { name: string; chapters: { title: string; topics: string[] }[] }[] };

// A connect code as the office reads it once: eight letters and digits in two groups of four, no 0/O/1/I.
export const CONNECT_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const CONNECT_CODE_DAYS = 7;
