import { Checker, bi, n, rn, rows, str, type ToolSpec } from '../engine';
import { num, type ReportSection } from '../report';
import { EMPTY_REPORT, ceilSafe, floorSafe, picker } from './common';

// Reference norms shown beside the result, never enforced as law.
// Source: CBSE Affiliation Bye-Laws 2018, infrastructure section
// (https://www.cbse.gov.in/cbsenew/aff_bye_laws.html, checkedOn:
// 2026-09-27): classroom at least 8 m x 6 m (about 500 sq ft), an
// optimum of 40 students per section, and 1 sq m of built-up floor area
// per student. CBSE revises these bye-laws; the page says to check the
// current version.
export const CBSE_REFERENCE = { classroomSqft: 500, sectionSize: 40, sqmPerStudent: 1 } as const;
const SQFT_PER_SQM = 10.7639;

const F = {
  classrooms: bi('Classrooms available', 'Uplabdh classrooms'),
  roomArea: bi('Average classroom area', 'Classroom ka ausat area'),
  unit: bi('Area unit', 'Area ki unit'),
  usable: bi('Usable share of floor area', 'Istemaal layak floor area'),
  perStudent: bi('Floor area per student', 'Har student ke liye floor area'),
  sectionSize: bi('Most students per section', 'Ek section mein zyada se zyada students'),
  periods: bi('Teaching periods per section per week', 'Har section ke hafte ke periods'),
  load: bi('Teaching periods per teacher per week', 'Har teacher ke hafte ke periods'),
  grades: bi('Enrollment by class', 'Class ke hisaab se enrollment'),
};

