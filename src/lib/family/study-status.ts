import type { MessageKey } from '@/lib/i18n';

// The status a subject or chapter shows on Study (S4, C377): Received, Digitizing or Published. Only Published is
// derived today, from real state: a version released to everyone for the child's board and class
// (content.syllabus_versions, status published, audience everyone), whose chapters the page lists. The database holds
// no queue of requested or in-progress chapters yet (the missing-chapter queue is slice S3), so nothing is shown for a
// subject without a published version: a status is never guessed. When S3's queue exists, its states map to the two
// others here.
export type StudyStatus = 'received' | 'digitizing' | 'published';

export const STUDY_STATUS_KEY: Record<StudyStatus, MessageKey> = {
  received: 'fam.status.received',
  digitizing: 'fam.status.digitizing',
  published: 'fam.status.published',
};

// The status of one subject from what the catalog really holds. `queue` is the future queue's state, if any.
export function subjectStatus(subject: string, published: readonly string[], queue?: StudyStatus | null): StudyStatus | null {
  if (published.includes(subject)) return 'published';
  return queue ?? null;
}
