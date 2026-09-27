import { Icon, type IconName } from '@/components/visual/Icons';
import { publishedClaims } from '@/content/pricing';

// Below the hero, per the founder's reference: a commitment band and six
// benefit cards. The band states only confirmed commitments (the claim
// registry), never an outcome guarantee or unmeasured experience.

const BENEFITS: { title: string; body: string; icon: IconName; card: string; chip: string; head: string }[] = [
  { title: 'Save Hours Every Week', body: 'Automate routine admin tasks and focus on students.', icon: 'operations', card: 'from-royal/10 to-white', chip: 'bg-royal text-white', head: 'text-royal-deep' },
  { title: 'Improve Student Results', body: 'Track learning, find gaps early and give the right support.', icon: 'chart', card: 'from-turquoise/15 to-white', chip: 'bg-emerald text-white', head: 'text-emerald' },
  { title: 'Happier & More Engaged Parents', body: 'Real-time updates on WhatsApp with two-way communication.', icon: 'parent', card: 'from-tangerine/15 to-white', chip: 'bg-tangerine text-slate', head: 'text-tangerine-deep' },
  { title: 'More Admissions and Growth', body: 'A modern, trusted system that parents value.', icon: 'school', card: 'from-grape/10 to-white', chip: 'bg-grape text-white', head: 'text-grape-deep' },
  { title: 'Data-Driven Decision Making', body: 'Clear reports and insights for smarter planning.', icon: 'reports', card: 'from-coral/15 to-white', chip: 'bg-coral text-slate', head: 'text-coral-deep' },
  { title: 'Stronger Teacher Collaboration', body: 'Plan, share and track progress together.', icon: 'teacher', card: 'from-cyan/15 to-white', chip: 'bg-cyan text-slate', head: 'text-azure' },
];

export function WhyChoose() {
  const commitments = publishedClaims.map((c) => c.title);
  return (
    <section aria-labelledby="why-title" className="bg-white">
      <div className="mx-auto flex w-full max-w-[86rem] flex-col gap-6 px-4 py-10 sm:px-6">
        <div className="nca-lift grid grid-cols-1 items-center gap-5 rounded-3xl border border-emerald/20 bg-gradient-to-r from-turquoise/10 via-white to-grape/5 p-5 sm:p-6 lg:grid-cols-[auto_1fr_auto]">
          <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald text-white shadow-lg">
            <Icon name="shield" className="h-9 w-9" />
          </span>
          <div className="flex flex-col gap-2">
            <h2 className="text-2xl font-extrabold text-emerald">Our Commitment to Your School</h2>
            <p className="text-slate">
              We start every school in pilot mode, keep your records in India and isolated from every other school, show
              WhatsApp costs openly and let you change plans as you grow. When your whole school community works in one
              system, teachers, parents and leaders finally see the same picture, and that is where learning and trust grow.
            </p>
            <ul className="flex flex-wrap gap-2">
              {commitments.map((c) => (
                <li key={c} className="flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs font-bold text-slate shadow-sm">
                  <Icon name="check" className="h-3.5 w-3.5 text-emerald" />
                  {c}
                </li>
              ))}
            </ul>
          </div>
          <div className="flex items-center gap-3 rounded-2xl bg-emerald px-4 py-3 text-white shadow-lg">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-emerald">
              <Icon name="check" className="h-6 w-6" />
            </span>
            <span className="leading-tight">
              <b className="block text-lg">Pilot first</b>
              <span className="block text-sm">Nothing reaches a parent until you approve</span>
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-gold text-slate shadow-md">
            <Icon name="trophy" className="h-6 w-6" />
          </span>
          <h2 id="why-title" className="text-2xl font-extrabold text-slate sm:text-3xl">
            Why Schools Choose NetCyberAI
          </h2>
        </div>
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {BENEFITS.map((b) => (
            <li key={b.title} className={`nca-lift flex flex-col gap-3 rounded-2xl border border-slate/10 bg-gradient-to-b p-4 ${b.card}`}>
              <span className="flex items-center gap-3">
                <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${b.chip}`}>
                  <Icon name={b.icon} className="h-5 w-5" />
                </span>
                <b className={`text-base leading-tight ${b.head}`}>{b.title}</b>
              </span>
              <span className="text-sm text-slate">{b.body}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
