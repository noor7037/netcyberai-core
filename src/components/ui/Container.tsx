import type { HTMLAttributes } from 'react';

// The public site's one page shell (C543, `.nca-shell` in globals.css): up to 120rem wide with a gutter of
// clamp(16px, 3vw, 56px), so the Header, Footer and every section line up and use a wide screen. `reading` keeps
// long text (articles, legal pages, FAQs) at about 75 characters a line, centred in the page.
export function Container({ className = '', reading = false, children, ...props }: HTMLAttributes<HTMLDivElement> & { reading?: boolean }) {
  return (
    <div className={`nca-shell ${reading ? 'nca-shell-reading' : ''} ${className}`} {...props}>
      {children}
    </div>
  );
}
