'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useT } from '@/components/app-shell/LangContext';
import { SchoolLogo } from '@/components/app-shell/SchoolLogo';
import { Input } from '@/components/ui/Input';
import type { MessageKey } from '@/lib/i18n';
import { LOGO_EDGE_PX, LOGO_MAX_ASPECT, LOGO_MAX_BYTES, LOGO_MIN_SIDE_PX, LOGO_PICKER_ACCEPT, logoAddress, SCHOOL_NAME_MAX } from '@/lib/school/logo-file';

// "School profile and branding" (C235-B): the school's official name and logo. In Settings for the principal and
// the school admin (the page shows it to them only; the route and the database refuse anyone else), and in Control
// for the founder while onboarding a school. Saved, it shows at once at the top of every screen of that school.
//
// The logo never leaves this device as it was chosen: a JPG, PNG or SVG of up to 5 MB is drawn on a canvas at most
// 512 pixels on its long side and sent as that drawing, a PNG. An SVG is only ever drawn, never sent, so nothing in it
// can run anywhere. The server checks the PNG again by its own bytes.

// `school`: Settings, the session's own school (its id names the logo's address). `control`: the school named.
type Brand = { name: string; logoVersion: string | null };
type Note = { tone: 'ok' | 'bad'; key: MessageKey };
const PICKED = /\.(jpe?g|png|svg)$/i;
const PICKED_TYPES = ['image/jpeg', 'image/png', 'image/svg+xml'];
const SERVER_CODES = ['not_allowed', 'not_found', 'not_sent', 'name_blank', 'name_long', 'name_invalid', 'logo_empty', 'logo_too_large', 'logo_not_image', 'logo_dimensions', 'storage_unavailable'];
const TAP = 'inline-flex min-h-[44px] items-center justify-center rounded-md border border-slate/20 bg-white px-4 text-sm font-semibold text-slate hover:bg-slate/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-royal disabled:opacity-60';

// The chosen file as the PNG this device sends, or why it cannot be.
async function drawLogo(file: File): Promise<{ blob: Blob } | { problem: MessageKey }> {
  if (!PICKED.test(file.name) && !PICKED_TYPES.includes(file.type)) return { problem: 'branding.err.picker_type' };
  if (file.size > LOGO_MAX_BYTES) return { problem: 'branding.err.picker_size' };
  const svg = file.type === 'image/svg+xml' || /\.svg$/i.test(file.name);
  const source = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('unreadable'));
      image.src = source;
    });
    // An SVG with no size of its own is drawn as a square.
    const width = image.naturalWidth || LOGO_EDGE_PX;
    const height = image.naturalHeight || LOGO_EDGE_PX;
    // Never larger than the edge; an SVG (no pixels of its own) is drawn at the full edge.
    const scale = svg ? LOGO_EDGE_PX / Math.max(width, height) : Math.min(1, LOGO_EDGE_PX / Math.max(width, height));
    const w = Math.max(1, Math.round(width * scale));
    const h = Math.max(1, Math.round(height * scale));
    if (w < LOGO_MIN_SIDE_PX || h < LOGO_MIN_SIDE_PX || w / h > LOGO_MAX_ASPECT || h / w > LOGO_MAX_ASPECT) return { problem: 'branding.err.logo_dimensions' };
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const context = canvas.getContext('2d');
    if (!context) return { problem: 'branding.err.picker_read' };
    context.imageSmoothingQuality = 'high';
    context.drawImage(image, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    return blob ? { blob } : { problem: 'branding.err.picker_read' };
  } catch {
    return { problem: 'branding.err.picker_read' };
  } finally {
    URL.revokeObjectURL(source);
  }
}

