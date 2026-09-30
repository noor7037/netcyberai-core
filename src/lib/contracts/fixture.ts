// Every contract fixture is wrapped in this, so non-real data can never be
// mistaken for real data: screens built on fixtures show `notice`, and
// src/demo-fixture/contracts/** is the only place fixtures live (CLAUDE.md:
// demo data only under src/demo-fixture/**).
export type Fixture<T> = { readonly nonReal: true; readonly notice: string; readonly data: T };

export const FIXTURE_NOTICE = 'Illustrative data for design and tests. Not a real school, person or number.';

export function fixture<T>(data: T): Fixture<T> {
  return { nonReal: true, notice: FIXTURE_NOTICE, data };
}
