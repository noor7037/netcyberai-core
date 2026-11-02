import { NextRequest, NextResponse } from 'next/server';
import { AI_TUTOR_ROLES, addTutor, changeTutor, parseTutor, readTutors, switchPlatformTutor } from '@/lib/ai-tutors';
import { appRoute, readJson, ruleError } from '@/lib/frameworks/route';

// AI Tutors, the school's side (W16-A3). The principal and the school admin only.
//   GET    the platform's tutors with this school's switch on each, and the school's own tutors
//   POST   add one of the school's own tutors { name, subject, style, language }; 201 with it
//   PATCH  { tutorId, name?, subject?, style?, language?, enabled? } change or switch one of the school's own tutors, or
//          { platformKey, enabled } switch a platform tutor for this school. Nothing is removed.
// Every change is audited. A family sees the result only through school_tutors_for_guardian() (School Link).
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KEY = /^[a-z][a-z0-9_]{1,39}$/;
const FIELD = { name: 'name', style: 'description', subject: 'subject', language: 'language' } as const;

export async function GET(req: NextRequest) {
  return appRoute(req, async ({ claims, db }) => {
    if (!AI_TUTOR_ROLES.includes(claims.role)) return ruleError(403, 'not_allowed');
    return NextResponse.json(await readTutors(db), { headers: { 'Cache-Control': 'no-store' } });
  });
}

export async function POST(req: NextRequest) {
  return appRoute(req, async ({ claims, db }) => {
    if (!AI_TUTOR_ROLES.includes(claims.role)) return ruleError(403, 'not_allowed');
    const body = await readJson(req);
    if (!body) return ruleError(400, 'required', { field: 'name' });
    const parsed = parseTutor(body);
    if (!parsed.ok) return ruleError(400, parsed.field === 'language' || parsed.field === 'subject' ? 'choose_one' : 'required', { field: FIELD[parsed.field] });
    const tutor = await addTutor(db, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role }, parsed.value);
    return NextResponse.json({ tutor }, { status: 201 });
  });
}

export async function PATCH(req: NextRequest) {
  return appRoute(req, async ({ claims, db }) => {
    if (!AI_TUTOR_ROLES.includes(claims.role)) return ruleError(403, 'not_allowed');
    const body = await readJson(req);
    if (!body) return ruleError(400, 'nothing_to_save');
    const who = { schoolId: claims.schoolId, userId: claims.sub, role: claims.role };
    const enabled = typeof body.enabled === 'boolean' ? body.enabled : null;
    if (typeof body.platformKey === 'string') {
      if (!KEY.test(body.platformKey) || enabled === null) return ruleError(400, 'nothing_to_save');
      return (await switchPlatformTutor(db, who, body.platformKey, enabled)) ? NextResponse.json({ ok: true }) : ruleError(404, 'not_found', { field: 'name' });
    }
    if (typeof body.tutorId !== 'string' || !UUID.test(body.tutorId)) return ruleError(400, 'nothing_to_save');
    const words = ['name', 'style', 'subject', 'language'].some((k) => k in body);
    const parsed = words ? parseTutor(body) : null;
    if (parsed && !parsed.ok) return ruleError(400, parsed.field === 'language' || parsed.field === 'subject' ? 'choose_one' : 'required', { field: FIELD[parsed.field] });
    if (!parsed && enabled === null) return ruleError(400, 'nothing_to_save');
    const changed = await changeTutor(db, who, body.tutorId, parsed?.ok ? parsed.value : null, enabled);
    return changed ? NextResponse.json({ tutor: changed }) : ruleError(404, 'not_found', { field: 'name' });
  });
}
