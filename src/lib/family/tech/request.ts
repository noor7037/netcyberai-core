// The guard for every Tech Lab API: a family session, the active child, the tech_lab switch, and study consent.
// The course itself is the lesson files. Progress uses the tables when they exist.

import { NextRequest, NextResponse } from 'next/server';
import type { PoolClient } from 'pg';
import { activeChild, listChildren, type FamilyChild } from '@/lib/family/children';
import { consentState } from '@/lib/family/consent';
import { readFamilySwitches, switchOn } from '@/lib/family/flags';
import { familyRun, requireFamily } from '@/lib/family/request';
import { FAMILY_CHILD_COOKIE } from '@/lib/family/session';

export type TechCtx = { db: PoolClient; accountId: string; child: FamilyChild };

const fail = (error: string, status: number) => NextResponse.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } });

export async function withTech(req: NextRequest, fn: (ctx: TechCtx) => Promise<NextResponse>): Promise<NextResponse> {
  const guard = await requireFamily(req);
  if (guard.error) return guard.error;
  const session = guard.session;
  return familyRun(session, async (db) => {
    const children = await listChildren(db, session.accountId);
    const child = activeChild(children, req.cookies.get(FAMILY_CHILD_COOKIE)?.value);
    if (!child) return fail('no_child', 404);
    if (!switchOn(await readFamilySwitches(db, session.accountId), 'tech_lab')) return fail('off', 403);
    if (!(await consentState(db, session.accountId)).study_core) return fail('consent_needed', 403);
    return fn({ db, accountId: session.accountId, child });
  });
}

export const techError = fail;
