'use client';

import { useState } from 'react';
import { fill, type Words } from '@/lib/family/fill';
import { TEST_TEXT_MAX, type PublicChapterTest, type TestResult } from '@/lib/family/chapter-test-shape';
import { sniffTutorFile, TUTOR_FILE_MAX_BYTES } from '@/lib/family/tutor-shape';
import { Card, SUBJECT_TONE } from './BlockViews';

// A chapter test at the end of a chapter (S5, C378). Multiple-choice answers are checked on the server when the whole test is
// sent (the phone holds only sealed tokens); written answers and photos are kept for the parent or teacher, who read them
// against the rubric shown under each question. The app never marks those and shows no score for them. A photo goes
// through the tutor's private upload door (the same three steps as the tutor window), and is kept for this test.

type Photo = { state: 'sending' | 'checking' | 'ready'; id: string | null };
type Sent = { ok: true; result: TestResult } | { ok: false; error: string };

const postJson = (url: string, body: unknown) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify(body) }).catch(() => null);
const errorOf = async (res: Response | null) => (res ? String(((await res.json().catch(() => ({}))) as { error?: unknown }).error ?? 'network') : 'network');

function sendToStore(url: string, file: File, contentType: string): Promise<boolean> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', contentType);
    xhr.setRequestHeader('x-upsert', 'false');
    xhr.onload = () => resolve(xhr.status >= 200 && xhr.status < 300);
    xhr.onerror = xhr.onabort = xhr.ontimeout = () => resolve(false);
    xhr.send(file);
  });
}

