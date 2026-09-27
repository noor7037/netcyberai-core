// The seven school documents the free certificate studio makes, with the
// fields each needs. Every value lives only in the page's memory while
// the visitor works (see CertificateStudio): nothing here is stored.

export type CertType = 'transfer' | 'bonafide' | 'character' | 'marksheet' | 'study' | 'fee-receipt' | 'achievement';
export type TemplateId = 'classic' | 'formal' | 'modern' | 'celebration';

export interface CertField {
  id: string;
  label: string;
  kind: 'text' | 'date' | 'number' | 'textarea' | 'select';
  required?: boolean;
  options?: string[];
  help?: string;
  max?: number; // max characters
}

export interface CertTable {
  id: string;
  label: string;
  columns: { id: string; label: string; kind: 'text' | 'number' }[];
  maxRows: number;
}

export interface CertDef {
  type: CertType;
  slug: string;
  name: string;
  docTitle: string;
  numberField: string; // the field holding the certificate number
  personField: string; // the field holding the student's or recipient's name
  fields: CertField[];
  tables?: CertTable[];
  templates: TemplateId[];
}

export const TEMPLATE_NAMES: Record<TemplateId, { name: string; note: string }> = {
  classic: { name: 'Classic', note: 'Black and white, double border' },
  formal: { name: 'Formal', note: 'Black and white, centred crest' },
  modern: { name: 'Modern', note: 'Navy and blue accents' },
  celebration: { name: 'Celebration', note: 'Full brand colours' },
};

// School details shared by every document.
export const SCHOOL_FIELDS: CertField[] = [
  { id: 'schoolName', label: 'School name', kind: 'text', required: true, max: 90 },
  { id: 'affiliation', label: 'Affiliation number', kind: 'text', max: 40 },
  { id: 'schoolCode', label: 'School code', kind: 'text', max: 40 },
  { id: 'address', label: 'Address', kind: 'text', max: 140 },
  { id: 'phone', label: 'Phone', kind: 'text', max: 40 },
  { id: 'email', label: 'Email', kind: 'text', max: 80 },
  { id: 'place', label: 'Place (printed beside the date)', kind: 'text', max: 40 },
];

const CONDUCT = ['Excellent', 'Very Good', 'Good', 'Satisfactory'];
const SIGN: CertField[] = [
  { id: 'signName', label: 'Signatory name', kind: 'text', max: 60 },
  { id: 'signTitle', label: 'Signatory designation', kind: 'text', max: 40 },
];

