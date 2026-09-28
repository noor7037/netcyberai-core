import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/visual/Icons';
import { TRIAL_CTA } from '@/content/free-tools';

// The founder's call to action on every free tool page, word for word,
// linked to the trial sign-up (Start a Pilot) page.
export function TrialCta({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`flex flex-col gap-4 rounded-3xl bg-sapphire text-white sm:flex-row sm:items-center sm:justify-between ${compact ? 'p-5' : 'p-6 sm:p-8'}`}>
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-tangerine text-slate">
          <Icon name="sparkle" className="h-5 w-5" />
        </span>
        <p className={`font-bold ${compact ? 'text-base' : 'text-lg'}`}>{TRIAL_CTA.text}</p>
      </div>
      <Button href={TRIAL_CTA.href} variant="secondary" className="shrink-0">
        {TRIAL_CTA.button} <Icon name="arrow" className="ml-1 h-4 w-4" />
      </Button>
    </div>
  );
}
