# AG-1 — App design system + gallery

**Branch:** `ag/AG-1-design-system` · **Status:** Ready · **Depends on:** nothing

## Goal
One component kit that every module screen (P1–P8) is built from, so 33 modules
look like one product and match the demo (`src/components/showcase/PrincipalDashboard.tsx`,
`TeacherApp.tsx`, `ParentApp.tsx`).

## Allowed paths
- `src/components/app-ui/**` (new)
- `src/app/design-system/**` (new, the gallery)
- `src/demo-fixture/app-ui/**` (new, sample data for the gallery only)
- tests next to the components (`*.test.ts[x]`)

Anything else, including `src/components/ui/**` (used by live screens) and
`src/lib/design-tokens.ts`: do not edit. Ask in the PR description instead.

## Build
1. **Layout:** `PageHeader` (title, subtitle, actions, breadcrumb), `Section`,
   `ResponsiveGrid`, `StatGrid`.
2. **Data display:** `StatTile` (value, delta, count-up, drill-down link),
   `DataTable`, which becomes a card list below 768 px and supports a sort
   header, row selection and a sticky bulk-action bar, `ListCard`,
   `StatusBadge` (icon + label, never colour alone), `Timeline`, `Avatar`.
3. **Filters UI (visual only; the engine is Core):** `FilterBar` (one row,
   chips, "More filters" sheet on phones), `SavedViewsMenu`, `SearchBox`.
   Props are plain typed values, with no fetching.
4. **Charts:** wrap `src/components/visual/Charts.tsx`; don't fork it. Add
   `ChartCard` (title, one-line message, table-view toggle, empty state).
5. **Feedback:** `Skeleton` for each of the above, `EmptyState` (says what to do
   next), `ErrorState` (retry), `NoPermission`, `ComingInPhase` (module name,
   phase, capability list).
6. **Group tones:** `groupTone(group)` → token pair per `17` §4 (School & People
   = sapphire/royal … AI = grape/violet), used by headers and charts.
7. **Motion:** 150–300 ms, count-up numbers, skeletons, no layout shift; all off
   under `prefers-reduced-motion` (use `usePrefersReducedMotion` from `src/lib/hooks.ts`).
8. **Gallery** at `/design-system`: every component, every state (loading /
   empty / error / no-permission / populated), each group tone, light surface
   and the midnight cinematic surface. The page must call `notFound()` when
   `process.env.NODE_ENV === 'production'`. It is for local review only and
   needs no login or database, and must set `robots: { index: false }`.

## Done when
- `bash scripts/ci_local.sh` passes every step.
- Screenshots of the gallery at 360, 390, 768, 1024, 1440, plus one with reduced motion.
- Every interactive element has a target of at least 44 px, keyboard focus is visible, and contrast passes `check_contrast.py`.
- Unit tests cover `groupTone`, the `DataTable` → card switch and the `FilterBar` chip logic.
- No hex colours outside tokens, and no invented numbers outside `src/demo-fixture/**`.
