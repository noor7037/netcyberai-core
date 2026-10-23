// The internal demo pilot's school (W2 item 1, C324): fictional, with synthetic people only. "NetCyberAI Demo School",
// CBSE, English medium with Hindi support, one Class 6 section. The demo.setup job (src/lib/jobs/demo-setup.ts) builds
// it on the test database through the app's own functions. The two inboxes it uses (the teacher's invitation and the
// parent's record) come in the job's payload, never from here. Fixed ids, so a second run changes nothing.

const id = (n: number) => `d6000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;

export const DEMO_SCHOOL = {
  schoolId: id(0x1),
  name: 'NetCyberAI Demo School',
  board: 'CBSE',
  jurisdiction: 'IN-DL',
} as const;

export const DEMO_CLASS = { classId: id(0x61), name: '6-A', grade: '6', section: 'A' } as const;

// The five core subjects of a CBSE Class 6. The teacher takes Science and Mathematics.
export const DEMO_SUBJECTS = [
  { subjectId: id(0x101), name: 'Science', taught: true },
  { subjectId: id(0x102), name: 'Mathematics', taught: true },
  { subjectId: id(0x103), name: 'English', taught: false },
  { subjectId: id(0x104), name: 'Hindi', taught: false },
  { subjectId: id(0x105), name: 'Social Science', taught: false },
] as const;

export const DEMO_TEACHER = { displayName: 'Anita Demo' } as const;

// The child's first name is the one the parent gives in the Family app's first steps, so the two records read alike.
export const DEMO_STUDENT = { studentId: id(0x501), admissionNo: 'DEMO-0001', name: 'Aarav Demo', firstName: 'Aarav', rollNo: '1', dob: '2014-06-15' } as const;

// The school sends nothing: the demo school is a pilot whose outbound sending is not approved, so the send-gate
// records any message to this number as blocked.
export const DEMO_PARENT = { parentId: id(0xe01), name: 'Ravi Demo', phone: '9800000601', relation: 'Father' } as const;
