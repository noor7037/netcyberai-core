import { streamChatCompletions } from './chat-completions';
import { capabilities, type AdapterResult, type TextAdapter } from './types';

// Google's Gemini API (AI Studio) through its OpenAI-compatible route (C230-U). Its terms, as read on 2026-10-22, are
// for users of 18 or older and not for an app likely to be used by under-18s, and its free tier may use what is sent
// to improve Google's products. Control shows that beside its switch (C368). The founder's direction (C230-AO): during
// testing it may be cleared for children's words only on a paid-tier key and with made-up personas; before a real
// child's words go to it, Google's written confirmation or another provider.
const URL = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';

export const geminiAdapter: TextAdapter = {
  providerId: 'gemini',
  capability: 'text',
  termsNote: 'adults_only',
  needsKey: true,
  capabilities: capabilities(['text', 'vision', 'stream', 'json']),
  keyLooksRight: (key) => /^AIza[0-9A-Za-z_-]{35}$/.test(key),
  streamText(request, onDelta): Promise<AdapterResult> {
    return streamChatCompletions(URL, request.apiKey, request, onDelta, { maxTokensField: 'max_tokens', jsonMode: true, includeUsage: true });
  },
};
