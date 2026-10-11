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
