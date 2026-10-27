import { describe, expect, it } from 'vitest';
import { examplePdf, EXAMPLE_PDF_NAME } from '@/lib/whatsapp/example-pdf';
import { createMetaTemplate, GRAPH_VERSION, metaAppId, MetaWhatsAppProvider, templateCreateBody, templateSendBody, uploadHeaderExample } from '@/lib/whatsapp/meta';
import { StandInWhatsAppProvider } from '@/lib/whatsapp/provider';
import { TEMPLATE_REGISTRY } from '@/lib/whatsapp/templates';

// AQ-5 (C366): Meta's formats for a template that carries a PDF, held against Meta's documented examples (the URLs are
// in src/lib/whatsapp/meta.ts's header). NO NETWORK CALL IS MADE: `fetch` is handed in and answers in Meta's shape.
// Every token and id is made up.

const ACCOUNT = { accessToken: 'MADEUPTOKEN_doc_0123456789abcdefghijklmnopqrstuvwxyz_END', wabaId: '102290129340398' };
const CONFIG = { accessToken: ACCOUNT.accessToken, appSecret: 'madeupappsecret0123456789abcdef', verifyToken: 'made-up-verify-token-0123456789', phoneNumberId: '106540352242922', wabaId: ACCOUNT.wabaId };
type Init = { method: string; headers: Record<string, string>; body?: string | FormData | Uint8Array };
type Call = { url: string; method: string; headers: Record<string, string>; body: unknown };
const recorded = (...answers: { ok: boolean; status: number; body: unknown }[]) => {
  const calls: Call[] = [];
  const fetcher = async (url: string, init: Init) => {
    let body: unknown = null;
    if (typeof init.body === 'string') body = JSON.parse(init.body);
    else if (init.body instanceof Uint8Array) body = init.body;
    else if (init.body instanceof FormData) body = Object.fromEntries([...init.body.entries()].map(([k, v]) => [k, typeof v === 'string' ? v : { name: (v as File).name, type: v.type, size: v.size }]));
    calls.push({ url, method: init.method, headers: init.headers, body });
    const a = answers[Math.min(calls.length - 1, answers.length - 1)];
    return { ok: a.ok, status: a.status, json: async () => a.body };
  };
  return { calls, fetcher };
};
const SESSION = 'upload:MTphdHRhY2htZW50OjlkYWNkYjE3LTA2MGItNDNkNS1iMjk4LWFjNzNiNDdjNzg0MD9maWxlX2xlbmd0aD0xMDAmZmlsZV90eXBlPWFwcGxpY2F0aW9uL3BkZg==?sig=ARZ3Lf_madeup';
const HANDLE = '4::YXBwbGljYXRpb24vcGRm:ARb_made_up_handle==:e:1730000000:1234567890:100:ARZmadeup';

