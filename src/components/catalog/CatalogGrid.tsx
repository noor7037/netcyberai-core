import Link from 'next/link';
import { SpotlightCard } from '@/components/visual/SpotlightCard';
import { Icon } from '@/components/visual/Icons';
import type { CatalogPage } from '@/content/catalog';
import { tones } from '@/lib/semantic';

export function CatalogGrid({ pages, base }: { pages: CatalogPage[]; base: '/products' | '/solutions' }) {
  return (
    <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {pages.map((p) => (
        <li key={p.slug}>
          <Link href={`${base}/${p.slug}`} className="block h-full rounded-3xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-royal">
            <SpotlightCard className="flex h-full flex-col overflow-hidden rounded-3xl border border-slate/10 bg-white">
              <div className={`flex items-center gap-3 p-5 ${tones[p.tone].solid}`}>
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20">
                  <Icon name={p.icon} className="h-5 w-5" />
                </span>
                <span className="text-lg font-extrabold">{p.name}</span>
              </div>
              <div className="flex flex-1 flex-col gap-4 p-5">
                <p className="text-sm text-slate/70">{p.menuBlurb}</p>
                <ol className="flex flex-wrap gap-1.5" aria-label={`${p.name} workflow`}>
                  {p.workflow.slice(0, 4).map((w, i) => (
                    <li key={w.title} className={`rounded-full px-2.5 py-1 text-xs font-semibold ${tones[p.tone].soft}`}>
                      {`${i + 1}. ${w.title}`}
                    </li>
                  ))}
                </ol>
                <span className="mt-auto inline-flex items-center gap-1.5 text-sm font-bold text-royal">
                  See it working <Icon name="arrow" className="h-4 w-4" />
                </span>
              </div>
            </SpotlightCard>
          </Link>
        </li>
      ))}
    </ul>
  );
}
