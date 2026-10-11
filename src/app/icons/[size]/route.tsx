import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ImageResponse } from 'next/og';

// The app's icon for a phone's home screen (C143), drawn from our own logo
// mark (public/brand/logo-mark.svg): /icons/192, /icons/512, and
// /icons/maskable (the mark with the safe margin Android's shapes need).
export const dynamic = 'force-static';
export function generateStaticParams() {
  return [{ size: '192' }, { size: '512' }, { size: 'maskable' }];
}

const SIZES: Record<string, { px: number; pad: number }> = { '192': { px: 192, pad: 0 }, '512': { px: 512, pad: 0 }, maskable: { px: 512, pad: 0.1 } };

export function GET(_req: Request, { params }: { params: { size: string } }) {
  const spec = SIZES[params.size];
  if (!spec) return new Response('Not found', { status: 404 });
  const svg = readFileSync(path.join(process.cwd(), 'public/brand/logo-mark.svg'), 'utf8');
  const inner = Math.round(spec.px * (1 - spec.pad * 2));
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#002357' }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- drawn into a PNG, not served as a page image */}
        <img alt="" width={inner} height={inner} src={`data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`} />
      </div>
    ),
    { width: spec.px, height: spec.px }
  );
}
