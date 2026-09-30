// Custom fields (17 §1a; built in P1-b, Decision Log C112). A school adds
// typed fields to Student, Guardian, Staff and Admission lead; they appear
// in forms, filters (key 'cf:<fieldId>'), imports, exports and reports.
// Only the office defines them and reads or writes their values.

export const CUSTOM_FIELD_ENTITIES = ['student', 'guardian', 'staff', 'admission_lead'] as const;
export type CustomFieldEntity = (typeof CUSTOM_FIELD_ENTITIES)[number];

export const CUSTOM_FIELD_TYPES = ['text', 'number', 'date', 'list', 'boolean'] as const;
export type CustomFieldType = (typeof CUSTOM_FIELD_TYPES)[number];

export type CustomFieldDefinition = {
  fieldId: string;
  entity: CustomFieldEntity;
  key: string; // 'snake_case', fixed once created
  label: string;
  type: CustomFieldType; // fixed once created
  options?: readonly string[]; // list only
  required: boolean;
  archived: boolean; // archived fields keep their values but leave forms and filters
};

export type CustomFieldValue = string | number | boolean;

export type CustomFieldCreate = Pick<CustomFieldDefinition, 'entity' | 'key' | 'label' | 'type' | 'required'> & { options?: readonly string[] };
export type CustomFieldPatch = Partial<Pick<CustomFieldDefinition, 'label' | 'required' | 'archived'>> & { options?: readonly string[] };

// Values of one record: null clears a value.
export type CustomFieldValuesUpdate = {
  entity: CustomFieldEntity;
  recordId: string;
  values: Readonly<Record<string, CustomFieldValue | null>>; // keyed by fieldId
};

export const MAX_CUSTOM_FIELDS_PER_ENTITY = 50;

export function customFieldFilterKey(fieldId: string): string {
  return `cf:${fieldId}`;
}
