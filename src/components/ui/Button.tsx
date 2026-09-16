import Link from 'next/link';
import type { AnchorHTMLAttributes, ButtonHTMLAttributes } from 'react';

const baseClasses =
  'inline-flex min-h-[44px] items-center justify-center rounded-md px-6 py-3 text-base font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2';

const variantClasses = {
  primary: 'bg-sapphire text-off-white hover:bg-sapphire/90',
  secondary: 'bg-emerald text-slate hover:bg-emerald/90',
  outline: 'border-2 border-sapphire text-sapphire hover:bg-sapphire/10',
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
