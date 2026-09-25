import { Container } from '@/components/ui/Container';
import { SectionHeading, DemoLabel } from '@/components/visual/Primitives';
import { BrowserFrame } from '@/components/visual/Frames';
import { ParentPulsePhone, PulseComposerScreen } from '@/components/visual/Screens';
import { Meter } from '@/components/visual/Charts';
import { Icon } from '@/components/visual/Icons';
import { colors } from '@/lib/design-tokens';
import { pulseReplies } from '@/demo-fixture/website-demo';

const tierColors = [colors.turquoise, colors.gold, colors.coral];

export function PulseTwoWay() {
  return (
    <section aria-labelledby="pulse-title" className="relative overflow-hidden bg-white">
      <div aria-hidden="true" className="absolute -left-24 top-10 h-72 w-72 rounded-full bg-cyan/20 blur-3xl" />
      <div aria-hidden="true" className="absolute -right-24 bottom-10 h-72 w-72 rounded-full bg-grape/15 blur-3xl" />
      <Container wide className="relative flex flex-col gap-10 py-20">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <SectionHeading
            id="pulse-title"
            eyebrow="Daily Learning Pulse"
            tone="communication"
            title="Teacher to parent, and back again"
            lead="The Pulse is built only from verified class activity, approved by the teacher, and delivered on WhatsApp. Parents reply with a tap, and the school sees who understood."
          />
          <DemoLabel />
        </div>

        <ol className="grid grid-cols-1 items-start gap-6 lg:grid-cols-3">
          <li className="flex flex-col gap-3">
            <p className="flex items-center gap-2 text-sm font-bold text-grape-deep">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-grape text-white">1</span>
              Teacher approves the Pulse
            </p>
            <BrowserFrame url="app.netcyberai.com/pulse">
              <PulseComposerScreen />
            </BrowserFrame>
          </li>
          <li className="flex flex-col gap-3">
            <p className="flex items-center gap-2 text-sm font-bold text-azure">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-cyan text-slate">2</span>
              Parent reads and replies on WhatsApp
            </p>
            <ParentPulsePhone />
          </li>
          <li className="flex flex-col gap-3">
            <p className="flex items-center gap-2 text-sm font-bold text-emerald">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-turquoise text-slate">3</span>
              The school sees the response
            </p>
            <div className="flex flex-col gap-4 rounded-2xl border border-slate/10 bg-white p-4 shadow-xl shadow-cyan/10">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-slate/70">6A Science Pulse</p>
                <p className="text-2xl font-extrabold text-slate">{`${pulseReplies.read} of ${pulseReplies.of} parents read it`}</p>
              </div>
              <ul className="flex flex-col gap-2.5">
                {pulseReplies.tiers.map((t, i) => (
                  <li key={t.label}>
                    <div className="flex justify-between text-xs text-slate/70">
                      <span>{t.label}</span>
                      <span className="font-semibold text-slate">{t.value}</span>
                    </div>
                    <Meter value={t.value} max={pulseReplies.read} color={tierColors[i]} label={`${t.label}: ${t.value} parents`} />
                  </li>
                ))}
              </ul>
              <ul className="flex flex-col gap-2">
                {pulseReplies.messages.map((m) => (
                  <li key={m.from} className="rounded-xl bg-off-white p-2.5">
                    <p className="text-xs font-bold text-slate">{m.from}</p>
                    <p className="text-xs text-slate/70">{m.text}</p>
                  </li>
                ))}
              </ul>
              <p className="flex items-center gap-2 rounded-xl bg-coral/15 px-3 py-2 text-xs font-semibold text-coral-deep">
                <Icon name="bell" className="h-4 w-4 shrink-0" /> 3 parents need a follow-up call
              </p>
            </div>
          </li>
        </ol>

        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <li className="flex items-center gap-3 rounded-2xl bg-cyan/15 p-4">
            <Icon name="parent" className="h-6 w-6 shrink-0 text-sapphire" />
            <p className="text-sm text-sapphire">
              <span className="font-bold">Parent ↔ Child:</span> a question to ask at dinner, every day.
            </p>
          </li>
          <li className="flex items-center gap-3 rounded-2xl bg-grape/10 p-4">
            <Icon name="teacher" className="h-6 w-6 shrink-0 text-grape-deep" />
            <p className="text-sm text-grape-deep">
              <span className="font-bold">Parent ↔ Teacher:</span> replies land with the class teacher.
            </p>
          </li>
          <li className="flex items-center gap-3 rounded-2xl bg-turquoise/15 p-4">
            <Icon name="school" className="h-6 w-6 shrink-0 text-emerald" />
            <p className="text-sm text-emerald">
              <span className="font-bold">Parent ↔ School:</span> notices and fees in the same thread.
            </p>
          </li>
        </ul>
        <p className="text-sm text-slate/70">
          WhatsApp is the primary parent channel. No app download is required; a web portal exists for anyone who
          prefers it.
        </p>
      </Container>
    </section>
  );
}
