'use client';

import dynamic from 'next/dynamic';
import type { ModelBlock } from '@/lib/family/blocks';
import type { Words } from '@/lib/family/fill';

// W19-D: a model block, as the answer's block switch draws it. Its own file, not BlockViews.tsx, so a screen that does
// not draw models carries none of it. The viewer and its catalogue are their own chunk (no server render: it measures the phone), and
// three.js a further chunk inside it, fetched only when the 3D view starts. The voice sync works as the board's does
// (W18-P1): the screen passes the index of the sentence being spoken (`sentence`) and the answer's spoken sentences
// (`sentences`, call.ts spokenSentences, the same list the index counts in); the model lights the part that sentence
// names (models/spoken.ts). `onAsk(partKey, label)`: the screen's "What does the <part> do?", when it wires one.
const ModelView = dynamic(() => import('./ModelView').then((m) => m.ModelView), { ssr: false, loading: () => <div className="fam-card h-80 bg-white" aria-hidden="true" /> });
export function ModelBlockView({ b, w, tone, sentence, sentences, onAsk }: { b: ModelBlock; w: Words; tone: string; sentence?: number; sentences?: readonly string[]; onAsk?: (partKey: string, label: string) => void }) {
  const said = sentence !== undefined && sentences ? (sentences[sentence] ?? null) : null;
  return <ModelView b={b} w={w} tone={tone} said={said} onAsk={onAsk} />;
}
