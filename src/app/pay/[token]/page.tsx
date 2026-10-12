import type { Metadata } from 'next';
import { withPlatformService } from '@/lib/auth/db';
import { minorToRupees } from '@/lib/fees/money';
import { t, type Lang } from '@/lib/i18n';
import type { Sql } from '@/lib/jobs/types';
import { linkForPayer } from '@/lib/payments/apply';
import { configuredPaymentProvider } from '@/lib/payments/provider';
import { StandInPayButton } from './StandInPayButton';

// The page a parent opens from a payment link (docs/23 6f, C169). It shows
// the school's name, the amount and where the link stands: nothing about
// any child. "Paid" is shown only when the provider's signed notice has
// been applied; coming back from a checkout page changes nothing here.
// Both languages are shown, since the reader has no account or setting.
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Fee payment', robots: { index: false, follow: false } };

const platform = withPlatformService as <T>(fn: (db: Sql) => Promise<T>) => Promise<T>;
const LANGS: readonly Lang[] = ['en', 'hi'];

export default async function PayPage({ params }: { params: { token: string } }) {
  const link = await platform((db) => linkForPayer(db, params.token)).catch(() => null);
  const provider = configuredPaymentProvider();
  const both = (render: (lang: Lang) => string) => LANGS.map((lang) => <p key={lang} lang={lang}>{render(lang)}</p>);
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-4 bg-off-white p-6 text-slate">
      {!link ? (
        <div data-pay-state="unknown" className="rounded-lg border border-slate/10 bg-white p-4 text-sm">{both((lang) => t(lang, 'payer.unknown'))}</div>
      ) : (
        <>
          <h1 className="text-xl font-bold">{link.schoolName}</h1>
          <div className="rounded-lg border border-slate/10 bg-white p-4">
            <div className="text-sm text-slate/70">{both((lang) => t(lang, 'payer.amount'))}</div>
            <p data-pay-amount className="text-3xl font-extrabold">{`₹${minorToRupees(link.amountMinor)}`}</p>
          </div>
          <div data-pay-state={link.state} className="flex flex-col gap-2 rounded-lg border border-slate/10 bg-white p-4 text-sm">
            {link.state === 'paid' && both((lang) => t(lang, 'payer.paid', { receipt: link.receiptNo ?? '' }))}
            {link.state === 'closed' && both((lang) => t(lang, 'payer.closed'))}
            {link.state === 'open' && link.testMode && link.provider !== 'stand-in' && both((lang) => t(lang, 'payer.testMode'))}
            {link.state === 'open' &&
              (provider?.name === 'stand-in' && link.provider === 'stand-in' ? (
                <StandInPayButton token={params.token} labels={{ pay: t('en', 'payer.standin.pay'), note: t('en', 'payer.standin.note'), failed: t('en', 'payer.standin.failed') }} />
              ) : link.provider && link.provider !== 'stand-in' && link.checkoutUrl?.startsWith('https://') ? (
                <>
                  {both((lang) => t(lang, 'payer.gateway.note'))}
                  <a data-gateway-pay href={link.checkoutUrl} rel="noopener noreferrer" className="inline-flex min-h-[48px] items-center justify-center rounded-md bg-sapphire px-5 text-base font-semibold text-white">
                    {t('en', 'payer.gateway.pay')} · {t('hi', 'payer.gateway.pay')}
                  </a>
                </>
              ) : (
                both((lang) => t(lang, 'payer.notOn'))
              ))}
          </div>
        </>
      )}
    </main>
  );
}
