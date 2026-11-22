// One savepoint at a time on a connection (founder's launch check, 22 Nov 2026). A page that reads several children at
// once (Promise.all) on the family's single connection used to interleave savepoints: savepoint A, savepoint B,
// release A (which also releases B), then release B failed with "savepoint does not exist" and the parent area crashed
// for a family with two children. Every savepoint-guarded read now waits for the previous one on the same connection.
const chains = new WeakMap<object, Promise<unknown>>();

export function oneAtATime<T>(db: object, job: () => Promise<T>): Promise<T> {
  const before = chains.get(db) ?? Promise.resolve();
  const run = before.then(job, job);
  chains.set(db, run.then(() => undefined, () => undefined));
  return run;
}
