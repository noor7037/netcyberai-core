// The app design system (17 §4, PR-3a). Every school-app and Control screen
// builds from these; nothing here holds data of its own. The gallery at
// /design-system (development only) shows each piece in every state.
export { AppCard } from './Card';
export { BulkBar, bulkApi, type BulkApi } from './BulkBar';
export { ComingInPhase } from './ComingInPhase';
export { ChartCard, ChartTable } from './ChartCard';
export { AreaTrend, CalendarHeat, ChartFrame, DEFAULT_BANDS, DonutChart, GaugeChart, RingProgress, type DonutSlice, type GaugeBand, type HeatDay, type TrendPoint } from './ProgressCharts';
export { greetingFor, HeroBand, indiaDate, indiaHour, type HeroChip } from './HeroBand';
export { ModuleIcon } from './ModuleIcon';
export { ModulePage, PRIMARY_ACTION, QUIET_ACTION } from './ModulePage';
export { DataList, type DataColumn, type ListSelection } from './DataList';
export { FilterBar, useUrlListQuery } from './FilterBar';
export * as listQuery from './list-query';
export { formatTrend, formatValue, NO_VALUE } from './format';
export { KpiTile } from './KpiTile';
export { useCountUp } from './motion';
export { PageHeader } from './PageHeader';
export { SavedViewsMenu, savedViewsApi, type NewView } from './SavedViewsMenu';
export { EmptyState, ErrorState, NoAccessState, Skeleton } from './States';
export { StatusPill } from './StatusPill';
export { STATUS_TONES, TOKEN_TONES, toneTint, type StatusTone, type ToneClasses } from './tones';
