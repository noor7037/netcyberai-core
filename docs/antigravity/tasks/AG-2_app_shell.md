# AG-2 — App shell: 8-group navigation, desktop + phone

**Branch:** `ag/AG-2-app-shell` · **Status:** Blocked until Core PR-0 merges
`src/lib/contracts/nav.ts` (groups, modules, roles, phase, status) · **Depends on:** AG-1

## Goal
The navigation every school user sees: 8 collapsible groups from `17` §2. Each
role sees only its modules (`17` §5). Teachers keep bottom navigation on phones.

## Allowed paths
- `src/components/app-ui/shell/**`
- `src/app/design-system/**` (add shell demos)
- `src/demo-fixture/app-ui/**`

**Not allowed:** `src/app/(school)/app/layout.tsx` and
`src/app/(admin)/control/layout.tsx`. They hold auth guards. Core wires the new
shell in with a one-line swap after this PR merges; describe the exact swap in
the PR.

## Build
- `AppShell` with `SidebarGroups`: collapsible, remembers open groups per user
  in `localStorage` (wrapped in try/catch), active item, group tone accent, and a
  collapsed rail at 1024 px.
- On phones: a top bar with a drawer containing the same groups; `BottomNav` for
  the teacher role (Home, Attendance, Homework, Pulse, More).
- Driven only by the contract type: `navFor(role, entitlements)` comes from
  Core. Use a typed fixture until then. Never hard-code module lists.
- A module the school has not bought shows as locked with "Ask your admin". It
  is never hidden in a way that looks like a bug.
- Keyboard: arrow keys inside a group, Esc closes the drawer, focus is trapped
  in the drawer.

## Done when
- `ci_local.sh` passes every step. Screenshots for principal, teacher and office
  roles at 390 and 1440.
- Tests: filtering by role and entitlement, and the collapse state.
