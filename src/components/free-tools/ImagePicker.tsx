'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { DEFAULT_ADJUST, decodeImage, processImage, validateImageFile, type ImageAdjust } from '@/lib/certificates/image';
import type { CertImage } from '@/lib/certificates/definitions';

const btn =
  'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-md border border-slate/20 bg-white px-4 text-sm font-semibold text-slate hover:bg-off-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-royal';

// Picks an image from the device (gallery or files), validates it and
// lets the visitor crop, trim and clear a white background, with a
// checkerboard preview so transparency is visible. The result is held in
// memory by the parent; the source file is released immediately.
export function ImagePicker({
  label,
  help,
  value,
  onChange,
  whiteDefault = false,
  allowCrop = true,
}: {
  label: string;
  help?: string;
  value?: CertImage;
  onChange: (img: CertImage | undefined) => void;
  whiteDefault?: boolean;
  allowCrop?: boolean;
}) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [source, setSource] = useState<HTMLImageElement | null>(null);
  const [adj, setAdj] = useState<ImageAdjust>({ ...DEFAULT_ADJUST, clearWhite: whiteDefault });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Re-process whenever an adjustment changes.
  useEffect(() => {
    if (!source) return;
    const t = window.setTimeout(() => onChange(processImage(source, adj)), 60);
    return () => window.clearTimeout(t);
    // onChange is stable enough for this purpose; re-running on it would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, adj]);

  async function pick(file: File) {
    setError('');
    const problem = await validateImageFile(file);
    if (problem) return setError(problem);
    setBusy(true);
    try {
      setSource(await decodeImage(file));
      setAdj({ ...DEFAULT_ADJUST, clearWhite: whiteDefault });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function clear() {
    setSource(null);
    onChange(undefined);
    setError('');
  }

  const slider = (edge: keyof ImageAdjust['crop'], text: string) => (
    <label className="flex flex-col gap-1 text-xs font-semibold text-slate">
      {text}: {adj.crop[edge]}
      <input
        type="range"
        min={0}
        max={40}
        step={1}
        value={adj.crop[edge]}
        onChange={(e) => setAdj({ ...adj, crop: { ...adj.crop, [edge]: Number(e.target.value) } })}
        className="accent-royal"
      />
    </label>
  );

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-slate/10 p-4">
      <p id={`${id}-label`} className="text-sm font-bold text-slate">
        {label}
      </p>
      {help && <p className="text-xs text-slate/70">{help}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <div
          className="nca-checker flex h-20 w-28 items-center justify-center overflow-hidden rounded-lg border border-slate/20"
        >
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value.src} alt={`${label} preview`} className="max-h-full max-w-full object-contain" />
          ) : (
            <span className="text-xs text-slate/70">No image</span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={btn} onClick={() => inputRef.current?.click()} aria-describedby={`${id}-label`}>
            {busy ? 'Opening…' : value ? 'Change image' : 'Choose image'}
          </button>
          {value && (
            <button type="button" className={btn} onClick={clear}>
              Remove
            </button>
          )}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void pick(f);
            e.target.value = '';
          }}
        />
      </div>
      <p className="text-xs text-slate/70">JPG, PNG or WebP, up to 5 MB.</p>
      {error && (
        <p role="alert" className="text-sm font-semibold text-red-800">
          {error}
        </p>
      )}
      {source && (
        <details className="rounded-xl bg-off-white p-3">
          <summary className="cursor-pointer text-sm font-bold text-slate">Adjust image</summary>
          <div className="mt-3 flex flex-col gap-3">
            <label className="flex items-center gap-2 text-sm text-slate">
              <input type="checkbox" className="h-5 w-5 accent-royal" checked={adj.trim} onChange={(e) => setAdj({ ...adj, trim: e.target.checked })} />
              Trim empty margins
            </label>
            <label className="flex items-center gap-2 text-sm text-slate">
              <input type="checkbox" className="h-5 w-5 accent-royal" checked={adj.clearWhite} onChange={(e) => setAdj({ ...adj, clearWhite: e.target.checked })} />
              Make white background transparent
            </label>
            {allowCrop && (
              <fieldset className="grid grid-cols-2 gap-3">
                <legend className="mb-1 text-xs font-bold text-slate">Crop each edge (percent)</legend>
                {slider('top', 'Top')}
                {slider('bottom', 'Bottom')}
                {slider('left', 'Left')}
                {slider('right', 'Right')}
              </fieldset>
            )}
          </div>
        </details>
      )}
    </div>
  );
}
