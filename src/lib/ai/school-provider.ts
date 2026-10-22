import type { Sql } from '@/lib/jobs/types';
import { draftSystem, draftUser } from './prompts/copilot.draft';
import { HOME_HELP, type AIProvider, type DraftKind } from './provider';
import { streamText, type AiRefusal, type ProfileId } from './platform';

// Copilot and Parent AI on the AI platform (M2-10, C284): an AIProvider whose drafts go through the platform's
// copilot.draft and parent_ai.home_help profiles, so the key the founder enters in Control → AI, its fallbacks, kill
// switches and metering apply to the school apps as they do to the Family app. Runs in the school request's own
// transaction (role app_user, which may read only these two profiles, C284). A draft the platform cannot make throws
// AiUnavailableError, and the caller says Copilot is not available or keeps its fixed sentence (Parent AI).

export class AiUnavailableError extends Error {
  constructor(readonly reason: AiRefusal) {
    super(`ai_${reason}`);
  }
}

const SCHOOL_PROFILES: readonly ProfileId[] = ['copilot.draft', 'parent_ai.home_help'];
export const profileForKind = (kind: DraftKind | typeof HOME_HELP): ProfileId => (kind === HOME_HELP ? 'parent_ai.home_help' : 'copilot.draft');

// null when neither profile has a provider and model chosen and switched on: the school apps then say no provider.
export async function schoolProvider(db: Sql, schoolId: string, day: string): Promise<AIProvider | null> {
  const { rows } = await db.query(
    `select profile_id from control.ai_profiles where profile_id = any($1::text[]) and enabled and provider_id is not null and model is not null`,
    [SCHOOL_PROFILES]
  );
  const on = new Set(rows.map((r: Record<string, unknown>) => String(r.profile_id)));
  if (on.size === 0) return null;
  return {
    name: 'ai-platform',
    async draft(request) {
      const profile = profileForKind(request.kind);
      if (!on.has(profile)) throw new AiUnavailableError('not_switched_on');
      const result = await streamText(db, { accountId: schoolId, childFirstNames: [], day }, profile, {
        system: draftSystem(request),
        messages: [{ role: 'user', content: draftUser(request) }],
        maxTokens: 1200,
      });
      if (!result.ok) throw new AiUnavailableError(result.reason);
      return { text: result.text, tokensIn: result.tokensIn, tokensOut: result.tokensOut };
    },
  };
}
