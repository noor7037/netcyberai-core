import { withFamilyGate } from '@/lib/family/db';
import { AI_FEATURES, childrenAiStatus, llamaVersions, modelName, providerName } from '@/lib/family/ai-status';
import { familyLangBeforeSignIn } from '@/lib/family/server';
import { t, type MessageKey } from '@/lib/i18n';

// How the AI works (W2, C315): the page every "made by AI" notice links to. It needs no session and holds nothing
// personal. It says plainly that answers are made by AI and can be wrong, which children's features are switched on
// right now and with which model (read live from Control's settings), and what keeps a child safe. When a Llama model
// is in use it carries the Llama licence's attribution: "Built with Llama" and the licence notice for each version.
export default async function FamilyAboutAiPage() {
  const lang = familyLangBeforeSignIn();
  const statuses = await withFamilyGate((db) => childrenAiStatus(db));
  const llama = llamaVersions(statuses);
  return (
    <main lang={lang} className="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 py-6">
      <section className="fam-card fam-rise flex flex-col gap-3 bg-white p-6">
        <h1 className="text-2xl font-extrabold text-slate">{t(lang, 'fam.ai.title')}</h1>
        <p className="text-base text-slate">{t(lang, 'fam.ai.lead')}</p>
      </section>

      <section aria-labelledby="ai-status" className="fam-card flex flex-col gap-3 bg-white p-6">
        <h2 id="ai-status" className="text-lg font-bold text-slate">
          {t(lang, 'fam.ai.statusTitle')}
        </h2>
        <ul className="flex flex-col gap-3">
          {AI_FEATURES.map((f) => {
            const s = statuses.find((x) => x.feature === f)!;
            return (
              <li key={f} data-ai-feature={f} data-on={s.on} className="flex flex-col gap-1 rounded-2xl bg-off-white p-3">
                <span className="text-base font-bold text-slate">{t(lang, `fam.ai.feature.${f}` as MessageKey)}</span>
                <span className="text-sm text-slate">{s.on && s.model && s.provider ? t(lang, 'fam.ai.on', { model: modelName(s.model), provider: providerName(s.provider) }) : t(lang, 'fam.ai.off')}</span>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="ai-safe" className="fam-card flex flex-col gap-3 bg-white p-6">
        <h2 id="ai-safe" className="text-lg font-bold text-slate">
          {t(lang, 'fam.ai.safeTitle')}
        </h2>
        <ul className="flex list-disc flex-col gap-2 pl-5 text-base text-slate">
          {(['names', 'check', 'blocks', 'checked', 'stored', 'training'] as const).map((k) => (
            <li key={k}>{t(lang, `fam.ai.safe.${k}` as MessageKey)}</li>
          ))}
        </ul>
      </section>

      {llama.length > 0 && (
        <section data-built-with-llama className="fam-card flex flex-col gap-2 bg-white p-6">
          <p className="text-lg font-extrabold text-slate">{t(lang, 'fam.ai.builtWith')}</p>
          {llama.map((v) => (
            <p key={v} className="text-sm text-slate">
              {t(lang, 'fam.ai.llamaLicence', { version: v })}
            </p>
          ))}
        </section>
      )}

      <a href="/family" className="inline-flex min-h-[44px] items-center self-start rounded-2xl px-1 font-bold text-ink underline-offset-4 hover:underline">
        {t(lang, 'fam.ai.back')}
      </a>
    </main>
  );
}
