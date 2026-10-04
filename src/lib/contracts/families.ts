// Sibling mapping (Students module, Decision Log C116). A family is a
// household of students; siblings are the other students of the same
// family. Links are explicit: the server may suggest a sibling from a
// matching guardian phone or email, the office confirms.

export type FamilyRef = { familyId: string; familyCode: string };

export type StudentStatus = 'pending_consent' | 'active' | 'inactive' | 'transferred';

export type SiblingSuggestion = {
  parentId: string;
  guardianName: string;
  relation: string | null;
  matchedOn: 'phone' | 'email';
  phoneLast4: string | null;
  family: FamilyRef | null;
  students: readonly { studentId: string; displayName: string; className: string | null; status: StudentStatus }[];
};

export type FamilyMember = {
  studentId: string;
  displayName: string;
  className: string | null;
  section: string | null;
  status: StudentStatus;
  // 1 = eldest, among the family's active students by date of birth.
  // Computed, never stored; null for a student who is not active, and for
  // a viewer who cannot see the whole family (a teacher).
  siblingOrder: number | null;
  isSelf: boolean;
};

export type FamilyGuardian = {
  parentId: string;
  name: string;
  relation: string | null;
  phoneLast4: string | null;
  childIds: readonly string[];
};

export type FamilyView = {
  family: FamilyRef | null;
  members: readonly FamilyMember[]; // the student first, then siblings in order
  guardians: readonly FamilyGuardian[];
  canManage: boolean; // principal and school admin
};

export type GuardianMergeRecord = {
  mergeId: string;
  keptParentId: string;
  mergedParentId: string;
  merged: { name: string; relation: string | null; phoneLast4: string | null; hasEmail: boolean };
  linksMoved: number;
  linksDropped: number;
  mergedBy: string;
  mergedAt: string;
};

export const MAX_FAMILY_LINK = 20;
