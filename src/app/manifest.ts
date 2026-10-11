import type { MetadataRoute } from 'next';

// The install manifest (docs/20 5a, C143): "Add to Home screen" on a phone
// opens the school app full screen at My Day. Colours are the logo's.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'NetCyberAI',
    short_name: 'NetCyberAI',
    description: 'The school app: your day, attendance and classes.',
    start_url: '/app',
    scope: '/',
    display: 'standalone',
    background_color: '#020a2a',
    theme_color: '#020a2a',
    lang: 'en',
    icons: [
      { src: '/icons/192', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/512', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
