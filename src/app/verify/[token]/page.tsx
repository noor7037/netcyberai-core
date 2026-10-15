import type { Metadata } from 'next';
import { withPlatformService } from '@/lib/auth/db';
import { verifyCertificate, type VerifyView } from '@/lib/documents/certificates';
import { t, type Lang, type MessageKey } from '@/lib/i18n';
import type { Sql } from '@/lib/jobs/types';

// The page the QR code on a certificate opens (docs/28 row 10e, C228). Anyone may open it, signed in or not. It shows
// only what lets a reader match the paper: valid or withdrawn, the certificate's type, the school, the number, the
// day it was issued, and the first name with the initial of the surname (nothing once the family has had the child's
// details erased). Never a date of birth, a class, a parent or a fee. One read, through the database's own function
// (certificate_verify), of the one token in the address; nothing lists tokens. Both languages are shown, since the
// reader has no account or setting. Not indexed, and the address is not passed on to other sites.
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Certificate check', robots: { index: false, follow: false, nocache: true }, referrer: 'no-referrer' };

const platform = withPlatformService as <T>(fn: (db: Sql) => Promise<T>) => Promise<T>;
const LANGS: readonly Lang[] = ['en', 'hi'];

function issuedOn(lang: Lang, iso: string): string {
  return new Intl.DateTimeFormat(lang === 'hi' ? 'hi-IN' : 'en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${iso}T00:00:00+05:30`));
}

export default async function VerifyCertificatePage({ params }: { params: { token: string } }) {
  // A lookup that fails is not a certificate that does not exist (review of C228): the page says to try again.
  const lookup = await platform((db) => verifyCertificate(db, params.token)).then(
    (view: VerifyView | null) => ({ failed: false as const, view }),
    () => ({ failed: true as const, view: null })
  );
  const found = lookup.view;
  const both = (render: (lang: Lang) => string) =>
    LANGS.map((lang) => (
      <p key={lang} lang={lang}>
        {render(lang)}
      </p>
    ));
  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 py-8 text-slate">
      <h1 className="text-xl font-bold">
        {t('en', 'crt.verify.title')} · <span lang="hi">{t('hi', 'crt.verify.title')}</span>
      </h1>
      {lookup.failed ? (
        <div data-verify-state="unavailable" className="flex flex-col gap-2 rounded-lg border border-slate/10 bg-white p-4 text-sm">
          {both((lang) => t(lang, 'crt.verify.unavailable'))}
        </div>
      ) : !found ? (
        <div data-verify-state="unknown" className="flex flex-col gap-2 rounded-lg border border-slate/10 bg-white p-4 text-sm">
          {both((lang) => t(lang, 'crt.verify.unknown'))}
        </div>
      ) : (
        <>
          <div data-verify-state={found.state} className={`flex flex-col gap-2 rounded-lg p-4 text-sm font-semibold ${found.state === 'valid' ? 'bg-emerald/10 text-emerald-text' : 'border border-red-800/30 bg-white text-red-800'}`}>
            {both((lang) => t(lang, found.state === 'valid' ? 'crt.verify.valid' : 'crt.verify.withdrawn'))}
          </div>
          <dl data-verify-facts className="grid grid-cols-1 gap-3 rounded-lg border border-slate/10 bg-white p-4 text-sm">
            {(
              [
                ['crt.verify.type', (lang: Lang) => t(lang, `crt.type.${found.type}` as MessageKey), 'type'],
                ['crt.verify.school', () => found.schoolName, 'school'],
                ['crt.verify.number', () => found.number, 'number'],
                ['crt.verify.date', (lang: Lang) => issuedOn(lang, found.issuedOn), 'date'],
                ...(found.nameShown ? ([['crt.verify.name', () => found.nameShown as string, 'name']] as const) : []),
              ] as const
            ).map(([label, value, key]) => (
              <div key={key} data-verify-fact={key} className="flex flex-col gap-0.5">
                <dt className="text-slate/70">
                  {t('en', label)} · <span lang="hi">{t('hi', label)}</span>
                </dt>
                <dd className="break-words text-base font-semibold">
                  {value('en')}
                  {key === 'type' || key === 'date' ? (
                    <span lang="hi" className="block text-sm font-normal">
                      {value('hi')}
                    </span>
                  ) : null}
                </dd>
              </div>
            ))}
          </dl>
          <div className="flex flex-col gap-2 rounded-lg border border-slate/10 bg-white p-4 text-sm">
            {both((lang) => t(lang, found.nameShown ? 'crt.verify.nameNote' : 'crt.verify.nameErased'))}
            {both((lang) => t(lang, 'crt.verify.match'))}
          </div>
        </>
      )}
    </div>
  );
}
