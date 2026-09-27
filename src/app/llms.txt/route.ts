import { blogPosts } from '@/content/blog';
import { freeTools } from '@/content/free-tools';
import { absoluteUrl, pageMeta } from '@/lib/seo';
import { companyName, contactEmail, siteDescription } from '@/lib/site-config';

export const dynamic = 'force-static';

type MetaKey = keyof typeof pageMeta;

function link(key: MetaKey): string {
  const page = pageMeta[key];
  return `- [${page.title}](${absoluteUrl(page.path)}): ${page.description}`;
}

// Generated from the same page registry and blog data the site renders,
// so this summary cannot drift from what the pages actually say.
export function GET() {
  const body = [
    `# ${companyName}`,
    '',
    `> ${siteDescription}`,
    '',
    'Current status: pre-launch. This website is the only live product surface. No school, student, or parent data is processed yet, and no pilot results, customer numbers, or case studies exist or are claimed anywhere on this site.',
    '',
    'Standing product positions:',
    '- Parent messages are sent 1-on-1 on WhatsApp. WhatsApp Groups are never used, because they expose every parent’s number to others.',
    '- Student records stay in a pending state until a parent or guardian’s consent is recorded, per purpose.',
    '- The Haryana Form 6 fee check is advisory only: never blocking, never legal advice.',
    '- There is no public teacher leaderboard; the Teacher Impact Card is visible only to the teacher and their principal.',
    `- The /demo route is an interactive walkthrough using a fictional school and fictional student names. It is not deliberately excluded from crawling, but nothing in it should be cited as real ${companyName} customer data.`,
    '',
    '## Features',
    link('feeRecovery'),
    link('dailyPulse'),
    link('weeklyBrief'),
    link('certificates'),
    link('teacherImpact'),
    link('form6'),
    '',
    '## Trust and pricing',
    link('dataOwnership'),
    link('privacy'),
    link('terms'),
    link('pricing'),
    '',
    '## Free tools (run in the browser; nothing typed is sent to NetCyberAI)',
    link('freeTools'),
    ...freeTools.map((t) => `- [${t.name}](${absoluteUrl(`/free-tools/${t.slug}`)}): ${t.description}`),
    '',
    '## Guides',
    ...blogPosts.map((post) => `- [${post.title}](${absoluteUrl(`/blog/${post.slug}`)}): ${post.description}`),
    '',
    '## Contact',
    `- Email: ${contactEmail}`,
    '',
  ].join('\n');

  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