describe('a template that carries a PDF, at Meta (C366)', () => {
  it('“Submit to Meta”: the document header first, with the example file’s handle, then the body', () => {
    const draft = { name: 'exam_result_pdf', language: 'en' as const, text: 'From {{1}}: {{2}} ... {{3}} ... {{4}} works for 30 days.', example: ['Sunrise Public School', 'Aarav', 'Half-yearly exam', 'https://www.netcyberai.com/results/Xy12AbCdEfGh'], header: { format: 'DOCUMENT' as const, handle: HANDLE } };
    expect(templateCreateBody(draft)).toEqual({
      name: 'exam_result_pdf',
      language: 'en',
      category: 'UTILITY',
      parameter_format: 'positional',
      components: [
        { type: 'HEADER', format: 'DOCUMENT', example: { header_handle: [HANDLE] } },
        { type: 'body', text: draft.text, example: { body_text: [draft.example] } },
      ],
    });
    // A template with no header is as before.
    expect((templateCreateBody({ ...draft, header: undefined }).components as unknown[]).length).toBe(1);
  });

  it('the handle: the token’s app by debug_token, an upload session on it, then the example PDF’s bytes; then the template', async () => {
    const meta = recorded(
      { ok: true, status: 200, body: { data: { app_id: '1234567890123', application: 'NetCyberAI', is_valid: true, scopes: ['whatsapp_business_management'] } } },
      { ok: true, status: 200, body: { id: SESSION } },
      { ok: true, status: 200, body: { h: HANDLE } },
      { ok: true, status: 200, body: { id: '594425479261596', status: 'PENDING', category: 'UTILITY' } }
    );
    const draft = { name: 'exam_result_pdf', language: 'en' as const, text: 'From {{1}}: {{2}} {{3}} {{4}} text.', example: ['a', 'b', 'c', 'd'], header: { format: 'DOCUMENT' as const } };
    expect(await createMetaTemplate(ACCOUNT, draft, meta.fetcher as never)).toEqual({ ok: true, id: '594425479261596', status: 'PENDING', category: 'UTILITY' });
    const [who, open, file, made] = meta.calls;
    expect(who).toEqual({ url: `https://graph.facebook.com/${GRAPH_VERSION}/debug_token?input_token=${ACCOUNT.accessToken}`, method: 'GET', headers: { Authorization: `Bearer ${ACCOUNT.accessToken}` }, body: null });
    const pdf = examplePdf();
    expect(open).toEqual({ url: `https://graph.facebook.com/${GRAPH_VERSION}/1234567890123/uploads?file_name=${EXAMPLE_PDF_NAME}&file_length=${pdf.length}&file_type=application%2Fpdf`, method: 'POST', headers: { Authorization: `OAuth ${ACCOUNT.accessToken}` }, body: null });
    expect(file).toEqual({ url: `https://graph.facebook.com/${GRAPH_VERSION}/${SESSION}`, method: 'POST', headers: { Authorization: `OAuth ${ACCOUNT.accessToken}`, file_offset: '0' }, body: pdf });
    expect(made.url).toBe(`https://graph.facebook.com/${GRAPH_VERSION}/${ACCOUNT.wabaId}/message_templates`);
    expect((made.body as { components: unknown[] }).components[0]).toEqual({ type: 'HEADER', format: 'DOCUMENT', example: { header_handle: [HANDLE] } });
    // The token is in no address but debug_token's own question, and in no body.
    for (const c of [open, file, made]) expect(c.url).not.toContain(ACCOUNT.accessToken);
    expect(JSON.stringify(made.body)).not.toContain(ACCOUNT.accessToken);
  });

  it('when Meta does not say the app, or opens no session, or gives no handle: nothing is submitted, and Meta’s refusal is said shortly', async () => {
    const noApp = recorded({ ok: false, status: 400, body: { error: { message: 'Invalid OAuth access token.', code: 190 } } });
    expect(await createMetaTemplate(ACCOUNT, { name: 'x_y_z', language: 'en', text: 'a b c', example: [], header: { format: 'DOCUMENT' } }, noApp.fetcher as never)).toEqual({ ok: false, message: 'the example PDF was not taken: Meta answered 400 (code 190): Invalid OAuth access token.' });
    expect(noApp.calls).toHaveLength(1);
    expect(await metaAppId(ACCOUNT, recorded({ ok: true, status: 200, body: { data: { app_id: '../me' } } }).fetcher)).toEqual({ ok: false, message: 'Meta did not say which app the saved token belongs to' });
    const badSession = recorded({ ok: true, status: 200, body: { data: { app_id: '1234567890123' } } }, { ok: true, status: 200, body: { id: 'https://elsewhere.example/steal' } });
    expect(await uploadHeaderExample(ACCOUNT, undefined, badSession.fetcher)).toEqual({ ok: false, message: 'Meta opened no upload session' });
    expect(badSession.calls).toHaveLength(2);
    const noHandle = recorded({ ok: true, status: 200, body: { data: { app_id: '1234567890123' } } }, { ok: true, status: 200, body: { id: SESSION } }, { ok: true, status: 200, body: {} });
    expect(await uploadHeaderExample(ACCOUNT, undefined, noHandle.fetcher)).toEqual({ ok: false, message: 'Meta took the file and gave no handle' });
  });

  it('the example PDF is a PDF made in code, and holds no child, school or mark', () => {
    const text = new TextDecoder().decode(examplePdf());
    expect(text.startsWith('%PDF-1.4')).toBe(true);
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true);
    expect(text).toMatch(/Example only: no real child, school or mark\./);
    // The cross-reference table points at each object.
    const xref = Number(/startxref\n(\d+)/.exec(text)?.[1]);
    expect(text.slice(xref, xref + 4)).toBe('xref');
  });
});

