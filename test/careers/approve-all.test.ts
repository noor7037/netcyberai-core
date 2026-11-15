import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { POST } from '@/app/api/control/content/careers/route';
import { approveAllPending, type PendingCounts } from '@/lib/content/career-review';
import type { Sql } from '@/lib/family/careers/sql';

const FIRST: PendingCounts = { careers: 2, fields: 1, steps: 3, actions: 4, courses: 5, crosses: 1, laterals: 1 };
const ZERO: PendingCounts = { careers: 0, fields: 0, steps: 0, actions: 0, courses: 0, crosses: 0, laterals: 0 };

function fake(counts: PendingCounts, updated: number): Sql {
  const query = async (sql: string) => {
    const text = String(sql);
    if (text.includes('count(*)')) return { rows: [counts], rowCount: 1 };
    if (text.includes('insert into audit_log')) return { rows: [], rowCount: 1 };
    return { rows: [], rowCount: updated };
  };
  return { query } as Sql;
}

describe('approve all pending', () => {
  it('returns the rows it approved, then zero on a second call', async () => {
    const first = await approveAllPending(fake(FIRST, 2), 'actor-1');
    expect(first).toEqual({ careers: 2, fields: 2, steps: 2, actions: 2, courses: 2, crosses: 2, laterals: 2 });
    const second = await approveAllPending(fake(ZERO, 0), 'actor-1');
    expect(second).toEqual(ZERO);
  });

  it('refuses a caller who is not signed in', async () => {
    const body = new FormData();
    body.set('action', 'approve-all');
    body.set('confirm', 'approve-pending');
    const res = await POST(new NextRequest('http://localhost/api/control/content/careers', { method: 'POST', body }));
    expect(res.status).toBe(401);
  });
});
