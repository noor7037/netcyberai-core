# AG-3 — "Coming in P<n>" screens for every unbuilt module

**Branch:** `ag/AG-3-coming-screens` · **Status:** Blocked · **Depends on:** AG-1, AG-2, contract `src/lib/contracts/modules.ts`

## Goal
Every nav item opens a real, honest page on day one, instead of a 404 or a
generic stub. Each unbuilt module shows what it will do and when, so the demo
and the product agree.

## Allowed paths
- New `page.tsx` files under `src/app/(school)/app/<module-id>/` **only where no
  page exists yet**. Do not edit existing pages.
- `src/components/app-ui/**`

## Build
- Use `ComingInPhase` (AG-1), fed from the module contract: name, group tone,
  phase, and the capability list from `17` §3.
- Include one illustrative layout skeleton per module type (list, dashboard,
  form). It is labelled "Preview layout" and contains **no numbers and no
  names**.
- Replace no live screen. `StubPage` stays until each module ships.

## Done when
- Every module id in the contract resolves to a page. Add a test that iterates
  the contract and asserts that a route exists.
- `check_claims.py` passes: no promised dates, no invented metrics.
- Screenshots of 3 sample modules at 390 and 1440.
