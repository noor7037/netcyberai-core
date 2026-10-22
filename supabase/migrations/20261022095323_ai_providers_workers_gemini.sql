-- Cloudflare Workers AI and Gemini as AI providers (Decision Log C230-U).
--
-- workers-ai: open-weight models run by Cloudflare, for the children's paths (the resolver, the homework helper, voice
-- input). Nothing in Cloudflare's terms or the models' licences bars a product used by children, and Cloudflare does
-- not train on what is sent. It is not cleared for minors here: the founder clears it in Control → AI with the terms
-- link, as every provider is cleared (the code's half is the adapter's minorsEligible).
--
-- gemini: Google's Gemini API, for adult tools only (Copilot drafts, the syllabus import, the library staff prepare).
-- Its terms forbid use in anything directed to, or likely to be used by, people under 18, so its adapter is never
-- eligible for a profile that carries a child's words, and it is never cleared for minors.

insert into control.ai_providers (provider_id) values ('workers-ai'), ('gemini')
on conflict (provider_id) do nothing;
