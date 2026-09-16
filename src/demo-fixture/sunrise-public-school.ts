// Concept-demo fixture data. This file is the single allowlisted
// exception to the no-invented-data rule (Constitution §9) — everything
// here is fictional and exists only to illustrate how the product works.
// The school name is generic and archetypal (a common pattern across
// many unrelated Indian schools), not a reference to any real
// institution, student, or family.

export const demoSchool = {
  name: 'Sunrise Public School',
  location: 'Palwal, Haryana',
};

export type FeeStatus = 'paid' | 'partial' | 'pending' | 'overdue';

export interface DemoStudent {
  id: string;
  name: string;
  rollNo: string;
  attendancePercent: number;
  feeStatus: FeeStatus;
  feeBalancePaise: number;
  concession?: string;
}

export const demoClassName = '8-A';

export const demoStudents: DemoStudent[] = [
  { id: 's1', name: 'Aryan Sharma', rollNo: '01', attendancePercent: 92, feeStatus: 'paid', feeBalancePaise: 0 },
  { id: 's2', name: 'Diya Verma', rollNo: '02', attendancePercent: 96, feeStatus: 'paid', feeBalancePaise: 0 },
  { id: 's3', name: 'Rohan Kumar', rollNo: '03', attendancePercent: 68, feeStatus: 'overdue', feeBalancePaise: 150000 },
  { id: 's4', name: 'Fatima Khan', rollNo: '04', attendancePercent: 88, feeStatus: 'partial', feeBalancePaise: 80000 },
  { id: 's5', name: 'Gurpreet Singh', rollNo: '05', attendancePercent: 94, feeStatus: 'paid', feeBalancePaise: 0, concession: 'Sibling concession' },
  { id: 's6', name: 'Simran Kaur', rollNo: '06', attendancePercent: 90, feeStatus: 'paid', feeBalancePaise: 0 },
  { id: 's7', name: 'Imran Ali', rollNo: '07', attendancePercent: 73, feeStatus: 'pending', feeBalancePaise: 220000 },
  { id: 's8', name: 'Priya Yadav', rollNo: '08', attendancePercent: 97, feeStatus: 'paid', feeBalancePaise: 0 },
];

export const demoPrincipal = { name: 'Kavita Sharma', role: 'Principal' };
export const demoTeacher = { name: 'Anjali Mehta', role: `Class Teacher, ${demoClassName}`, subject: 'Science' };
export const demoParent = { name: 'Rakesh Verma', childId: 's2' }; // parent of Diya Verma

export const demoFeeStructure = [
  { head: 'Tuition', amountPaise: 180000, frequency: 'monthly' as const },
  { head: 'Transport', amountPaise: 90000, frequency: 'monthly' as const },
  { head: 'Annual Charges', amountPaise: 350000, frequency: 'annual' as const },
];

export interface DemoCertificateRequest {
  id: string;
  studentName: string;
  certType: 'Transfer Certificate' | 'Bonafide Certificate' | 'Character Certificate';
  stage: 'applied' | 'finance_clearance' | 'remarks' | 'principal_signed' | 'delivered';
}

export const demoCertificateRequests: DemoCertificateRequest[] = [
  { id: 'c1', studentName: 'Rohan Kumar', certType: 'Transfer Certificate', stage: 'finance_clearance' },
  { id: 'c2', studentName: 'Simran Kaur', certType: 'Bonafide Certificate', stage: 'principal_signed' },
];

export const demoTeacherImpact = {
  teacherName: demoTeacher.name,
  subject: demoTeacher.subject,
  classAvgAttendance: 91,
  syllabusCompletionPercent: 78,
  parentFeedbackOutOf5: 4.3,
};

export const demoRecognitionEvents = [
  { studentId: 's4', studentName: 'Fatima Khan', type: 'personal_best' as const, note: 'Improved Maths marks by 12 points since last fortnight.' },
  { studentId: 's8', studentName: 'Priya Yadav', type: 'personal_best' as const, note: 'Improved attendance from 89% to 97%.' },
];

export type ExceptionState = 'taught' | 'delayed' | 'partial' | 'not_taught';

export interface DemoPulseMessage {
  date: string;
  subject: string;
  topic: string;
  exceptionState: ExceptionState;
  bodyHinglish: string;
}

export const demoPulseMessages: DemoPulseMessage[] = [
  {
    date: '2026-09-15',
    subject: 'Science',
    topic: 'Photosynthesis',
    exceptionState: 'taught',
    bodyHinglish: 'Aaj Class 8-A mein Science ka topic tha "Photosynthesis". Ghar par poochiye: paudhe khana kaise banate hain?',
  },
  {
    date: '2026-09-14',
    subject: 'Maths',
    topic: 'Fractions',
    exceptionState: 'partial',
    bodyHinglish: 'Aaj Class 8-A mein Maths ka topic "Fractions" shuru hua, poora nahi hua. Kal continue hoga.',
  },
];

// Validated in the WhatsApp Business Platform interactive-reply-button
// character limit review — do not lengthen these without re-checking
// against Meta's current limit.
export const demoComprehensionTiers = [
  { tier: 1, label: 'Samajh nahi aaya' },
  { tier: 2, label: 'Thoda samjha' },
  { tier: 3, label: 'Achhe se samjha' },
];

export const demoWeeklyBrief = {
  weekOf: '2026-09-08',
  bodyHinglish:
    'Is hafte Class 8-A mein yeh hua: Science mein photosynthesis, Maths mein fractions, aur Hindi mein ek kahani padhi gayi. Ghar par poochiye: (1) Paudhe khana kaise banate hain? (2) Aadha aur chauthai mein kya farak hai? (3) Kahani ka sabse pasandida hissa kaun sa tha?',
};

export const demoForm6Advisory = {
  cpiConfigured: false,
};
