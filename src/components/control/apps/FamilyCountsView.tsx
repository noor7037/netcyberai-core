import { AppCard } from '@/components/app-ui/Card';
import { StatTile } from '@/components/app-ui/StatTile';
import type { FamilyCounts } from '@/lib/control/family-counts';
import { t, type Lang } from '@/lib/i18n';

// Control → Family (M1-7): the counts of the Family app as tiles. Numbers only: the reader (family-counts.ts) keeps
// nothing else, so no name, child, answer or email address can be drawn here.

const count = (n: number) => n.toLocaleString('en-IN');

export function FamilyCountsView({ counts, lang }: { counts: FamilyCounts; lang: Lang }) {
  return (
    <div className="flex min-w-0 flex-col gap-4" data-family-counts>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
        <StatTile icon="users" tone="royal" label={t(lang, 'control.family.accounts')} value={count(counts.accounts)} attrs={{ 'data-count': 'accounts' }} />
        <StatTile icon="shield" tone="emerald" label={t(lang, 'control.family.accountsWithPin')} value={count(counts.accountsWithPin)} attrs={{ 'data-count': 'accounts_with_pin' }} />
        <StatTile icon="student" tone="turquoise" label={t(lang, 'control.family.children')} value={count(counts.children)} attrs={{ 'data-count': 'children' }} />
        <StatTile icon="compliance" tone="azure" label={t(lang, 'control.family.studyCore')} value={count(counts.studyCoreGranted)} attrs={{ 'data-count': 'study_core_granted' }} />
        <StatTile icon="reports" tone="grape" label={t(lang, 'control.family.answers7d')} value={count(counts.answers7d)} attrs={{ 'data-count': 'answers_7d' }} />
        <StatTile icon="student" tone="sapphire" label={t(lang, 'control.family.childrenAnswering7d')} value={count(counts.childrenAnswering7d)} attrs={{ 'data-count': 'children_answering_7d' }} />
        <StatTile icon="exams" tone="amber" label={t(lang, 'control.family.topicsMastered')} value={count(counts.topicsMastered)} attrs={{ 'data-count': 'topics_mastered' }} />
        <StatTile icon="pulse" tone="violet" label={t(lang, 'control.family.aiToday')} value={count(counts.aiRequestsToday)} attrs={{ 'data-count': 'ai_requests_today' }} />
      </div>
      <AppCard title={t(lang, 'control.family.byClass')}>
        {counts.childrenByClass.length === 0 ? (
          <p className="text-sm text-slate/70">{t(lang, 'control.family.byClass.none')}</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
            {counts.childrenByClass.map((c) => (
              <StatTile key={c.classLevel} icon="student" tone="royal" label={t(lang, 'control.family.class', { n: c.classLevel })} value={count(c.count)} attrs={{ 'data-class': c.classLevel }} />
            ))}
          </div>
        )}
      </AppCard>
    </div>
  );
}
