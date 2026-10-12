import { notFound } from 'next/navigation';
import { ModuleOffPage } from '@/components/app-shell/ModuleOffPage';
import { ModulePage } from '@/components/app-ui/ModulePage';
import { PrintButton } from '@/components/fees/PrintButton';
import { withTenantContext } from '@/lib/auth/db';
import { getServerSession } from '@/lib/auth/server-session';
import { rupeesInWords } from '@/lib/certificates/words';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { moduleOffReason } from '@/lib/frameworks/page-access';
import { minorToRupees } from '@/lib/fees/money';
import { getReceipt } from '@/lib/fees/payments';
import { FINANCE } from '@/lib/fees/structures';
import { t, type MessageKey } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';

// A receipt, as issued, laid out to print (docs/23 6c, C160). Every figure
// on it comes from the receipt and its payments; nothing is typed here.
export const dynamic = 'force-dynamic';

export default async function ReceiptPage({ params }: { params: { receiptId: string } }) {
  const off = await moduleOffReason('fees');
  if (off) return <ModuleOffPage moduleId="fees" reason={off} />;
  const session = await getServerSession();
  if (!session?.schoolId || !FINANCE.includes(session.role) || !isUuid(params.receiptId)) notFound();
  const { lang } = getLang(session.sub);
  const found = await withTenantContext(session, async (db) => ({
    receipt: await getReceipt(db, session.schoolId as string, params.receiptId),
    school: ((await db.query(`select name from schools where school_id = $1`, [session.schoolId])).rows[0]?.name as string | undefined) ?? '',
  }));
  const r = found.receipt;
  if (!r) notFound();
  const date = new Date(r.issued_at).toLocaleDateString(lang === 'hi' ? 'hi-IN' : 'en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' });

  return (
    <ModulePage moduleId="fees" help="take-fee-payment" tour="fees" title={t(lang, 'rcp.title', { number: r.receipt_no })} purpose={t(lang, 'rcp.purpose')} hideHeaderInPrint primary={<PrintButton label={t(lang, 'rcp.print')} />}>
      <article lang={lang} data-receipt className="mx-auto flex w-full max-w-2xl flex-col gap-4 rounded-lg border border-slate/20 bg-white p-6 text-sm text-slate print:border-0 print:p-0">
        <header className="flex flex-wrap items-start justify-between gap-2 border-b border-slate/20 pb-3">
          <div>
            <p className="text-lg font-bold">{found.school}</p>
            <p className="font-semibold">{t(lang, 'rcp.heading')}</p>
          </div>
          <div className="text-right">
            <p data-receipt-no className="font-bold">
              {r.receipt_no}
            </p>
            <p>{date}</p>
          </div>
        </header>
        {r.reversed_at && (
          <p role="status" data-reversed className="rounded-md border border-red-800/30 p-3 font-semibold text-red-800">
            {t(lang, 'rcp.reversed', { reason: r.reversal_reason ?? '' })}
          </p>
        )}
        <p>
          {t(lang, 'rcp.from', { student: r.student_name, class: r.class_name ?? '' })}
          {r.family_code ? ` · ${t(lang, 'rcp.family', { code: r.family_code })}` : ''}
        </p>
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-slate/20 text-left">
              <th className="py-2 font-semibold">{t(lang, 'rcp.for')}</th>
              <th className="py-2 text-right font-semibold">{t(lang, 'rcp.amount')}</th>
            </tr>
          </thead>
          <tbody>
            {r.lines.map((l, i) => (
              <tr key={i} className="border-b border-slate/10">
                <td className="py-2">{[r.family_code ? l.student_name : null, l.head_name ?? t(lang, l.is_late_fee ? 'pay.lateFee' : 'rcp.fee'), l.period_key && l.period_key !== 'once' ? l.period_key : null].filter(Boolean).join(' · ')}</td>
                <td className="py-2 text-right">{`₹${minorToRupees(l.amount_minor)}`}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td className="py-2 font-bold">{t(lang, 'rcp.total')}</td>
              <td data-receipt-total className="py-2 text-right font-bold">
                {`₹${minorToRupees(r.total_minor)}`}
              </td>
            </tr>
          </tfoot>
        </table>
        <p>{rupeesInWords(r.total_minor / 100)}</p>
        <p>
          {t(lang, 'rcp.method', { method: t(lang, `pay.method.${r.method}` as MessageKey) })}
          {r.reference ? ` · ${r.reference}` : ''}
        </p>
        <p className="pt-6">{r.issued_by_name ? t(lang, 'rcp.issuedBy', { name: r.issued_by_name }) : t(lang, 'rcp.online')}</p>
      </article>
    </ModulePage>
  );
}