export const CERT_DEFS: CertDef[] = [
  {
    type: 'transfer',
    slug: 'transfer-certificate-generator',
    name: 'Transfer Certificate',
    docTitle: 'Transfer Certificate',
    numberField: 'number',
    personField: 'studentName',
    templates: ['classic', 'formal'],
    fields: [
      { id: 'number', label: 'TC number', kind: 'text', required: true, max: 30 },
      { id: 'admissionNo', label: 'Admission number', kind: 'text', required: true, max: 30 },
      { id: 'studentName', label: 'Name of the student', kind: 'text', required: true, max: 80 },
      { id: 'fatherName', label: 'Father’s or guardian’s name', kind: 'text', required: true, max: 80 },
      { id: 'motherName', label: 'Mother’s name', kind: 'text', max: 80 },
      { id: 'dob', label: 'Date of birth', kind: 'date', required: true, help: 'Printed in figures and in words.' },
      { id: 'gender', label: 'Gender', kind: 'select', options: ['', 'Female', 'Male', 'Other'] },
      { id: 'nationality', label: 'Nationality', kind: 'text', max: 30 },
      { id: 'category', label: 'Category', kind: 'select', options: ['', 'General', 'OBC', 'SC', 'ST', 'EWS', 'Other'] },
      { id: 'admissionDate', label: 'Date of first admission', kind: 'date' },
      { id: 'admissionClass', label: 'Class at first admission', kind: 'text', max: 30 },
      { id: 'lastClass', label: 'Class last studied', kind: 'text', required: true, max: 40 },
      { id: 'boardResult', label: 'Last board or school exam and result', kind: 'text', max: 90 },
      { id: 'promotion', label: 'Qualified for promotion to a higher class', kind: 'text', max: 60, help: 'For example: Yes, to Class 9' },
      { id: 'workingDays', label: 'Total working days', kind: 'number' },
      { id: 'daysPresent', label: 'Days present', kind: 'number' },
      { id: 'dues', label: 'All dues paid', kind: 'select', options: ['', 'Yes', 'No'] },
      { id: 'concession', label: 'Fee concession, if any', kind: 'text', max: 60 },
      { id: 'scholarship', label: 'Scholarship, if any', kind: 'text', max: 60 },
      { id: 'activities', label: 'Games and activities', kind: 'text', max: 90 },
      { id: 'conduct', label: 'General conduct', kind: 'select', options: ['', ...CONDUCT] },
      { id: 'lastAttendance', label: 'Date of last attendance', kind: 'date' },
      { id: 'applicationDate', label: 'Date of application for certificate', kind: 'date' },
      { id: 'issueDate', label: 'Date of issue', kind: 'date', required: true },
      { id: 'reason', label: 'Reason for leaving', kind: 'text', required: true, max: 90 },
      { id: 'remarks', label: 'Any other remarks', kind: 'text', max: 120 },
      ...SIGN,
    ],
  },
  {
    type: 'bonafide',
    slug: 'bonafide-certificate-generator',
    name: 'Bonafide Certificate',
    docTitle: 'Bonafide Certificate',
    numberField: 'number',
    personField: 'studentName',
    templates: ['classic', 'formal', 'modern'],
    fields: [
      { id: 'number', label: 'Certificate number', kind: 'text', required: true, max: 30 },
      { id: 'studentName', label: 'Student name', kind: 'text', required: true, max: 80 },
      { id: 'admissionNo', label: 'Admission number', kind: 'text', required: true, max: 30 },
      { id: 'dob', label: 'Date of birth', kind: 'date' },
      { id: 'parentName', label: 'Father’s or guardian’s name', kind: 'text', required: true, max: 80 },
      { id: 'relation', label: 'Student is the', kind: 'select', options: ['son', 'daughter', 'ward'] },
      { id: 'className', label: 'Class', kind: 'text', required: true, max: 20 },
      { id: 'section', label: 'Section', kind: 'text', max: 10 },
      { id: 'year', label: 'Academic year', kind: 'text', required: true, max: 20 },
      { id: 'status', label: 'Enrollment status', kind: 'select', options: ['is a bonafide student', 'was a bonafide student'] },
      { id: 'purpose', label: 'Purpose', kind: 'text', required: true, max: 90, help: 'For example: opening a bank account' },
      { id: 'issueDate', label: 'Date of issue', kind: 'date', required: true },
      ...SIGN,
    ],
  },
  {
    type: 'character',
    slug: 'character-certificate-generator',
    name: 'Character and Conduct Certificate',
    docTitle: 'Character Certificate',
    numberField: 'number',
    personField: 'studentName',
    templates: ['classic', 'formal'],
    fields: [
      { id: 'number', label: 'Certificate number', kind: 'text', required: true, max: 30 },
      { id: 'studentName', label: 'Student name', kind: 'text', required: true, max: 80 },
      { id: 'admissionNo', label: 'Admission number', kind: 'text', max: 30 },
      { id: 'parentName', label: 'Father’s or guardian’s name', kind: 'text', max: 80 },
      { id: 'className', label: 'Class', kind: 'text', max: 20 },
      { id: 'period', label: 'Academic period at the school', kind: 'text', required: true, max: 40, help: 'For example: 2019-20 to 2025-26' },
      { id: 'conduct', label: 'Conduct', kind: 'select', required: true, options: ['', ...CONDUCT] },
      { id: 'participation', label: 'Participation in school activities', kind: 'text', max: 120 },
      { id: 'discipline', label: 'Disciplinary remarks', kind: 'text', max: 120, help: 'Leave blank to print “No disciplinary action is on record.”' },
      { id: 'purpose', label: 'Purpose', kind: 'text', max: 90 },
      { id: 'issueDate', label: 'Date of issue', kind: 'date', required: true },
      ...SIGN,
    ],
  },
  {
    type: 'marksheet',
    slug: 'report-card-generator',
    name: 'Marksheet and Report Card',
    docTitle: 'Report Card',
    numberField: 'rollNo',
    personField: 'studentName',
    templates: ['classic', 'formal', 'modern'],
    fields: [
      { id: 'examName', label: 'Exam name', kind: 'text', required: true, max: 50 },
      { id: 'year', label: 'Academic year', kind: 'text', required: true, max: 20 },
      { id: 'studentName', label: 'Student name', kind: 'text', required: true, max: 80 },
      { id: 'admissionNo', label: 'Admission number', kind: 'text', max: 30 },
      { id: 'rollNo', label: 'Roll number', kind: 'text', required: true, max: 20 },
      { id: 'dob', label: 'Date of birth', kind: 'date' },
      { id: 'className', label: 'Class', kind: 'text', required: true, max: 20 },
      { id: 'section', label: 'Section', kind: 'text', max: 10 },
      { id: 'grades', label: 'Grade scale (grade:lowest percentage)', kind: 'text', max: 120, help: 'Change to your board’s or school’s scale.' },
      { id: 'passPercent', label: 'Pass mark in each subject (percentage of maximum)', kind: 'number' },
      { id: 'attendance', label: 'Attendance', kind: 'text', max: 30, help: 'For example: 182 of 196 days' },
      { id: 'teacherRemarks', label: 'Class teacher’s remarks', kind: 'text', max: 140 },
      { id: 'principalRemarks', label: 'Principal’s remarks', kind: 'text', max: 140 },
      { id: 'issueDate', label: 'Date of issue', kind: 'date', required: true },
      { id: 'teacherName', label: 'Class teacher name', kind: 'text', max: 60 },
      ...SIGN,
    ],
    tables: [
      {
        id: 'subjects',
        label: 'Subjects and marks',
        maxRows: 14,
        columns: [
          { id: 'subject', label: 'Subject', kind: 'text' },
          { id: 'max', label: 'Maximum', kind: 'number' },
          { id: 'theory', label: 'Theory', kind: 'number' },
          { id: 'practical', label: 'Practical', kind: 'number' },
        ],
      },
    ],
  },
  {
    type: 'study',
    slug: 'study-certificate-generator',
    name: 'Study and Enrollment Certificate',
    docTitle: 'Study Certificate',
    numberField: 'number',
    personField: 'studentName',
    templates: ['classic', 'formal', 'modern'],
    fields: [
      { id: 'number', label: 'Certificate number', kind: 'text', required: true, max: 30 },
      { id: 'studentName', label: 'Student name', kind: 'text', required: true, max: 80 },
      { id: 'admissionNo', label: 'Admission number', kind: 'text', required: true, max: 30 },
      { id: 'dob', label: 'Date of birth', kind: 'date' },
      { id: 'parentName', label: 'Parent’s or guardian’s name', kind: 'text', required: true, max: 80 },
      { id: 'relation', label: 'Student is the', kind: 'select', options: ['son', 'daughter', 'ward'] },
      { id: 'className', label: 'Class', kind: 'text', required: true, max: 20 },
      { id: 'section', label: 'Section', kind: 'text', max: 10 },
      { id: 'year', label: 'Academic year', kind: 'text', required: true, max: 20 },
      { id: 'admissionDate', label: 'Date of admission', kind: 'date' },
      { id: 'status', label: 'Status', kind: 'select', options: ['is studying', 'studied'] },
      { id: 'purpose', label: 'Purpose', kind: 'text', required: true, max: 90 },
      { id: 'issueDate', label: 'Date of issue', kind: 'date', required: true },
      ...SIGN,
    ],
  },
  {
    type: 'fee-receipt',
    slug: 'fee-receipt-generator',
    name: 'Fee Payment Receipt',
    docTitle: 'Fee Receipt',
    numberField: 'number',
    personField: 'studentName',
    templates: ['classic', 'formal', 'modern'],
    fields: [
      { id: 'number', label: 'Receipt number', kind: 'text', required: true, max: 30 },
      { id: 'studentName', label: 'Student name', kind: 'text', required: true, max: 80 },
      { id: 'admissionNo', label: 'Admission number', kind: 'text', max: 30 },
      { id: 'className', label: 'Class', kind: 'text', max: 20 },
      { id: 'parentName', label: 'Parent’s name', kind: 'text', max: 80 },
      { id: 'year', label: 'Academic year', kind: 'text', max: 20 },
      { id: 'discount', label: 'Discount', kind: 'number' },
      { id: 'lateFee', label: 'Late fee', kind: 'number' },
      { id: 'paid', label: 'Amount paid', kind: 'number', required: true },
      { id: 'mode', label: 'Payment mode', kind: 'select', options: ['Cash', 'UPI', 'Card', 'Cheque', 'Bank transfer', 'Demand draft'] },
      { id: 'transactionId', label: 'Transaction or cheque number', kind: 'text', max: 40 },
      { id: 'paymentDate', label: 'Payment date', kind: 'date', required: true },
      { id: 'cashier', label: 'Received by (cashier)', kind: 'text', max: 60 },
      ...SIGN,
    ],
    tables: [
      {
        id: 'heads',
        label: 'Fee heads',
        maxRows: 12,
        columns: [
          { id: 'head', label: 'Fee head', kind: 'text' },
          { id: 'amount', label: 'Amount', kind: 'number' },
        ],
      },
    ],
  },
  {
    type: 'achievement',
    slug: 'achievement-certificate-generator',
    name: 'Achievement and Participation Certificate',
    docTitle: 'Certificate of Achievement',
    numberField: 'number',
    personField: 'recipientName',
    templates: ['celebration', 'modern', 'classic'],
    fields: [
      { id: 'kind', label: 'Certificate type', kind: 'select', options: ['Achievement', 'Participation', 'Merit', 'Excellence', 'Improvement', 'Appreciation'] },
      { id: 'number', label: 'Certificate number', kind: 'text', max: 30 },
      { id: 'recipientName', label: 'Student or teacher name', kind: 'text', required: true, max: 80 },
      { id: 'recipientRole', label: 'Recipient is a', kind: 'select', options: ['Student', 'Teacher'] },
      { id: 'className', label: 'Class (students)', kind: 'text', max: 20 },
      { id: 'award', label: 'Award or position', kind: 'text', max: 60, help: 'For example: First Prize, Most Improved' },
      { id: 'event', label: 'Event or reason', kind: 'text', required: true, max: 90 },
      { id: 'level', label: 'Level', kind: 'select', options: ['', 'Class', 'School', 'Inter-school', 'District', 'State', 'National', 'International'] },
      { id: 'eventDate', label: 'Event date', kind: 'date' },
      { id: 'year', label: 'Academic year', kind: 'text', max: 20 },
      { id: 'organizer', label: 'Organised by', kind: 'text', max: 80 },
      { id: 'issueDate', label: 'Date of issue', kind: 'date', required: true },
      { id: 'sign2Name', label: 'Second signatory name (optional)', kind: 'text', max: 60 },
      { id: 'sign2Title', label: 'Second signatory designation', kind: 'text', max: 40 },
      ...SIGN,
    ],
  },
];

export function findCertDef(typeOrSlug: string): CertDef | undefined {
  return CERT_DEFS.find((d) => d.type === typeOrSlug || d.slug === typeOrSlug);
}

export type CertValues = Record<string, string>;
export type CertRows = Record<string, Record<string, string>[]>;

// A processed image as a data URL (never an uploaded file) and its
// width/height ratio, used by the fit rules.
export interface CertImage {
  src: string;
  aspect: number;
}

export interface CertDoc {
  def: CertDef;
  template: TemplateId;
  values: CertValues; // school + document fields
  rows: CertRows;
  images: { logo?: CertImage; signature?: CertImage; stamp?: CertImage }; // memory only
  options: { stampBox: boolean; qr: boolean };
}

export function missingRequired(doc: CertDoc): string[] {
  const all = [...SCHOOL_FIELDS, ...doc.def.fields];
  const missing = all.filter((f) => f.required && !(doc.values[f.id] ?? '').trim()).map((f) => f.label);
  for (const t of doc.def.tables ?? []) {
    const rows = (doc.rows[t.id] ?? []).filter((r) => Object.values(r).some((x) => (x ?? '').trim()));
    if (rows.length === 0) missing.push(t.label);
  }
  return missing;
}
