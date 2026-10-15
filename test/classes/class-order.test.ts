import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { classOrderSql, classRank, classSortKeySql, compareClasses, SCHOOL_GRADES, sortClasses } from '@/lib/classes/class-order';
import { STANDARD_CLASSES } from '@/lib/classes/standard-classes';

// One class order everywhere (C235-A): Nursery < LKG < UKG < 1 < … < 12, then section, then name. The TypeScript
// comparator and the SQL `order by` are one rule: the same rows come back in the same order from both.

const row = (name: string, grade: string | null = null, section: string | null = null) => ({ name, grade, section });

describe('the class order', () => {
  it('ranks Nursery, LKG, UKG, then 1 to 12; unknown grades last', () => {
    expect(SCHOOL_GRADES.map((g) => classRank(g, null))).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
    expect(classRank(null, '10-A')).toBe(12);
    expect(classRank('', 'lkg-b')).toBe(1);
    expect(classRank(null, '5A')).toBe(7);
    expect(classRank(null, 'nursery')).toBe(0);
    expect(classRank('13', null)).toBe(15);
    expect(classRank(null, 'Toddlers')).toBe(1000);
    expect(classRank(null, null)).toBe(1000);
  });

  it('puts 2-A before 10-A, which ordering by name did not', () => {
    const names = ['10-A', '2-A', '1-B', 'UKG-A', '12-C', '1-A', 'LKG-C', 'Nursery', '11-A', '9-B'];
    expect(sortClasses(names.map((n) => row(n))).map((c) => c.name)).toEqual(['Nursery', 'LKG-C', 'UKG-A', '1-A', '1-B', '2-A', '9-B', '10-A', '11-A', '12-C']);
    expect([...names].sort()).not.toEqual(sortClasses(names.map((n) => row(n))).map((c) => c.name));
  });

  it('reads the grade and section columns first, the name only when they are empty', () => {
    // A class whose name does not say its grade is placed by its grade column; with no section column, by what its
    // name has after the grade ("6B" is section B).
    expect(sortClasses([row('Rose', '3', 'A'), row('2-B', '2', 'B'), row('Lily', '3', null)]).map((c) => c.name)).toEqual(['2-B', 'Rose', 'Lily']);
    expect(sortClasses([row('6-C', '6', 'C'), row('6B'), row('6-A', '6', 'A')]).map((c) => c.name)).toEqual(['6-A', '6B', '6-C']);
    expect(compareClasses(row('1-A', '1', 'a'), row('1-B', '1', 'B'))).toBeLessThan(0);
  });

  it('orders the 42 standard classes as they are listed', () => {
    const shuffled = [...STANDARD_CLASSES].reverse();
    expect(sortClasses(shuffled)).toEqual(STANDARD_CLASSES);
    expect(STANDARD_CLASSES.slice(0, 4).map((c) => c.name)).toEqual(['LKG-A', 'LKG-B', 'LKG-C', 'UKG-A']);
    expect(STANDARD_CLASSES.at(-1)?.name).toBe('12-C');
  });
});

describe('the class order in SQL is the same as in TypeScript', () => {
  let pg: PGlite;
  const rows = [
    row('10-A', '10', 'A'), row('2-A', '2', 'A'), row('1-B', null, null), row('UKG-A', 'UKG', 'A'), row('12-C', '12', 'C'), row('1-A', '1', 'A'),
    row('lkg-c', null, null), row('Nursery', 'Nursery', null), row('11-A', '11', 'A'), row('9-b', '9', 'b'), row('5A', null, null), row('Toddlers', null, null),
    row('Rose', '3', 'A'), row('Lily', '3', null), row('13-A', '13', 'A'), row('6B', null, null), row('6-A', '6', 'A'), row('6-C', '6', 'C'), row('Arts', '', ''), row('10-C', ' 10 ', 'C'), row('10-B', '10', 'B'),
  ];
  beforeAll(async () => {
    pg = new PGlite();
    await pg.exec(`create table classes (class_id serial primary key, name text not null, grade text, section text)`);
    for (const r of rows) await pg.query(`insert into classes (name, grade, section) values ($1, $2, $3)`, [r.name, r.grade, r.section]);
  });
  afterAll(async () => pg?.close());

  it('gives the same order, under an alias and without one', async () => {
    const want = sortClasses(rows).map((r) => r.name);
    expect((await pg.query<{ name: string }>(`select c.name from classes c order by ${classOrderSql('c')}`)).rows.map((r) => r.name)).toEqual(want);
    expect((await pg.query<{ name: string }>(`select name from classes order by ${classOrderSql('')}`)).rows.map((r) => r.name)).toEqual(want);
    // As one value, for the students list's "sort by class", both ways.
    expect((await pg.query<{ name: string }>(`select c.name from classes c order by ${classSortKeySql('c')} asc nulls last`)).rows.map((r) => r.name)).toEqual(want);
    expect((await pg.query<{ name: string }>(`select c.name from classes c order by ${classSortKeySql('c')} desc nulls last`)).rows.map((r) => r.name)).toEqual([...want].reverse());
    expect(want.slice(0, 6)).toEqual(['Nursery', 'lkg-c', 'UKG-A', '1-A', '1-B', '2-A']);
    expect(want.slice(-2)).toEqual(['Arts', 'Toddlers']);
  });
});
