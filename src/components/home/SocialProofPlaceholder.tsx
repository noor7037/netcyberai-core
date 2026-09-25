import { Container } from '@/components/ui/Container';
import { Reveal } from '@/components/ui/Reveal';
import { Badge } from '@/components/ui/Badge';

// Explicit, honest structure per the founder's own instruction: no
// invented customers, quotes, or case studies. These sections exist so
// the LAYOUT is ready the moment a real pilot school agrees to be
// named -- until then, they say so plainly rather than filling the
// space with something that looks real but isn't.
export function SocialProofPlaceholder() {
  return (
    <section className="bg-off-white">
      <Container className="py-16">
        <Reveal>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-2xl font-bold text-slate sm:text-3xl">From schools using NetCyberAI</h2>
            <Badge>Coming as pilots complete</Badge>
          </div>
          <p className="mt-3 max-w-2xl text-slate/70">
            We don&apos;t publish quotes or case studies until a real school has agreed to be named. This
            section will carry their words, not ours, once that happens.
          </p>
        </Reveal>
      </Container>
    </section>
  );
}
