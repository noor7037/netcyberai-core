import type { BlogPost } from '../contract';
import { automateSchoolFeeRemindersWhatsappUpiIndia } from './automate-school-fee-reminders-whatsapp-upi-india';
import { digitalTcCharacterCertificateWorkflow } from './digital-tc-character-certificate-workflow';
import { haryanaForm6FeeHikeComplianceGuide } from './haryana-form-6-fee-hike-compliance-guide';
import { whyParentsDontCheckSchoolApps } from './why-parents-dont-check-school-apps';
import { personalBestVsTop3Recognition } from './personal-best-vs-top-3-recognition';
import { feeRecoverySequenceD3ToD7Playbook } from './fee-recovery-sequence-d3-to-d7-playbook';
import { onboarding500StudentsWithoutDpdpProblem } from './onboarding-500-students-without-dpdp-problem';
import { schoolErpDataOwnershipPreContractChecklist } from './school-erp-data-ownership-pre-contract-checklist';
import { teacherImpactCardMeasuringTeachingWithoutLeaderboards } from './teacher-impact-card-measuring-teaching-without-leaderboards';
import { schoolAttendanceAlertsWithoutSpammingParents } from './school-attendance-alerts-without-spamming-parents';
import { coachingCentreVsSchoolErpSameEngineDifferentDataModel } from './coaching-centre-vs-school-erp-same-engine-different-data-model';
import { udisePlusDataExportMadeSimple } from './udise-plus-data-export-made-simple';
import { weeklyConfidenceBriefDinnerTableQuestions } from './weekly-confidence-brief-dinner-table-questions';
import { howToMeasureWhatParentsActuallyOpen } from './how-to-measure-what-parents-actually-open';
import { schoolNoticesPaperDiaryToWhatsapp } from './school-notices-paper-diary-to-whatsapp';

import { schoolFeeInstalmentPlanAndCollectionForecast } from './school-fee-instalment-plan-and-collection-forecast';
import { attendanceRecoveryPlanForExamEligibility } from './attendance-recovery-plan-for-exam-eligibility';
import { schoolCapacityAndSectionPlanning } from './school-capacity-and-section-planning';
import { timetableClashesAndSubstitution } from './timetable-clashes-and-substitution';
import { examResultAnalysisForTeachers } from './exam-result-analysis-for-teachers';
import { schoolPayrollBudgetPlanning } from './school-payroll-budget-planning';
import { admissionSeasonCapacityAndRevenue } from './admission-season-capacity-and-revenue';
import { fairTeacherWorkloadAndSubstitution } from './fair-teacher-workload-and-substitution';
import { schoolCostPerStudentAndBreakEvenFee } from './school-cost-per-student-and-break-even-fee';
import { schoolCertificateFormatsGuide } from './school-certificate-formats-guide';

export const blogPosts: BlogPost[] = [
  schoolCertificateFormatsGuide,
  schoolFeeInstalmentPlanAndCollectionForecast,
  attendanceRecoveryPlanForExamEligibility,
  schoolCapacityAndSectionPlanning,
  timetableClashesAndSubstitution,
  examResultAnalysisForTeachers,
  schoolPayrollBudgetPlanning,
  admissionSeasonCapacityAndRevenue,
  fairTeacherWorkloadAndSubstitution,
  schoolCostPerStudentAndBreakEvenFee,
  haryanaForm6FeeHikeComplianceGuide,
  automateSchoolFeeRemindersWhatsappUpiIndia,
  digitalTcCharacterCertificateWorkflow,
  whyParentsDontCheckSchoolApps,
  personalBestVsTop3Recognition,
  feeRecoverySequenceD3ToD7Playbook,
  onboarding500StudentsWithoutDpdpProblem,
  schoolErpDataOwnershipPreContractChecklist,
  teacherImpactCardMeasuringTeachingWithoutLeaderboards,
  schoolAttendanceAlertsWithoutSpammingParents,
  coachingCentreVsSchoolErpSameEngineDifferentDataModel,
  udisePlusDataExportMadeSimple,
  weeklyConfidenceBriefDinnerTableQuestions,
  howToMeasureWhatParentsActuallyOpen,
  schoolNoticesPaperDiaryToWhatsapp,
];

export function getBlogPost(slug: string): BlogPost | undefined {
  return blogPosts.find((post) => post.slug === slug);
}
