import { ModulePage } from '@/components/app-ui/ModulePage';
import { BillingPlansView } from '@/components/control/BillingPlansView';
import { withTenantContext } from '@/lib/auth/db';
import { getServerSession } from '@/lib/auth/server-session';
import { billingOverview } from '@/lib/control/billing';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';

// Billing & Plans (docs/26 slice 8e, C204). The plans are rows typed here: their names and prices are in the
// database, never in code. Below them, every school by plan and state: what it has paid until, its access, when
// grace ends, with "Record a payment" and "Change plan". The nightly check moves a school past its paid-until day
// into grace and then read-only (src/lib/control/billing-nightly.ts).

export const dynamic = 'force-dynamic';

export default async function BillingPlansPage() {
  const session = await getServerSession();
  const { lang } = getLang(session?.sub ?? '');
  // The layout has already refused anyone but the founder; this runs as nca_super.
  const data = session ? await withTenantContext(session, (db) => billingOverview(db)) : null;
  return (
    <ModulePage title={t(lang, 'billing.title')} purpose={t(lang, 'billing.purpose')} icon="fees" tone="tangerine" eyebrow={t(lang, 'group.control')} headerLang={lang}>
      {data && <BillingPlansView initial={data} />}
    </ModulePage>
  );
}
