// What the AI does for children right now (W2, C315), for the page "How the AI works" (/family/about-ai): each
// children's feature is on only when Control has chosen a provider and model, switched the profile on, and cleared that
// provider for minors. Read from Control's own tables through the family role, so the page never claims more than the
// platform would allow. The models named decide the Llama licence's attribution ("Built with Llama" and its notice).

type Db = { query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> };

export const AI_FEATURES = ['explanations', 'photos', 'voice', 'safety'] as const;
export type AiFeature = (typeof AI_FEATURES)[number];
const PROFILE: Record<AiFeature, string> = { explanations: 'family.resolver', photos: 'family.homework', voice: 'family.voice_input', safety: 'family.moderation' };

export type AiFeatureStatus = { feature: AiFeature; on: boolean; provider: string | null; model: string | null };

export async function childrenAiStatus(db: Db): Promise<AiFeatureStatus[]> {
  const { rows } = await db.query(
    `select p.profile_id, p.provider_id, p.model, p.enabled, coalesce(v.cleared_for_minors, false) as cleared, coalesce(v.enabled, false) as provider_on
       from control.ai_profiles p left join control.ai_providers v on v.provider_id = p.provider_id
      where p.profile_id = any($1::text[])`,
    [Object.values(PROFILE)]
  );
  return AI_FEATURES.map((feature) => {
    const r = rows.find((x) => x.profile_id === PROFILE[feature]);
    const on = !!r && r.enabled === true && !!r.provider_id && !!r.model && r.cleared === true && r.provider_on === true;
    return { feature, on, provider: on ? String(r!.provider_id) : null, model: on ? String(r!.model) : null };
  });
}

// The provider's name as a family reads it.
const PROVIDER_NAMES: Record<string, string> = { 'workers-ai': 'Cloudflare Workers AI', anthropic: 'Anthropic', openai: 'OpenAI', gemini: 'Google' };
export const providerName = (id: string) => PROVIDER_NAMES[id] ?? id;
// A model id's own name: "@cf/meta/llama-4-scout-17b-16e-instruct" → "llama-4-scout-17b-16e-instruct".
export const modelName = (id: string) => id.split('/').pop() ?? id;

// The Llama versions in use, for the licence's notice. Llama Guard 3 is built on Llama 3.1.
export function llamaVersions(statuses: readonly AiFeatureStatus[]): string[] {
  const found = new Set<string>();
  for (const s of statuses) {
    const m = (s.model ?? '').toLowerCase();
    if (!m.includes('llama')) continue;
    const v = m.includes('llama-guard-3') ? '3.1' : /llama-(\d+(?:\.\d+)?)/.exec(m)?.[1];
    if (v) found.add(`Llama ${v}`);
  }
  return [...found].sort();
}
