import { NextRequest, NextResponse } from 'next/server';
import { appRoute, ruleError } from '@/lib/frameworks/route';
import { applySiblingRule } from '@/lib/fees/sibling';
import { FINANCE } from '@/lib/fees/structures';
import { indiaDate } from '@/lib/time/india';

// POST: bring the sibling rule's concessions in line with the families as they are today (C168).
// It proposes and ends; it approves nothing.
export async function POST(req: NextRequest) {
  return appRoute(req, async ({ claims, db }) => {
    if (!FINANCE.includes(claims.role)) return ruleError(403, 'not_allowed');
    return NextResponse.json(await applySiblingRule(db, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role }, indiaDate()));
  });
}
