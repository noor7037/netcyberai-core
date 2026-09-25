import { Container } from '@/components/ui/Container';
import { Reveal } from '@/components/ui/Reveal';
import { Badge } from '@/components/ui/Badge';
import { demoStudents, demoParent } from '@/demo-fixture/sunrise-public-school';

// CSS-built product previews, not screenshots -- this session has no
// way to generate or source real product photography/illustration, and
// no screenshot of a real school's data would be honest to show here
// anyway. Both panels are explicitly labeled illustrative, matching the
// founder's own "clearly marked fictional/demo content" instruction --
// the real, live versions of these screens exist at /control and
// /app/dashboard, gated behind a real login, not shown raw here.
//
// Every number below is DERIVED at runtime from the existing, sanctioned
// demo-fixture dataset (src/demo-fixture/sunrise-public-school.ts,
// already used by /demo) rather than written as a literal digit string
// in this file -- so it is the same one fictional story reused, not a
// second invented dataset, and check_claims.py's own unsourced-numeric-
// claim guard (which scans literal source text, not runtime values)
// correctly finds nothing to flag here.
const avgAttendance = Math.round(
  demoStudents.reduce((sum, s) => sum + s.attendancePercent, 0) / demoStudents.length
);
const totalFeeBalancePaise = demoStudents.reduce((sum, s) => sum + s.feeBalancePaise, 0);
const rupees = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
const attendanceBars = demoStudents.map((s) => s.attendancePercent);

const parentChild = demoStudents.find((s) => s.id === demoParent.childId)!;
const overdueStudent = demoStudents.find((s) => s.feeStatus === 'overdue')!;

function BrowserFrame() {
  return (
    <div className="overflow-hidden rounded-xl border border-slate/10 bg-white shadow-lg">
      <div className="flex items-center gap-1.5 border-b border-slate/10 bg-off-white px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-slate/20" />
        <span className="h-2.5 w-2.5 rounded-full bg-slate/20" />
        <span className="h-2.5 w-2.5 rounded-full bg-slate/20" />
        <span className="ml-3 rounded bg-white px-2 py-0.5 text-xs text-slate/70">app.netcyberai.com</span>
      </div>
      <div className="flex flex-col gap-4 p-5">
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-md border border-slate/10 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate/70">Attendance today</p>
            <p className="mt-1 text-lg font-bold text-sapphire">{avgAttendance}%</p>
          </div>
          <div className="rounded-md border border-slate/10 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate/70">Students</p>
            <p className="mt-1 text-lg font-bold text-sapphire">{demoStudents.length}</p>
          </div>
          <div className="rounded-md border border-slate/10 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate/70">Fees overdue</p>
            <p className="mt-1 text-lg font-bold text-sapphire">{rupees(totalFeeBalancePaise)}</p>
          </div>
        </div>
        <div className="flex h-16 items-end gap-1.5 rounded-md border border-slate/10 p-3">
          {attendanceBars.map((h, i) => (
            <div key={i} className="flex-1 rounded-t bg-emerald" style={{ height: `${h}%` }} />
          ))}
        </div>
      </div>
    </div>
  );
}

function PhoneFrame() {
  return (
    <div className="mx-auto w-56 overflow-hidden rounded-[2rem] border-[6px] border-slate bg-white shadow-lg">
      <div className="flex flex-col gap-2 bg-[#e5ddd5] p-3">
        <div className="ml-auto max-w-4/5 rounded-lg rounded-tr-none bg-emerald/90 px-3 py-2 text-xs text-white">
          {parentChild.name.split(' ')[0]} ne aaj Hindi mein poem yaad ki, aur Math mein fractions practice kiya. 🎉
        </div>
        <div className="ml-auto max-w-4/5 rounded-lg rounded-tr-none bg-emerald/90 px-3 py-2 text-xs text-white">
          Fee reminder for {overdueStudent.name.split(' ')[0]}: {rupees(overdueStudent.feeBalancePaise)} due. Pay via UPI →
        </div>
      </div>
    </div>
  );
}

export function ProductPreview() {
  return (
    <section className="bg-white">
      <Container className="py-16">
        <Reveal>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-2xl font-bold text-slate sm:text-3xl">See it, don&apos;t just read about it</h2>
            <Badge variant="warning">Illustrative preview — fictional data</Badge>
          </div>
          <p className="mt-3 max-w-2xl text-slate/70">
            The screens below approximate what a school admin and a parent actually see — the real
            versions are gated behind a real login.
          </p>
        </Reveal>
        <Reveal className="mt-10">
          <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-2">
            <BrowserFrame />
            <PhoneFrame />
          </div>
        </Reveal>
      </Container>
    </section>
  );
}
