import { streamChatCompletions } from './chat-completions';
import type { AdapterResult, TextAdapter } from './types';

// Google's Gemini API through its OpenAI-compatible route (C230-U), for adult tools only: Copilot drafts, the syllabus
// import and the library NetCyberAI staff prepare in Control. The Gemini API's terms require users of 18 or older and
// forbid its use in anything directed to, or likely to be used by, people under 18, so it is never eligible for a
// profile that carries a child's words, whatever Control says. Its free tier may use what is sent to improve Google's
// products, so these profiles never send a person's details (they name a class, a subject and a topic). Not configured
// anywhere yet: whether an adult-only tool on a site children also use is "likely to be accessed" by under-18s is a
// question Google has not answered, so Workers AI serves every profile until it does (docs/family-app/AI_PROVIDERS.md).
// Until then the adapter is not registered (./index.ts): Control lists the provider but no profile can use it.
const URL = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';

export const geminiAdapter: TextAdapter = {
  providerId: 'gemini',
  capability: 'text',
  minorsEligible: false,
  needsKey: true,
  vision: true,
  keyLooksRight: (key) => /^AIza[0-9A-Za-z_-]{35}$/.test(key),
  streamText(request, onDelta): Promise<AdapterResult> {
    return streamChatCompletions(URL, request.apiKey, request, onDelta, { maxTokensField: 'max_tokens', jsonMode: true, includeUsage: true });
  },
};