export const capacitySpec: ToolSpec = {
  slug: 'school-capacity-planner',
  rulesUpdated: '27 September 2026',
  groups: [
    {
      title: bi('Rooms', 'Kamre'),
      fields: [
        { kind: 'number', id: 'classrooms', label: F.classrooms, suffix: 'count', min: 1 },
        {
          kind: 'select',
          id: 'unit',
          label: F.unit,
          options: [
            { value: 'sqft', label: bi('Square feet', 'Square feet') },
            { value: 'sqm', label: bi('Square metres', 'Square metre') },
          ],
        },
        { kind: 'number', id: 'roomArea', label: F.roomArea, min: 1, help: bi('Reference norm: about 500 sq ft (8 m x 6 m) per classroom.', 'Reference norm: lagbhag 500 sq ft (8 m x 6 m) har classroom.') },
        { kind: 'number', id: 'usable', label: F.usable, suffix: 'percent', min: 1, max: 100, help: bi('The floor left after furniture, walls and walkways.', 'Furniture, deewar aur raaste ke baad bacha floor.') },
        { kind: 'number', id: 'perStudent', label: F.perStudent, min: 0.1, step: 0.1, help: bi('In the unit chosen above. Reference norm: 1 sq m (10.76 sq ft).', 'Upar chuni unit mein. Reference norm: 1 sq m (10.76 sq ft).') },
        { kind: 'number', id: 'sectionSize', label: F.sectionSize, suffix: 'students', min: 1, help: bi('Reference norm: 40.', 'Reference norm: 40.') },
      ],
    },
    {
      title: bi('Teaching', 'Padhai'),
      fields: [
        { kind: 'number', id: 'periods', label: F.periods, suffix: 'periods', min: 1 },
        { kind: 'number', id: 'load', label: F.load, suffix: 'periods', min: 1 },
      ],
    },
    {
      title: bi('Students', 'Students'),
      fields: [
        {
          kind: 'rows',
          id: 'grades',
          label: F.grades,
          addLabel: bi('Add class', 'Class jodein'),
          maxRows: 20,
          columns: [
            { id: 'grade', label: bi('Class', 'Class'), kind: 'text' },
            { id: 'current', label: bi('Enrolled now', 'Abhi enrolled'), kind: 'number', min: 0 },
            { id: 'incoming', label: bi('Expected new', 'Naye expected'), kind: 'number', min: 0 },
          ],
        },
      ],
    },
  ],
  defaults: { classrooms: '', unit: 'sqft', roomArea: '', usable: '85', perStudent: '10.76', sectionSize: '40', periods: '48', load: '30', grades: [{ grade: '', current: '', incoming: '' }] },

  compute(v, lang) {
    const p = picker(lang);
    const c = new Checker(lang);
    const rooms = c.num(n(v, 'classrooms'), F.classrooms, { min: 1, int: true });
    const unit = str(v, 'unit') === 'sqm' ? 'sqm' : 'sqft';
    const area = c.num(n(v, 'roomArea'), F.roomArea, { min: 1 });
    const usable = c.num(n(v, 'usable'), F.usable, { min: 1, max: 100 });
    const per = c.num(n(v, 'perStudent'), F.perStudent, { min: 0.1 });
    const size = c.num(n(v, 'sectionSize'), F.sectionSize, { min: 1, int: true });
    const periods = c.num(n(v, 'periods'), F.periods, { min: 1 });
    const load = c.num(n(v, 'load'), F.load, { min: 1 });
    const grades = rows(v, 'grades')
      .map((r) => ({ grade: (r.grade ?? '').trim(), current: rn(r, 'current'), incoming: rn(r, 'incoming') }))
      .filter((g) => g.grade || Number.isFinite(g.current) || Number.isFinite(g.incoming));
    if (grades.length === 0) c.add('Add at least one class with its enrollment.', 'Kam se kam ek class aur uska enrollment jodein.');
    grades.forEach((g, i) => {
      if (!Number.isFinite(g.current) || g.current < 0) c.add(`Row ${i + 1}: enter the students enrolled now.`, `Row ${i + 1}: abhi ke enrolled students bhariye.`);
      if (Number.isFinite(g.incoming) && g.incoming < 0) c.add(`Row ${i + 1}: new students cannot be negative.`, `Row ${i + 1}: naye students minus mein nahi ho sakte.`);
    });
    if (c.errors.length) return { errors: c.errors, report: EMPTY_REPORT };

    const areaSqft = unit === 'sqft' ? area : area * SQFT_PER_SQM;
    const perSqm = unit === 'sqm' ? per : per / SQFT_PER_SQM;
    const byArea = floorSafe((area * (usable / 100)) / per);
    const seatsPerRoom = Math.min(byArea, size);
    const capacity = seatsPerRoom * rooms;
    const data = grades.map((g, i) => {
      const students = g.current + (Number.isFinite(g.incoming) ? g.incoming : 0);
      const sections = students > 0 ? ceilSafe(students / seatsPerRoom) : 0;
      return { name: g.grade || p(`Class ${i + 1}`, `Class ${i + 1}`), students, sections, avg: sections ? students / sections : 0 };
    });
    const enrolled = data.reduce((a, d) => a + d.students, 0);
    const sections = data.reduce((a, d) => a + d.sections, 0);
    const available = capacity - enrolled;
    const roomGap = sections - rooms;
    const teachers = ceilSafe((sections * periods) / load);

    const warnings: string[] = [];
    if (roomGap > 0) warnings.push(p(`${roomGap} more section${roomGap > 1 ? 's' : ''} than classrooms. Plan a shift, more rooms or fewer admissions.`, `Classrooms se ${roomGap} section zyada hain. Shift, naye kamre ya kam admission ki yojana banayein.`));
    if (available < 0) warnings.push(p(`Enrollment is ${num(-available)} over the safe seating capacity.`, `Enrollment surakshit seats se ${num(-available)} zyada hai.`));
    if (areaSqft < CBSE_REFERENCE.classroomSqft) warnings.push(p(`The average classroom (${num(areaSqft)} sq ft) is below the ${CBSE_REFERENCE.classroomSqft} sq ft reference norm.`, `Ausat classroom (${num(areaSqft)} sq ft) ${CBSE_REFERENCE.classroomSqft} sq ft reference norm se chhota hai.`));
    if (perSqm < CBSE_REFERENCE.sqmPerStudent) warnings.push(p('The floor area per student is below the 1 sq m reference norm.', 'Har student ka floor area 1 sq m reference norm se kam hai.'));
    if (byArea < size) warnings.push(p(`Room area, not section size, is the limit: each room seats ${byArea}.`, `Section size nahi, kamre ka area seema hai: har kamre mein ${byArea} seats.`));

    const sectionsOut: ReportSection[] = [
      {
        kind: 'stats',
        items: [
          { label: p('Safe seats per classroom', 'Har classroom mein surakshit seats'), value: num(seatsPerRoom), note: p(`area allows ${byArea}, section limit ${size}`, `area se ${byArea}, section seema ${size}`) },
          { label: p('Maximum capacity', 'Adhiktam kshamta'), value: num(capacity), note: p(`${rooms} classrooms, one section each`, `${rooms} classrooms, har ek mein ek section`) },
          { label: p('Students (now + expected)', 'Students (abhi + expected)'), value: num(enrolled) },
          { label: p('Seats available', 'Khaali seats'), value: num(available), tone: available >= 0 ? 'good' : 'bad' },
          { label: p('Sections required', 'Zaroori sections'), value: num(sections), tone: roomGap > 0 ? 'bad' : 'good', note: p(`${rooms} classrooms`, `${rooms} classrooms`) },
          { label: p('Teachers required (teaching load)', 'Zaroori teachers (teaching load)'), value: num(teachers), note: p(`${sections} sections × ${periods} periods ÷ ${load}`, `${sections} sections × ${periods} periods ÷ ${load}`) },
        ],
      },
      {
        kind: 'table',
        heading: p('Sections by class', 'Class ke hisaab se sections'),
        columns: [p('Class', 'Class'), p('Students', 'Students'), p('Sections', 'Sections'), p('Average per section', 'Section mein ausat')],
        rows: data.map((d) => [d.name, num(d.students), num(d.sections), num(d.avg, 1)]),
        numeric: [false, true, true, true],
      },
    ];
    if (warnings.length) sectionsOut.push({ kind: 'notes', heading: p('Capacity warnings', 'Capacity chetavni'), tone: 'warn', items: warnings });
    sectionsOut.push({
      kind: 'text',
      heading: p('Reference norms', 'Reference norms'),
      text: p(
        'CBSE Affiliation Bye-Laws 2018 describe a classroom of at least 8 m x 6 m (about 500 sq ft), an optimum of 40 students per section and 1 sq m of floor area per student. These are shown for reference only. Check the current bye-laws of your board and your state’s rules; this is not legal advice.',
        'CBSE Affiliation Bye-Laws 2018 mein classroom kam se kam 8 m x 6 m (lagbhag 500 sq ft), ek section mein 40 students aur har student ke liye 1 sq m floor area bataya gaya hai. Ye sirf reference ke liye hai. Apne board ke current bye-laws aur rajya ke niyam dekhein; ye kanooni salah nahi hai.'
      ),
    });

    return {
      errors: [],
      report: {
        title: p('School Capacity and Section Plan', 'School Capacity aur Section Plan'),
        subtitle: p(`${rooms} classrooms · ${grades.length} classes`, `${rooms} classrooms · ${grades.length} classes`),
        sections: sectionsOut,
        assumptions: [
          p('Each classroom holds one section at a time (no shifts).', 'Har classroom mein ek samay par ek section (koi shift nahi).'),
          p('Every classroom has about the average area entered.', 'Har classroom ka area lagbhag bhare gaye ausat jitna hai.'),
          p('Teachers needed = sections × weekly periods ÷ periods one teacher takes. Subject specialists may raise this.', 'Zaroori teachers = sections × hafte ke periods ÷ ek teacher ke periods. Subject specialists se ye badh sakta hai.'),
        ],
        disclaimer: p(
          'A planning estimate from your inputs. Reference norms are not legal advice; your board, state and local building rules decide what is allowed.',
          'Aapke inputs se planning anumaan. Reference norms kanooni salah nahi hain; board, rajya aur sthaniya building niyam hi tay karte hain.'
        ),
      },
    };
  },
};
