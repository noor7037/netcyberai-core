import type { Metadata } from 'next';
import QRCode from 'qrcode';
import { withPlatformService } from '@/lib/auth/db';
import { minorToRupees } from '@/lib/fees/money';
import { t, type Lang } from '@/lib/i18n';
import type { Sql } from '@/lib/jobs/types';
import { linkForPayer } from '@/lib/payments/apply';
import { configuredPaymentProvider } from '@/lib/payments/provider';
import { upiForPayer } from '@/lib/payments/upi';
import { StandInPayButton } from './StandInPayButton';
import { UtrForm } from './UtrForm';

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
  // Direct UPI to the school's own account, where the school offers it (C174). The QR and the button carry the same upi://pay link.
  const upi = link?.state === 'open' ? await platform((db) => upiForPayer(db, params.token)).catch(() => null) : null;
  const qr = upi ? await QRCode.toString(upi.uri, { type: 'svg', margin: 1, width: 220 }) : null;
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
          {upi && qr && (
            <div data-pay-upi={upi.report} className="flex flex-col gap-3 rounded-lg border border-slate/10 bg-white p-4 text-sm">
              {upi.report === 'being_verified' ? (
                <div data-upi-initiated className="font-semibold">{both((lang) => t(lang, 'payer.upi.initiated'))}</div>
              ) : (
                <>
                  {upi.report === 'not_found' && <div data-upi-not-found className="rounded-md bg-tangerine/10 px-3 py-2">{both((lang) => t(lang, 'payer.upi.notFound'))}</div>}
                  {both((lang) => t(lang, 'payer.upi.how', { name: upi.payeeName }))}
                  <a data-upi-pay href={upi.uri} className="inline-flex min-h-[48px] items-center justify-center rounded-md bg-sapphire px-5 text-base font-semibold text-white">
                    {t('en', 'payer.upi.pay')} · {t('hi', 'payer.upi.pay')}
                  </a>
                  {/* Our own QR of the same link, drawn on the server: no image from anywhere else. */}
                  <div data-upi-qr aria-label="UPI QR" className="mx-auto h-[220px] w-[220px]" dangerouslySetInnerHTML={{ __html: qr }} />
                  <p className="break-all text-xs text-slate/70">
                    {upi.upiId} · <span data-upi-reference className="font-semibold">{upi.reference}</span>
                  </p>
                  <UtrForm token={params.token} labels={{ label: `${t('en', 'payer.upi.utr')} · ${t('hi', 'payer.upi.utr')}`, hint: `${t('en', 'payer.upi.utrHint')} ${t('hi', 'payer.upi.utrHint')}`, send: `${t('en', 'payer.upi.send')} · ${t('hi', 'payer.upi.send')}`, bad: `${t('en', 'payer.upi.bad')} ${t('hi', 'payer.upi.bad')}`, used: `${t('en', 'payer.upi.used')} ${t('hi', 'payer.upi.used')}`, failed: `${t('en', 'payer.upi.failed')} ${t('hi', 'payer.upi.failed')}` }} />
                </>
              )}
            </div>
          )}
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
              ) : upi ? null : (
                both((lang) => t(lang, 'payer.notOn'))
              ))}
          </div>
        </>
      )}
    </main>
  );
}
