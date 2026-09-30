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
];

export function settingsSchemaFor(moduleId: ModuleId): ModuleSettingsSchema | null {
  return SETTINGS_SCHEMAS.find((s) => s.moduleId === moduleId) ?? null;
}
