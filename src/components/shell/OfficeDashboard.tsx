import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

type Section = { id: string; title: string; description: string };

// PRD §7.3/§4.4: "A KPI grid is a desktop layout; on a phone a
// principal scrolls past it." Exception-first order, in DOM source
// order (matters: the verification for this component checks DOM
// order at 360px, not just visual position, since visual order can be
// faked with CSS while DOM/reading order stays wrong for a screen
// reader): Needs your decision today, Today, This week, Warnings, then
// Analytics one tap down -- a link, not inline charts (no business
// logic yet to chart).
//
// "On desktop the same content expands to multi-column... same
// information architecture, different density" -- this is ONE
// component, ONE array of sections, rendered once. The `lg:grid-cols-2`
// class is the only thing that changes between 360px and 1024px+;
// there is no second, desktop-only component duplicating this content.
const sections: Section[] = [
  {
    id: 'decisions',
    title: 'Needs your decision today',
    description: 'Approvals, TC requests, correction requests, marks awaiting approval, and fee waivers will appear here.',
  },
  {
    id: 'today',
    title: 'Today',
    description: 'Attendance %, staff present, and absentees not yet communicated to parents.',
  },
  {
    id: 'this-week',
    title: 'This week',
    description: 'Fee collection, Pulse open rate, and new admissions this week.',
  },
  {
    id: 'warnings',
    title: 'Warnings',
    description: 'Consent pending, message budget state, Form 6 advisory, and at-risk student count.',
  },
];

export function OfficeDashboard() {
  return (
    <div className="p-4 md:p-6">
      <h1 className="mb-4 text-xl font-bold text-slate">Dashboard</h1>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {sections.map((s) => (
          <Card key={s.id}>
            <h2 className="mb-1 text-base font-bold text-slate">{s.title}</h2>
            <p className="text-sm text-slate/70">{s.description}</p>
          </Card>
        ))}
      </div>
      <div className="mt-4">
        <Button href="/app/reports" variant="outline">
          Analytics →
        </Button>
      </div>
    </div>
  );
}
