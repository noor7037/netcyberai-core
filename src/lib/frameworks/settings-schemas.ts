import type { ModuleId } from '@/lib/contracts/modules';
import type { ModuleSettingsSchema } from '@/lib/contracts/settings';

// Every module's settings schema, in one registry (17 §1a, C112). A module
// adds its schema here when it is built (part of the module definition of
// done, roadmap 16 §3 rule 4); the settings API and the generated screen
// serve only what is registered. Setup is the first: the school's accent
// colour (read by the app shell, PR-3) and its working days (read by
// Attendance and Timetable when they are built, P2).

const OFFICE = ['principal', 'school_admin'] as const;

export const SETTINGS_SCHEMAS: readonly ModuleSettingsSchema[] = [
  {
    moduleId: 'setup',
    version: 2,
    fields: [
      {
        key: 'accent_color',
        label: 'Accent colour',
        help: 'One colour from the NetCyberAI palette, used for your school’s highlights in the app.',
        section: 'Branding',
        type: 'color_token',
        default: 'royal',
        editableBy: OFFICE,
      },
      {
        key: 'parent_language',
        label: 'Language for messages to parents',
        help: 'The language the school writes to parents in when a guardian has not chosen one. A message goes in Hindi only once its Hindi wording has been reviewed; until then it goes in English.',
        section: 'Messages',
        type: 'select',
        default: 'en',
        options: [
          { value: 'en', label: 'English' },
          { value: 'hi', label: 'Hindi' },
        ],
        required: true,
        editableBy: OFFICE,
        affectsExistingRecords: false,
      },
      {
        key: 'working_days',
        label: 'Working days',
        help: 'Days the school is open. Attendance and the timetable use these days.',
        section: 'Calendar',
        type: 'weekdays',
        default: ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'],
        required: true,
        editableBy: OFFICE,
        affectsExistingRecords: false,
      },
    ],
  },
  // Students (C116): the family number format. Changing it affects only
  // families created afterwards; existing numbers never change.
  {
    moduleId: 'students',
    version: 1,
    fields: [
      {
        key: 'family_code_format',
        label: 'Family number format',
        help: 'How new family numbers look. Use {YYYY} or {YY} for the year and {SEQ:4} for a 4-digit counter.',
        section: 'Numbering',
        type: 'numbering',
        default: 'FAM-{YYYY}-{SEQ:4}',
        required: true,
        editableBy: OFFICE,
        affectsExistingRecords: false,
      },
    ],
  },
  // Attendance (C146): how far back the office may enter or correct a day.
  {
    moduleId: 'attendance',
    version: 1,
    fields: [
      {
        key: 'correction_window_days',
        label: 'Days the office may correct',
        help: 'How many days back the principal or school admin may enter or correct attendance, with a reason. Marks from a phone that arrive late within these days wait for the office.',
        section: 'Corrections',
        type: 'number',
        default: 7,
        min: 0,
        max: 60,
        required: true,
        editableBy: OFFICE,
        affectsExistingRecords: false,
      },
    ],
  },
  // Homework Recovery (C152): who is listed for a catch-up plan.
  {
    moduleId: 'recovery',
    version: 1,
    fields: [
      {
        key: 'missed_threshold',
        label: 'Homeworks not done',
        help: 'A student is listed for a catch-up plan after this many homeworks marked “Not done”, from 1 to 10.',
        section: 'Who is listed',
        type: 'number',
        default: 3,
        min: 1,
        max: 10,
        required: true,
        editableBy: OFFICE,
        affectsExistingRecords: false,
      },
      {
        key: 'window_school_days',
        label: 'Within this many school days',
        help: 'How many school days back to look, from 3 to 30. Only the school’s working days are counted.',
        section: 'Who is listed',
        type: 'number',
        default: 10,
        min: 3,
        max: 30,
        required: true,
        editableBy: OFFICE,
        affectsExistingRecords: false,
      },
    ],
  },
  // Fees (C159): the day of the month a due falls on unless the office picks another.
  {
    moduleId: 'fees',
    version: 6,
    fields: [
      {
        key: 'due_day',
        label: 'Day of the month fees are due',
        help: 'The date offered when dues are raised for a month, from 1 to 28. The office can choose another date each time.',
        section: 'Dues',
        type: 'number',
        default: 10,
        min: 1,
        max: 28,
        required: true,
        editableBy: OFFICE,
        affectsExistingRecords: false,
      },
      {
        key: 'receipt_no_format',
        label: 'Receipt number format',
        help: 'How new receipt numbers look. Use {YYYY} or {YY} for the year and {SEQ:5} for a 5-digit counter. Receipts already issued keep their numbers.',
        section: 'Receipts',
        type: 'numbering',
        default: 'RCP-{YYYY}-{SEQ:5}',
        required: true,
        editableBy: OFFICE,
        affectsExistingRecords: false,
      },
      // UPI to the school's own account (C175, C176).
      {
        key: 'upi_email_cap',
        label: 'Emails a day for UPI payments to verify',
        help: 'When the verifiers are emailed for each UPI payment, this is the most that go out in one day, from 1 to 500. Payments beyond it are told in one summary that night.',
        section: 'UPI payments',
        type: 'number',
        default: 20,
        min: 1,
        max: 500,
        required: true,
        editableBy: OFFICE,
        affectsExistingRecords: false,
      },
      // Fee reminders by email to guardians (docs/23 6g, C179): off unless the school switches them on.
      {
        key: 'reminders_enabled',
        label: 'Email fee reminders to guardians',
        help: 'When on, a guardian with an email address is reminded 3 days before a fee is due, on the day, and 7 days after, with the payment link. One email a family a day. No reminder goes while a promise to pay or hardship is open. Where WhatsApp is connected for your school the reminder goes there, and by email otherwise: never both on one day. Off until you switch it on.',
        section: 'Reminders',
        type: 'boolean',
        default: false,
        required: true,
        editableBy: OFFICE,
        affectsExistingRecords: false,
      },
      // Counter UPI and cheques are expected in the bank statement (docs/24 §3.6, C177).
      {
        key: 'bank_unseen_days',
        label: 'Days before a counter UPI or cheque payment not seen in the bank is listed',
        help: 'A payment taken at the counter by UPI, cheque or bank transfer should show in the bank statement. After this many days without it, from 1 to 30, it is listed for the office to look into. The receipt stays valid.',
        section: 'Bank statements',
        type: 'number',
        default: 3,
        min: 1,
        max: 30,
        required: true,
        editableBy: OFFICE,
        affectsExistingRecords: false,
      },
      // The sibling rule (C168): off unless the school switches it on. It only proposes; a person approves.
      {
        key: 'sibling_enabled',
        label: 'Sibling concession',
        help: 'Off: no sibling concession is proposed. On: for brothers and sisters the office has linked as one family, the app proposes a concession for the children chosen below. Each one waits for the principal or the school admin to approve it.',
        section: 'Sibling concession',
        type: 'boolean',
        default: false,
        required: true,
        editableBy: OFFICE,
        affectsExistingRecords: false,
      },
      {
        key: 'sibling_percent',
        label: 'Sibling concession, in percent',
        help: 'How much is taken off, from 0 to 100. It is used only while “Sibling concession” is on.',
        section: 'Sibling concession',
        type: 'number',
        default: 0,
        min: 0,
        max: 100,
        required: true,
        editableBy: OFFICE,
        affectsExistingRecords: false,
      },
      {
        key: 'sibling_child',
        label: 'Which children get it',
        help: 'Counted from the eldest child of the family who is on the rolls.',
        section: 'Sibling concession',
        type: 'select',
        default: 'younger',
        options: [
          { value: 'younger', label: 'Every child after the eldest' },
          { value: 'third_onwards', label: 'The third child onwards' },
        ],
        required: true,
        editableBy: OFFICE,
        affectsExistingRecords: false,
      },
      {
        key: 'sibling_heads',
        label: 'On which fee heads',
        help: 'Either only the heads every child pays, such as tuition, or every head.',
        section: 'Sibling concession',
        type: 'select',
        default: 'mandatory',
        options: [
          { value: 'mandatory', label: 'Only the heads every child pays' },
          { value: 'all', label: 'Every head' },
        ],
        required: true,
        editableBy: OFFICE,
        affectsExistingRecords: false,
      },
      // Late fee (C158, C163, C166): off unless the school switches it on and gives an amount.
      {
        key: 'late_fee_enabled',
        label: 'Charge a late fee',
        help: 'Off: no late fee is ever added. On: each fee still unpaid after its due date and the days of grace gets one late-fee line, added at night as a new due. Only fees falling due from the day you switch this on are fined.',
        section: 'Late fee',
        type: 'boolean',
        default: false,
        required: true,
        editableBy: OFFICE,
        affectsExistingRecords: false,
      },
      {
        key: 'late_fee_rupees',
        label: 'Late fee, in rupees',
        help: 'The amount added once to each overdue fee, in whole rupees. It is used only while “Charge a late fee” is on.',
        section: 'Late fee',
        type: 'number',
        default: 0,
        min: 0,
        max: 100000,
        required: true,
        editableBy: OFFICE,
        affectsExistingRecords: false,
      },
      {
        key: 'late_fee_grace_days',
        label: 'Days of grace before a late fee',
        help: 'How many days after the due date a fee may stay unpaid before the late fee is added. It is used only while “Charge a late fee” is on.',
        section: 'Late fee',
        type: 'number',
        default: 0,
        min: 0,
        max: 90,
        required: true,
        editableBy: OFFICE,
        affectsExistingRecords: false,
      },
    ],
  },
  // Timetable (C145): how many periods a school day has. Lowering it hides
  // nothing: periods already entered beyond it stay until the office clears them.
  {
    moduleId: 'timetable',
    version: 1,
    fields: [
      {
        key: 'periods_per_day',
        label: 'Periods in a day',
        help: 'How many teaching periods a school day has, from 1 to 12. The timetable shows this many.',
        section: 'School day',
        type: 'number',
        default: 8,
        min: 1,
        max: 12,
        required: true,
        editableBy: OFFICE,
        affectsExistingRecords: false,
      },
    ],
  },
  // Early Warning (C209): when attendance gives a reason to look at how a child is getting on. The homework
  // reason uses Homework Recovery's own two settings, and a needs-help follow-up has none. A change is used from
  // the next check: a flag already open is worked out again then, and closes if its reason is gone.
  // The days that must be marked cannot be more than the days looked back: with such numbers attendance could
  // never be a reason for any child, and the school would not be told. Refused, whichever of the two is changed.
  // Version 2 (C218, rule version 2): the two numbers of the marks reason, each comparing a child only with
  // themselves and the grading scheme's pass mark.
  {
    moduleId: 'early-warning',
    version: 2,
    check: (v) => (Number(v.min_marked_days) > Number(v.window_days) ? [{ key: 'min_marked_days', message: 'cannot be more than the days looked back' }] : []),
    fields: [
      {
        key: 'attendance_below',
        label: 'In school on fewer than this many days in every 100',
        help: 'Attendance becomes a reason to look when a child was in school, present or late, on fewer than this many of every 100 days marked, from 1 to 100. Days on recorded leave are left out.',
        section: 'Attendance',
        type: 'number',
        default: 75,
        min: 1,
        max: 100,
        required: true,
        editableBy: OFFICE,
        affectsExistingRecords: true,
      },
      {
        key: 'window_days',
        label: 'Looking back this many days',
        help: 'How many days back attendance is counted, today included, from 7 to 90, and never fewer than the days that must be marked below.',
        section: 'Attendance',
        type: 'number',
        default: 30,
        min: 7,
        max: 90,
        required: true,
        editableBy: OFFICE,
        affectsExistingRecords: true,
      },
      {
        key: 'min_marked_days',
        label: 'Only when at least this many days were marked',
        help: 'Attendance is not used until this many of those days have a mark other than leave, from 1 to 60, and never more than the days looked back above. With fewer days, one or two absences would look larger than they are.',
        section: 'Attendance',
        type: 'number',
        default: 10,
        min: 1,
        max: 60,
        required: true,
        editableBy: OFFICE,
        affectsExistingRecords: true,
      },
      {
        key: 'marks_drop_points',
        label: 'A fall of at least this many points in an exam',
        help: 'Marks become a reason to look when a child’s percent in their latest exam with every paper entered fell by at least this many points from their own exam before it, from 1 to 100. A child is compared only with themselves.',
        section: 'Marks',
        type: 'number',
        default: 15,
        min: 1,
        max: 100,
        required: true,
        editableBy: OFFICE,
        affectsExistingRecords: true,
      },
      {
        key: 'marks_below_pass_subjects',
        label: 'Or below the pass mark in at least this many subjects',
        help: 'Marks are also a reason to look when, in that exam, a child is below the grading scheme’s pass mark in at least this many subjects, from 1 to 12. Absent and exempt are not marks and are left out.',
        section: 'Marks',
        type: 'number',
        default: 2,
        min: 1,
        max: 12,
        required: true,
        editableBy: OFFICE,
        affectsExistingRecords: true,
      },
    ],
  },
  // c210-jobs begin
  // c210-jobs end
  // p6-9a begin
  // p6-9a end
  // p6-9b begin
  // p6-9b end
  // p6-9c begin
  // p6-9c end
  // p6-9d begin
  // p6-9d end
  // p6-9e begin
  // Learning Genome (C217): the lines its rules hold a child against, comparing the child only with themselves.
  // Nothing is stored: a change is used the next time a genome is opened, and the screen shows each line in use.
  {
    moduleId: 'learning-genome',
    version: 1,
    fields: [
      {
        key: 'trend_points',
        label: 'A subject rising or falling by at least this many points',
        help: 'A subject is a strength when the child’s percent rose by at least this many points against their own previous exam in it, and a gap when it fell by as many, from 1 to 50.',
        section: 'Exams',
        type: 'number',
        default: 10,
        min: 1,
        max: 50,
        required: true,
        editableBy: OFFICE,
        affectsExistingRecords: false,
      },
      {
        key: 'spread_points',
        label: 'A subject above or below their own overall by at least this many points',
        help: 'In the child’s latest exam with two subjects or more, a subject this many points above their own overall in that exam is a strength, and as many below is a gap, from 1 to 50.',
        section: 'Exams',
        type: 'number',
        default: 10,
        min: 1,
        max: 50,
        required: true,
        editableBy: OFFICE,
        affectsExistingRecords: false,
      },
      {
        key: 'needs_help_replies',
        label: 'A chapter with at least this many “needs help” replies',
        help: 'A chapter is a gap when the child’s parents replied “needs help” to the Daily Pulse of its taught lessons at least this many times in the days looked back, from 1 to 20.',
        section: 'Daily Pulse',
        type: 'number',
        default: 2,
        min: 1,
        max: 20,
        required: true,
        editableBy: OFFICE,
        affectsExistingRecords: false,
      },
      {
        key: 'understood_replies',
        label: 'A chapter with at least this many “understood” replies',
        help: 'A chapter is a strength when the parents replied “understood” at least this many times and never “needs help”, from 1 to 20.',
        section: 'Daily Pulse',
        type: 'number',
        default: 3,
        min: 1,
        max: 20,
        required: true,
        editableBy: OFFICE,
        affectsExistingRecords: false,
      },
      {
        key: 'homework_done_below',
        label: 'Homework done on fewer than this many in every 100',
        help: 'Homework in a subject is a gap when the child did fewer than this many of every 100 homeworks checked in the days looked back, from 1 to 100.',
        section: 'Homework',
        type: 'number',
        default: 60,
        min: 1,
        max: 100,
        required: true,
        editableBy: OFFICE,
        affectsExistingRecords: false,
      },
      {
        key: 'homework_min_checked',
        label: 'Only when at least this many homeworks were checked',
        help: 'Homework is not used until at least this many of the child’s homeworks in the subject were checked, from 1 to 50. With fewer, one missed homework would look larger than it is.',
        section: 'Homework',
        type: 'number',
        default: 5,
        min: 1,
        max: 50,
        required: true,
        editableBy: OFFICE,
        affectsExistingRecords: false,
      },
      {
        key: 'window_days',
        label: 'Homework and replies over this many days back',
        help: 'How many days back homework and Daily Pulse replies are counted, today included, from 7 to 366. Exams are counted from the first one entered.',
        section: 'Period',
        type: 'number',
        default: 90,
        min: 7,
        max: 366,
        required: true,
        editableBy: OFFICE,
        affectsExistingRecords: false,
      },
    ],
  },
  // p6-9e end
  // p6-9f begin
  // p6-9f end
  // c212-pricing begin
  // c212-pricing end
];

export function settingsSchemaFor(moduleId: ModuleId): ModuleSettingsSchema | null {
  return SETTINGS_SCHEMAS.find((s) => s.moduleId === moduleId) ?? null;
}
