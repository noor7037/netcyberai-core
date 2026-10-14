import { SHOWN_ROW, ShownRows, shownDay } from '@/components/dashboards/ShownRows';
import { withTenantContext } from '@/lib/auth/db';
import { getServerSession } from '@/lib/auth/server-session';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';
import { ANSWER_ROWS_MAX, PARENT_AI_ROLES, listAnswers, type AnswerRow } from '@/lib/parent-ai/answers';
import { indiaDate } from '@/lib/time/india';

// /app/parent-ai?show=drafts (docs/26 slice 8d, C203): the draft answers no person has yet approved or discarded,
// exactly as the dashboard counted them: both read listAnswers(…, 'draft'), in the reader's own session (a
// teacher: the children of their own classes). The oldest first. A draft's words are not repeated here: reading,
// changing and approving stay in the list below.
export async function ParentAiShown() {
  const session = await getServerSession();
  if (!session?.schoolId || !PARENT_AI_ROLES.includes(session.role)) return null;
  const schoolId = session.schoolId;
  const { lang } = getLang(session.sub);
  let drafts: AnswerRow[];
  try {
    drafts = await withTenantContext(session, (db) => listAnswers(db, schoolId, 'draft'));
  } catch {
    return null;
  }
  const note = [drafts.length >= ANSWER_ROWS_MAX ? t(lang, 'shown.capped', { count: ANSWER_ROWS_MAX }) : '', drafts.length > 0 ? t(lang, 'shown.answers.below') : ''].filter(Boolean).join(' ');
  return (
    <ShownRows id="answers-drafts" lang={lang} title={t(lang, 'shown.answers.title', { count: drafts.length })} note={note || undefined} backHref="/app/parent-ai" empty={drafts.length === 0}>
      {drafts.map((a) => (
        <li key={a.answer_id} data-shown-row className={SHOWN_ROW}>
          <span className="font-bold">{a.child}</span>
          <span>{t(lang, 'shown.answers.row', { guardian: a.guardian, by: a.drafted_by ?? '', date: shownDay(lang, indiaDate(new Date(a.drafted_at))) })}</span>
        </li>
      ))}
    </ShownRows>
  );
}
