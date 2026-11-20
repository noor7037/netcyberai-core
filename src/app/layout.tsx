import type { Metadata } from 'next';
import { Header } from '@/components/layout/Header';
import { featureMenu } from '@/content/features/menu';
import { Footer } from '@/components/layout/Footer';
import { SiteBreadcrumbs } from '@/components/layout/SiteBreadcrumbs';
import { AuthLinkForwarder } from '@/components/auth/AuthLinkForwarder';
import { organizationJsonLd, serializeJsonLd, websiteJsonLd } from '@/lib/seo';
import { companyName, ogLocale, siteDescription, siteLanguage, siteUrl } from '@/lib/site-config';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: companyName, template: `%s | ${companyName}` },
  description: siteDescription,
  openGraph: { siteName: companyName, locale: ogLocale, type: 'website' },
  twitter: { card: 'summary_large_image' },
  // Search Console and Bing Webmaster Tools ownership (C471): the codes each tool shows, set as Vercel settings at
  // build. Public by design (they are printed on every page), not secrets; with none set, no tag is written.
  verification: {
    ...(process.env.GOOGLE_SITE_VERIFICATION ? { google: process.env.GOOGLE_SITE_VERIFICATION } : {}),
    ...(process.env.BING_SITE_VERIFICATION ? { other: { 'msvalidate.01': process.env.BING_SITE_VERIFICATION } } : {}),
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang={siteLanguage}>
      <body className="flex min-h-screen flex-col bg-off-white font-sans text-slate">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-white focus:px-4 focus:py-3 focus:font-semibold focus:text-slate focus:shadow-lg focus:outline focus:outline-2 focus:outline-royal"
        >
          Skip to main content
        </a>
        <Header features={featureMenu()} />
        <main id="main" tabIndex={-1} className="flex-1 focus:outline-none">
          <SiteBreadcrumbs />
          {children}
        </main>
        <Footer />
        <AuthLinkForwarder />
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
