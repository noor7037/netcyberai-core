import type { ReactNode } from 'react';
import type { IconName } from '@/components/visual/Icons';
import { MODULE_GROUPS, moduleById, type ColorToken, type ModuleId } from '@/lib/contracts/modules';
import { FirstVisitTour } from '@/components/app-shell/FirstVisitTour';
import { ShowMeHow } from '@/components/app-shell/ShowMeHow';
import type { TourId } from '@/lib/contracts/tours';
import { PageBanner } from './PageHeader';

// The one layout every working screen shares (docs/19 rule 1): learn one
// screen, know them all. Top to bottom, always in this order:
//
//   header   the page banner (C235-C): a gradient in the group's tone with
//            the module's icon, its title, ONE short line on what the screen
//            is for and, when there is more to say, an ⓘ "About this page"
//            (`about`); "Show me how" (the guide for this screen's task) and
//            ONE primary button on the banner's white tray
//   more     quieter actions, when a screen has them
//   notice   a message about the whole screen
//   search   the search box
//   filters  filter chips
//   body     the list, cards or form (children)
//   bulk     the bar that appears when rows are selected
//
// A slot a screen does not need is left out; the order never changes.
// `help` is the Help Center guide's slug; `tour` the first-visit tour (docs/19 rule 8).
// Give `moduleId` and the icon, colour and group name come from the registry.
// scripts/check_module_pages.py fails a /app or /control page that does not
// render through this (apart from its documented exceptions).
export function ModulePage({
  moduleId,
  title,
  purpose,
  about,
  eyebrow,
  tone,
  icon,
  primary,
  more,
  notice,
  search,
  filters,
  bulk,
  headerLang,
  hideHeaderInPrint = false,
  help,
  tour,
  children,
}: {
  moduleId?: ModuleId;
  title: string;
  purpose: string; // one short line, plain words
  about?: ReactNode; // the longer explanation, behind the ⓘ
  eyebrow?: string;
  tone?: ColorToken;
  icon?: IconName;
  primary?: ReactNode; // exactly one primary button or link
  more?: ReactNode;
  notice?: ReactNode;
  search?: ReactNode;
  filters?: ReactNode;
  bulk?: ReactNode;
  headerLang?: string; // when the title and purpose are not in the page's language (Help Center in Hindi)
  hideHeaderInPrint?: boolean; // a screen whose body is printed on its own (an ID card)
  help?: string; // slug of the Help Center guide for this screen's task
  tour?: TourId; // the first-visit tour of this screen
  children: ReactNode;
}) {
  const mod = moduleId ? moduleById(moduleId) : null;
  const group = mod ? MODULE_GROUPS.find((g) => g.id === mod.group) : null;
  const colour = tone ?? group?.tone[0] ?? 'royal';
  const glyph = icon ?? mod?.icon;
  const over = eyebrow ?? group?.label;
  return (
    <div data-module-page={moduleId ?? 'page'} className="flex flex-col gap-4 p-4 md:p-6">
      <PageBanner
        lang={headerLang}
        className={hideHeaderInPrint ? 'print:hidden' : ''}
        tone={colour}
        icon={glyph}
        eyebrow={over}
        title={title}
        subtitle={purpose}
        about={about}
        actions={
          (help || primary) && (
            <>
              {help && <ShowMeHow slug={help} />}
              {primary && <div data-slot="primary">{primary}</div>}
            </>
          )
        }
      />
      {tour && <FirstVisitTour id={tour} />}
      {more && (
        <div data-slot="more" className="flex flex-wrap items-center gap-2">
          {more}
        </div>
      )}
      {notice}
      {search && <div data-slot="search">{search}</div>}
      {filters && <div data-slot="filters">{filters}</div>}
      <div data-slot="body" className="flex min-w-0 flex-col gap-4">
        {children}
      </div>
      {bulk}
    </div>
  );
}

// The look of the one primary button, for links and buttons alike.
export const PRIMARY_ACTION = 'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-md bg-sapphire px-4 text-sm font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-royal disabled:opacity-60';
export const QUIET_ACTION = 'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-md border border-slate/20 bg-white px-4 text-sm font-semibold text-slate focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-royal';
