import { parseCsv } from '@/lib/import/csv';

// One-screen school provisioning (W6-E, C230-AU; Decision Log C399): what the Control screen sends, and the rules
// that need no database, so the screen and the route read the same ones. No server-only imports: the screen uses it.

export const PROVISION_GRADES: readonly string[] = ['Nursery', 'LKG', 'UKG', ...Array.from({ length: 12 }, (_, i) => String(i + 1))];
export const MAX_SECTIONS = 8;
export const MAX_TEACHERS = 300;
export const MAX_STUDENT_CSV_CHARS = 2_000_000;
// The columns of the students list. name, class and section are needed; the guardian's phone links a guardian.
export const PROVISION_STUDENT_COLUMNS = ['name', 'class', 'section', 'guardian_phone', 'guardian_name', 'admission_no', 'roll_no', 'dob'] as const;

export type ProvisionTeacher = { name: string; email: string; className: string };
export type ProvisionSession = { label: string; startDate: string; endDate: string };

// The body the screen posts.
export type ProvisionRequest = {
  schoolName: string;
  boardId: string;
  stateCode: string;
  city: string;
  grades: string[];
  sections: number;
  session: ProvisionSession;
  principal: { name: string; email: string };
  teachers: ProvisionTeacher[];
  studentsCsv: string;
  // Set when the founder chose "add to the existing school" after a name match.
  existingSchoolId?: string | null;
  // true: everything is checked and counted in a transaction that is then undone.
  dryRun?: boolean;
};

// The sections a class gets: A, then A and B, and so on.
export const sectionLetters = (count: number): string[] => 'ABCDEFGH'.slice(0, Math.max(1, Math.min(MAX_SECTIONS, Math.floor(count) || 1))).split('');

// The class names made for the chosen grades and sections, in class order: "Nursery-A", "LKG-A", "5-B".
export const provisionClassNames = (grades: readonly string[], sections: number): string[] =>
  PROVISION_GRADES.filter((g) => grades.includes(g)).flatMap((g) => sectionLetters(sections).map((s) => `${g}-${s}`));

// India's school year runs April to March: the session that holds `today` (YYYY-MM-DD), labelled "2026-27".
export function defaultSession(today: string): ProvisionSession {
  const [y, m] = today.split('-').map(Number);
  const start = m >= 4 ? y : y - 1;
  return { label: `${start}-${String((start + 1) % 100).padStart(2, '0')}`, startDate: `${start}-04-01`, endDate: `${start + 1}-03-31` };
}

// A pasted list of teachers, one a line: name, email and (optional) class, comma or tab separated. A first line that
// names the columns is skipped. Lines with no email are kept so the route can say which line is wrong.
export function parseTeacherList(text: string): ProvisionTeacher[] {
  const rows = parseCsv(text.replace(/\t/g, ','))
    .map((cells) => cells.map((c) => c.trim()))
    .filter((cells) => cells.some((c) => c !== ''));
  if (rows[0] && rows[0].some((c) => c.toLowerCase() === 'email')) rows.shift();
  return rows.map(([name = '', email = '', className = '']) => ({ name, email, className }));
}
