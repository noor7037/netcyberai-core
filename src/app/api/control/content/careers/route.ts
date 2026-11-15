import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/auth/require-super-admin';
import { asLiveStaff } from '@/lib/control/billing-route';
import { buildBundle } from '@/lib/family/careers/catalog';
import { importSeed } from '@/lib/family/careers/importer';
import { editCareerText, setCareerReview } from '@/lib/content/career-review';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const guard = await requireSuperAdmin(req);
  if ('error' in guard) return guard.error;
  const form = await req.formData();
  const action = String(form.get('action') ?? '');
  const slug = String(form.get('slug') ?? '');
  const run = await asLiveStaff(guard.claims, async (db) => {
    if (action === 'approve' || action === 'reject') return setCareerReview(db, guard.claims.sub, slug, action, String(form.get('reason') ?? ''));
    if (action === 'edit') {
      return editCareerText(db, guard.claims.sub, slug, {
        titleEn: String(form.get('titleEn') ?? ''),
        titleHi: String(form.get('titleHi') ?? ''),
        summaryEn: String(form.get('summaryEn') ?? ''),
        summaryHi: String(form.get('summaryHi') ?? ''),
        officialUrl: String(form.get('officialUrl') ?? ''),
        reviewDue: String(form.get('reviewDue') ?? ''),
      });
    }
    if (action === 'import' && form.get('confirm') === 'load-pending-seed') {
      await importSeed(db, guard.claims.sub, buildBundle());
      return { ok: true as const };
    }
    return { ok: false as const, reason: 'missing' };
  });
  if ('refused' in run) return run.refused;
  const back = new URL('/control/content/careers', req.url);
  back.searchParams.set('notice', run.value.ok ? 'saved' : 'error');
  return NextResponse.redirect(back, 303);
}
