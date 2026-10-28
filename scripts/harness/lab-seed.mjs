// G4 (C372): the Quality Lab's harness picture with two services configured and one finished run. Two made-up keys
// are sealed with this run's own AI_CREDENTIALS_KEY (as src/lib/ai/credentials.ts seals them: AES-256-GCM, the
// provider's id as the authenticated data), and one run of two cases on two models is written with made-up answers,
// so the screen shows the comparable table without calling any vendor. clearLab() removes all of it.
import { createCipheriv, randomBytes } from 'node:crypto';

export const LAB_RUN = '00000000-0000-4000-8000-00000000a4b1';
const PROVIDERS = [
  ['anthropic', `sk-ant-${'h'.repeat(30)}HARN`],
  ['openai', `sk-${'h'.repeat(30)}HARN`],
];

export function seal(keyBase64, provider, apiKey) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(keyBase64, 'base64'), iv);
  cipher.setAAD(Buffer.from(`ai:${provider}`));
  const ciphertext = Buffer.concat([cipher.update(apiKey, 'utf8'), cipher.final()]);
  return { ciphertext: ciphertext.toString('base64'), iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64') };
}

export async function seedLab(db, keyBase64, founder) {
  for (const [provider, apiKey] of PROVIDERS) {
    const s = seal(keyBase64, provider, apiKey);
    await db.pg.query(
      `insert into control.ai_credentials (provider_id, ciphertext, iv, tag, key_version, key_last4, set_by) values ($1, $2, $3, $4, 1, 'HARN', $5)
       on conflict (provider_id) do update set ciphertext = excluded.ciphertext, iv = excluded.iv, tag = excluded.tag, key_version = 1`,
      [provider, s.ciphertext, s.iv, s.tag, founder]
    );
  }
  // G6 (C379): the model pickers' lists: one service listed, one whose list is unavailable.
  await db.pg.query(
    `insert into control.ai_model_lists (provider_id, models, ok, fetched_at) values
         ('anthropic', array['claude-haiku-4-5', 'claude-lab-a', 'claude-opus-4-1', 'claude-sonnet-4-5'], true, now() - interval '2 hours'),
         ('openai', '{}', false, now() - interval '2 hours')
       on conflict (provider_id) do update set models = excluded.models, ok = excluded.ok, fetched_at = excluded.fetched_at`
  );
  await db.pg.query(
    `insert into control.ai_eval_runs (run_id, dataset_version, case_ids, models, started_by) values ($1, 'a4b1a4b1a4b1', $2::text[], $3::jsonb, $4) on conflict (run_id) do nothing`,
    [LAB_RUN, ['maths-percent-discount', 'maths-area-rectangle-json'], JSON.stringify([{ provider: 'anthropic', model: 'claude-lab-a' }, { provider: 'openai', model: 'gpt-lab-b' }]), founder]
  );
  const rows = [
    ['maths-percent-discount', 'anthropic', 'claude-lab-a', '15% of 800 is 120.\n800 − 120 = 680.\nAnswer: 680 rupees', 2140, 610, 30, 18, null, true, null, 5, 'Clear steps.'],
    ['maths-percent-discount', 'openai', 'gpt-lab-b', 'The discount is 120 rupees, so the price is 640 rupees.', 1720, 480, 25, 15, null, false, null, 2, null],
    ['maths-area-rectangle-json', 'anthropic', 'claude-lab-a', '{"correct": false, "right_answer": 108, "hint": "Multiply the length by the width."}', 1980, 700, 40, 20, true, true, null, null, null],
    ['maths-area-rectangle-json', 'openai', 'gpt-lab-b', 'Here you go: {"correct": false, "right_answer": 108, "hint": "Area is length times width."}', 1650, 520, 35, 25, false, true, 'output_schema_invalid', null, null],
  ];
  for (const r of rows) {
    await db.pg.query(
      `insert into control.ai_eval_results (run_id, case_id, provider_id, model, output_text, latency_ms, first_token_ms, tokens_in, tokens_out, json_valid, check_passed, error_class, score, notes)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) on conflict (run_id, case_id, provider_id, model) do nothing`,
      [LAB_RUN, ...r]
    );
  }
}

export async function clearLab(db) {
  await db.pg.query(`delete from control.ai_eval_results where run_id = $1`, [LAB_RUN]);
  await db.pg.query(`delete from control.ai_eval_runs where run_id = $1`, [LAB_RUN]);
  await db.pg.query(`delete from control.ai_credentials where key_last4 = 'HARN'`);
  await db.pg.query(`delete from control.ai_model_lists`);
}
