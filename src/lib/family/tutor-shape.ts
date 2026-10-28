// The shared tutor window's shapes and limits (S2, C375), safe for the phone: no database, store or message file is
// imported here. The server checks every one of them again (src/lib/family/tutor.ts); the phone only checks first, so a
// child is told at once.

import type { Block } from './blocks';

// A file the child attaches: a photo (PNG, JPEG, WebP) or a PDF, at most 10 MB, at most three to one question. The
// private bucket refuses anything else too (supabase/migrations/20261027210308_s2_tutor.sql).
// C230-AR: Attach file shows, and the server takes a file, only while the tutor actually reads what is attached (a
// photo through the vision profile, a PDF's text layer). Until that path works the control is hidden, not shown dead.
export const TUTOR_READS_FILES = false;

export const TUTOR_FILE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'] as const;
export type TutorFileType = (typeof TUTOR_FILE_TYPES)[number];
export const TUTOR_FILE_MAX_BYTES = 10 * 1024 * 1024;
export const TUTOR_FILES_PER_TURN = 3;
export const isTutorFileType = (v: unknown): v is TutorFileType => (TUTOR_FILE_TYPES as readonly unknown[]).includes(v);

// The question box takes what Understand takes.
export const TUTOR_TEXT_MIN = 3;
export const TUTOR_TEXT_MAX = 500;

// What a file really is, by its own first bytes (never its name or the type the phone claims): PNG, JPEG, WebP or PDF.
export function sniffTutorFile(bytes: Uint8Array): TutorFileType | null {
  const at = (i: number, ...v: number[]) => bytes.length >= i + v.length && v.every((b, k) => bytes[i + k] === b);
  if (at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'image/png';
  if (at(0, 0xff, 0xd8, 0xff)) return 'image/jpeg';
  if (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return 'image/webp';
  if (at(0, 0x25, 0x50, 0x44, 0x46, 0x2d)) return 'application/pdf';
  return null;
}

// Where the window was opened from: the Study page (a subject), or the chapter reader's doubt drawer (its chapter and
// the block the child was on). Board and class are the child's own, read on the server, never sent.
export type TutorContext = { subject: string; chapterKey?: string; blockId?: string };

// A turn as the phone draws it. A tutor turn holds the answer's teaching blocks only: a check or practice item's answer
// is sealed for the phone and is never kept.
export type TutorFile = { id: string; mime: TutorFileType };
export type TutorTurn =
  | { id: string; role: 'child'; lang: 'en' | 'hi'; text: string; chapterKey: string | null; blockId: string | null; files: TutorFile[]; at: string }
  | { id: string; role: 'tutor'; lang: 'en' | 'hi'; blocks: Block[]; at: string };

// The kept part of an answer: every block but a check or practice.
export const keptTutorBlocks = (blocks: readonly Block[]): Block[] => blocks.filter((b) => b.type !== 'check' && b.type !== 'practice');
