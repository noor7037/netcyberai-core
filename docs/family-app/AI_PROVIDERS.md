# AI providers for NetCyberAI (C230-U)

Written by the supervisor on 2026-10-22 for Noor and the build lead. This page records which AI providers the product may use, for which users, and why. It also gives the evidence and the setup.

**Where the evidence comes from.** Each provider's terms were checked through web search the same day. The provider pages themselves could not be opened from the supervisor's session (its network blocks them), so where only a third-party summary was found, the table says so.

## The requirement
- **Children:** typed questions, photos of a textbook page, voice, age-appropriate explanations, hints, practice, diagrams and interactive learning. The users are Classes 1 to 12, so many are **under 13**.
- **Adults:** teachers, parents and NetCyberAI staff.
- **Money:** free first, with no spending without the founder's approval.
- **Terms:** never bypass a provider's terms.

## What each provider allows

| Provider | Child-directed use (our users include under-13s) | Free use | What happens to what we send | Photos | Verdict |
|---|---|---|---|---|---|
| **Gemini API** (Google AI Studio) | **No.** Users must be 18+. Not to be used in an app directed to, or likely used by, under-18s. The version effective 2025-12-18 keeps this clause. [terms](https://ai.google.dev/gemini-api/terms) | Yes: Flash models, per-project limits | The free tier may be used to improve Google's products | Yes | **Parked.** Even adult tools are in doubt: they sit on netcyberai.com, which children use, and the clause turns on "likely to be accessed". Google has not answered this question ([forum thread](https://discuss.ai.google.dev/t/age-restrictions-in-gemini-api-terms-general-audience-app-rated-3-with-an-adult-only-ai-feature/179916)). |
| **Vertex AI** (Google Cloud) | Probably the same clause, per a developer forum reading; **not verified** ([forum](https://discuss.ai.google.dev/t/age-requirements-clause-offline-developer-side-generation-of-static-audio-images-for-a-childrens-app/186872)) | Trial credit only | Not used for training | Yes | Not chosen |
| **OpenAI** | **No** under 13: the Business Terms forbid under-13 users and under-13 personal data; 13–17 need parental consent ([business terms](https://openai.com/policies/business-terms)) | No free API | Not used for training | Yes | **Adult tools only** |
| **Anthropic** | **Yes, with safeguards:** age verification, moderation and filtering, monitoring, AI disclosure, and COPPA-style compliance ([guidance for organizations serving minors](https://support.claude.com/en/articles/9307344-responsible-use-of-anthropic-s-models-guidelines-for-organizations-serving-minors); [announcement](https://techcrunch.com/2024/05/10/anthropic-now-lets-kids-use-its-ai-tech-within-limits)) | No free tier; Haiku 4.5 is about $1 in / $5 out per million tokens ([third-party summary](https://www.morphllm.com/anthropic-claude-api-pricing)) | Not used for training | Yes | **Best for real children, when approved** |
| **OpenRouter** | Reportedly 18+ from 2026-08-31 ([change record](https://conductatlas.com/change/2026-09-01-openrouter-openrouter-terms-of-service-4768/), third-party). Each model's own provider terms apply on top. | 50 free-model requests a day (1,000 after $10 in credits) | Many free endpoints log or train | Some | Not chosen |
| **OmniRoute** | A self-hosted router ([overview](https://pinggy.io/blog/omniroute_ai_gateway_security/)). It changes nobody's terms; each free tier it combines keeps its own rules. | Needs our own server | Each provider's rules | — | Not needed: our AI platform already routes and falls back |
| **Mistral** | Minimum age 13; the free Experiment plan may train on requests ([help](https://help.mistral.ai/en/articles/455206-how-can-i-try-the-api-for-free-with-the-experiment-plan)) | Yes, with training | Trained on (free plan) | Yes | Not chosen |
| **Groq** | Its privacy policy says the services are "not directed to children" ([record](https://conductatlas.com/platform/groq/groq-privacy-policy/services-not-directed-to-children-under-18/), third-party) | Yes (about 1,000 requests a day per model) | Unclear | Some | Not chosen |
| **Cloudflare Workers AI** (open-weight models) | **No clause found that bars a customer's product for children.** Cloudflare's agreement says its own services are aimed at adults; that describes its customers (us), not our users ([agreement](https://www.cloudflare.com/en-ca/terms/)). The models' licences (Llama, Gemma) restrict harmful content, not users' age ([Gemma policy](https://ai.google.dev/gemma/prohibited_use_policy)). | **10,000 "neurons" a day on the free plan.** Going over gives an error, never a bill ([pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/)). | **Not used to train models or improve services** ([data usage](https://developers.cloudflare.com/workers-ai/platform/privacy/)) | Yes: Llama 4 Scout, Llama 3.2 11B Vision, Gemma 3 | **Chosen for the children's paths now** |
| **YouTube Data API** | Allowed. A child-directed client must follow COPPA-style rules and tell Google ([developer policies](https://developers.google.com/youtube/terms/developer-policies)) | 10,000 units a day | — | — | In use (C230-R) |
| **Google Custom Search API** | Closed to new customers; ends 2027-01-01 ([summary](https://brave.com/learn/google-api-shutdown/)) | — | — | — | Not available |

## The chosen architecture
The existing AI platform (`src/lib/ai/platform.ts`) stays as it is. Each feature names a **profile**, and Control chooses its provider, model and fallbacks. A provider serves a profile that carries a child's words only when two things are both true:
- **In code:** its adapter is marked `minorsEligible`, set after reading the vendor's terms.
- **In Control:** the founder has cleared it, with the terms link.

| Profile | Who uses it | Now (free) | Later (founder approves the spend) |
|---|---|---|---|
| `family.resolver`: explanations, typed questions, hints, practice, diagrams | Children | Workers AI (Llama 4 Scout) | Anthropic first, Workers AI as fallback |
| `family.homework`: textbook photo | Children | Workers AI (a vision model) | Anthropic first, Workers AI as fallback |
| `family.voice_input` | Children | Workers AI (Whisper large v3 turbo) | Same |
| `content.prepare`: the library staff prepare in Control | NetCyberAI staff | Workers AI | Anthropic, or Gemini if Google confirms |
| `copilot.draft`, `content.syllabus_extract` | Teachers, staff | Workers AI | Anthropic, or Gemini if Google confirms |
| `parent_ai.home_help` | Parents, inside a school app | Workers AI | Same |

**Gemini** has an adapter (never eligible for children), but it is **not configured** anywhere until Google confirms in writing that an adult-only, signed-in tool on a site children also use is allowed. One free provider for every profile also keeps setup to one account.

**Changed in code (C230-U):**
- New adapters `workers-ai` (text, photos, speech) and `gemini` (text), on one shared Chat Completions core (`src/lib/ai/adapters/chat-completions.ts`).
- OpenAI is now **not eligible** for children's profiles (its under-13 rule). Gemini is never eligible either.
- Control accepts Workers AI model ids (`@cf/...`).

**Budget and quota:**
- The free plans stop with an error at their limit; they do not bill. No payment method is added to either account without the founder's approval.
- A spent quota (HTTP 429) is a normal failure: the platform tries the next provider in the profile's chain, then shows the family's plain "try again later" message.
- The family daily cap (`family.ai.daily_requests`) and the per-feature caps (photos and voice seconds a day) still apply. Control → Apps health shows failures and cap refusals.

**What the free allowance buys:**
- Cloudflare's own table prices Llama 3.2 11B Vision at 4,410 neurons per million input tokens and 61,493 per million output tokens.
- An explanation of about 1,500 tokens in and 900 out therefore costs about 62 neurons, so about 160 explanations fit in a day's 10,000.
- Larger models cost more per token, and a photo counts as 1,601–6,404 input tokens. That is enough for development and synthetic testing, not for a real class.

## The children's safeguards (ours, on top of any provider's)
- The parent's consent: `study_core` for everything, plus `photo_input` and `voice_practice` for photos and voice.
- A child's name, email, phone and ID numbers are removed before any call (the pre-processor). A photo and a recording are read once and never stored.
- Daily caps per family and per feature.
- "Checked explanations only" for the subjects Control names (C300). Explanations staff prepare reach a child only after a person checks them.
- Answers are checked block by block, arithmetic is recomputed by our code, and links come from the catalog only.
- **Still to build** (build lead, W2):
  - a moderation pass on a child's typed words and on answers, with Llama Guard on Workers AI;
  - the "answers are made by AI" notice and "Built with Llama" on the AI page (the Llama licence's attribution);
  - prompt tuning so Llama returns our JSON blocks reliably.

## Setup (founder; each is free and needs only his own accounts)
1. **Cloudflare.**
   - Create a free account and copy the **Account ID** (dashboard → Workers AI).
   - Create an **API token** with the "Workers AI" permission only.
   - In Control → AI, enter the key for `workers-ai` as `<account id>:<token>`.
   - Then **clear `workers-ai` for minors**, using the terms link above.
   - Choose its models for the three children's profiles.
2. **Not now: Gemini.** Do not create a Gemini key until Google answers the "likely to be accessed" question for adult tools.
3. **Never attach a payment method** to the Cloudflare account without approval.

## Not verified yet (checked on the first live call, with a key)
- **Photos:** whether Cloudflare's OpenAI-compatible route takes `image_url` photos for the chosen vision model. If it does not, the call fails safely and the next provider is tried; the fix is to send photos to that model's own `/ai/run` route.
- **Audio formats:** which formats Whisper on Workers AI accepts (WebM and Ogg from the phone).
- **Current model ids:** Cloudflare retires models, for example Llama 3.1 8B in May 2026, so the ids are taken from its model catalogue on the day.
