import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/auth/require-super-admin';
import { withTenantContext } from '@/lib/auth/db';
import { sessionErrorResponse } from '@/lib/auth/session-error-response';
import { isUuid } from '@/lib/frameworks/custom-fields';

// GET ?q=: the guardians of a school whose name or phone matches, for the founder's "Create a login" as a parent
// (C230-D). At most 20, each with the last four digits of the phone, their children and classes, and whether a
// login exists already. Founder only.
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: { schoolId: string } }) {
  const guard = await requireSuperAdmin(req);
  if ('error' in guard) return guard.error;
  if (!isUuid(params.schoolId)) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const q = (req.nextUrl.searchParams.get('q') ?? '').trim().slice(0, 60);
  const digits = q.replace(/\D/g, '');
  try {
    const guardians = await withTenantContext(guard.claims, async (client) =>
      (
        await client.query(
          `select p.parent_id, p.name, right(regexp_replace(coalesce(p.phone, ''), '\\D', '', 'g'), 4) as phone_last4,
                  exists (select 1 from users u where u.user_id = p.parent_id) as has_login,
                  coalesce(string_agg(s.name || coalesce(' (' || c.name || ')', ''), ', ' order by s.name), '') as children
             from parents p
             left join parent_student_map m on m.parent_id = p.parent_id and m.school_id = p.school_id
             left join students s on s.student_id = m.student_id and s.school_id = p.school_id
             left join classes c on c.class_id = s.class_id
            where p.school_id = $1 and p.merged_into is null
              and ($2 = '' or p.name ilike '%' || $2 || '%' or ($3 <> '' and regexp_replace(coalesce(p.phone, ''), '\\D', '', 'g') like '%' || $3 || '%'))
            group by p.parent_id, p.name, p.phone
            order by lower(p.name)
            limit 20`,
          [params.schoolId, q, digits.length >= 4 ? digits : '']
        )
      ).rows.map((r) => ({ parentId: r.parent_id as string, name: r.name as string, phoneLast4: (r.phone_last4 as string) || null, children: r.children as string, hasLogin: r.has_login as boolean }))
    );
    return NextResponse.json({ guardians }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    const resp = sessionErrorResponse(err);
    if (resp) return resp;
    throw err;
  }
}
