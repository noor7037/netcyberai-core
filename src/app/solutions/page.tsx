import { Container } from '@/components/ui/Container';
import { Button } from '@/components/ui/Button';
import { buildMetadata, pageMeta } from '@/lib/seo';

export const metadata = buildMetadata(pageMeta.solutions);

const SOLUTIONS = [
  { title: 'Principal', description: 'A private, non-public signal on teaching quality and a daily operational summary — not a public leaderboard.' },
  { title: 'School Admin', description: 'Student, guardian, class, and consent records in one place, with an audit trail on every change.' },
  { title: 'Teacher', description: 'Fast daily entry — attendance, the Daily Pulse update, marks — built for a budget Android phone.' },
  { title: 'Finance', description: 'Fee structures, dues, and an automated WhatsApp reminder sequence with a UPI link.' },
  { title: 'Admissions', description: 'A real Get Started/Book Demo pipeline into the Control Plane onboarding stages.' },
  { title: 'Multi-school', description: 'One platform account, several schools, each fully tenant-isolated at the database layer — not just at the UI.' },
  {
    title: 'CBSE',
    description:
      'Built for the realities of Indian K-12 schooling. [GAP: specific CBSE board-compliance claims are not yet verified — we will not state a compliance claim we have not confirmed.]',
  },
  {
    title: 'Budget Private Schools',
    description: 'Designed around budget Android phones and WhatsApp as the default channel — not a desktop-first assumption.',
  },
] as const;

export default function SolutionsPage() {
  return (
    <>
      <section className="bg-gradient-to-br from-sapphire via-sapphire to-azure">
        <Container className="flex flex-col gap-4 py-16 text-off-white">
          <h1 className="max-w-2xl text-3xl font-bold sm:text-4xl">Built around who actually uses it</h1>
          <p className="max-w-2xl text-lg text-off-white/90">
            The same platform, shaped around each real role's own daily reality — not one generic
            dashboard for everyone.
          </p>
        </Container>
      </section>

      <section className="bg-off-white">
        <Container className="py-16">
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {SOLUTIONS.map((s) => (
              <div key={s.title} className="flex flex-col gap-2 rounded-lg border border-slate/10 bg-white p-6 shadow-sm">
                <h2 className="text-lg font-bold text-slate">{s.title}</h2>
                <p className="text-sm text-slate/70">{s.description}</p>
              </div>
            ))}
          </div>
        </Container>
      </section>

      <section className="bg-sapphire">
        <Container className="flex flex-col items-start gap-4 py-16 text-off-white">
          <h2 className="text-2xl font-bold">Tell us which one is you</h2>
          <Button href="/get-started" variant="secondary">
            Get started
          </Button>
        </Container>
      </section>
    </>
  );
}
