import type { SVGProps } from 'react';

// One small stroke icon set, drawn for this site (no icon library, no
// third-party artwork). Icons inherit colour via currentColor.
const paths: Record<string, string> = {
  school: 'M3 10l9-6 9 6M5 10v9h14v-9M9 19v-5h6v5M12 7.5v.01',
  principal: 'M12 3l2.5 5 5.5.8-4 3.9.9 5.5L12 15.6 7.1 18.2 8 12.7 4 8.8l5.5-.8z',
  admin: 'M4 7h16v12H4zM9 7V5h6v2M4 12h16',
  teacher: 'M3 5h18v10H3zM8 19l4-4 4 4M7 9h6M7 12h4',
  student: 'M12 4L2 9l10 5 10-5-10-5zM6 11v5c3 2 9 2 12 0v-5',
  parent: 'M8 11a3 3 0 100-6 3 3 0 000 6zM17 12a2.5 2.5 0 100-5 2.5 2.5 0 000 5zM3 20c0-3 2.5-5.5 5-5.5s5 2.5 5 5.5M13.5 20c.3-2.6 1.8-4.5 3.5-4.5s3.5 1.9 3.8 4.5',
  finance: 'M7 5h10M7 9h10M7 5c4 0 6 1.5 6 4s-2 4-6 4l7 6',
  core: 'M12 3v3M12 18v3M3 12h3M18 12h3M6 6l2 2M16 16l2 2M18 6l-2 2M8 16l-2 2M12 8a4 4 0 100 8 4 4 0 000-8z',
  attendance: 'M9 11l2 2 4-4M5 4h14v16H5zM9 2v4M15 2v4',
  academics: 'M4 5h7a2 2 0 012 2v12a2 2 0 00-2-2H4zM20 5h-7a2 2 0 00-2 2v12a2 2 0 012-2h7z',
  homework: 'M4 20h4L19 9l-4-4L4 16zM13 7l4 4',
  exams: 'M7 3h7l5 5v13H7zM14 3v5h5M10 14l2 2 4-4',
  fees: 'M3 7h18v12H3zM3 11h18M7 15h3',
  chat: 'M4 5h16v11H9l-5 4z',
  pulse: 'M3 12h4l2-6 4 12 2-6h6',
  sparkle: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  trophy: 'M8 4h8v5a4 4 0 01-8 0zM8 6H4a3 3 0 003 4M16 6h4a3 3 0 01-3 4M12 13v4M8 20h8',
  certificate: 'M5 4h14v11H5zM9 8h6M9 11h4M10 15l-1 5 3-2 3 2-1-5',
  admissions: 'M9 11a4 4 0 100-8 4 4 0 000 8zM2 20c0-4 3-6 7-6s7 2 7 6M19 8v6M16 11h6',
  operations: 'M12 9a3 3 0 100 6 3 3 0 000-6zM19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z',
  bell: 'M6 8a6 6 0 1112 0c0 7 3 9 3 9H3s3-2 3-9M10 21h4',
  check: 'M5 12l4 4 10-10',
  alert: 'M12 3l10 18H2zM12 10v4M12 17v.01',
  info: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 16v-5M12 8v.01',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  play: 'M8 5l11 7-11 7z',
  pause: 'M8 5h3v14H8zM13 5h3v14h-3z',
  chevronLeft: 'M15 5l-7 7 7 7',
  chevronRight: 'M9 5l7 7-7 7',
  chevronDown: 'M5 9l7 7 7-7',
  download: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  phone: 'M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2z',
  compliance: 'M9 12l2 2 4-4M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
  reports: 'M6 3h9l5 5v13H6zM9 17v-3M12 17v-6M15 17v-4',
  users: 'M9 11a4 4 0 100-8 4 4 0 000 8zM2 20c0-4 3-6 7-6s7 2 7 6M17 3a4 4 0 010 8M22 20c0-3-1.7-5-4-5.7',
  link: 'M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1',
  lock: 'M6 11h12v10H6zM8 11V7a4 4 0 118 0v4',
  mail: 'M3 5h18v14H3zM3 6l9 7 9-7',
  support: 'M4 13a8 8 0 1116 0M4 13v4a2 2 0 002 2h1v-7H6a2 2 0 00-2 2M20 13v4a2 2 0 01-2 2h-1v-7h1a2 2 0 012 2',
  // One icon per module (docs/19 §3.2, C131): drawn here, same 24 px grid,
  // stroke and rounded joins. Nothing is traced from the reference board.
  dashboard: 'M4 4h7v9H4zM13 4h7v5h-7zM13 11h7v9h-7zM4 15h7v5H4z',
  staff: 'M5 6h14v14H5zM9 3v5M15 3v5M12 14a2 2 0 100-4 2 2 0 000 4zM8.5 18c.6-1.6 1.9-2.4 3.5-2.4s2.9.8 3.5 2.4',
  timetable: 'M4 6h16v14H4zM4 11h16M10 11v9M15 11v9M8 3v4M16 3v4',
  proxy: 'M4 8h13M14 5l3 3-3 3M20 16H7M10 13l-3 3 3 3',
  recovery: 'M4 12a8 8 0 0114-5.3L20 8M20 4v4h-4M20 12a8 8 0 01-14 5.3L4 16M4 20v-4h4M9.5 12l2 2 3.5-3.5',
  ptm: 'M3 5h11v8H8l-3 3v-3H3zM16 9h5v8h-2v3l-3-3h-4v-2',
  events: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4M12 12.2l1 2 2.2.3-1.6 1.6.4 2.2-2-1.1-2 1.1.4-2.2-1.6-1.6 2.2-.3z',
  complaints: 'M4 5h16v11h-7l-4 4v-4H4zM12 8v3.5M12 13.5v.01',
  earlyWarning: 'M8 10a4 4 0 118 0c0 4 2 5.5 2 5.5H6S8 14 8 10M10.5 19h3M3.5 8a8 8 0 012-3.5M20.5 8a8 8 0 00-2-3.5',
  genome: 'M6 8a2 2 0 100-4 2 2 0 000 4zM18 8a2 2 0 100-4 2 2 0 000 4zM12 14a2 2 0 100-4 2 2 0 000 4zM6 20a2 2 0 100-4 2 2 0 000 4zM18 20a2 2 0 100-4 2 2 0 000 4zM7.5 7.5l3 3M16.5 7.5l-3 3M7.5 16.5l3-3M16.5 16.5l-3-3',
  curriculumGap: 'M5 4h14v16H5zM8 8h8M8 12h3M14.5 12H16M8 16h8',
  copilot: 'M5 19L15 9M13 7l4 4M17 3l.8 2.2L20 6l-2.2.8L17 9l-.8-2.2L14 6l2.2-.8zM6 5v3M4.5 6.5h3M19 14v3M17.5 15.5h3',
  parentAi: 'M9 18h6M10 21h4M12 3a6 6 0 00-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0012 3z',
  auditor: 'M8 4h8v3H8zM6 5.5H5v15h14v-15h-1M7.5 14H10l1.5-3 2 5 1.5-2h2',
  career: 'M12 21a9 9 0 100-18 9 9 0 000 18zM15.5 8.5l-2 5-5 2 2-5z',
  twin: 'M4 9h10v10H4zM10 9V5h10v10h-6',
  automation: 'M13 3L5 13h6l-1 8 8-10h-6z',
  ticket: 'M4 7h16v3a2 2 0 000 4v3H4v-3a2 2 0 000-4zM14 7v10',
  search: 'M11 18a7 7 0 100-14 7 7 0 000 14zM16 16l5 5',
  plus: 'M12 5v14M5 12h14',
};

export type IconName = keyof typeof paths;

export function Icon({ name, className = 'h-5 w-5', ...rest }: { name: IconName } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
      {...rest}
    >
      <path d={paths[name]} />
    </svg>
  );
}
