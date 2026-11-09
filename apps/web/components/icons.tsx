import type { SVGProps } from "react";

const base = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round", viewBox: "0 0 24 24", "aria-hidden": true } as const;
type P = SVGProps<SVGSVGElement>;

export const Icon = {
  overview: (p: P) => (<svg {...base} {...p}><path d="M3 12l9-8 9 8" /><path d="M5 10v10h14V10" /><path d="M10 20v-6h4v6" /></svg>),
  entries: (p: P) => (<svg {...base} {...p}><path d="M4 6h16M4 12h16M4 18h10" /></svg>),
  planning: (p: P) => (<svg {...base} {...p}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>),
  goals: (p: P) => (<svg {...base} {...p}><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="4" /><circle cx="12" cy="12" r="1" /></svg>),
  cards: (p: P) => (<svg {...base} {...p}><rect x="3" y="6" width="18" height="13" rx="2" /><path d="M3 10h18M7 15h3" /></svg>),
  income: (p: P) => (<svg {...base} {...p}><path d="M4 17l6-6 4 4 6-7" /><path d="M14 8h6v6" /></svg>),
  ai: (p: P) => (<svg {...base} {...p}><path d="M12 3l1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9z" /><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" /></svg>),
  reports: (p: P) => (<svg {...base} {...p}><path d="M6 3h9l5 5v13H6z" /><path d="M14 3v6h6M9 17v-3M12 17v-6M15 17v-4" /></svg>),
  people: (p: P) => (<svg {...base} {...p}><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5" /><path d="M16 4.5a3.5 3.5 0 010 7M18 14.6c1.8.8 3 2.6 3.5 5.4" /></svg>),
  billing: (p: P) => (<svg {...base} {...p}><path d="M12 3v18M17 7.5c-.8-1.5-2.6-2.5-5-2.5-2.8 0-4.5 1.4-4.5 3.3 0 4.6 10 2.4 10 7.2 0 2-1.9 3.5-5 3.5-2.5 0-4.4-1-5.2-2.8" /></svg>),
  settings: (p: P) => (<svg {...base} {...p}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z" /></svg>),
  admin: (p: P) => (<svg {...base} {...p}><path d="M12 3l8 3v6c0 4.5-3.4 8.2-8 9-4.6-.8-8-4.5-8-9V6z" /><path d="M9 12l2 2 4-4" /></svg>),
  plus: (p: P) => (<svg {...base} {...p}><path d="M12 5v14M5 12h14" /></svg>),
  eye: (p: P) => (<svg {...base} {...p}><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>),
  eyeOff: (p: P) => (<svg {...base} {...p}><path d="M3 3l18 18M10.6 5.1A10.8 10.8 0 0112 5c6.4 0 10 7 10 7a17.8 17.8 0 01-3.2 4.2M6.6 6.6C3.8 8.4 2 12 2 12s3.6 7 10 7c1.6 0 3-.4 4.3-1" /><path d="M9.9 9.9a3 3 0 004.2 4.2" /></svg>),
  menu: (p: P) => (<svg {...base} {...p}><path d="M4 7h16M4 12h16M4 17h16" /></svg>),
  close: (p: P) => (<svg {...base} {...p}><path d="M6 6l12 12M18 6L6 18" /></svg>),
  speaker: (p: P) => (<svg {...base} {...p}><path d="M11 5L6 9H3v6h3l5 4z" /><path d="M15.5 8.5a5 5 0 010 7M18.5 5.5a9 9 0 010 13" /></svg>),
  mic: (p: P) => (<svg {...base} {...p}><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0014 0M12 18v3" /></svg>),
  stop: (p: P) => (<svg {...base} {...p}><rect x="6" y="6" width="12" height="12" rx="2" /></svg>),
  search: (p: P) => (<svg {...base} {...p}><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>),
  check: (p: P) => (<svg {...base} {...p}><path d="M5 12l5 5 9-10" /></svg>),
  alert: (p: P) => (<svg {...base} {...p}><path d="M12 3l9.5 17h-19z" /><path d="M12 10v4M12 17.5v.5" /></svg>),
  info: (p: P) => (<svg {...base} {...p}><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 7.5v.5" /></svg>),
  logout: (p: P) => (<svg {...base} {...p}><path d="M15 4h4v16h-4M10 17l5-5-5-5M15 12H3" /></svg>),
  arrowUp: (p: P) => (<svg {...base} {...p}><path d="M12 19V5M6 11l6-6 6 6" /></svg>),
  arrowDown: (p: P) => (<svg {...base} {...p}><path d="M12 5v14M6 13l6 6 6-6" /></svg>),
};
