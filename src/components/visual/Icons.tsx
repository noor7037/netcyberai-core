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
