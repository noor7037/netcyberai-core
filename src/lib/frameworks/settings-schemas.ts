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
    version: 1,
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
    version: 1,
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
      // Late fee (C158, C163): off unless the school types an amount.
      {
        key: 'late_fee_rupees',
        label: 'Late fee, in rupees',
        help: 'Leave it at 0 for no late fee. With an amount, each fee still unpaid after its due date and the days of grace gets one late-fee line, added at night. Only fees falling due from the day you set this are fined.',
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
        help: 'How many days after the due date a fee may stay unpaid before the late fee is added. It matters only when a late fee is set.',
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
];

export function settingsSchemaFor(moduleId: ModuleId): ModuleSettingsSchema | null {
  return SETTINGS_SCHEMAS.find((s) => s.moduleId === moduleId) ?? null;
}
