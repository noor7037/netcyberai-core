import Link from 'next/link';
import type { AnchorHTMLAttributes, ButtonHTMLAttributes } from 'react';

const baseClasses =
  'inline-flex min-h-[44px] items-center justify-center rounded-md px-6 py-3 text-base font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2';

const variantClasses = {
  primary: 'bg-sapphire text-off-white hover:bg-sapphire/90',
  // Action CTA (orange = action in the v4 semantic system). Slate on
  // tangerine is 5.61:1. The previous `bg-emerald text-slate` was 2.67:1
  // and failed WCAG -- invisible to check_contrast.py because this map is
  // a lookup object, not a literal className.
  secondary: 'bg-tangerine text-slate shadow-lg shadow-tangerine/25 hover:bg-tangerine/90',
  outline: 'border-2 border-sapphire text-sapphire hover:bg-sapphire/10',
  // For an outline button on a dark background (e.g. a gradient CTA section).
  // A separate variant, not `outline` plus an overriding className: Tailwind's
  // generated CSS order (not JSX class-string order) decides which of two
  // same-specificity utilities wins, so `outline`'s own text-sapphire/
  // border-sapphire silently won over a later text-off-white/border-off-white
  // in className, rendering dark-on-dark, unreadable text -- confirmed via a
  // real screenshot on the Hero and CTASection gradients before this fix.
  outlineLight: 'border-2 border-off-white text-off-white hover:bg-off-white/10',
} as const;

type Variant = keyof typeof variantClasses;

type ButtonAsButton = ButtonHTMLAttributes<HTMLButtonElement> & {
  href?: undefined;
  variant?: Variant;
};

type ButtonAsLink = AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string;
  variant?: Variant;
};

export type ButtonProps = ButtonAsButton | ButtonAsLink;

export function Button({ variant = 'primary', className = '', ...props }: ButtonProps) {
  const classes = `${baseClasses} ${variantClasses[variant]} ${className}`;

  if ('href' in props && props.href) {
    const { href, ...rest } = props;
    const isExternal = href.startsWith('http') || href.startsWith('https://wa.me');
    return (
      <Link
        href={href}
        className={classes}
        {...(isExternal ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
        {...rest}
      >
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
