import type { ReactNode } from "react";

export type IconName =
  | "dashboard"
  | "map"
  | "bag"
  | "sword"
  | "shield"
  | "helmet"
  | "skull"
  | "book"
  | "trophy"
  | "leaf"
  | "list"
  | "search"
  | "settings"
  | "chevronRight"
  | "chevronDown"
  | "chevronLeft"
  | "check"
  | "x"
  | "menu"
  | "spark"
  | "moon"
  | "filter"
  | "external"
  | "alert"
  | "target"
  | "scroll"
  | "flask"
  | "users"
  | "layers"
  | "clock"
  | "arrowRight"
  | "arrowLeft"
  | "command"
  | "eye"
  | "lock"
  | "refresh"
  | "plus"
  | "minus"
  | "download"
  | "upload"
  | "shieldOff"
  | "flame"
  | "talisman";

const PATHS: Record<IconName, ReactNode> = {
  dashboard: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1.4" />
      <rect x="14" y="3" width="7" height="7" rx="1.4" />
      <rect x="3" y="14" width="7" height="7" rx="1.4" />
      <rect x="14" y="14" width="7" height="7" rx="1.4" />
    </>
  ),
  map: (
    <>
      <path d="m9 18-6 3V6l6-3 6 3 6-3v15l-6 3-6-3Z" />
      <path d="M9 3v15M15 6v15" />
    </>
  ),
  bag: (
    <>
      <path d="M5 8h14l-1 12H6L5 8Z" />
      <path d="M9 8V6a3 3 0 0 1 6 0v2" />
    </>
  ),
  sword: (
    <>
      <path d="M14.5 4.5 19 3l-1.5 4.5L9 16" />
      <path d="m8 15 3 3" />
      <path d="m5 16 3 3" />
      <path d="m3 21 2.5-2.5" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3 5 6v6c0 4.2 2.9 7.5 7 9 4.1-1.5 7-4.8 7-9V6l-7-3Z" />
      <path d="M12 7v10" />
    </>
  ),
  helmet: (
    <>
      <path d="M5 14a7 7 0 0 1 14 0v5H5v-5Z" />
      <path d="M5 14h14M9 19v-5M15 19v-5" />
    </>
  ),
  skull: (
    <>
      <path d="M12 3a8 8 0 0 0-8 8c0 3 1.6 5.3 4 6.5V21h8v-3.5c2.4-1.2 4-3.5 4-6.5a8 8 0 0 0-8-8Z" />
      <circle cx="9" cy="11" r="1.3" />
      <circle cx="15" cy="11" r="1.3" />
      <path d="M10 17v4M14 17v4" />
    </>
  ),
  book: (
    <>
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H11v18H6.5A2.5 2.5 0 0 1 4 18.5v-13Z" />
      <path d="M20 5.5A2.5 2.5 0 0 0 17.5 3H13v18h4.5a2.5 2.5 0 0 0 2.5-2.5v-13Z" />
    </>
  ),
  trophy: (
    <>
      <path d="M8 4h8v5a4 4 0 0 1-8 0V4Z" />
      <path d="M8 6H5v1a3 3 0 0 0 3 3M16 6h3v1a3 3 0 0 1-3 3" />
      <path d="M12 13v4M9 21h6M10 17h4" />
    </>
  ),
  leaf: (
    <>
      <path d="M20 4c-8 0-14 4-14 10a6 6 0 0 0 6 6c6 0 8-8 8-16Z" />
      <path d="M4 21c2-6 6-9 11-11" />
    </>
  ),
  list: (
    <>
      <path d="M9 6h11M9 12h11M9 18h11" />
      <circle cx="4.5" cy="6" r="1" />
      <circle cx="4.5" cy="12" r="1" />
      <circle cx="4.5" cy="18" r="1" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.4-2.3 1a7 7 0 0 0-1.7-1L14.6 3h-4L10 6a7 7 0 0 0-1.7 1L6 6 4 9.5 6.1 11a7 7 0 0 0 0 2L4 14.5 6 18l2.3-1a7 7 0 0 0 1.7 1l.4 3h4l.4-3a7 7 0 0 0 1.7-1l2.3 1 2-3.5-2.1-1.5c.1-.3.1-.7.1-1Z" />
    </>
  ),
  chevronRight: <path d="m9 5 7 7-7 7" />,
  chevronDown: <path d="m5 9 7 7 7-7" />,
  chevronLeft: <path d="m15 5-7 7 7 7" />,
  check: <path d="m4 12 5 5L20 6" />,
  x: <path d="M6 6l12 12M18 6 6 18" />,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  spark: (
    <>
      <path d="M12 2c.6 4 2 6.4 6 7-4 .6-5.4 3-6 7-.6-4-2-6.4-6-7 4-.6 5.4-3 6-7Z" />
      <path d="M19 15c.3 1.8.9 2.7 2.5 3-1.6.3-2.2 1.2-2.5 3-.3-1.8-.9-2.7-2.5-3 1.6-.3 2.2-1.2 2.5-3Z" />
    </>
  ),
  moon: <path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5Z" />,
  filter: <path d="M3 5h18l-7 8v6l-4 2v-8L3 5Z" />,
  external: (
    <>
      <path d="M14 4h6v6M20 4l-9 9" />
      <path d="M19 14v5H5V5h5" />
    </>
  ),
  alert: (
    <>
      <path d="M12 3 2.5 20h19L12 3Z" />
      <path d="M12 9v5M12 17.2v.2" />
    </>
  ),
  target: (
    <>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
    </>
  ),
  scroll: (
    <>
      <path d="M6 4h12v15a2 2 0 0 0 2 2H7a3 3 0 0 1-3-3V7" />
      <path d="M4 7h2M9 8h6M9 12h6M9 16h4" />
    </>
  ),
  flask: (
    <>
      <path d="M9 3h6M10 3v5l-5 9a2 2 0 0 0 1.8 3h10.4A2 2 0 0 0 19 17l-5-9V3" />
      <path d="M7 14h10" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20a6 6 0 0 1 12 0" />
      <circle cx="17" cy="9" r="2.4" />
      <path d="M15.5 15.5A5 5 0 0 1 21 20" />
    </>
  ),
  layers: (
    <>
      <path d="m12 3 9 5-9 5-9-5 9-5Z" />
      <path d="m3 13 9 5 9-5M3 17l9 5 9-5" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  arrowRight: <path d="M4 12h16M14 6l6 6-6 6" />,
  arrowLeft: <path d="M20 12H4M10 6l-6 6 6 6" />,
  command: <path d="M9 6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6Z" />,
  eye: (
    <>
      <path d="M2 12s4-6 10-6 10 6 10 6-4 6-10 6S2 12 2 12Z" />
      <circle cx="12" cy="12" r="2.5" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="10" width="14" height="10" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </>
  ),
  refresh: (
    <>
      <path d="M20 7v5h-5M4 17v-5h5" />
      <path d="M6.1 9a7 7 0 0 1 11.5-2L20 12M4 12l2.4 5a7 7 0 0 0 11.5-2" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  download: (
    <>
      <path d="M12 3v12M7 10l5 5 5-5" />
      <path d="M4 20h16" />
    </>
  ),
  upload: (
    <>
      <path d="M12 16V4M7 9l5-5 5 5" />
      <path d="M4 20h16" />
    </>
  ),
  shieldOff: (
    <>
      <path d="M5 6v6c0 4.2 2.9 7.5 7 9 1.3-.5 2.5-1.2 3.5-2.2M19 12V6l-7-3-2.2 1" />
      <path d="M3 3l18 18" />
    </>
  ),
  flame: (
    <>
      <path d="M12 22c4 0 7-2.7 7-6.5 0-3-2-5.2-4-7.5-1.2-1.4-2.2-2.7-2.5-5-2.2 2-5 5.7-5 9.5 0 1.2.4 2.3 1.2 3.2C7.8 14.4 7 13 7 11.2 5.7 12.7 5 14.4 5 16c0 3.4 3 6 7 6Z" />
    </>
  ),
  talisman: (
    <>
      <path d="M12 3 8 7l4 3 4-3-4-4Z" />
      <path d="M8 7 5 10l7 11 7-11-3-3" />
      <path d="M12 10v8" />
    </>
  ),
};

interface IconProps {
  name: IconName;
  size?: number;
  strokeWidth?: number;
  className?: string;
}

export function Icon({ name, size = 18, strokeWidth = 1.7, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  );
}