describe('sending a template that carries a PDF (C366)', () => {
  it('the send body: the document header with Meta’s media id and the file’s name, then the values', () => {
    const body = templateSendBody({ toPhone: '+919800000001', templateName: 'exam_result_pdf', templateParams: { school: 'School A', child: 'Aarav', exam: 'Half-yearly', link: 'https://x.example/r' }, templateOrder: ['school', 'child', 'exam', 'link'], language: 'hi', document: { mediaId: '1037543291543636', filename: 'Half-yearly_6-A_roll-1.pdf' } });
    expect(body).toEqual({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: '+919800000001',
      type: 'template',
      template: {
        name: 'exam_result_pdf',
        language: { code: 'hi' },
        components: [
          { type: 'header', parameters: [{ type: 'document', document: { id: '1037543291543636', filename: 'Half-yearly_6-A_roll-1.pdf' } }] },
          { type: 'body', parameters: [{ type: 'text', text: 'School A' }, { type: 'text', text: 'Aarav' }, { type: 'text', text: 'Half-yearly' }, { type: 'text', text: 'https://x.example/r' }] },
        ],
      },
    });
  });

  it('giving a file: POST /{phone-number-id}/media, multipart, as documented; never for a test school; never anything but a PDF', async () => {
    const meta = recorded({ ok: true, status: 200, body: { id: '1037543291543636' } });
    const provider = new MetaWhatsAppProvider(CONFIG, meta.fetcher as never);
    const bytes = examplePdf();
    expect(await provider.uploadMedia({ bytes, mimeType: 'application/pdf', filename: 'Half-yearly_6-A_roll-1.pdf', testSchool: false })).toEqual({ ok: true, mediaId: '1037543291543636' });
    expect(meta.calls).toEqual([
      {
        url: `https://graph.facebook.com/${GRAPH_VERSION}/${CONFIG.phoneNumberId}/media`,
        method: 'POST',
        headers: { Authorization: `Bearer ${CONFIG.accessToken}` },
        body: { messaging_product: 'whatsapp', file: { name: 'Half-yearly_6-A_roll-1.pdf', type: 'application/pdf', size: bytes.length }, type: 'application/pdf' },
      },
    ]);
    expect(await provider.uploadMedia({ bytes, mimeType: 'application/pdf', filename: 'x.pdf', testSchool: true })).toEqual({ ok: false, message: 'a test school never sends through a real account' });
    expect(await provider.uploadMedia({ bytes, mimeType: 'application/pdf', filename: 'x.pdf' })).toMatchObject({ ok: false });
    expect(await provider.uploadMedia({ bytes, mimeType: 'application/pdf', filename: 'Aarav Kumar.pdf', testSchool: false })).toEqual({ ok: false, message: 'the file is not a PDF WhatsApp takes' });
    expect(meta.calls).toHaveLength(1);
    const refused = await new MetaWhatsAppProvider(CONFIG, recorded({ ok: false, status: 400, body: { error: { message: 'Param file must be a file with one of the following types', code: 100 } } }).fetcher as never).uploadMedia({ bytes, mimeType: 'application/pdf', filename: 'a.pdf', testSchool: false });
    expect(refused).toEqual({ ok: false, message: 'Meta answered 400 (code 100): Param file must be a file with one of the following types' });
  });

  it('the stand-in takes a file and gives an id of its own, reaching nothing', async () => {
    const standIn = new StandInWhatsAppProvider({ secret: 'x'.repeat(32) });
    const r = await standIn.uploadMedia({ bytes: examplePdf(), mimeType: 'application/pdf', filename: 'a.pdf', testSchool: true });
    expect(r).toMatchObject({ ok: true, mediaId: expect.stringMatching(/^standin-media-/) });
    expect(standIn.uploads).toEqual([{ filename: 'a.pdf', bytes: examplePdf().length, mediaId: (r as { mediaId: string }).mediaId, testSchool: true }]);
  });

  it('only the PDF message carries a document', () => {
    expect(TEMPLATE_REGISTRY.filter((d) => d.header).map((d) => d.name)).toEqual(['exam_result_pdf']);
  });
});
