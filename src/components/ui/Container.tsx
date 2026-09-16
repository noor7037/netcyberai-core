import type { HTMLAttributes } from 'react';

export function Container({ className = '', children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`mx-auto w-full max-w-5xl px-4 sm:px-6 ${className}`} {...props}>
      {children}
    </div>
  );
}
