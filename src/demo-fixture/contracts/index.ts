// NON-REAL fixtures for every contract in src/lib/contracts (Decision Log
// C110). For the Experience lane to build screens before the APIs exist,
// and for tests. Every export is wrapped in fixture(): `nonReal: true` and a
// notice a screen must show. No real school, person, phone or number.
import {
  buildNavigation,
  fixture,
  type BulkActionDefinition,
  type BulkPreview,
  type BulkRun,
  type CategoryChart,
  type KpiTile,
  type ListDefinition,
  type ListPage,
  type ModuleId,
  type ModuleSettingsSchema,
  type Navigation,
  type OnboardingTemplate,
  type SavedView,
  type SchoolEntitlements,
  type SchoolSettings,
  type ShareChart,
  type StudentSearchResponse,
  type TimeSeriesChart,
} from '@/lib/contracts';
import { MODULE_IDS } from '@/lib/contracts/modules';

const SCHOOL_ID = '00000000-0000-4000-8000-00000000f001';
const PRINCIPAL_ID = '00000000-0000-4000-8000-00000000f002';
const FOUNDER_ID = '00000000-0000-4000-8000-00000000f003';

// ---- entitlements and navigation ------------------------------------------------

const allOn = Object.fromEntries(MODULE_IDS.map((id) => [id, { enabled: true, source: 'plan' as const }])) as Record<ModuleId, { enabled: true; source: 'plan' }>;

export const entitlementsFixture = fixture<SchoolEntitlements>({
  schoolId: SCHOOL_ID,
  plan: 'illustrative-plan',
  accessMode: 'full',
  modules: {
    ...allOn,
    payroll: { enabled: false, source: 'plan' },
    twin: { enabled: false, source: 'founder_override', overriddenBy: FOUNDER_ID, overriddenAt: '2026-09-01T09:00:00Z' },
    students: { enabled: true, source: 'plan', limits: { students: 1500 } },
  },
});

export const principalNavigationFixture = fixture<Navigation>(
  buildNavigation('principal', entitlementsFixture.data, {
    admissions: { kind: 'count', value: 12, tone: 'action' },
    attendance: { kind: 'percent', value: 94.1, tone: 'success' },
    complaints: { kind: 'count', value: 2, tone: 'alert' },
    'raise-ticket': { kind: 'new' },
  })
);

export const teacherNavigationFixture = fixture<Navigation>(buildNavigation('teacher', entitlementsFixture.data));

// ---- settings --------------------------------------------------------------------

