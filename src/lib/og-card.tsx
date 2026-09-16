import { ImageResponse } from 'next/og';
import { colors } from './design-tokens';
import { ogImageSize } from './seo';
import { companyName, siteUrl } from './site-config';

export function renderOgCard({ eyebrow, title }: { eyebrow: string; title: string }) {
  const titleSize = title.length > 70 ? 50 : title.length > 45 ? 58 : 68;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: 72,
          backgroundColor: colors.sapphire,
          color: colors.offWhite,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <div style={{ width: 14, height: 44, marginRight: 18, backgroundColor: colors.emerald, borderRadius: 4 }} />
          <div style={{ fontSize: 34, fontWeight: 700 }}>{companyName}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 26, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 20 }}>{eyebrow}</div>
          <div style={{ fontSize: titleSize, fontWeight: 700, lineHeight: 1.15 }}>{title}</div>
        </div>
        <div style={{ fontSize: 26 }}>{siteUrl.replace(/^https?:\/\//, '')}</div>
      </div>
    ),
    ogImageSize,
  );
}
