import type { IconName } from '@/components/visual/Icons';
import type { Tone } from '@/lib/semantic';

// Free tools on the public website. Every tool runs entirely in the
// visitor's browser: nothing typed or uploaded is sent to NetCyberAI.
// Each exists because a school needs it whether or not it ever becomes
// a customer, and each mirrors a real product rule (the import checker
// reuses src/lib/import/rules.ts; the message builders follow the
// one-to-one, never-a-group WhatsApp rule).

export type FreeToolSlug = 'student-import-checker' | 'attendance-calculator' | 'fee-reminder-message' | 'daily-pulse-message';

export interface FreeTool {
  slug: FreeToolSlug;
  name: string;
  menuBlurb: string;
  icon: IconName;
  tone: Tone;
  title: string;
  description: string;
  heroLead: string;
}

export const freeTools: FreeTool[] = [
  {
    slug: 'student-import-checker',
    name: 'Student Import Checker',
    menuBlurb: 'Check a student list for errors before you move it anywhere.',
    icon: 'check',
    tone: 'success',
    title: 'Free Student Import Checker',
    description:
      'Check your student list CSV for missing names, wrong dates and duplicate admission numbers before any import. It runs in your browser; nothing is uploaded.',
    heroLead:
      'Moving student records from a register or spreadsheet is where most school data problems start. Paste or open your CSV here and see every missing name, badly written date and duplicate admission number, row by row. The check runs in your browser, so your students’ details never leave your computer.',
  },
  {
    slug: 'attendance-calculator',
    name: 'Attendance Calculator',
    menuBlurb: 'How many more days a student needs to reach 75 percent.',
    icon: 'attendance',
    tone: 'product',
    title: 'Free Attendance Percentage Calculator',
    description:
      'Work out a student’s attendance percentage, how many more days they must attend to reach a target such as 75 percent, or how many they can still miss.',
    heroLead:
      'Enter the days a student has attended and the working days so far, then choose a target such as the 75 percent many boards expect. The calculator shows the current percentage, how many days in a row the student must attend to reach the target, and how many days can still be missed safely.',
  },
  {
    slug: 'fee-reminder-message',
    name: 'Fee Reminder Message',
    menuBlurb: 'A polite English and Hinglish fee reminder for one family.',
    icon: 'fees',
    tone: 'action',
    title: 'Free Fee Reminder Message Builder',
    description:
      'Write a polite, clear fee reminder for one family in English and Hinglish, ready to copy into WhatsApp. No shaming language, and never for a group chat.',
    heroLead:
      'A fee reminder works best when it is short, polite and sent to one family at a time. Fill in the student, month, amount and due date, and this tool writes a respectful message in English and Hinglish that you can copy into WhatsApp. It never names a child in a group or compares families.',
  },
  {
    slug: 'daily-pulse-message',
    name: 'Daily Pulse Message',
    menuBlurb: 'Turn today’s lessons into a short parent update.',
    icon: 'pulse',
    tone: 'intelligence',
    title: 'Free Daily Learning Update Builder',
    description:
      'Turn what a class learned today into a short parent update in English and Hinglish, with one question to ask at home for each subject. Copy it into WhatsApp.',
    heroLead:
      'Parents want to know what their child learned today, not a long notice. Add each subject, the topic taught and one question a parent can ask at dinner. The builder writes a short update in English and Hinglish that ends with a simple way for the parent to say how well their child understood.',
  },
];

export function findFreeTool(slug: string): FreeTool | undefined {
  return freeTools.find((t) => t.slug === slug);
}