export function ChapterTestView({ b, blockId, chapterKey, subject, w, tone }: { b: PublicChapterTest; blockId: string; chapterKey: string; subject: string; w: Words; tone: string }) {
  const [choice, setChoice] = useState<Record<string, number>>({});
  const [text, setText] = useState<Record<string, string>>({});
  const [photo, setPhoto] = useState<Record<string, Photo>>({});
  const [photoError, setPhotoError] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<Sent | null>(null);
  const preview = b.preview === true;
  const done = sent?.ok === true;
  const mcq = b.items.filter((i) => i.kind === 'mcq');
  const photoBusy = Object.values(photo).some((p) => p.state !== 'ready');
  const complete = mcq.every((i) => choice[i.id] !== undefined);
  const chip = SUBJECT_TONE[tone]?.chip ?? 'bg-ink text-white';

  const attach = async (itemId: string, file: File) => {
    const fail = (code: string) => {
      setPhoto((p) => {
        const { [itemId]: _gone, ...rest } = p;
        return rest;
      });
      setPhotoError((e) => ({ ...e, [itemId]: w[`fam.tutor.err.${code}`] ?? w[`fam.ctest.err.${code}`] ?? w['fam.ctest.err.photo'] }));
    };
    setPhotoError((e) => ({ ...e, [itemId]: '' }));
    const mime = sniffTutorFile(new Uint8Array(await file.slice(0, 16).arrayBuffer()));
    if (file.size === 0 || file.size > TUTOR_FILE_MAX_BYTES || !mime || mime === 'application/pdf') return fail('file_type');
    setPhoto((p) => ({ ...p, [itemId]: { state: 'sending', id: null } }));
    const asked = await postJson('/api/family/tutor/files', { subject, mime, size: file.size, name: file.name });
    if (!asked?.ok) return fail(await errorOf(asked));
    const ticket = (await asked.json().catch(() => null)) as { attachmentId?: string; uploadUrl?: string; contentType?: string } | null;
    if (!ticket?.attachmentId || !ticket.uploadUrl) return fail('network');
    if (!(await sendToStore(ticket.uploadUrl, file, ticket.contentType ?? mime))) return fail('storage_unavailable');
    setPhoto((p) => ({ ...p, [itemId]: { state: 'checking', id: ticket.attachmentId! } }));
    const confirmed = await postJson(`/api/family/tutor/files/${encodeURIComponent(ticket.attachmentId)}`, {});
    if (!confirmed?.ok) return fail(await errorOf(confirmed));
    setPhoto((p) => ({ ...p, [itemId]: { state: 'ready', id: ticket.attachmentId! } }));
  };
  const drop = (itemId: string) => {
    const id = photo[itemId]?.id;
    setPhoto((p) => {
      const { [itemId]: _gone, ...rest } = p;
      return rest;
    });
    if (id) void fetch(`/api/family/tutor/files/${encodeURIComponent(id)}`, { method: 'DELETE', credentials: 'same-origin' }).catch(() => null);
  };

  const submit = async () => {
    if (preview || !complete || photoBusy || busy) return;
    setBusy(true);
    const answers = b.items.flatMap((i): Record<string, unknown>[] => {
      if (i.kind === 'mcq') return [{ itemId: i.id, token: i.token, choice: choice[i.id] }];
      if (i.kind === 'written') return text[i.id]?.trim() ? [{ itemId: i.id, text: text[i.id].trim() }] : [];
      return photo[i.id]?.id ? [{ itemId: i.id, attachmentId: photo[i.id].id }] : [];
    });
    const res = await postJson('/api/family/chapter-test', { chapterKey, blockId, answers });
    setBusy(false);
    if (res?.ok) return setSent({ ok: true, result: (await res.json()) as TestResult });
    setSent({ ok: false, error: await errorOf(res) });
  };

  const result = sent?.ok ? sent.result : null;
  const fail = sent && !sent.ok ? (w[`fam.ctest.err.${sent.error}`] ?? w['fam.ctest.err.generic']) : null;

  return (
    <Card title={b.title} tone={tone} tag="chapter_test">
      <ol className="flex flex-col gap-4">
        {b.items.map((item, n) => {
          const r = result?.items.find((x) => x.id === item.id);
          return (
            <li key={item.id} data-test-item={item.kind} className="flex flex-col gap-3 rounded-2xl bg-off-white p-3">
              {item.kind === 'mcq' ? (
                <fieldset className="flex flex-col gap-2" disabled={done || preview}>
                  <legend className="text-base font-semibold text-slate">
                    {n + 1}. {item.question}
                  </legend>
                  <span className="sr-only">{w['fam.ctest.mcq']}</span>
                  {item.options.map((o, i) => (
                    <label key={i} className={`flex min-h-[44px] cursor-pointer items-center gap-3 rounded-xl bg-white px-4 py-2 text-base text-slate ring-1 ${choice[item.id] === i ? 'ring-2 ring-ink' : 'ring-slate/15'}`}>
                      <input type="radio" name={`${blockId}-${item.id}`} checked={choice[item.id] === i} onChange={() => setChoice((c) => ({ ...c, [item.id]: i }))} className="h-5 w-5 accent-saffron-deep" />
                      <span>{o}</span>
                    </label>
                  ))}
                  {r && (
                    <div role="status" className={`flex flex-col gap-1 rounded-xl px-3 py-2 text-sm text-slate ${r.correct ? 'bg-emerald/10' : 'bg-coral/10'}`}>
                      <p className="font-bold">{r.correct ? w['fam.ctest.right'] : w['fam.ctest.notYet']}</p>
                      {r.why && <p>{r.why}</p>}
                    </div>
                  )}
                </fieldset>
              ) : (
                <div className="flex flex-col gap-2">
                  <p className="text-base font-semibold text-slate">
                    {n + 1}. {item.question}
                  </p>
                  <div>
                    <p className="text-sm font-bold text-slate">{w['fam.ctest.rubric']}</p>
                    <ul className="list-disc pl-5 text-sm text-slate">
                      {item.rubric.map((x, i) => (
                        <li key={i}>{x}</li>
                      ))}
                    </ul>
                  </div>
                  {item.kind === 'written' ? (
                    <label className="flex flex-col gap-1 text-sm font-bold text-slate">
                      <span>{w['fam.ctest.written']}</span>
                      <textarea
                        rows={4}
                        maxLength={TEST_TEXT_MAX}
                        value={text[item.id] ?? ''}
                        disabled={done || preview}
                        onChange={(e) => setText((t) => ({ ...t, [item.id]: e.target.value }))}
                        className="min-h-[96px] w-full rounded-xl bg-white p-3 text-base font-normal text-slate ring-1 ring-slate/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink"
                      />
                    </label>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {!photo[item.id] && !done && (
                        <label className={`fam-press inline-flex min-h-[44px] cursor-pointer items-center self-start rounded-full px-4 text-sm font-bold ${chip} ${preview ? 'opacity-50' : ''}`}>
                          {w['fam.ctest.photoAttach']}
                          <input
                            type="file"
                            accept="image/png,image/jpeg,image/webp"
                            capture="environment"
                            disabled={preview}
                            className="sr-only"
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              e.target.value = '';
                              if (f) void attach(item.id, f);
                            }}
                          />
                        </label>
                      )}
                      {photo[item.id] && (
                        <p role="status" className="text-sm font-semibold text-slate">
                          {photo[item.id].state === 'ready' ? w['fam.ctest.photoReady'] : w['fam.ctest.photoChecking']}
                        </p>
                      )}
                      {photo[item.id]?.state === 'ready' && !done && (
                        <button type="button" onClick={() => drop(item.id)} className="min-h-[44px] self-start px-1 text-sm font-semibold text-ink underline-offset-4 hover:underline">
                          {w['fam.ctest.photoRemove']}
                        </button>
                      )}
                      {photoError[item.id] && (
                        <p role="alert" className="text-sm font-semibold text-coral-deep">
                          {photoError[item.id]}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>
      {preview && <p className="text-sm font-semibold text-slate">{w['fam.ctest.preview']}</p>}
      {!done && !preview && (
        <div className="flex flex-col gap-2">
          {!complete && mcq.length > 0 && <p className="text-sm text-slate">{w['fam.ctest.incomplete']}</p>}
          <button
            type="button"
            data-test-submit
            disabled={!complete || photoBusy || busy}
            onClick={() => void submit()}
            className={`fam-press min-h-[48px] self-start rounded-full px-6 text-base font-bold disabled:opacity-50 ${chip}`}
          >
            {busy ? w['fam.ctest.sending'] : w['fam.ctest.submit']}
          </button>
          {fail && (
            <p role="alert" className="text-sm font-semibold text-coral-deep">
              {fail}
            </p>
          )}
        </div>
      )}
      {result && (
        <div role="status" data-test-result className="flex flex-col gap-1 rounded-2xl bg-white p-3 text-base text-slate ring-1 ring-slate/10">
          <p className="font-bold">{w['fam.ctest.sent']}</p>
          {result.mcqTotal > 0 && <p>{fill(w['fam.ctest.score'], { n: result.mcqCorrect, d: result.mcqTotal })}</p>}
          {result.items.some((x) => x.kind !== 'mcq') && <p className="text-sm">{w['fam.ctest.kept']}</p>}
        </div>
      )}
    </Card>
  );
}
