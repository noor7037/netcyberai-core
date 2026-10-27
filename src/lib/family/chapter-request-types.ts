import type { StudyStatus } from './study-status';

// The pure parts of the missing-chapter queue (S3, C376), safe for the phone: types, the mapping to Study's badges, and
// the per-student source choice. The database side is chapter-requests.ts.

export type RequestStatus = 'received' | 'digitizing' | 'ready' | 'declined';
export type ChapterRequest = { requestId: string; childId: string; subject: string; title: string; source: 'parent_upload' | 'catalog'; status: RequestStatus; declineReason: string | null; createdAt: string };
export type SourceMode = 'catalog' | 'school' | 'parent';
export const SOURCE_MODES: readonly SourceMode[] = ['catalog', 'school', 'parent'];

// What Study shows for a request: Received, Digitizing, and Published once the chapter is out. A declined one shows nothing.
export const requestStudyStatus = (s: RequestStatus): StudyStatus | null => (s === 'received' ? 'received' : s === 'digitizing' ? 'digitizing' : s === 'ready' ? 'published' : null);

// The queue state of one subject: Digitizing beats Received. Ready needs no badge here (the published list shows it).
export function queueStatusOf(requests: readonly Pick<ChapterRequest, 'subject' | 'status'>[], subject: string): StudyStatus | null {
  const open = requests.filter((r) => r.subject === subject).map((r) => r.status);
  return open.includes('digitizing') ? 'digitizing' : open.includes('received') ? 'received' : null;
}

// Which sources Study shows for a subject: only the chosen one, or all when none is chosen.
export const sourceShown = (mode: SourceMode | undefined, source: SourceMode): boolean => mode === undefined || mode === source;
