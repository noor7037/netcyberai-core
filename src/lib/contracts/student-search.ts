// Student 360 search (17 §3a: "2-second search by name / admission no. /
// parent phone"; API in P1-b, under 300 ms at 5,000 students, Decision
// Log C110). One box, results as the person types.

export type StudentSearchRequest = {
  q: string; // at least 2 characters; digits search admission numbers and phones
  limit?: number; // default 10, maximum 25
};

export type StudentMatchField = 'name' | 'admission_no' | 'guardian_phone' | 'roll_no';

export type StudentSearchResult = {
  studentId: string;
  displayName: string;
  admissionNo: string | null;
  className: string | null;
  section: string | null;
  rollNo: string | null;
  status: 'active' | 'alumni' | 'transferred' | 'inactive';
  matchedOn: StudentMatchField;
  // Only the last four digits, and only when the match was on the phone.
  guardianPhoneLast4?: string;
  href: string; // the Student 360 profile
};

export type StudentSearchResponse = {
  results: readonly StudentSearchResult[];
  tookMs: number; // server time, for the speed budget
};

export const STUDENT_SEARCH_MIN_CHARS = 2;
export const STUDENT_SEARCH_DEFAULT_LIMIT = 10;
export const STUDENT_SEARCH_MAX_LIMIT = 25;
