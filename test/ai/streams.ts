// Vendor streams, as the two text adapters receive them, for tests that replace fetch. Made-up text only.

const sse = (events: { event?: string; data: unknown }[]) =>
  events.map((e) => `${e.event ? `event: ${e.event}\n` : ''}data: ${typeof e.data === 'string' ? e.data : JSON.stringify(e.data)}\n\n`).join('');

export function anthropicOk(pieces: string[], tokensIn = 11, tokensOut = 7): Response {
  const body = sse([
    { event: 'message_start', data: { type: 'message_start', message: { id: 'msg_x', type: 'message', usage: { input_tokens: tokensIn, output_tokens: 1 } } } },
    { event: 'content_block_start', data: { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } } },
    ...pieces.map((text) => ({ event: 'content_block_delta', data: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } } })),
    { event: 'content_block_stop', data: { type: 'content_block_stop', index: 0 } },
    { event: 'message_delta', data: { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: tokensOut } } },
    { event: 'message_stop', data: { type: 'message_stop' } },
  ]);
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

export function anthropicRefusal(): Response {
  const body = sse([
    { event: 'message_start', data: { type: 'message_start', message: { usage: { input_tokens: 5, output_tokens: 0 } } } },
    { event: 'message_delta', data: { type: 'message_delta', delta: { stop_reason: 'refusal' }, usage: { output_tokens: 0 } } },
    { event: 'message_stop', data: { type: 'message_stop' } },
  ]);
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

export function openaiOk(pieces: string[], tokensIn = 13, tokensOut = 9): Response {
  const body = sse([
    ...pieces.map((content) => ({ data: { choices: [{ index: 0, delta: { content }, finish_reason: null }] } })),
    { data: { choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] } },
    { data: { choices: [], usage: { prompt_tokens: tokensIn, completion_tokens: tokensOut } } },
    { data: '[DONE]' },
  ]);
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

export const httpError = (status = 500) => new Response(JSON.stringify({ error: { type: 'overloaded_error' } }), { status, headers: { 'content-type': 'application/json' } });
