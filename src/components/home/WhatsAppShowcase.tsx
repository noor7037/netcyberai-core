'use client';

import { useRef, useState } from 'react';
import { Container } from '@/components/ui/Container';
import { DemoLabel, Eyebrow } from '@/components/visual/Primitives';
import { Icon, type IconName } from '@/components/visual/Icons';
import { tones, type Tone } from '@/lib/semantic';
import { usePrefersReducedMotion } from '@/lib/hooks';
import { whatsappStory as story, type ChatItem } from '@/demo-fixture/website-demo';

// The parent's side of NetCyberAI as one WhatsApp conversation. The five
// story steps are buttons that scroll the phone to the matching message,
// so the visitor can follow school -> parent -> reply -> school -> teacher
// without reading a diagram. Fixture data only; nothing is sent.

const STEPS: { id: string; target: string; title: string; body: string; icon: IconName; tone: Tone }[] = [
  { id: 's1', target: 'pulse', title: 'Something happens in school', body: 'Teachers mark what they taught today. That is the only input they give.', icon: 'teacher', tone: 'product' },
  { id: 's2', target: 'pulse', title: 'The parent gets a useful update', body: 'One short message in English and Hinglish: what was taught, and one question to ask at home.', icon: 'chat', tone: 'communication' },
  { id: 's3', target: 'reply', title: 'The parent replies in one tap', body: '“Achhe se samjha”, “Thoda samjha” or “Samajh nahi aaya”. No app, no login.', icon: 'parent', tone: 'achievement' },
  { id: 's4', target: 'recorded', title: 'The school sees where help is needed', body: 'Replies add up by class and topic, so the teacher sees which lesson needs another look.', icon: 'chart', tone: 'intelligence' },
  { id: 's5', target: 'followup', title: 'The teacher follows up', body: 'The revision happens, and the parent hears back. The loop is closed, not just “a notice was sent”.', icon: 'check', tone: 'success' },
];

const ALSO: { label: string; target: string; icon: IconName }[] = [
  { label: 'Homework reminders', target: 'homework', icon: 'homework' },
  { label: 'Fees and receipts', target: 'fee', icon: 'fees' },
  { label: 'Personal Best', target: 'personal-best', icon: 'trophy' },
];

function Bubble({ item, active }: { item: ChatItem; active: boolean }) {
  const ring = active ? 'ring-2 ring-royal ring-offset-2 ring-offset-peach/40' : '';
  if (item.kind === 'day') {
    return (
      <p className="mx-auto rounded-md bg-white/80 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate/70">{item.text}</p>
    );
  }
  if (item.kind === 'out') {
    return (
      <div id={`wa-${item.id}`} className={`ml-10 self-end rounded-xl rounded-tr-none bg-leaf/25 px-3 py-2 text-[13px] leading-snug text-slate shadow-sm transition-shadow ${ring}`}>
        {item.text}
        <span className="mt-1 block text-right text-[10px] text-slate/70">{`${item.time} ✓✓`}</span>
      </div>
    );
  }
  if (item.kind === 'pulse') {
    return (
      <div id={`wa-${item.id}`} className={`mr-4 self-start overflow-hidden rounded-xl rounded-tl-none bg-white text-[13px] leading-snug text-slate shadow-sm transition-shadow ${ring}`}>
        <p className={`px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide ${tones.communication.soft}`}>Daily Learning Pulse · {story.className}</p>
        <div className="flex flex-col gap-2 px-3 py-2">
          <p className="font-semibold">{item.greeting}</p>
          <p className="text-slate/70">{item.hinglish}</p>
          <ul className="flex flex-col gap-1.5">
            {item.subjects.map((s) => (
              <li key={s.subject} className="rounded-lg border border-slate/10 bg-off-white px-2.5 py-1.5">
                <p className="text-[12px] font-bold">{s.subject}</p>
                <p className="text-[11px] text-slate/70">{s.teacher}</p>
                <p className="mt-0.5 text-[12px]">{s.ask}</p>
                <p className="text-[12px] text-slate/70">{s.askHinglish}</p>
              </li>
            ))}
          </ul>
          <p className="font-semibold">{item.prompt}</p>
          <ul className="flex flex-col gap-1">
            {item.tiers.map((t) => (
              <li key={t} className={`rounded-md border px-2 py-1 text-center text-[12px] font-semibold ${t === 'Thoda samjha' ? 'border-gold bg-gold/15' : 'border-slate/15'}`}>
                {t}
              </li>
            ))}
          </ul>
          <span className="block text-right text-[10px] text-slate/70">{item.time}</span>
        </div>
      </div>
    );
  }
  return (
    <div id={`wa-${item.id}`} className={`mr-8 self-start rounded-xl rounded-tl-none bg-white px-3 py-2 text-[13px] leading-snug text-slate shadow-sm transition-shadow ${ring}`}>
      {item.badge && <p className={`mb-1 inline-block rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${tones.success.soft}`}>{item.badge}</p>}
      <p>{item.text}</p>
      {item.hinglish && <p className="mt-1 text-slate/70">{item.hinglish}</p>}
      {item.attachment && (
        <p className="mt-2 flex items-center gap-2 rounded-lg bg-off-white px-2 py-1.5 text-[12px] font-semibold">
          <span className="flex h-7 w-7 items-center justify-center rounded bg-coral/15 text-coral-deep">
            <Icon name="certificate" className="h-4 w-4" />
          </span>
          {item.attachment}
        </p>
      )}
      {item.actions && (
        <ul className="mt-2 flex flex-col gap-1">
          {item.actions.map((a) => (
            <li key={a} className="rounded-md border border-slate/15 px-2 py-1 text-center text-[12px] font-semibold text-emerald">
              {a}
            </li>
          ))}
        </ul>
      )}
      <span className="mt-1 block text-right text-[10px] text-slate/70">{item.time}</span>
    </div>
  );
}

