// The app design system (17 §4, PR-3a). Every school-app and Control screen
// builds from these; nothing here holds data of its own. The gallery at
// /design-system (development only) shows each piece in every state.
export { AppCard } from './Card';
export { ChartCard, ChartTable } from './ChartCard';
export { DataList, type DataColumn } from './DataList';
export { formatTrend, formatValue, NO_VALUE } from './format';
export { KpiTile } from './KpiTile';
export { useCountUp } from './motion';
export { PageHeader } from './PageHeader';
export { EmptyState, ErrorState, NoAccessState, Skeleton } from './States';
export { StatusPill } from './StatusPill';
export { STATUS_TONES, TOKEN_TONES, type StatusTone, type ToneClasses } from './tones';
