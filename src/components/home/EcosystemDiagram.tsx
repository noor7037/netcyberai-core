import { Container } from '@/components/ui/Container';
import { Reveal } from '@/components/ui/Reveal';
import { companyName } from '@/lib/site-config';

// Each badge below is written as its own fully-literal className,
// deliberately not built from a shared ternary/lookup keyed by a data
// field: scripts/check_contrast.py's static parser only sees literal
// className TEXT, and a `${cond ? 'a' : 'b'}`-style interpolation (even
// one this codebase already uses elsewhere, e.g. Badge.tsx's own
// variantClasses) is invisible to it -- confirmed directly by testing
// that exact shape against this checker before writing this file this
// way. Four short, explicit blocks beat a "checker-visible-looking"
// abstraction that silently isn't.
export function EcosystemDiagram() {
  return (
    <section className="bg-off-white">
      <Container className="py-16">
        <Reveal>
          <h2 className="max-w-2xl text-2xl font-bold text-slate sm:text-3xl">
            One connected system, not five separate tools
          </h2>
          <p className="mt-3 max-w-2xl text-slate/70">
            Every {companyName} surface reads and writes the same students, guardians, classes, and
            consent records — nothing is duplicated or re-entered between them.
          </p>
        </Reveal>

        <Reveal className="mt-10">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="flex flex-col gap-3 rounded-lg border border-slate/10 bg-white p-6 shadow-sm transition-transform hover:-translate-y-1 hover:shadow-md">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-sapphire text-sm font-bold text-off-white">1</div>
              <h3 className="text-base font-bold text-slate">Control Plane</h3>
              <p className="text-sm text-slate/70">Platform operations, onboarding, cross-school reporting</p>
            </div>
            <div className="flex flex-col gap-3 rounded-lg border border-slate/10 bg-white p-6 shadow-sm transition-transform hover:-translate-y-1 hover:shadow-md">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-azure text-sm font-bold text-off-white">2</div>
              <h3 className="text-base font-bold text-slate">School Portal</h3>
              <p className="text-sm text-slate/70">Office, Finance, and Academic workflows for school staff</p>
            </div>
            <div className="flex flex-col gap-3 rounded-lg border border-slate/10 bg-white p-6 shadow-sm transition-transform hover:-translate-y-1 hover:shadow-md">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-violet text-sm font-bold text-off-white">3</div>
              <h3 className="text-base font-bold text-slate">Teacher</h3>
              <p className="text-sm text-slate/70">Fast daily entry — attendance, marks, the Daily Pulse update</p>
            </div>
            <div className="flex flex-col gap-3 rounded-lg border border-slate/10 bg-white p-6 shadow-sm transition-transform hover:-translate-y-1 hover:shadow-md">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald text-sm font-bold text-off-white">4</div>
              <h3 className="text-base font-bold text-slate">Parent (WhatsApp)</h3>
              <p className="text-sm text-slate/70">No app install — every update arrives where parents already are</p>
            </div>
          </div>
        </Reveal>
      </Container>
    </section>
  );
}
