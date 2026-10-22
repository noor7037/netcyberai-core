'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Textarea';
import type { Words } from '@/lib/family/fill';
import { subjectTheme } from '@/lib/family/subject-theme';
import type { Subject } from '@/lib/family/subjects';
import { UnderstandView, type UnderstandInput } from './UnderstandView';

// A typed question, asked from the chosen subject's page (M1-5, C251). It stays on this page (never in the address bar)
// and is never kept in the shared library: it is the child's own words. The server decides its subject (F1-3): a
// question about another subject is answered with a pointer to that subject, not here.
export function StudyQuestion({ w, subject, tone }: { w: Words; subject: Subject; tone: string }) {
  const [text, setText] = useState('');
  const [asked, setAsked] = useState<UnderstandInput | null>(null);
  return (
    <div className="flex flex-col gap-3">
      <form
        className="fam-card flex flex-col gap-3 bg-white p-4 sm:p-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim().length >= 3) setAsked({ kind: 'question', text: text.trim() });
        }}
      >
        <Textarea id={`fam-question-${subject}`} label={w['fam.study.ask']} helperText={w['fam.study.askHelp']} maxLength={500} rows={3} value={text} onChange={(e) => setText(e.target.value)} />
        <Button type="submit" disabled={text.trim().length < 3} className={`fam-cta fam-press w-full rounded-2xl bg-royal-deep font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto sm:self-start ${subjectTheme(subject).tile}`}>
          {w['fam.study.askButton']}
        </Button>
      </form>
      {asked && <UnderstandView key={asked.kind === 'question' ? asked.text : ''} w={w} input={asked} tone={tone} />}
    </div>
  );
}
