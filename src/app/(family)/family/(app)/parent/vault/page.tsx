import { redirect } from 'next/navigation';
import { SubPageHeader } from '@/components/family/SubPageHeader';
import { VaultList, type VaultChild } from '@/components/family/tutor/VaultList';
import { familyPageRead, firstStepsNext, requireFamilyPage } from '@/lib/family/server';
import { vaultConversations } from '@/lib/family/tutor';
import { VAULT_KEYS } from '@/lib/family/tutor-words';
import { familyWords } from '@/lib/family/words';
import { isMessageKey, t } from '@/lib/i18n';

// The Learning Vault (S2, C375): in the parent area, behind the parent PIN, never on a child's own phone. Each child's
// conversations with the tutor, by subject, with the child's questions, and a "clear" for each (the questions, the
// answers and the files, removed from the private store too).
export const dynamic = 'force-dynamic';

export default async function FamilyVaultPage() {
  const page = await requireFamilyPage();
  if (!page) redirect('/family/sign-in');
  const next = firstStepsNext(page);
  if (next) redirect(next);
  if (!page.parentMode) redirect('/family/parent');
  const lang = page.parentLang;
  const w = familyWords(lang, VAULT_KEYS);
  const conversations = await familyPageRead(page, (db) => vaultConversations(db, page.session.accountId));
  const subjectName = (s: string) => {
    const key = `fam.subject.${s}`;
    return isMessageKey(key) ? t(lang, key) : s;
  };
  const list: VaultChild[] = page.children.map((c) => ({
    childId: c.childId,
    firstName: c.firstName,
    conversations: conversations.filter((v) => v.childId === c.childId).map((v) => ({ conversationId: v.conversationId, subject: v.subject, subjectName: subjectName(v.subject), turns: v.turns, files: v.files, questions: v.questions })),
  }));
  return (
    <div lang={lang} className="flex min-h-screen flex-col">
      <SubPageHeader back="/family/parent" backLabel={w['fam.marks.backParent']} title={w['fam.vault.title']} tone="royal" />
      <main className="relative mx-auto -mt-8 flex w-full max-w-xl flex-1 flex-col gap-4 px-4 pb-24" data-parent-vault>
        <p className="fam-card bg-white p-4 text-sm font-semibold text-slate">{w['fam.vault.lead']}</p>
        <VaultList w={w} lang={lang} list={list} />
      </main>
    </div>
  );
}
