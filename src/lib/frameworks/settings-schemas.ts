import type { ModuleId } from '@/lib/contracts/modules';
import type { ModuleSettingsSchema } from '@/lib/contracts/settings';
import { DEFAULT_EXAM_TYPES } from '@/lib/contracts/exam-types';

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
    version: 7,
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
      // c225: the RTE claim desk's setting (fees.rte_claim_heads, C223-A answer 4). A field of the fees schema, since a
      // module has one schema; its words are in the c225 blocks of en.ts and hi.ts. Read by src/lib/rte/desk.ts.
      {
        key: 'rte_claim_heads',
        label: 'Fee heads counted in an RTE claim',
        help: 'Which of the school’s fees make up the fee an RTE claim is compared with. A one-time fee, such as an admission fee, is never counted. Check your state’s notification. Claims already raised keep their fee.',
        section: 'RTE claims',
        type: 'select',
        default: 'rte_covered',
        options: [
          { value: 'rte_covered', label: 'Every recurring head an RTE child does not pay' },
          { value: 'rte_covered_mandatory', label: 'Only those of them every child pays' },
        ],
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
    // Version 2 (C229): the most periods in a row for one teacher, which the timetable generator keeps to.
    // Version 3 (C231): that limit has no default. The school sets it before the first proposal; until then the
    // generator makes none, and nothing stands in for the number. A school that kept the old default (12, no limit)
    // stored nothing, so it now has no limit set and is asked for one; a number a school chose is kept.
    version: 3,
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
      {
        key: 'max_consecutive',
        label: 'Most periods in a row for one teacher',
        help: 'The timetable generator never gives a teacher more periods than this one after another, from 1 to 12. At 12 there is no limit. There is no default: set it before the first proposal. The timetable already published does not change.',
        section: 'School day',
        type: 'number',
        default: null,
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
        help: 'Marks become a reason to look when a child’s percent in their latest published exam fell by at least this many points from their own exam before it, from 1 to 100. A child is compared only with themselves.',
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
    version: 2,
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
        help: 'How many days back homework and Daily Pulse replies are counted, today included, from 7 to 366. Exams are counted from the first one published.',
        section: 'Period',
        type: 'number',
        default: 90,
        min: 7,
        max: 366,
        required: true,
        editableBy: OFFICE,
        affectsExistingRecords: false,
      },
      // Version 2 (C352): the two lines of "kinds of mistake that keep coming back", worked out from the child's own
      // approved answer-sheet marks. Topics, chapters and progress add no line of their own: progress uses the trend
      // line above, against the child's own previous exam.
      {
        key: 'mistake_min_questions',
        label: 'A kind of mistake seen in at least this many answers',
        help: 'On the Learning Genome, a kind of mistake (a slip in a calculation, an answer left unfinished and the like) is listed as coming back when it cost the child marks in at least this many answers, from 2 to 50.',
        section: 'Answer sheets',
        type: 'number',
        default: 3,
        min: 2,
        max: 50,
        required: true,
        editableBy: OFFICE,
        affectsExistingRecords: false,
      },
      {
        key: 'mistake_min_papers',
        label: 'and across at least this many papers',
        help: 'The answers must come from at least this many different papers, so one hard paper does not look like a habit, from 1 to 20.',
        section: 'Answer sheets',
        type: 'number',
        default: 2,
        min: 1,
        max: 20,
        required: true,
        editableBy: OFFICE,
        affectsExistingRecords: false,
      },
    ],
  },
  // p6-9e end
  // p6-9f begin
  // p6-9f end
  // c347 begin
  // AI answer-sheet marking (docs/35, C347, C351, C352): the school's own switch and lines. The plan's monthly page
  // limit (Control) and Control's AI tasks decide whether the school may use it at all; these only narrow it.
  {
    moduleId: 'exams',
    version: 3, // 2: script_days (C230-AG); 3: exam_types (C230-AJ)
    fields: [
      {
        key: 'ai_marking_on',
        label: 'AI marks answer sheets',
        help: 'On: teachers may upload a class’s answer sheets for the AI to mark, and then check and approve every mark themselves. Off: nobody uploads answer sheets, and marks are typed as before.',
        section: 'AI marking',
        type: 'boolean',
        default: true,
        required: true,
        editableBy: OFFICE,
        affectsExistingRecords: false,
      },
      {
        key: 'review_below',
        label: 'Ask the teacher to check a script when the AI is less sure than this, in every 100',
        help: 'A script with any answer the AI was less sure of than this is flagged, and must be checked and approved on its own, from 50 to 95.',
        section: 'AI marking',
        type: 'number',
        default: 75,
        min: 50,
        max: 95,
        required: true,
        editableBy: OFFICE,
        affectsExistingRecords: false,
      },
      {
        key: 'families_see_scripts',
        label: 'Families see the checked answer sheets',
        help: 'On: once a class’s result is published, its linked families and the private result link show each paper’s checked pages, the marks of every question and the teacher’s notes, for their own child only. Off: families see the published marks only.',
        section: 'Families',
        type: 'boolean',
        default: true,
        required: true,
        editableBy: OFFICE,
        affectsExistingRecords: false,
      },
      {
        key: 'children_see_results',
        label: 'Children see their own published results in the Family app',
        help: 'On: a linked child’s own view shows their published results, checked answer sheets (when families see them) and what to practise. Off: only the parent sees them.',
        section: 'Families',
        type: 'boolean',
        default: true,
        required: true,
        editableBy: OFFICE,
        affectsExistingRecords: false,
      },
      {
        // C230-AJ part 2 (C357): the school's own exam types; each exam names one (src/lib/exams/exam-types.ts).
        key: 'exam_types',
        label: 'Exam types',
        help: 'The kinds of exam this school holds, in English and Hindi. Rename, hide or add one; each exam names one type. “Other” is always kept.',
        section: 'Exams',
        type: 'list',
        default: DEFAULT_EXAM_TYPES.map((t) => ({ ...t })),
        min: 1,
        max: 30,
        columns: [
          { key: 'key', label: 'Short code', type: 'text' },
          { key: 'en', label: 'Name in English', type: 'text' },
          { key: 'hi', label: 'Name in Hindi', type: 'text' },
          { key: 'hidden', label: 'Hidden', type: 'boolean' },
        ],
        required: true,
        editableBy: OFFICE,
        affectsExistingRecords: false,
      },
      {
        // C230-AJ (was C230-AG's 90 days): how long a paper's page pictures are kept (retention.ts).
        key: 'script_days',
        label: 'Keep the answer-sheet pictures for this many days',
        help: 'From 30 to 365, counted from the result’s publication, or, while no result is in force, from the last upload or the result’s reopening, whichever is later. Then the pictures of the checked pages are deleted, for families and the school alike; the marks, each question’s marks and the teacher’s notes stay as the school’s record. The marking screen says so seven days before.',
        section: 'Families',
        type: 'number',
        default: 45,
        min: 30,
        max: 365,
        required: true,
        editableBy: OFFICE,
        affectsExistingRecords: true,
      },
      {
        key: 'support_below',
        label: 'A child may need support below this percent on a paper',
        help: 'In a paper’s class view, children whose approved marks are below this percent are listed for the teacher, in roll order and never ranked, from 0 to 100.',
        section: 'Learning',
        type: 'number',
        default: 40,
        min: 0,
        max: 100,
        required: true,
        editableBy: OFFICE,
        affectsExistingRecords: false,
      },
    ],
  },
  // c347 end
  // c212-pricing begin
  // c212-pricing end
  // p7-10a begin
  {
    // Admissions (C221): when an enquiry has "gone quiet". The default is the website tracker's QUIET_DAYS_DEFAULT
    // (src/lib/free-tools/admissions-tracker.ts); test/admissions/admissions.test.ts holds the two together.
    moduleId: 'admissions',
    version: 1,
    fields: [
      {
        key: 'quiet_days',
        label: 'Gone quiet after this many days without contact',
        help: 'An open enquiry with no contact for this many days or more is listed under “Gone quiet”, from 1 to 90. A contact is the enquiry being recorded, a note of what happened, or a move of stage.',
        section: 'Follow-ups',
        type: 'number',
        default: 14,
        min: 1,
        max: 90,
        required: true,
        editableBy: OFFICE,
        affectsExistingRecords: false,
      },
    ],
  },
  // p7-10a end
  // p7-10b begin
  // p7-10b end
  // p7-10c begin
  // p7-10c end
  // p7-10d begin
  {
    // The compliance desk's teacher register (C227): the rules of the website's Teacher qualification and TET register
    // (src/lib/free-tools/teacher-register.ts). The defaults are the tool's defaultRegisterSettings() and the window
    // options its WINDOWS; test/compliance/register.test.ts holds them together. Read with the tool's own
    // cleanRegisterSettings (src/lib/compliance/register-rules.ts registerSettingsOf).
    moduleId: 'compliance',
    version: 1,
    fields: [
      {
        key: 'expiry_window',
        label: 'Show certificates ending within',
        help: 'A TET certificate or another approval with a valid-until date within this many days, or already passed, is listed on the compliance desk and on My Day. A blank valid-until date is no end date.',
        section: 'Teacher qualifications',
        type: 'select',
        default: '90',
        options: [
          { value: '30', label: '30 days' },
          { value: '60', label: '60 days' },
          { value: '90', label: '90 days' },
        ],
        required: true,
        editableBy: OFFICE,
        affectsExistingRecords: false,
      },
      // Each stage's requirements, one on/off setting each (the generated Settings screen has an editor for on/off).
      ...(
        [
          ['pre', 'Pre-primary'],
          ['primary', 'Primary (I–V)'],
          ['upper', 'Upper primary (VI–VIII)'],
          ['secondary', 'Secondary (IX–X)'],
          ['senior', 'Senior secondary (XI–XII)'],
        ] as const
      ).flatMap(([stage, stageLabel]) =>
        (
          [
            ['degree', 'Degree', 'A degree'],
            ['professional', 'Professional qualification (B.Ed, D.El.Ed or other)', 'A professional qualification (B.Ed, D.El.Ed or other)'],
            ['tet', 'TET', 'A TET'],
            ['pg', 'Postgraduate degree', 'A postgraduate degree'],
          ] as const
        ).map(([rule, ruleLabel, what]) => ({
          key: `${stage}_${rule}`,
          label: `${stageLabel}: ${ruleLabel}`,
          help: `${what} is needed to teach this stage: a teacher of the stage with none recorded is listed as a gap on the compliance desk. TET starts on for classes I to VIII, as the NCTE requires under the RTE Act; check your board’s and state’s rules for the rest.`,
          section: 'Teacher qualifications',
          type: 'boolean' as const,
          default: rule === 'tet' && (stage === 'primary' || stage === 'upper'),
          editableBy: OFFICE,
          affectsExistingRecords: false,
        }))
      ),
    ],
  },
  // p7-10d end
  // p7-10e begin
  {
    // Documents and certificates (C232 part A, C230-A): whether a certificate of each type waits for the fee clearance.
    // Off for the transfer certificate: the rule for holding a TC for fees differs by state, and the founder decides
    // with the lawyer; on for the other three. The school switches each knowingly. The defaults are CLEARANCE_DEFAULTS
    // (src/lib/documents/certificate-rules.ts) and public.certificate_needs_clearance(), which the issuing trigger
    // reads; test/documents/closeout.test.ts holds the three together.
    moduleId: 'documents',
    version: 1,
    fields: (
      [
        ['transfer', 'Transfer certificate', false],
        ['bonafide', 'Bonafide certificate', true],
        ['character', 'Character certificate', true],
        ['study', 'Study certificate', true],
      ] as const
    ).map(([type, name, on]) => ({
      key: `clearance_${type}`,
      label: `${name}: fee clearance`,
      help:
        type === 'transfer'
          ? 'When on, a transfer certificate waits until nothing is owed, the fee counter clears it, or the principal waives it with a reason. The rule for holding a TC for fees differs from state to state: switch this on only if your state’s rules allow it, and knowingly.'
          : 'When on, this certificate waits until nothing is owed, the fee counter clears it, or the principal waives it with a reason. When off, it is issued whatever is owed, and the register says the clearance was not asked.',
      section: 'Fee clearance',
      type: 'boolean' as const,
      default: on,
      editableBy: OFFICE,
      affectsExistingRecords: false,
    })),
  },
  // p7-10e end
  // p7-10f begin
  // p7-10f end
  // p7-10g begin
  // p7-10g end
  // c224 begin
  // c224 end
  // c225 begin
  // c225 end
  // c226 begin
  // c226 end
];

export function settingsSchemaFor(moduleId: ModuleId): ModuleSettingsSchema | null {
  return SETTINGS_SCHEMAS.find((s) => s.moduleId === moduleId) ?? null;
}
