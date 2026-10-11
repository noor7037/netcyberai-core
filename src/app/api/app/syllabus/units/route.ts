import { NextRequest, NextResponse } from 'next/server';
import { canWriteSyllabus } from '@/lib/auth/require-app-session';
import { addUnits, parseUnitLines, removeUnit } from '@/lib/academics/taught';
import { isRlsViolation } from '@/lib/db/pg-errors';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { appRoute, jsonError, readJson, ruleError } from '@/lib/frameworks/route';

// The syllabus map of one class and subject (docs/20 5d, C147).
//   POST    add topics, typed or pasted: one per line, "Chapter | Topic"
//   DELETE  remove one topic that no lesson has used
// RLS limits a teacher to the classes that are theirs.

export async function POST(req: NextRequest) {
  return appRoute(req, async ({ claims, db }) => {
    if (!canWriteSyllabus(claims.role)) return ruleError(403, 'not_allowed');
    const body = await readJson(req);
    if (!isUuid(body?.classId) || !isUuid(body?.subjectId) || typeof body?.lines !== 'string' || body.lines.length > 40_000) return ruleError(400, 'not_sent_properly');
    const lines = parseUnitLines(body.lines);
    if (lines.length === 0) return jsonError(400, 'write at least one topic', { code: 'no_topics' });
    try {
      await db.query('savepoint add_units');
      const added = await addUnits(db, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role }, { classId: body.classId as string, subjectId: body.subjectId as string }, lines);
      return NextResponse.json({ added }, { status: 201 });
    } catch (err) {
      if (!isRlsViolation(err)) throw err;
      await db.query('rollback to savepoint add_units');
      return ruleError(403, 'not_allowed');
    }
  });
}

export async function DELETE(req: NextRequest) {
  return appRoute(req, async ({ claims, db }) => {
    if (!canWriteSyllabus(claims.role)) return ruleError(403, 'not_allowed');
    const body = await readJson(req);
    if (!isUuid(body?.unitId)) return ruleError(400, 'not_sent_properly');
    const result = await removeUnit(db, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role }, body.unitId as string);
    if (result === 'removed') return NextResponse.json({ removed: true });
    return jsonError(result === 'in_use' ? 409 : 404, result === 'in_use' ? 'a lesson already used this topic, so it stays' : 'not found', { code: result });
  });
}
