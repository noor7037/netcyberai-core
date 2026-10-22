'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Textarea';
import type { Words } from '@/lib/family/fill';
import type { Subject } from '@/lib/family/subjects';
import { UnderstandView, type UnderstandInput } from './UnderstandView';
import { VoiceInput } from './VoiceInput';

// A typed question, asked from the chosen subject's page (M1-5, C251). It stays on this page (never in the address bar)
// and is never kept in the shared library: it is the child's own words. The server decides its subject (F1-3): a
// question about another subject is answered with a pointer to that subject, not here.
// `voice`: the microphone (M2-7, C281), only when the parent said yes to voice and Control has voice input on; the
// words it hears go into the box, for the child to check and edit before asking.
export function StudyQuestion({ w, subject, tone, voice = false }: { w: Words; subject: Subject; tone: string; voice?: boolean }) {
  const [text, setText] = useState('');
  const [asked, setAsked] = useState<UnderstandInput | null>(null);
  return (
    <div className="flex flex-col gap-3">
      <form
        className="flex flex-col gap-3 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate/10"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim().length >= 3) setAsked({ kind: 'question', text: text.trim() });
        }}
      >
        <Textarea id={`fam-question-${subject}`} label={w['fam.study.ask']} helperText={w['fam.study.askHelp']} maxLength={500} rows={3} value={text} onChange={(e) => setText(e.target.value)} />
        {voice && <VoiceInput w={w} onText={(heard) => setText((t) => (t.trim() ? `${t.trim()} ${heard}` : heard).slice(0, 500))} />}
        <Button type="submit" disabled={text.trim().length < 3} className="w-full sm:w-auto sm:self-start">
          {w['fam.study.askButton']}
        </Button>
      </form>
      {asked && <UnderstandView key={asked.kind === 'question' ? asked.text : ''} w={w} input={asked} tone={tone} />}
    </div>
  );
}
