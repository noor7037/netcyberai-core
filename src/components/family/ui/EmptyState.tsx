import Link from 'next/link';
import { FamIcon, type IconName } from '../FamIcon';

// The empty state of a Family screen (W6-B, docs/38 §5): a mark, one sentence and one action. No paragraph. The mark is
// a drawn icon on the brand gradient; the action is a real link, 44 px high or more.
export function EmptyState({ icon, text, href, action, ...data }: { icon: IconName; text: string; href: string; action: string; [data: `data-${string}`]: string | boolean | undefined }) {
  return (
    <section {...data} className="fam-card fam-empty bg-white text-slate">
      <span aria-hidden="true" className="fam-empty-mark bg-ink text-white">
        <FamIcon name={icon} className="h-6 w-6" />
      </span>
      <p className="text-base font-semibold text-slate">{text}</p>
      <Link href={href} className="fam-press inline-flex min-h-[44px] items-center justify-center rounded-full bg-white px-5 text-sm font-bold text-ink ring-1 ring-ink/30">
        {action}
      </Link>
    </section>
  );
}
