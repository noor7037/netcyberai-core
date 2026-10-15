import type { ListDefinition } from '@/lib/contracts/filters';
import type { ListSpec } from './filter-engine';
import { classSortKeySql } from '@/lib/classes/class-order';

// Every list served by the filter engine (C112). A module adds its list
// here when it is built; saved views, exports and bulk actions all refer
// to a list by its id. Students is the first.

const STUDENTS_DEFINITION: ListDefinition = {
  listId: 'students',
  moduleId: 'students',
  searchPlaceholder: 'Search by name or admission number',
  defaultSort: [{ field: 'name', dir: 'asc' }],
  fields: [
    { key: 'name', label: 'Name', type: 'text', sortable: true, column: { defaultVisible: true } },
    { key: 'admission_no', label: 'Admission no.', type: 'text', sortable: true, column: { defaultVisible: true } },
    { key: 'class', label: 'Class', type: 'reference', optionsFrom: 'classes', quick: true, sortable: true, column: { defaultVisible: true } },
    { key: 'section', label: 'Section', type: 'text', quick: true, sortable: true, column: { defaultVisible: true } },
    { key: 'session', label: 'Session', type: 'reference', optionsFrom: 'sessions', quick: true },
    {
      key: 'status',
      label: 'Status',
      type: 'enum',
      quick: true,
      column: { defaultVisible: true },
      options: [
        { value: 'pending_consent', label: 'Waiting for consent' },
        { value: 'active', label: 'Active' },
        { value: 'inactive', label: 'Inactive' },
        { value: 'transferred', label: 'Transferred' },
      ],
    },
    { key: 'roll_no', label: 'Roll no.', type: 'text', sortable: true, column: { defaultVisible: true } },
    { key: 'dob', label: 'Date of birth', type: 'date', sortable: true, column: { defaultVisible: false } },
    { key: 'created_at', label: 'Added on', type: 'date', sortable: true, column: { defaultVisible: false } },
    // Siblings (C116). Counted among the family's active students.
    { key: 'family_code', label: 'Family no.', type: 'text', sortable: true, column: { defaultVisible: false } },
    { key: 'has_siblings', label: 'Has siblings', type: 'boolean', quick: true },
    { key: 'family_size', label: 'Children in family', type: 'number', sortable: true },
    { key: 'sibling_order', label: 'Sibling order', type: 'number', sortable: true },
  ],
};

// Sibling order: 1 = eldest active student of the family, by date of birth
// (unknown last), then name. The same rule as the family view
// (families.ts, SIBLING_ORDER_SQL). Null outside a family or when inactive.
const ACTIVE_SIBLINGS = `from students sib where sib.school_id = s.school_id and sib.family_id = s.family_id and sib.status = 'active'`;
const SIBLING_ORDER = `case when s.family_id is null or s.status <> 'active' then null else 1 + (select count(*)::int ${ACTIVE_SIBLINGS}
  and (coalesce(sib.dob, 'infinity'::date), lower(sib.name), sib.student_id) < (coalesce(s.dob, 'infinity'::date), lower(s.name), s.student_id)) end`;

export type StudentListRow = {
  id: string;
  name: string;
  admission_no: string | null;
  class_id: string | null;
  class_name: string | null;
  section: string | null;
  roll_no: string | null;
  status: string;
  dob: string | null;
  created_at: string;
  family_code: string | null;
};

const STUDENTS: ListSpec = {
  definition: STUDENTS_DEFINITION,
  from: `students s left join classes c on c.school_id = s.school_id and c.class_id = s.class_id
         left join families fam on fam.school_id = s.school_id and fam.family_id = s.family_id`,
  idExpr: 's.student_id',
  schoolExpr: 's.school_id',
  select: `s.student_id as id, s.name, s.admission_no, s.class_id, c.name as class_name, c.section, s.roll_no,
           s.status::text as status, to_char(s.dob, 'YYYY-MM-DD') as dob, s.created_at, fam.family_code`,
  fields: {
    name: { expr: 's.name', sortExpr: 'lower(s.name)' },
    admission_no: { expr: 's.admission_no', sortExpr: 'lower(s.admission_no)' },
    // By class means the class order (C235-A): Nursery, LKG, UKG, 1 … 12, then section; "10-A" after "2-A".
    class: { expr: 's.class_id::text', sortExpr: classSortKeySql('c') },
    section: { expr: 'c.section', sortExpr: 'lower(c.section)' },
    session: { expr: 'c.session_id::text' },
    status: { expr: 's.status::text' },
    roll_no: { expr: 's.roll_no' },
    dob: { expr: 's.dob' },
    created_at: { expr: 's.created_at' },
    family_code: { expr: 'fam.family_code', sortExpr: 'lower(fam.family_code)' },
    has_siblings: { expr: `(s.family_id is not null and exists (select 1 ${ACTIVE_SIBLINGS} and sib.student_id <> s.student_id))` },
    family_size: { expr: `(case when s.family_id is null then null else (select count(*)::int ${ACTIVE_SIBLINGS}) end)` },
    sibling_order: { expr: `(${SIBLING_ORDER})` },
  },
  searchExprs: ['s.name', 's.admission_no', 'fam.family_code'],
  customEntity: 'student',
};

export const LISTS: readonly ListSpec[] = [STUDENTS];

export function listSpec(listId: unknown): ListSpec | null {
  return LISTS.find((l) => l.definition.listId === listId) ?? null;
}