export function WhatsAppShowcase() {
  const chatRef = useRef<HTMLDivElement>(null);
  const reduced = usePrefersReducedMotion();
  const [active, setActive] = useState<string>('s1');
  const [target, setTarget] = useState<string>('pulse');

  function go(stepId: string, messageId: string) {
    setActive(stepId);
    setTarget(messageId);
    const chat = chatRef.current;
    const el = chat?.querySelector<HTMLElement>(`#wa-${messageId}`);
    if (chat && el) chat.scrollTo({ top: el.offsetTop - 12, behavior: reduced ? 'auto' : 'smooth' });
  }

  return (
    <section aria-labelledby="whatsapp-title" className="bg-off-white">
      <Container wide className="grid grid-cols-1 items-start gap-12 py-20 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="order-2 flex flex-col items-center gap-4 lg:order-1 lg:sticky lg:top-24">
          <div className="w-full max-w-[21rem] rounded-[2.6rem] border-[9px] border-midnight bg-midnight shadow-2xl shadow-grape/25">
            <div className="overflow-hidden rounded-[2rem] bg-off-white">
              <div className="flex items-center justify-between bg-emerald px-5 pb-1 pt-2 text-[11px] font-semibold text-white">
                <span>9:41</span>
                <span aria-hidden="true" className="h-4 w-20 rounded-full bg-midnight" />
                <span>5G</span>
              </div>
              <div className="flex items-center gap-2.5 bg-emerald px-3 pb-2.5 pt-1 text-white">
                <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-xs font-extrabold text-emerald">
                  SP
                </span>
                <div className="min-w-0 leading-tight">
                  <p className="truncate text-sm font-semibold">Sunrise Public School</p>
                  <p className="truncate text-xs">{`Official updates · ${story.child}, ${story.className}`}</p>
                </div>
              </div>
              <div
                ref={chatRef}
                role="region"
                aria-label="Demo WhatsApp conversation between the school and a parent"
                tabIndex={0}
                className="relative flex h-[34rem] flex-col gap-2 overflow-y-auto bg-peach/25 p-3 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-royal"
              >
                {story.items.map((item) => (
                  <Bubble key={item.id} item={item} active={item.kind !== 'day' && item.id === target} />
                ))}
              </div>
              <div className="flex items-center gap-2 border-t border-slate/10 bg-white px-3 py-2">
                <span className="flex-1 rounded-full bg-off-white px-3 py-1.5 text-xs text-slate/70">Message</span>
                <span aria-hidden="true" className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald text-white">
                  <Icon name="arrow" className="h-4 w-4" />
                </span>
              </div>
            </div>
          </div>
          <DemoLabel />
        </div>

        <div className="order-1 flex flex-col gap-6 lg:order-2">
          <Eyebrow tone="communication">For parents, on WhatsApp</Eyebrow>
          <h2 id="whatsapp-title" className="text-3xl font-extrabold tracking-tight text-slate sm:text-4xl">
            The parent knows what their child learned today, and the school knows where to help.
          </h2>
          <p className="text-lg text-slate/70">
            Parents already use WhatsApp, so that is where NetCyberAI meets them. One honest update a day, a one-tap
            reply, and a teacher who follows up. Tap a step to see it in the chat.
          </p>
          <ol className="flex flex-col gap-2">
            {STEPS.map((s, i) => {
              const on = active === s.id;
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    aria-pressed={on}
                    onClick={() => go(s.id, s.target)}
                    className={`flex w-full items-start gap-4 rounded-2xl border p-4 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-royal ${on ? 'border-royal bg-white shadow-lg' : 'border-slate/10 bg-white/60 hover:bg-white'}`}
                  >
                    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tones[s.tone].solid}`}>
                      <Icon name={s.icon} className="h-5 w-5" />
                    </span>
                    <span className="flex flex-col gap-0.5">
                      <span className="text-xs font-bold uppercase tracking-wide text-slate/70">{`Step ${i + 1}`}</span>
                      <span className="font-extrabold text-slate">{s.title}</span>
                      <span className="text-sm text-slate/70">{s.body}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
          <div className="flex flex-col gap-3">
            <p className="text-sm font-bold text-slate">The same chat also carries</p>
            <ul className="flex flex-wrap gap-2">
              {ALSO.map((a) => (
                <li key={a.target}>
                  <button
                    type="button"
                    onClick={() => go('', a.target)}
                    className={`inline-flex min-h-[44px] items-center gap-2 rounded-full px-4 text-sm font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-royal ${tones.communication.soft}`}
                  >
                    <Icon name={a.icon} className="h-4 w-4" /> {a.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {[
              { t: 'No app to install', b: 'Everything arrives in WhatsApp.', icon: 'parent' as IconName },
              { t: 'Consent first', b: 'Messages go only to parents who agreed.', icon: 'shield' as IconName },
              { t: 'Nothing fails silently', b: 'If a message is not delivered, the school sees it.', icon: 'alert' as IconName },
            ].map((g) => (
              <li key={g.t} className="flex gap-3 rounded-2xl border border-slate/10 bg-white p-4">
                <Icon name={g.icon} className="mt-0.5 h-5 w-5 shrink-0 text-royal" />
                <span className="flex flex-col">
                  <span className="text-sm font-extrabold text-slate">{g.t}</span>
                  <span className="text-sm text-slate/70">{g.b}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </Container>
    </section>
  );
}
