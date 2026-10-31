import Link from 'next/link';
import type { AnchorHTMLAttributes, ButtonHTMLAttributes } from 'react';

// The Family app's button (W12-E, C419): the lesson identity's two buttons. Primary is saffron with ink text (never
// white on it), secondary is an ink outline on paper. 44 px at least, and the same press as every other Family control
// (`fam-press`, off under prefers-reduced-motion). The product-wide Button in src/components/ui stays as it is for the
// school and Control screens. `secondary` is the same as `primary`, kept so callers that asked for the action colour by
// that name read the same.
const base =
  'fam-press inline-flex min-h-[44px] items-center justify-center rounded-xl px-6 py-3 text-base font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:cursor-not-allowed disabled:opacity-60';

export const familyButtonVariants = {
  primary: 'bg-saffron text-ink hover:bg-saffron/90',
  secondary: 'bg-saffron text-ink hover:bg-saffron/90',
  outline: 'border-2 border-ink bg-paper text-ink hover:bg-ink/5',
} as const;

type Variant = keyof typeof familyButtonVariants;

type ButtonAsButton = ButtonHTMLAttributes<HTMLButtonElement> & { href?: undefined; variant?: Variant };
type ButtonAsLink = AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; variant?: Variant };

export type FamilyButtonProps = ButtonAsButton | ButtonAsLink;

export function Button({ variant = 'primary', className = '', ...props }: FamilyButtonProps) {
  const classes = `${base} ${familyButtonVariants[variant]} ${className}`;

  if ('href' in props && props.href) {
    const { href, ...rest } = props;
    const isExternal = href.startsWith('http');
    return (
      <Link href={href} className={classes} {...(isExternal ? { target: '_blank', rel: 'noopener noreferrer' } : {})} {...rest}>
        {props.children}
      </Link>
    );
  }

  const { children, ...rest } = props as ButtonAsButton;
  return (
    <button className={classes} {...rest}>
      {children}
    </button>
  );
}
