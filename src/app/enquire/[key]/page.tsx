import type { Metadata } from 'next';
import Link from 'next/link';
import { OnlineEnquiryForm } from '@/components/admissions/OnlineEnquiryForm';
import { onlineForm, schoolForKey, type OnlineForm } from '@/lib/admissions/online';
import { withPlatformService } from '@/lib/auth/db';
import { t, type Lang } from '@/lib/i18n';
import type { Sql } from '@/lib/jobs/types';

// A school's online enquiry form (W21-M1): the link the office shares. A family asks about a place with no account:
// the child's first name, the class sought, a guardian's name and phone. Read through the platform role and the
// database's definer function only (src/lib/admissions/online.ts): the school's name and its classes, nothing else.
// A wrong link and a school whose Admissions is off show the same page. Not indexed, never cached, no analytics.
// English or Hindi by ?lang=hi, with a link to the other.
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Admission enquiry', robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } }, referrer: 'no-referrer' };

const platform = withPlatformService as <T>(fn: (db: Sql) => Promise<T>) => Promise<T>;
const written = (text: string) => (/[ऀ-ॿ]/.test(text) ? 'hi' : 'en');

function Closed({ lang, failed }: { lang: Lang; failed: boolean }) {
  return (
    <div lang={lang} data-enquire-state={failed ? 'unavailable' : 'closed'} className="mx-auto flex w-full max-w-md flex-col gap-3 px-4 py-10 text-slate">
      <h1 className="text-xl font-bold">{t(lang, 'enq.title')}</h1>
      <p className="rounded-lg border border-slate/10 bg-white p-4 text-base">{t(lang, failed ? 'enq.unavailable' : 'enq.closed')}</p>
    </div>
  );
}

export default async function EnquirePage({ params, searchParams }: { params: { key: string }; searchParams: { lang?: string } }) {
  const lang: Lang = searchParams.lang === 'hi' ? 'hi' : 'en';
  const schoolId = schoolForKey(params.key);
  if (!schoolId) return <Closed lang={lang} failed={false} />;
  const got = await platform((db) => onlineForm(db as never, schoolId)).then(
    (form) => ({ failed: false as const, form }),
    () => ({ failed: true as const, form: null as OnlineForm | null })
  );
  if (!got.form) return <Closed lang={lang} failed={got.failed} />;
  const other: Lang = lang === 'hi' ? 'en' : 'hi';
  return (
    <div lang={lang} data-enquire-state="open" className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 py-6 text-slate">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold">
          <span lang={written(got.form.schoolName)}>{got.form.schoolName}</span>
        </p>
        <Link href={`/enquire/${params.key}${other === 'hi' ? '?lang=hi' : ''}`} prefetch={false} lang={other} hrefLang={other} rel="nofollow" className="inline-flex min-h-[44px] items-center text-sm font-semibold text-royal underline underline-offset-2">
          {t(lang, 'enq.otherLanguage')}
        </Link>
      </div>
      <h1 className="text-2xl font-extrabold">{t(lang, 'enq.title')}</h1>
      <p className="text-base">{t(lang, 'enq.purpose', { school: got.form.schoolName })}</p>
      <OnlineEnquiryForm lang={lang} formKey={params.key} classes={got.form.classes} />
    </div>
  );
}
