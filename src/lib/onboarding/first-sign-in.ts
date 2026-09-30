import { withPlatformService } from '@/lib/auth/db';
import type { Sql } from '@/lib/jobs/types';
import { markActive } from './applications';
import { markFirstSignIn } from './invitations';

// Called on every successful sign-in (resolve.ts, mintSession): an invited
// person's first one accepts their invitation and, for an approved school's
// principal, makes the application active (C98). A no-op update otherwise.
export async function recordSignIn(userId: string): Promise<void> {
  await withPlatformService((db) => markFirstSignIn(db as Sql, userId, markActive));
}
