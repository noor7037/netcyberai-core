// Server-sent events, read from a fetch body: yields the `data:` payload of each event, in order.
export async function* sseData(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const take = function* (final: boolean): Generator<string> {
    let cut: number;
    while ((cut = buffer.search(/\r?\n\r?\n/)) !== -1 || (final && buffer.trim() !== '')) {
      const block = cut === -1 ? buffer : buffer.slice(0, cut);
      buffer = cut === -1 ? '' : buffer.slice(cut).replace(/^\r?\n\r?\n/, '');
      const data = block
        .split(/\r?\n/)
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).replace(/^ /, ''))
        .join('\n');
      if (data) yield data;
      if (cut === -1) break;
    }
  };
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    yield* take(false);
  }
  buffer += decoder.decode();
  yield* take(true);
}
