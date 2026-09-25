import { Container } from '@/components/ui/Container';
import { Reveal } from '@/components/ui/Reveal';

// See EcosystemDiagram.tsx's own comment: each step below is a fully
// literal className, not built from a shared ternary/lookup, so
// scripts/check_contrast.py's static parser can actually evaluate it.
export function WorkflowDiagram() {
  return (
    <section className="bg-off-white">
      <Container className="py-16">
        <Reveal>
          <h2 className="max-w-2xl text-2xl font-bold text-slate sm:text-3xl">Automation you can actually trace</h2>
          <p className="mt-3 max-w-2xl text-slate/70">
            One real example — the fee-reminder sequence, end to end. Every automated message goes
            through the same consent- and quiet-hours-aware send gate.
          </p>
        </Reveal>
        <Reveal className="mt-10">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch sm:gap-2">
            <div className="flex flex-1 items-center gap-2">
              <div className="flex h-full flex-1 items-center justify-center rounded-lg bg-sapphire px-3 py-4 text-center text-sm font-semibold text-off-white">
                Fee falls due
              </div>
              <span aria-hidden="true" className="hidden text-slate/70 sm:block">→</span>
            </div>
            <div className="flex flex-1 items-center gap-2">
              <div className="flex h-full flex-1 items-center justify-center rounded-lg bg-azure px-3 py-4 text-center text-sm font-semibold text-off-white">
                WhatsApp reminder sent
              </div>
              <span aria-hidden="true" className="hidden text-slate/70 sm:block">→</span>
            </div>
            <div className="flex flex-1 items-center gap-2">
              <div className="flex h-full flex-1 items-center justify-center rounded-lg bg-violet px-3 py-4 text-center text-sm font-semibold text-off-white">
                Parent taps UPI link
              </div>
              <span aria-hidden="true" className="hidden text-slate/70 sm:block">→</span>
            </div>
            <div className="flex flex-1 items-center gap-2">
              <div className="flex h-full flex-1 items-center justify-center rounded-lg bg-emerald px-3 py-4 text-center text-sm font-semibold text-off-white">
                Payment recorded
              </div>
              <span aria-hidden="true" className="hidden text-slate/70 sm:block">→</span>
            </div>
            <div className="flex flex-1 items-center gap-2">
              <div className="flex h-full flex-1 items-center justify-center rounded-lg bg-emerald px-3 py-4 text-center text-sm font-semibold text-off-white">
                Receipt sent automatically
              </div>
            </div>
          </div>
        </Reveal>
      </Container>
    </section>
  );
}
