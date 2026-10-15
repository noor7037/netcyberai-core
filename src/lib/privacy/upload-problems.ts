// The upload check's refusals (C232 part A, src/lib/privacy/upload-check.ts), each a rule of the error catalogue
// (src/lib/errors/catalogue.ts) with its sentence in English and Hindi. Pure and import-free, so a screen can tell a
// refusal of the check from its own codes and show the catalogue's words.
export const UPLOAD_PROBLEMS = ['upload_aadhaar_number', 'upload_aadhaar_card', 'upload_unreadable'] as const;
export type UploadProblem = (typeof UPLOAD_PROBLEMS)[number];
export const isUploadProblem = (v: unknown): v is UploadProblem => (UPLOAD_PROBLEMS as readonly unknown[]).includes(v);
