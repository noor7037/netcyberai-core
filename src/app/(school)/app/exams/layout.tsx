import type { ReactNode } from 'react';
import { WordsProvider } from '@/components/app-shell/Words';
import { pageWords } from '@/components/app-shell/page-words';
import { getServerSession } from '@/lib/auth/server-session';
import { getLang } from '@/lib/i18n/server';

// Every Exams page shows the marking scheme's parts (SchemeParts), which read picked words (C402).
export default async function ExamsLayout({ children }: { children: ReactNode }) {
  const session = await getServerSession();
  const { lang } = getLang(session?.sub ?? '');
  return <WordsProvider words={pageWords(lang, '/app/exams/*')}>{children}</WordsProvider>;
}