export const attendanceSettingsSchemaFixture = fixture<ModuleSettingsSchema>({
  moduleId: 'attendance',
  version: 1,
  fields: [
    { key: 'working_days', label: 'Working days', section: 'Calendar', type: 'weekdays', default: ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'], editableBy: ['principal', 'school_admin'] },
    { key: 'mark_by', label: 'Mark attendance by', section: 'Marking', type: 'time', default: '10:00', editableBy: ['principal', 'school_admin'], help: 'After this time, the class shows as not marked.' },
    {
      key: 'codes',
      label: 'Attendance codes',
      section: 'Marking',
      type: 'list',
      min: 2,
      columns: [
        { key: 'code', label: 'Code', type: 'text' },
        { key: 'label', label: 'Meaning', type: 'text' },
        { key: 'counts_present', label: 'Counts as present', type: 'boolean' },
      ],
      default: [
        { code: 'P', label: 'Present', counts_present: true },
        { code: 'A', label: 'Absent', counts_present: false },
        { code: 'L', label: 'Late', counts_present: true },
        { code: 'LV', label: 'On leave', counts_present: false },
      ],
      editableBy: ['principal', 'school_admin'],
      affectsExistingRecords: true,
    },
    { key: 'absence_alert', label: 'Tell parents about an absence', section: 'Parents', type: 'boolean', default: true, editableBy: ['principal'] },
    {
      key: 'alert_language',
      label: 'Alert language',
      section: 'Parents',
      type: 'select',
      default: 'hinglish',
      options: [
        { value: 'english', label: 'English' },
        { value: 'hindi', label: 'Hindi' },
        { value: 'hinglish', label: 'Hinglish' },
      ],
      editableBy: ['principal', 'school_admin'],
    },
  ],
});

export const attendanceSettingsFixture = fixture<SchoolSettings>({
  schoolId: SCHOOL_ID,
  moduleId: 'attendance',
  schemaVersion: 1,
  values: { mark_by: '09:30' },
  revision: 3,
  updatedAt: '2026-09-15T04:30:00Z',
});

export const onboardingTemplateFixture = fixture<OnboardingTemplate>({
  id: 'illustrative-cbse-k12',
  name: 'CBSE, Nursery to Class 12 (illustrative)',
  board: 'CBSE',
  levels: ['pre_primary', 'primary', 'middle', 'secondary', 'senior_secondary'],
  classes: [
    { name: 'Nursery', sections: ['A'] },
    { name: 'Class 1', sections: ['A', 'B'] },
    { name: 'Class 10', sections: ['A', 'B'] },
  ],
  subjects: [
    { name: 'English', classes: ['Class 1', 'Class 10'] },
    { name: 'Mathematics', classes: ['Class 1', 'Class 10'] },
    { name: 'Science', classes: ['Class 10'] },
  ],
  settings: { attendance: { mark_by: '10:00' } },
  version: 1,
});

// ---- filters and saved views --------------------------------------------------------

export const studentListFixture = fixture<ListDefinition>({
  listId: 'students',
  moduleId: 'students',
  searchPlaceholder: 'Name, admission no. or parent phone',
  defaultSort: [{ field: 'display_name', dir: 'asc' }],
  fields: [
    { key: 'display_name', label: 'Name', type: 'text', sortable: true, column: { defaultVisible: true } },
    { key: 'admission_no', label: 'Admission no.', type: 'text', sortable: true, column: { defaultVisible: true } },
    { key: 'class_id', label: 'Class', type: 'reference', optionsFrom: 'classes', quick: true, column: { defaultVisible: true } },
    { key: 'section_id', label: 'Section', type: 'reference', optionsFrom: 'sections', quick: true, column: { defaultVisible: true } },
    {
      key: 'status',
      label: 'Status',
      type: 'enum',
      quick: true,
      options: [
        { value: 'active', label: 'Active' },
        { value: 'alumni', label: 'Alumni' },
        { value: 'transferred', label: 'Transferred' },
      ],
      column: { defaultVisible: true },
    },
    { key: 'date_of_birth', label: 'Date of birth', type: 'date', sortable: true, column: { defaultVisible: false } },
    { key: 'cf:house', label: 'House', type: 'enum', custom: true, options: [{ value: 'red', label: 'Red' }, { value: 'blue', label: 'Blue' }], column: { defaultVisible: false } },
  ],
});

export const savedViewFixture = fixture<SavedView>({
  viewId: '00000000-0000-4000-8000-00000000f010',
  listId: 'students',
  name: 'Class 10, active, by name',
  scope: 'school',
  ownerUserId: PRINCIPAL_ID,
  defaultForRoles: ['school_admin'],
  query: {
    filter: {
      combinator: 'and',
      conditions: [
        { field: 'class_id', op: 'in', value: ['illustrative-class-10'] },
        { field: 'status', op: 'in', value: ['active'] },
      ],
    },
    sort: [{ field: 'display_name', dir: 'asc' }],
    columns: ['display_name', 'admission_no', 'section_id'],
    pageSize: 50,
  },
  createdAt: '2026-09-10T06:00:00Z',
  updatedAt: '2026-09-10T06:00:00Z',
});

export const studentPageFixture = fixture<ListPage<{ studentId: string; displayName: string; admissionNo: string; className: string; section: string }>>({
  rows: [
    { studentId: '00000000-0000-4000-8000-00000000f101', displayName: 'Aarav Example', admissionNo: 'ILL-0001', className: 'Class 10', section: 'A' },
    { studentId: '00000000-0000-4000-8000-00000000f102', displayName: 'Diya Example', admissionNo: 'ILL-0002', className: 'Class 10', section: 'B' },
  ],
  total: 2,
  nextCursor: null,
});

// ---- bulk actions ---------------------------------------------------------------------------

export const bulkActionFixture = fixture<BulkActionDefinition>({
  actionId: 'students.promote',
  moduleId: 'students',
  listId: 'students',
  label: 'Promote to next class',
  confirmTitle: 'Promote {count} students?',
  confirmBody: 'Each student moves to the next class for the new session. You can undo this for 10 minutes.',
  allowedRoles: ['principal', 'school_admin'],
  params: [{ key: 'session_id', label: 'New session', type: 'select', options: [{ value: 'illustrative-session', label: '2027–28' }] }],
  destructive: false,
  undoWindowSeconds: 600,
  syncLimit: 200,
});

export const bulkPreviewFixture = fixture<BulkPreview>({
  previewId: '00000000-0000-4000-8000-00000000f201',
  actionId: 'students.promote',
  count: 2,
  firstRows: [
    { id: '00000000-0000-4000-8000-00000000f101', label: 'Aarav Example', change: 'Class 10 A → Class 11 A' },
    { id: '00000000-0000-4000-8000-00000000f102', label: 'Diya Example', change: 'Class 10 B → Class 11 B' },
  ],
  warnings: [],
  runsAsJob: false,
  expiresAt: '2026-09-30T10:15:00Z',
});

export const bulkRunFixture = fixture<BulkRun>({
  runId: '00000000-0000-4000-8000-00000000f202',
  actionId: 'students.promote',
  status: 'succeeded',
  total: 2,
  done: 2,
  failed: 0,
  failures: [],
  startedBy: PRINCIPAL_ID,
  startedAt: '2026-09-30T10:05:00Z',
  finishedAt: '2026-09-30T10:05:01Z',
  undoUntil: '2026-09-30T10:15:01Z',
});

// ---- Student 360 search ------------------------------------------------------------------------

export const studentSearchFixture = fixture<StudentSearchResponse>({
  tookMs: 42,
  results: [
    {
      studentId: '00000000-0000-4000-8000-00000000f101',
      displayName: 'Aarav Example',
      admissionNo: 'ILL-0001',
      className: 'Class 10',
      section: 'A',
      rollNo: '7',
      status: 'active',
      matchedOn: 'name',
      href: '/app/students/00000000-0000-4000-8000-00000000f101',
    },
    {
      studentId: '00000000-0000-4000-8000-00000000f103',
      displayName: 'Kabir Example',
      admissionNo: 'ILL-0003',
      className: 'Class 6',
      section: 'A',
      rollNo: null,
      status: 'active',
      matchedOn: 'guardian_phone',
      guardianPhoneLast4: '0000',
      href: '/app/students/00000000-0000-4000-8000-00000000f103',
    },
  ],
});

// ---- charts ------------------------------------------------------------------------------------

export const kpiTilesFixture = fixture<KpiTile[]>([
  { kind: 'kpi', id: 'students', label: 'Students', value: 640, unit: 'count', drillHref: '/app/students' },
  {
    kind: 'kpi',
    id: 'attendance_today',
    label: 'Present today',
    value: 94.1,
    unit: 'percent',
    trend: { direction: 'up', delta: 1.2, unit: 'percent', comparedTo: 'last week', good: 'up' },
    drillHref: '/app/attendance',
  },
  { kind: 'kpi', id: 'fees_due', label: 'Fees due this month', value: null, unit: 'inr_paise' },
]);

export const attendanceTrendFixture = fixture<TimeSeriesChart>({
  kind: 'time_series',
  id: 'attendance_trend',
  title: 'Attendance this week',
  unit: 'percent',
  granularity: 'day',
  target: 90,
  series: [
    {
      id: 'school',
      label: 'Whole school',
      points: [
        { t: '2026-09-21', v: 92.5 },
        { t: '2026-09-22', v: 93.8 },
        { t: '2026-09-23', v: null },
        { t: '2026-09-24', v: 94.1 },
      ],
    },
  ],
});

export const classCoverageFixture = fixture<CategoryChart>({
  kind: 'category',
  id: 'syllabus_coverage',
  title: 'Syllabus covered by class',
  unit: 'percent',
  orientation: 'horizontal',
  categories: ['Class 6', 'Class 8', 'Class 10'],
  series: [{ id: 'coverage', label: 'Covered', values: [48, 52, null] }],
});

export const feeShareFixture = fixture<ShareChart>({
  kind: 'share',
  id: 'fee_status',
  title: 'Fee status this term',
  unit: 'count',
  slices: [
    { id: 'paid', label: 'Paid', value: 410 },
    { id: 'partial', label: 'Part paid', value: 120 },
    { id: 'due', label: 'Due', value: 110 },
  ],
});
