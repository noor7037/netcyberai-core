import { ModulePage } from '@/components/app-ui/ModulePage';
import { FamilyPeopleView } from '@/components/control/family/FamilyPeopleView';
import { withTenantContext } from '@/lib/auth/db';
import { getServerSession } from '@/lib/auth/server-session';
import { loadFamilyPeople, parsePeopleQuery } from '@/lib/control/family-people';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';
import { pickWords } from '@/lib/i18n/pick';
import { WordsProvider } from '@/components/app-shell/Words';

// Control → Family → People (C230-V): the people who use the Family app, so NetCyberAI can serve them and, where a
// parent agreed, tell them about offers. The founder only (the layout), and only after the authenticator's step (aal2):
// below it nothing is read. Each read is audited (loadFamilyPeople).

export const dynamic = 'force-dynamic';

export default async function ControlFamilyPeoplePage({ searchParams }: { searchParams: { q?: string | string[]; offers?: string | string[]; page?: string | string[] } }) {
  const session = await getServerSession();
  const { lang } = getLang(session?.sub ?? '');
  const strong = session?.aal === 'aal2';
  const q = parsePeopleQuery(searchParams);
  const people = session && strong ? await withTenantContext(session, (db) => loadFamilyPeople(db, { userId: session.sub, role: session.role }, q)) : null;
  return (
    <ModulePage title={t(lang, 'control.people.title')} purpose={t(lang, 'control.people.purpose')} about={t(lang, 'control.people.about')} icon="users" tone="turquoise" eyebrow={t(lang, 'group.control')} headerLang={lang}>
      {people ? (
        <WordsProvider words={pickWords(lang, [], ['control.apps.'])}>
          <FamilyPeopleView lang={lang} people={people} q={q} />
        </WordsProvider>
      ) : (
        <p data-people-need-aal2 className="rounded-md border border-slate/20 bg-off-white px-3 py-2 text-sm font-semibold text-slate">
          {t(lang, 'control.people.needAal2')}
        </p>
      )}
    </ModulePage>
  );
}
