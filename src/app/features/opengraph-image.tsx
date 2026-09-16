import { renderOgCard } from '@/lib/og-card';
import { ogCards, ogImageSize } from '@/lib/seo';

export const size = ogImageSize;
export const contentType = 'image/png';
export const alt = ogCards.feature.alt;

export default function Image() {
  return renderOgCard(ogCards.feature);
}
