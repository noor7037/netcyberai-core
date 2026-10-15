import type { ReactNode } from 'react';
import type { IconName } from '@/components/visual/Icons';
import type { ColorToken } from '@/lib/contracts/modules';
import { BannerTitle } from './BannerTitle';
import { ModuleIcon } from './ModuleIcon';
import { HERO_TONES } from './tones';

// The page banner (C235-C, design system v5): a gradient in the module
// group's tone (tones.ts HERO_TONES), the module's icon in a frosted tile,
// the group, the title and ONE short line in white, an ⓘ for the longer
// "About this page", and the screen's actions on a white tray so that the
// buttons keep their own colours. Under the gradient sits bg-grape, the
// lowest-contrast stop any banner uses (white 4.99:1), so
// scripts/check_contrast.py checks the white text against the worst case;
// test/app-ui/tones.test.ts checks every stop. The two soft circles darken
// (slate/10), never lighten, so they only add contrast.
export function PageBanner({
  title,
  subtitle,
  eyebrow,
  tone = 'royal',
  icon,
  about,
  actions,
  lang,
  className = '',
}: {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  tone?: ColorToken;
  icon?: IconName;
  about?: ReactNode;
  actions?: ReactNode;
  lang?: string;
  className?: string;
}) {
  return (
    <header lang={lang} data-page-banner={tone} className={`relative isolate overflow-hidden rounded-3xl bg-grape bg-gradient-to-br ${HERO_TONES[tone].cls} p-5 text-white shadow-lg shadow-slate/10 md:p-7 ${className}`}>
      <span aria-hidden="true" className="pointer-events-none absolute -right-16 -top-28 -z-10 h-64 w-64 rounded-full bg-slate/10" />
      <span aria-hidden="true" className="pointer-events-none absolute -bottom-32 right-28 -z-10 h-56 w-56 rounded-full bg-slate/10" />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-1 basis-72 items-start gap-4">
          {icon && <ModuleIcon name={icon} tone={tone} size="lg" variant="glass" />}
          <BannerTitle eyebrow={eyebrow} title={title} subtitle={subtitle} about={about} />
        </div>
        {actions && (
          <div data-banner-actions className="flex flex-wrap items-center gap-1 rounded-2xl bg-white/95 p-1 shadow-sm backdrop-blur">
            {actions}
          </div>
        )}
      </div>
    </header>
  );
}

// A screen's header, for a page outside ModulePage (the Help Center guide):
// the same banner.
export function PageHeader({
  title,
  description,
  eyebrow,
  tone = 'royal',
  icon,
  about,
  actions,
}: {
  title: string;
  description?: string;
  eyebrow?: string;
  tone?: ColorToken;
  icon?: IconName;
  about?: ReactNode;
  actions?: ReactNode;
}) {
  return <PageBanner className="mb-4" title={title} subtitle={description} eyebrow={eyebrow} tone={tone} icon={icon} about={about} actions={actions} />;
}
