// The parent's account and privacy controls (feature P2; M1-2, C248): see and delete answers, sign out everywhere,
// the app's language, and delete the account, which erases every family row of it (the database cascades from
// family.accounts). Every function runs in the signed-in account's own transaction (withFamilyContext).

type Db = { query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[]; rowCount?: number | null }> };

export type AccountSummary = { email: string; uiLanguage: 'en' | 'hi'; hasPin: boolean };

export async function accountSummary(db: Db, accountId: string): Promise<AccountSummary | null> {
  const { rows } = await db.query(`select email, ui_language, pin_hash is not null as has_pin from family.accounts where account_id = $1`, [accountId]);
  const r = rows[0];
  return r ? { email: String(r.email), uiLanguage: r.ui_language === 'hi' ? 'hi' : 'en', hasPin: r.has_pin === true } : null;
}

export async function setLanguage(db: Db, accountId: string, lang: 'en' | 'hi'): Promise<void> {
  await db.query(`update family.accounts set ui_language = $2 where account_id = $1`, [accountId, lang]);
}

// Every session of this account ends at its next request (token_version is checked live).
export async function signOutEverywhere(db: Db, accountId: string): Promise<void> {
  await db.query(`update family.accounts set token_version = token_version + 1 where account_id = $1`, [accountId]);
}

export async function deleteAccount(db: Db, accountId: string): Promise<boolean> {
  const res = await db.query(`delete from family.accounts where account_id = $1`, [accountId]);
  return (res.rowCount ?? 0) === 1;
}

export type Answer = { attemptId: string; childId: string; subject: string; topicKey: string; kind: 'check' | 'practice'; answer: string; correct: boolean; answeredOn: string };

export async function listAnswers(db: Db, accountId: string, childId: string, limit = 200): Promise<Answer[]> {
  const { rows } = await db.query(
    `select attempt_id, child_id, subject, topic_key, kind, answer, correct, answered_on from family.attempts
      where account_id = $1 and child_id = $2 order by created_at desc limit $3`,
    [accountId, childId, Math.min(Math.max(limit, 1), 500)]
  );
  return rows.map((r) => ({
    attemptId: String(r.attempt_id),
    childId: String(r.child_id),
    subject: String(r.subject),
    topicKey: String(r.topic_key),
    kind: r.kind === 'practice' ? 'practice' : 'check',
    answer: String(r.answer),
    correct: r.correct === true,
    answeredOn: typeof r.answered_on === 'string' ? r.answered_on.slice(0, 10) : new Date(r.answered_on as Date).toISOString().slice(0, 10),
  }));
}

// Progress is made only of checked answers, so deleting answers recomputes the progress they made.
export async function recomputeTopic(db: Db, accountId: string, childId: string, topicKey: string): Promise<void> {
  const { rows } = await db.query(
    `select subject, count(*)::int as answered, count(*) filter (where correct)::int as correct,
            min(answered_on) filter (where correct) as first_correct, max(answered_on) filter (where correct) as last_correct
       from family.attempts where account_id = $1 and child_id = $2 and topic_key = $3 group by subject`,
    [accountId, childId, topicKey]
  );
  const r = rows[0];
  if (!r) {
    await db.query(`delete from family.topic_progress where account_id = $1 and child_id = $2 and topic_key = $3`, [accountId, childId, topicKey]);
    return;
  }
  await db.query(
    `insert into family.topic_progress (account_id, child_id, topic_key, subject, answered, correct, first_correct_on, last_correct_on, mastered_on, updated_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, case when $8::date - $7::date >= 7 then $8::date end, now())
     on conflict (child_id, topic_key) do update set answered = excluded.answered, correct = excluded.correct,
       first_correct_on = excluded.first_correct_on, last_correct_on = excluded.last_correct_on, mastered_on = excluded.mastered_on, updated_at = now()`,
    [accountId, childId, topicKey, r.subject, r.answered, r.correct, r.first_correct ?? null, r.last_correct ?? null]
  );
}

export async function deleteAnswer(db: Db, accountId: string, attemptId: string): Promise<boolean> {
  const { rows } = await db.query(`delete from family.attempts where account_id = $1 and attempt_id = $2 returning child_id, topic_key`, [accountId, attemptId]);
  if (!rows[0]) return false;
  await recomputeTopic(db, accountId, String(rows[0].child_id), String(rows[0].topic_key));
  return true;
}

export async function deleteAllAnswers(db: Db, accountId: string, childId: string): Promise<number> {
  const res = await db.query(`delete from family.attempts where account_id = $1 and child_id = $2`, [accountId, childId]);
  await db.query(`delete from family.topic_progress where account_id = $1 and child_id = $2`, [accountId, childId]);
  return res.rowCount ?? 0;
}
