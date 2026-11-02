import type { PoolClient } from 'pg';
import type { FamilyClaims } from './db';
import { guarded } from './chapter-store';
import type { FamilyChild } from './children';
import type { RequestStatus } from './chapter-request-types';
import { activeLinks, notifyOff, readSeen, schoolNewsFor, schoolNoticesFor, schoolSubjectIs, schoolTodayFor } from './school';
import { SUBJECT_IDS } from './subjects';
import { latestReportFor } from './parent-report';
import type { MessageKey } from '@/lib/i18n';

// The family's notifications centre (H1): what the app already knows to tell this child's family, read-only and built
// only from sources that exist: the connected school's new homework, notices and results (counted as the parent's
// "new from school" is, without the kinds the parent turned off), tonight's practice from the school, and the state of
// the chapters the family asked for. Nothing is stored for it and no new push is sent. The active child's items only:
// a sibling's, or another account's, never appear.

export const REQUEST_NEWS_DAYS = 14;

export type NotificationItem =
  | { id: string; kind: 'news'; news: 'homework' | 'notices' | 'results'; count: number; href: string }
  | { id: string; kind: 'notice'; school: string; body: string; href: string }
  | { id: string; kind: 'tonight'; subject: string; href: string }
  | { id: string; kind: 'request'; status: RequestStatus; title: string; href: string }
  // w16-b3: this child's weekly report (W16-B3), made in the last days; opens the parent area's Progress.
  | { id: string; kind: 'report'; weekStart: string; href: string };

export type NotificationInput = {
  news: { homework: number; notices: number; results: number } | null;
  // The school's own notices (W14-J): the school's name as the sender and the notice's words.
  notices?: readonly { noticeId: string; schoolName: string; body: string }[];
  tonight: readonly string[];
  requests: readonly { requestId: string; subject: string; title: string; status: RequestStatus }[];
  // w16-b3: the child's newest weekly report of the last days.
  report?: { childId: string; weekStart: string } | null;
};

export const NEWS_TEXT: Record<'homework' | 'notices' | 'results', MessageKey> = { homework: 'fam.news.homework', notices: 'fam.news.notices', results: 'fam.news.results' };
export const REQUEST_TEXT: Record<RequestStatus, MessageKey> = {
  received: 'fam.notify.center.requestReceived',
  digitizing: 'fam.notify.center.requestDigitizing',
  ready: 'fam.notify.center.requestReady',
  declined: 'fam.notify.center.requestDeclined',
};

// The list, school first, then the chapters. Pure.
export function buildNotifications(input: NotificationInput): NotificationItem[] {
  const out: NotificationItem[] = [];
  if (input.news) {
    for (const k of ['homework', 'notices', 'results'] as const) {
      if (input.news[k] > 0) out.push({ id: `news.${k}`, kind: 'news', news: k, count: input.news[k], href: '/family/parent' });
    }
  }
  if (input.report) out.push({ id: `report.${input.report.weekStart}`, kind: 'report', weekStart: input.report.weekStart, href: `/family/parent/progress/${encodeURIComponent(input.report.childId)}` });
  for (const n of input.notices ?? []) out.push({ id: `notice.${n.noticeId}`, kind: 'notice', school: n.schoolName, body: n.body, href: '/family/parent' });
  for (const s of input.tonight) out.push({ id: `tonight.${s}`, kind: 'tonight', subject: s, href: `/family/study?subject=${encodeURIComponent(s)}` });
  for (const r of input.requests) {
    out.push({ id: `request.${r.requestId}`, kind: 'request', status: r.status, title: r.title, href: `/family/study?subject=${encodeURIComponent(r.subject)}` });
  }
  return out;
}

// The chapter requests of this child that are still open or changed in the last days.
async function recentRequests(db: PoolClient, accountId: string, childId: string): Promise<NotificationInput['requests']> {
  return guarded(
    db,
    'notify_requests',
    async () =>
      (
        await db.query(
          `select request_id, subject, title, status from content.chapter_requests
            where account_id = $1 and child_id = $2 and (status in ('received', 'digitizing') or updated_at > now() - ($3::int * interval '1 day'))
            order by updated_at desc limit 20`,
          [accountId, childId, REQUEST_NEWS_DAYS]
        )
      ).rows.map((x: { request_id: string; subject: string; title: string; status: RequestStatus }) => ({ requestId: String(x.request_id), subject: String(x.subject), title: String(x.title), status: x.status })),
    []
  );
}

// Reads the sources for the active child, in the account's own transaction (`db`) and the school through the guardian's
// claims. The kinds the parent turned off are left out, as everywhere.
export async function readNotifications(db: PoolClient, claims: FamilyClaims, accountId: string, child: Pick<FamilyChild, 'childId'>): Promise<NotificationItem[]> {
  const links = await activeLinks(db, accountId);
  const seen = await readSeen(db, accountId);
  const off = await notifyOff(db, accountId);
  const mine = links.map((l) => ({ ...l, children: l.children.filter((c) => c.childId === child.childId) })).filter((l) => l.children.length > 0);
  const news = mine.length ? await schoolNewsFor(claims, mine, seen, off) : null;
  const atSchool = off.includes('tonight') ? null : await schoolTodayFor(claims, links, child.childId);
  const tonight = atSchool ? SUBJECT_IDS.filter((s) => atSchool.tonight.some((t) => schoolSubjectIs(t.subject, s))) : [];
  const notices = mine.length ? await schoolNoticesFor(claims, mine, off) : [];
  const report = await guarded(db, 'notify_report', () => latestReportFor(db, accountId, child.childId), null);
  return buildNotifications({ news, notices, tonight, requests: await recentRequests(db, accountId, child.childId), report: report ? { childId: child.childId, weekStart: report.weekStart } : null });
}
