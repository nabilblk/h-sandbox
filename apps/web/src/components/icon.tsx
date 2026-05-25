import type React from "react";

export const Icon = ({ name, size = 14, style }: { name: string; size?: number; style?: React.CSSProperties }) => {
  const common = { width: size, height: size, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round", style } as const;
  const paths: Record<string, React.ReactNode> = {
    box: <><path d="M2.5 4.5 8 1.5l5.5 3v7L8 14.5l-5.5-3v-7Z" /><path d="M2.5 4.5 8 7.5l5.5-3" /><path d="M8 7.5v7" /></>,
    plus: <><path d="M8 3v10M3 8h10" /></>,
    search: <><circle cx="7" cy="7" r="4" /><path d="m10 10 3 3" /></>,
    chevron: <><path d="m6 4 4 4-4 4" /></>,
    chevDown: <><path d="m4 6 4 4 4-4" /></>,
    arrowR: <><path d="M3 8h10M9 4l4 4-4 4" /></>,
    terminal: <><rect x="1.5" y="2.5" width="13" height="11" rx="1" /><path d="m4 6 2 2-2 2M8 10h4" /></>,
    file: <><path d="M4 1.5h5L13 5v9.5H4z" /><path d="M9 1.5V5h4" /></>,
    folder: <><path d="M1.5 4a1 1 0 0 1 1-1H6l1.5 1.5h6a1 1 0 0 1 1 1V12a1 1 0 0 1-1 1H2.5a1 1 0 0 1-1-1V4Z" /></>,
    logs: <><path d="M2.5 3h11M2.5 6h11M2.5 9h7M2.5 12h11" /></>,
    chart: <><path d="M2 13h12M4 11V7M7 11V4M10 11V8M13 11V5" /></>,
    bell: <><path d="M4 11V7a4 4 0 0 1 8 0v4l1 1.5H3L4 11Z" /><path d="M6.5 13.5a1.5 1.5 0 0 0 3 0" /></>,
    key: <><circle cx="5" cy="11" r="2.5" /><path d="m7 9 5-5M11 5l1.5 1.5M9.5 6.5 11 8" /></>,
    book: <><path d="M2.5 2.5h4a2 2 0 0 1 2 2v9a1.5 1.5 0 0 0-1.5-1.5H2.5v-9.5Z" /><path d="M13.5 2.5h-4a2 2 0 0 0-2 2v9a1.5 1.5 0 0 1 1.5-1.5h4.5v-9.5Z" /></>,
    settings: <><circle cx="8" cy="8" r="2" /><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.5 1.5M11.5 11.5 13 13M3 13l1.5-1.5M11.5 4.5 13 3" /></>,
    user: <><circle cx="8" cy="6" r="2.5" /><path d="M3 13.5c.5-2 2.5-3.5 5-3.5s4.5 1.5 5 3.5" /></>,
    copy: <><rect x="5" y="5" width="9" height="9" rx="1" /><path d="M11 5V3a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h2" /></>,
    check: <><path d="m3 8 3.5 3.5L13 5" /></>,
    x: <><path d="m4 4 8 8M12 4l-8 8" /></>,
    refresh: <><path d="M13.5 8a5.5 5.5 0 0 1-9.4 3.9M2.5 8a5.5 5.5 0 0 1 9.4-3.9" /><path d="M13.5 2.5v3h-3M2.5 13.5v-3h3" /></>,
    py: <><path d="M3 8h7a2 2 0 0 0 2-2V3.5a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2V8Z" /><path d="M13 8H6a2 2 0 0 0-2 2v2.5a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2V8Z" /></>,
    node: <><path d="M8 1.5 2.5 4.5v7L8 14.5l5.5-3v-7L8 1.5Z" /></>,
    lock: <><rect x="3" y="7" width="10" height="7" rx="1" /><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" /></>,
    bolt: <><path d="M9 1.5 3 9h4l-1 5.5L13 7H9l1-5.5h-1Z" /></>,
    globe: <><circle cx="8" cy="8" r="6.5" /><path d="M1.5 8h13M8 1.5c2 2 2 11 0 13M8 1.5c-2 2-2 11 0 13" /></>,
    stop: <><rect x="3.5" y="3.5" width="9" height="9" rx="1" /></>,
    play: <><path d="M4 3v10l9-5-9-5Z" /></>
  };
  return <svg {...common}>{paths[name] ?? <circle cx="8" cy="8" r="1.5" fill="currentColor" />}</svg>;
};
