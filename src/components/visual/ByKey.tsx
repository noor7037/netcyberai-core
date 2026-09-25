import type { ReactNode } from 'react';
import type { ChartKey, ScreenKey } from '@/content/catalog';
import { colors } from '@/lib/design-tokens';
import { BrowserFrame } from './Frames';
import { ColumnChart, Funnel, LineChart } from './Charts';
import {
  AdmissionsScreen,
  AttendanceScreen,
  CertificateWorkflowScreen,
  ComplianceScreen,
  ExamsScreen,
  FinanceScreen,
  HomeworkScreen,
  OperationsScreen,
  ParentPulsePhone,
  PrincipalScreen,
  PulseComposerScreen,
  RecognitionScreen,
  ReportsScreen,
  SchoolHealthScreen,
  StudentProfileScreen,
  StudentProgressScreen,
  TeacherImpactScreen,
  TeacherTodayScreen,
} from './Screens';
import {
  admissionsFunnel,
  attendanceTrend,
  classPerformance,
  feeCollectionTrend,
  homeworkCompletion,
  learningGrowth,
  parentResponse,
  personalBest,
  schoolHealth,
  teacherImpactSignals,
} from '@/demo-fixture/website-demo';

const SCREENS: Record<ScreenKey, { url: string; node: () => ReactNode; phone?: boolean }> = {
  principal: { url: 'principal', node: () => <PrincipalScreen /> },
  teacher: { url: 'today', node: () => <TeacherTodayScreen /> },
  parent: { url: '', node: () => <ParentPulsePhone />, phone: true },
  student: { url: 'progress', node: () => <StudentProgressScreen /> },
  finance: { url: 'fees', node: () => <FinanceScreen /> },
  admissions: { url: 'admissions', node: () => <AdmissionsScreen /> },
  attendance: { url: 'attendance', node: () => <AttendanceScreen /> },
  homework: { url: 'homework', node: () => <HomeworkScreen /> },
  exams: { url: 'exams', node: () => <ExamsScreen /> },
  recognition: { url: 'recognition', node: () => <RecognitionScreen /> },
  certificates: { url: 'certificates', node: () => <CertificateWorkflowScreen /> },
  reports: { url: 'reports', node: () => <ReportsScreen /> },
  compliance: { url: 'compliance', node: () => <ComplianceScreen /> },
  operations: { url: 'operations', node: () => <OperationsScreen /> },
  pulse: { url: 'pulse', node: () => <PulseComposerScreen /> },
  impact: { url: 'impact', node: () => <TeacherImpactScreen /> },
  profile: { url: 'students', node: () => <StudentProfileScreen /> },
  health: { url: 'health', node: () => <SchoolHealthScreen /> },
};

export function ScreenByKey({ k }: { k: ScreenKey }) {
  const s = SCREENS[k];
  if (s.phone) return <>{s.node()}</>;
  return <BrowserFrame url={`app.netcyberai.com/${s.url}`}>{s.node()}</BrowserFrame>;
}

export const CHART_TITLES: Record<ChartKey, string> = {
  attendance: 'School attendance this week vs last week',
  fees: 'Fee collection by month (₹ lakh)',
  admissions: 'Admissions funnel this season',
  homework: 'Homework completion by class',
  performance: 'Term 1 average score by subject',
  parents: 'Parents reading and replying to the Pulse',
  health: 'School health, by dimension',
  impact: 'Teacher Impact Card signals',
  growth: 'Class average score through the term',
  personalBest: `${personalBest.studentName}: ${personalBest.subject} unit scores`,
};

export function ChartByKey({ k }: { k: ChartKey }) {
  const title = CHART_TITLES[k];
  switch (k) {
    case 'attendance':
      return (
        <LineChart
          title={title}
          labels={attendanceTrend.labels}
          series={[
            { name: 'This week', color: colors.royal, values: attendanceTrend.thisWeek },
            { name: 'Last week', color: colors.turquoise, values: attendanceTrend.lastWeek },
          ]}
          min={80}
          max={100}
          unit="%"
          height={230}
        />
      );
    case 'fees':
      return (
        <ColumnChart
          title={title}
          data={feeCollectionTrend.labels.map((l, i) => ({ label: l, value: feeCollectionTrend.values[i] }))}
          color={colors.tangerine}
          unit="L"
          height={230}
        />
      );
    case 'admissions':
      return <Funnel title={title} stages={admissionsFunnel} colors={[colors.cyan, colors.royal, colors.grape, colors.turquoise]} />;
    case 'homework':
      return <ColumnChart title={title} data={homeworkCompletion} color={colors.royal} max={100} unit="%" height={230} />;
    case 'performance':
      return <ColumnChart title={title} data={classPerformance} color={colors.grape} max={100} height={230} />;
    case 'parents':
      return (
        <LineChart
          title={title}
          labels={parentResponse.labels}
          series={[
            { name: 'Read', color: colors.royal, values: parentResponse.read },
            { name: 'Replied', color: colors.tangerine, values: parentResponse.replied },
          ]}
          unit="%"
          height={230}
        />
      );
    case 'health':
      return <ColumnChart title={title} data={schoolHealth.dimensions.map((d) => ({ label: d.label.split(' ')[0], value: d.value }))} color={colors.turquoise} max={100} unit="%" height={230} />;
    case 'impact':
      return <ColumnChart title={title} data={teacherImpactSignals.map((d) => ({ label: d.label.split(' ')[0], value: d.value }))} color={colors.grape} max={100} unit="%" height={230} />;
    case 'growth':
      return (
        <LineChart
          title={title}
          labels={learningGrowth.labels}
          series={[{ name: 'Class average', color: colors.grape, values: learningGrowth.classAverage }]}
          min={50}
          max={80}
          height={230}
        />
      );
    case 'personalBest':
      return (
        <LineChart
          title={title}
          labels={personalBest.labels}
          series={[{ name: 'Score', color: colors.grape, values: personalBest.scores }]}
          min={40}
          max={80}
          height={230}
        />
      );
  }
}
