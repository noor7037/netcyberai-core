import type { Metadata } from 'next';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { organizationJsonLd, serializeJsonLd, websiteJsonLd } from '@/lib/seo';
import { companyName, ogLocale, siteDescription, siteLanguage, siteUrl } from '@/lib/site-config';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: companyName, template: `%s | ${companyName}` },
  description: siteDescription,
  openGraph: { siteName: companyName, locale: ogLocale, type: 'website' },
  twitter: { card: 'summary_large_image' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang={siteLanguage}>
      <body className="flex min-h-screen flex-col bg-off-white font-sans text-slate">
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(organizationJsonLd()) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(websiteJsonLd()) }}
        />
      </body>
    </html>
  );
}
