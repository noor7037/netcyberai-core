import type { HTMLAttributes } from 'react';

// `wide` is for the visual marketing sections (1152px); the default
// 1024px measure stays for text-led pages and the internal app.
export function Container({ className = '', wide = false, children, ...props }: HTMLAttributes<HTMLDivElement> & { wide?: boolean }) {
  return (
    <div className={`mx-auto w-full ${wide ? 'max-w-6xl' : 'max-w-5xl'} px-4 sm:px-6 ${className}`} {...props}>
      {children}
    </div>
  );
}
