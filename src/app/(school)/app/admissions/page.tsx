import { ModuleOffPage } from '@/components/app-shell/ModuleOffPage';
import { moduleOffReason } from '@/lib/frameworks/page-access';
import { StudentsView } from '@/components/students/StudentsView';

// [GAP] vs PRD §3.1's full admissions pipeline (Enquiry -> Application
// -> Document Verification -> Interview/Assessment -> Offer ->
// Confirmation -> Enrolled): only the LAST state that pipeline produces
// has ever had a schema column (students.status), and Prompt A never
// added enquiry/application/offer tables for the earlier stages. This
// page is honestly what the schema actually supports today -- the
// enrolment queue (status = pending_consent) -- not a fabricated
// multi-stage pipeline UI with nothing behind it. Building the earlier
// stages is real, scoped work for a future prompt, not something to
// silently invent here.
export default async function AdmissionsPage() {
  const off = await moduleOffReason('admissions');
  if (off) return <ModuleOffPage moduleId="admissions" reason={off} />;
  return (
    <StudentsView
      title="Admissions"
      description="Newly enrolled students awaiting parent/guardian consent. (Earlier pipeline stages — enquiry, application, offer — aren't built yet; see this page's own source comment.)"
      statusFilter="pending_consent"
    />
  );
}
