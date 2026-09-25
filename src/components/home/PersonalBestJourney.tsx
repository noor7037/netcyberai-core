import { Container } from '@/components/ui/Container';
import { SectionHeading, DemoLabel } from '@/components/visual/Primitives';
import { LineChart } from '@/components/visual/Charts';
import { CertificateCard } from '@/components/visual/Screens';
import { ChatIn, PhoneFrame } from '@/components/visual/Frames';
import { Icon, type IconName } from '@/components/visual/Icons';
import { tones, type Tone } from '@/lib/semantic';
import { colors } from '@/lib/design-tokens';
import { personalBest } from '@/demo-fixture/website-demo';

const JOURNEY: { title: string; detail: string; icon: IconName; tone: Tone }[] = [
  { title: 'Baseline', detail: `Unit 1: ${personalBest.scores[0]}. The only comparison is with her own past.`, icon: 'chart', tone: 'product' },
  { title: 'Improvement', detail: 'Scores rise across units as she practises.', icon: 'arrow', tone: 'communication' },
  { title: 'Personal Best detected', detail: `Unit 6: ${personalBest.scores[5]}, beating her previous best of ${personalBest.previousBest}.`, icon: 'sparkle', tone: 'intelligence' },
  { title: 'Badge', detail: 'A Personal Best badge appears on her progress view.', icon: 'trophy', tone: 'achievement' },
  { title: 'Certificate', detail: 'A certificate is prepared for the teacher to approve.', icon: 'certificate', tone: 'action' },
  { title: 'Teacher recognition', detail: 'The teacher adds a line of praise in class.', icon: 'teacher', tone: 'success' },
  { title: 'Parent notified', detail: 'Her parents get the news on WhatsApp.', icon: 'chat', tone: 'communication' },
];

export function PersonalBestJourney() {
  return (
    <section aria-labelledby="pb-title" className="relative overflow-hidden bg-violet text-white">
      <div aria-hidden="true" className="nca-mesh-warm absolute inset-0" />
      <div aria-hidden="true" className="nca-float-slow absolute left-8 top-16 h-3 w-3 rotate-45 rounded-sm bg-gold" />
      <div aria-hidden="true" className="nca-float absolute right-12 top-24 h-2.5 w-2.5 rounded-full bg-cyan" />
      <div aria-hidden="true" className="nca-float-slow absolute bottom-24 left-1/2 h-3 w-3 rounded-full bg-tangerine" />
      <div aria-hidden="true" className="nca-float absolute bottom-16 right-1/3 h-2.5 w-2.5 rotate-12 rounded-sm bg-sunshine" />
      <Container wide className="relative flex flex-col gap-10 py-20">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <SectionHeading
            dark
            id="pb-title"
            eyebrow="Student growth"
            tone="achievement"
            title="Every student can win a Personal Best"
            lead="Recognition that rewards progress against a student's own past, so the child at the back of the class can celebrate too."
          />
          <DemoLabel onDark />
        </div>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
          <div className="flex flex-col gap-5">
            <div className="rounded-3xl bg-white p-5 text-slate shadow-2xl">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <p className="font-extrabold text-slate">{`${personalBest.studentName} · ${personalBest.subject}`}</p>
                <span className="inline-flex items-center gap-1 rounded-full bg-gold px-2.5 py-0.5 text-xs font-bold text-slate">
                  <Icon name="trophy" className="h-3.5 w-3.5" /> Personal Best
                </span>
              </div>
              <LineChart
                title={`${personalBest.studentName}, ${personalBest.subject} unit test scores`}
                labels={personalBest.labels}
                series={[{ name: 'Score', color: colors.grape, values: personalBest.scores }]}
                min={40}
                max={80}
                height={210}
              />
              <p className="mt-2 text-xs text-slate/70">{`Baseline ${personalBest.scores[0]} → Personal Best ${personalBest.scores[5]}`}</p>
            </div>
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <li className="rounded-2xl bg-gold p-3 text-slate">
                <p className="text-xs font-bold uppercase tracking-wide">Primary</p>
                <p className="font-extrabold">Personal Best</p>
              </li>
              <li className="rounded-2xl bg-sunshine p-3 text-slate">
                <p className="text-xs font-bold uppercase tracking-wide">Secondary</p>
                <p className="font-extrabold">Most Improved</p>
              </li>
              <li className="rounded-2xl bg-white p-3 text-slate">
                <p className="text-xs font-bold uppercase tracking-wide">Optional, off by default</p>
                <p className="font-extrabold">Class Top-3</p>
              </li>
            </ul>
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <ol className="flex flex-col gap-2 sm:col-span-2 xl:col-span-1" aria-label="Personal Best journey">
              {JOURNEY.map((j, i) => (
                <li key={j.title} className="nca-glass flex items-start gap-3 rounded-xl p-3">
                  <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${tones[j.tone].solid}`}>
                    <Icon name={j.icon} className="h-4 w-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-bold">{`${i + 1}. ${j.title}`}</span>
                    <span className="block text-xs opacity-80">{j.detail}</span>
                  </span>
                </li>
              ))}
            </ol>
            <div className="flex flex-col gap-4 sm:col-span-2 xl:col-span-1">
              <CertificateCard />
              <PhoneFrame title="Sunrise Public School" subtitle="Recognition">
                <ChatIn time="5:20 pm">
                  <p className="font-bold">Personal Best! 🎉</p>
                  <p className="mt-1">{`${personalBest.studentName} scored ${personalBest.scores[5]} in ${personalBest.subject}, her best ever. Her certificate is attached.`}</p>
                </ChatIn>
              </PhoneFrame>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