export function SchoolBrandingCard(props: { scope: 'school' | 'control'; schoolId: string; initial?: Brand }) {
  const { t, lang } = useT();
  const router = useRouter();
  const ids = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const { schoolId } = props;
  const control = props.scope === 'control';
  const endpoint = control ? `/api/control/schools/${schoolId}/branding` : '/api/app/school/branding';
  const [brand, setBrand] = useState<Brand | null>(props.initial ?? null);
  const [name, setName] = useState(props.initial?.name ?? '');
  const [logo, setLogo] = useState<{ blob: Blob; preview: string } | null>(null);
  const [removing, setRemoving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<Note | null>(null);

  // Control reads the school's name and logo itself; Settings is given them by the page.
  useEffect(() => {
    if (props.initial || !control) return;
    let live = true;
    fetch(endpoint)
      .then((res) => (res.ok ? res.json() : null))
      .then((body: Brand | null) => {
        if (!live || !body) return;
        setBrand(body);
        setName(body.name);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [endpoint, props.initial, control]);
  useEffect(() => () => (logo ? URL.revokeObjectURL(logo.preview) : undefined), [logo]);

  async function choose(file: File | undefined) {
    if (!file) return;
    setNote(null);
    const drawn = await drawLogo(file);
    if (fileRef.current) fileRef.current.value = '';
    if ('problem' in drawn) return setNote({ tone: 'bad', key: drawn.problem });
    setRemoving(false);
    setLogo({ blob: drawn.blob, preview: URL.createObjectURL(drawn.blob) });
    setNote({ tone: 'ok', key: 'branding.logo.ready' });
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!brand || busy) return;
    setBusy(true);
    setNote(null);
    const form = new FormData();
    form.set('name', name);
    if (logo) form.set('logo', logo.blob, 'logo.png');
    if (removing) form.set('removeLogo', '1');
    try {
      const res = await fetch(endpoint, { method: 'POST', body: form });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        const code = typeof body?.code === 'string' && SERVER_CODES.includes(body.code) ? body.code : 'failed';
        setNote({ tone: 'bad', key: `branding.err.${code}` as MessageKey });
        return;
      }
      const changed = body.changed?.name || body.changed?.logo !== 'kept';
      setBrand({ name: body.name, logoVersion: body.logoVersion ?? null });
      setName(body.name);
      setLogo(null);
      setRemoving(false);
      setNote({ tone: 'ok', key: changed ? 'branding.saved' : 'branding.nothing' });
      // The bar at the top of every screen is drawn on the server: drawn again with the new name and logo.
      if (changed) router.refresh();
    } catch {
      setNote({ tone: 'bad', key: 'branding.err.failed' });
    } finally {
      setBusy(false);
    }
  }

  const shownName = name.trim() || brand?.name || '';
  const shownLogo = logo ? logo.preview : removing ? null : logoAddress(brand?.logoVersion ?? null, schoolId);
  const hasLogo = !!brand?.logoVersion;

  return (
    <section lang={lang} data-branding aria-labelledby={`${ids}-title`} className="flex flex-col gap-4 rounded-lg border border-slate/10 bg-white p-4">
      <div className="flex flex-col gap-1">
        <h3 id={`${ids}-title`} className="text-base font-bold text-slate">
          {t('branding.title')}
        </h3>
        <p className="text-sm text-slate/70">{t(control ? 'branding.how.control' : 'branding.how')}</p>
      </div>
      {!brand ? (
        <p className="text-sm text-slate/70">{t('branding.loading')}</p>
      ) : (
        <form onSubmit={save} className="flex flex-col gap-4">
          <div data-branding-preview className="flex items-center gap-3 rounded-lg border border-slate/10 bg-off-white p-3">
            <SchoolLogo src={shownLogo} name={shownName} size="lg" />
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate/70">{t('branding.preview')}</p>
              <p className="line-clamp-2 break-words text-lg font-extrabold leading-snug text-slate" title={shownName}>
                {shownName}
              </p>
              {!hasLogo && !logo && <p className="text-sm text-slate/70">{t('branding.logo.none')}</p>}
              {removing && <p className="text-sm text-slate">{t('branding.logo.willRemove')}</p>}
            </div>
          </div>
          <div className="max-w-xl">
            <Input id={`${ids}-name`} label={t('branding.name')} helperText={t('branding.name.hint')} value={name} maxLength={SCHOOL_NAME_MAX} autoComplete="organization" required onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium text-slate">{t('branding.logo')}</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" data-branding-choose className={TAP} disabled={busy} onClick={() => fileRef.current?.click()}>
                {t(hasLogo || logo ? 'branding.logo.change' : 'branding.logo.choose')}
              </button>
              {hasLogo && !logo && (
                <button type="button" data-branding-remove aria-pressed={removing} className={TAP} disabled={busy} onClick={() => setRemoving((r) => !r)}>
                  {t(removing ? 'branding.logo.keep' : 'branding.logo.remove')}
                </button>
              )}
            </div>
            <input ref={fileRef} id={`${ids}-logo`} data-branding-file type="file" accept={LOGO_PICKER_ACCEPT} hidden onChange={(e) => void choose(e.target.files?.[0])} />
            <p className="text-sm text-slate/70">{t('branding.logo.hint')}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" data-branding-save disabled={busy} className="inline-flex min-h-[44px] items-center justify-center rounded-md bg-sapphire px-5 text-sm font-semibold text-white hover:bg-sapphire/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-royal disabled:opacity-60">
              {t(busy ? 'branding.saving' : 'branding.save')}
            </button>
            {note && (
              <p role={note.tone === 'bad' ? 'alert' : 'status'} data-branding-note={note.tone} className={`text-sm font-semibold ${note.tone === 'ok' ? 'text-emerald-text' : 'text-red-800'}`}>
                {t(note.key)}
              </p>
            )}
          </div>
        </form>
      )}
    </section>
  );
}
