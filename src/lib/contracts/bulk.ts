import type { ListQuery } from './filters';
import type { ModuleId, SchoolRole } from './modules';

// Bulk actions (17 §1a; built in P1-b on the job pipeline, Decision Log
// C110): select some rows or the whole filtered set, preview, confirm,
// run (a background job above `syncLimit`), and undo within a window where
// the action allows it. The server recounts the filtered set at confirm
// time and refuses if it no longer matches the preview.

export type BulkActionDefinition = {
  actionId: string; // 'students.promote', 'attendance.present_all', …
  moduleId: ModuleId;
  listId: string;
  label: string;
  confirmTitle: string;
  confirmBody: string; // may use {count}
  allowedRoles: readonly SchoolRole[];
  // Parameters the person fills before previewing (for example a target class).
  params?: readonly {
    key: string;
    label: string;
    type: 'text' | 'number' | 'date' | 'select';
    options?: readonly { value: string; label: string }[];
    optionsFrom?: 'classes' | 'sections' | 'sessions' | 'staff' | 'subjects'; // choices loaded from the school's data
  }[];
  destructive: boolean;
  undoWindowSeconds?: number; // absent: cannot be undone
  syncLimit: number; // at most this many rows run inside the request; more go to a job
  // Selection size the action accepts (C116: "link as siblings" is 2 to 20).
  minRows?: number;
  maxRows?: number;
};

export type BulkSelection =
  | { mode: 'ids'; ids: readonly string[] }
  | { mode: 'filtered'; query: ListQuery; expectedCount: number };

export type BulkPreviewRequest = { actionId: string; selection: BulkSelection; params?: Readonly<Record<string, string | number>> };

export type BulkPreview = {
  previewId: string; // confirm with this; expires
  actionId: string;
  count: number;
  firstRows: readonly { id: string; label: string; change: string }[]; // the first few rows and what happens to each
  warnings: readonly string[]; // rows skipped and why
  runsAsJob: boolean;
  expiresAt: string;
};

// previewed: waiting for confirm; expired: not confirmed in time, or the
// filtered set changed before confirm (C112).
export type BulkRunStatus = 'previewed' | 'queued' | 'running' | 'succeeded' | 'partially_failed' | 'failed' | 'undone' | 'expired';

export type BulkRun = {
  runId: string;
  actionId: string;
  status: BulkRunStatus;
  total: number;
  done: number;
  failed: number;
  failures: readonly { id: string; reason: string }[]; // first few
  startedBy: string;
  startedAt: string;
  finishedAt?: string;
  undoUntil?: string; // present while undo is possible
};
