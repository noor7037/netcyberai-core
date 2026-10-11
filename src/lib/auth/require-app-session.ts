import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from './require-session';
import { canAccessApp } from './guards';
import type { SessionClaims, StaffRole } from './types';
import { guardRead, guardWrite, WRITE_METHODS } from '@/lib/frameworks/write-guard';

// Every /api/app/** route needs the identical guard: a real session,
// with an actual selected school (super_admin has none -- canAccessApp
// already excludes it). Mirrors requireSuperAdmin's shape for
// /api/control/** -- PRD §2.2's "a hidden-but-reachable endpoint is an
// open endpoint" rule applies here exactly as it does there: the (school)
// shell's nav hides pages a role shouldn't see, but that is never a
// substitute for checking at the route itself.
//
// A request that changes something also passes the write guard here
// (C137): refused when the school's account is paused or read-only, or the
// route's module is switched off for the school. Because it sits in this
// one guard, every write route has it without asking.
export async function requireAppSession(
  req: NextRequest
): Promise<{ claims: SessionClaims & { schoolId: string } } | { error: NextResponse }> {
  const claims = await requireSession(req);
  if (!claims || !canAccessApp(claims)) {
    return { error: NextResponse.json({ error: 'not authenticated' }, { status: 401 }) };
  }
  const app = claims as SessionClaims & { schoolId: string };
  if (WRITE_METHODS.includes(req.method)) {
    const refused = await guardWrite(app, req.nextUrl.pathname);
    if (refused) return { error: refused };
  } else {
    // A read of a module the school has switched off is refused too (C140).
    const refused = await guardRead(app, req.nextUrl.pathname);
    if (refused) return { error: refused };
  }
  return { claims: app };
}

// Student/guardian/class master-data writes: gated to the two roles
// the Office menu surfaces these pages to (school_admin, principal --
// see the module registry, src/lib/contracts/modules.ts). Every other staff role (teacher,
// accountant, academic_coordinator) can still READ this data -- the
// existing students_tenant_isolation/classes_tenant_isolation RLS
// policies are blanket, whole-school, all-command policies with no
// role sub-filter -- but writing student master data from outside the
// office shell is not a workflow this prompt asked for, and silently
// allowing it from any role would be exactly the "hidden-but-reachable
// is open" gap PRD §2.2 warns about.
const MASTER_DATA_WRITE_ROLES: StaffRole[] = ['school_admin', 'principal'];

export function canWriteMasterData(role: StaffRole): boolean {
  return MASTER_DATA_WRITE_ROLES.includes(role);
}

// Prompt G Task 3: authorizing a DSR deletion request (the explicit,
// separately-confirmed step that must happen before pseudonymization
// can ever run) is deliberately the same narrow set as master-data
// writes, not opened to every role that can merely log a request.
// Named separately from canWriteMasterData rather than reusing it
// directly -- these two checks answer different questions and
// happening to share a role set today is not a reason to couple them;
// a future change to one must not silently change the other.
const ERASURE_AUTHORIZATION_ROLES: StaffRole[] = ['school_admin', 'principal'];

export function canAuthorizeErasure(role: StaffRole): boolean {
  return ERASURE_AUTHORIZATION_ROLES.includes(role);
}

// Attendance is teacher-facing (04_SYSTEM_DESIGN_PRD.md Sec3.2), but
// principal/school_admin/academic_coordinator also legitimately mark or
// correct it (covering, overseeing, or fixing a class with no assigned
// teacher) -- accountant has no attendance duty. This is a coarse route
// gate only, same role as canWriteMasterData's: the fine-grained "a
// teacher may only touch their OWN class" boundary is RLS's job
// (attendance_tenant_isolation + the restrictive teacher_scope_attendance
// overlay), not re-implemented here.
const ATTENDANCE_WRITE_ROLES: StaffRole[] = ['school_admin', 'principal', 'teacher', 'academic_coordinator'];

export function canWriteAttendance(role: StaffRole): boolean {
  return ATTENDANCE_WRITE_ROLES.includes(role);
}

// "Taught today" (syllabus_progress) is recorded by the teacher who took
// the lesson, or by academic leadership covering for them. Coarse route
// gate only: which class+subject a teacher may record is enforced by the
// restrictive teacher_scope_syllabus_progress RLS policy.
const SYLLABUS_WRITE_ROLES: StaffRole[] = ['school_admin', 'principal', 'teacher', 'academic_coordinator'];

export function canWriteSyllabus(role: StaffRole): boolean {
  return SYLLABUS_WRITE_ROLES.includes(role);
}
