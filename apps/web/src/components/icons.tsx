import type { SVGProps } from 'react';

export type IconProps = SVGProps<SVGSVGElement>;

const base = (props: IconProps) => ({
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  width: 18,
  height: 18,
  'aria-hidden': true,
  ...props,
});

export const IconDashboard = (props: IconProps) => (
  <svg {...base(props)}>
    <rect x="3" y="3" width="7.5" height="8.5" rx="2" />
    <rect x="13.5" y="3" width="7.5" height="5" rx="2" />
    <rect x="3" y="14.5" width="7.5" height="6.5" rx="2" />
    <rect x="13.5" y="11" width="7.5" height="10" rx="2" />
  </svg>
);

export const IconActivity = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M3 13h3.5l2.5-7 4 14 2.5-7H21" />
  </svg>
);

export const IconCalendar = (props: IconProps) => (
  <svg {...base(props)}>
    <rect x="3" y="5" width="18" height="16" rx="3" />
    <path d="M3 10h18M8 3v4M16 3v4" />
  </svg>
);

export const IconUsers = (props: IconProps) => (
  <svg {...base(props)}>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3.5 20a5.5 5.5 0 0 1 11 0" />
    <path d="M16 5.2a3.2 3.2 0 0 1 0 6.4M17.5 20a5.6 5.6 0 0 0-2-4.3" />
  </svg>
);

export const IconBuilding = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M4 21V6a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v15" />
    <path d="M14 10h4a2 2 0 0 1 2 2v9M2.5 21h19M7.5 8h2M7.5 12h2M7.5 16h2M17 14h.01M17 18h.01" />
  </svg>
);

export const IconBolt = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M13 2 4.5 13.5H11L10 22l8.5-11.5H12z" />
  </svg>
);

export const IconLayers = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="m12 3 8.5 4.8L12 12.6 3.5 7.8z" />
    <path d="m3.5 12.5 8.5 4.8 8.5-4.8M3.5 16.8l8.5 4.7 8.5-4.7" />
  </svg>
);

export const IconTrendUp = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M3 17l6-6 4 4 8-8" />
    <path d="M15 7h6v6" />
  </svg>
);

export const IconTrendDown = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M3 7l6 6 4-4 8 8" />
    <path d="M15 17h6v-6" />
  </svg>
);

export const IconMinus = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M5 12h14" />
  </svg>
);

export const IconArrowRight = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);

export const IconExternal = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M14 4h6v6M20 4l-8.5 8.5" />
    <path d="M18 14.5V18a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3.5" />
  </svg>
);

export const IconChevronDown = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="m6 9.5 6 6 6-6" />
  </svg>
);

export const IconRefresh = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M20 11A8 8 0 0 0 6.3 6.3L4 8.5" />
    <path d="M4 4v4.5h4.5M4 13a8 8 0 0 0 13.7 4.7L20 15.5" />
    <path d="M20 20v-4.5h-4.5" />
  </svg>
);

export const IconAlert = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M12 3.8 21 19.5H3z" />
    <path d="M12 10v4M12 16.6h.01" />
  </svg>
);

export const IconInbox = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M3.5 13.5 6 5.2A2 2 0 0 1 7.9 3.8h8.2a2 2 0 0 1 1.9 1.4l2.5 8.3" />
    <path d="M3.5 13.5h4l1.2 2.4h6.6l1.2-2.4h4v4.6a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" />
  </svg>
);

export const IconPin = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M12 21s6.5-6 6.5-11a6.5 6.5 0 1 0-13 0C5.5 15 12 21 12 21z" />
    <circle cx="12" cy="10" r="2.4" />
  </svg>
);

export const IconClock = (props: IconProps) => (
  <svg {...base(props)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7.5V12l3.2 2" />
  </svg>
);

export const IconSparkle = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M12 3.5l1.7 4.6 4.6 1.7-4.6 1.7L12 16.1l-1.7-4.6-4.6-1.7 4.6-1.7z" />
    <path d="M18.5 15.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" />
  </svg>
);

export const IconFile = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M14 3.5H7.5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V8z" />
    <path d="M14 3.5V8h4.5M9 13h6M9 16.5h4" />
  </svg>
);

export const IconPullRequest = (props: IconProps) => (
  <svg {...base(props)}>
    <circle cx="7" cy="18" r="2.4" />
    <circle cx="7" cy="6" r="2.4" />
    <circle cx="17" cy="18" r="2.4" />
    <path d="M7 8.4v7.2M14.5 6h1.6a2 2 0 0 1 2 2v7.6" />
  </svg>
);

export const IconIssue = (props: IconProps) => (
  <svg {...base(props)}>
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="2.2" />
  </svg>
);

export const IconCode = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="m9 8-4.5 4.5L9 17M15 8l4.5 4.5L15 17" />
  </svg>
);

export const IconCheck = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="m5 12.8 4.2 4.2L19 7.4" />
  </svg>
);

export const IconSearch = (props: IconProps) => (
  <svg {...base(props)}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m16 16 4 4" />
  </svg>
);

export const IconFilter = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M4 6h16M7 12h10M10 18h4" />
  </svg>
);

export const IconX = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
);

export const IconPlus = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const IconTrash = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M4 7h16M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7" />
    <path d="M6 7l1 12.5A1.5 1.5 0 0 0 8.5 21h7a1.5 1.5 0 0 0 1.5-1.5L18 7" />
    <path d="M10 11v6M14 11v6" />
  </svg>
);

export const IconArchive = (props: IconProps) => (
  <svg {...base(props)}>
    <rect x="3" y="4" width="18" height="4" rx="1.5" />
    <path d="M5 8v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8M10 12h4" />
  </svg>
);

export const IconUnlink = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M9 15l-1.2 1.2a3.5 3.5 0 0 1-5-5L5 9" />
    <path d="M15 9l1.2-1.2a3.5 3.5 0 0 1 5 5L19 15" />
    <path d="M4 4l16 16" />
  </svg>
);

export const IconLink = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M9.5 14.5 14.5 9.5" />
    <path d="M11 6.5 12.5 5a3.5 3.5 0 0 1 5 5L16 11.5" />
    <path d="M13 17.5 11.5 19a3.5 3.5 0 0 1-5-5L8 12.5" />
  </svg>
);

export const IconKey = (props: IconProps) => (
  <svg {...base(props)}>
    <circle cx="8" cy="8" r="4" />
    <path d="M11 11l8 8M16 16l2-2M18.5 18.5 21 16" />
  </svg>
);

export const IconShield = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M12 3.5 19 6v5.5c0 4-2.9 7.3-7 8.5-4.1-1.2-7-4.5-7-8.5V6z" />
    <path d="m9.2 12 2 2 3.6-3.8" />
  </svg>
);

export const IconChevronRight = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="m9.5 6 6 6-6 6" />
  </svg>
);

export const IconUserPlus = (props: IconProps) => (
  <svg {...base(props)}>
    <circle cx="9.5" cy="8" r="3.4" />
    <path d="M3.5 20a6 6 0 0 1 11.4-2.6" />
    <path d="M18 13v6M15 16h6" />
  </svg>
);

export const IconInfo = (props: IconProps) => (
  <svg {...base(props)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5M12 7.6h.01" />
  </svg>
);

export const IconArrowLeft = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M19 12H5M11 6l-6 6 6 6" />
  </svg>
);
