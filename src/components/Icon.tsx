import type { SVGProps } from "react";

export type IconName =
  | "book"
  | "workbook"
  | "list"
  | "grammar"
  | "headphones"
  | "volume"
  | "star"
  | "search"
  | "chevron"
  | "play"
  | "pause"
  | "previous"
  | "next"
  | "shuffle"
  | "eye"
  | "eyeOff"
  | "check"
  | "close"
  | "menu"
  | "sparkle"
  | "expand"
  | "note"
  | "sortTime"
  | "sortCategory"
  | "sortAlpha"
  | "viewList"
  | "viewCards"
  | "hideEnglish"
  | "hideDutch"
  | "starOnly"
  | "underlineU"
  | "triangleRight"
  | "triangleDown"
  | "sequential"
  | "logout"
  | "trash"
  | "brain"
  | "send"
  | "copy";

export function Icon({
  name,
  size = 18,
  ...props
}: { name: IconName; size?: number } & Omit<SVGProps<SVGSVGElement>, "name">) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    ...props,
  };

  switch (name) {
    case "book":
      return (
        <svg {...common}>
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" />
        </svg>
      );
    case "workbook":
      return (
        <svg {...common}>
          <rect x="4" y="3" width="16" height="18" rx="2" />
          <path d="M8 7h8M8 11h8M8 15h5" />
        </svg>
      );
    case "list":
      return (
        <svg {...common}>
          <path d="M8 6h12M8 12h12M8 18h12" />
          <path d="M3 6h.01M3 12h.01M3 18h.01" />
        </svg>
      );
    case "grammar":
      return (
        <svg {...common}>
          <path d="M4 19V5a2 2 0 0 1 2-2h12v18H6a2 2 0 0 1-2-2Z" />
          <path d="m8 15 2-6 2 6M8.7 13h2.6M15 9v6" />
        </svg>
      );
    case "headphones":
      return (
        <svg {...common}>
          <path d="M4 14v-2a8 8 0 0 1 16 0v2" />
          <path d="M4 14h2a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-5ZM20 14h-2a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1v-5Z" />
        </svg>
      );
    case "volume":
      return (
        <svg {...common}>
          <path d="M11 5 6 9H3v6h3l5 4V5Z" />
          <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" />
        </svg>
      );
    case "star":
      return (
        <svg {...common}>
          <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-2.9-5.6 2.9 1.1-6.2L3 9.6l6.2-.9L12 3Z" />
        </svg>
      );
    case "search":
      return (
        <svg {...common}>
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-4-4" />
        </svg>
      );
    case "chevron":
      return (
        <svg {...common}>
          <path d="m9 6 6 6-6 6" />
        </svg>
      );
    case "play":
      return (
        <svg {...common} fill="currentColor" stroke="none">
          <path d="M8 5.5v13l11-6.5-11-6.5Z" />
        </svg>
      );
    case "pause":
      return (
        <svg {...common} fill="currentColor" stroke="none">
          <path d="M7 5h3v14H7zM14 5h3v14h-3z" />
        </svg>
      );
    case "previous":
      return (
        <svg {...common}>
          <path d="M15 6 9 12l6 6M6 6v12" />
        </svg>
      );
    case "next":
      return (
        <svg {...common}>
          <path d="m9 6 6 6-6 6M18 6v12" />
        </svg>
      );
    case "shuffle":
      return (
        <svg {...common}>
          <path d="M3 7h3c4 0 5 10 9 10h5" />
          <path d="m17 14 3 3-3 3M3 17h3c1.5 0 2.6-1.3 3.6-3M14 7h6M17 4l3 3-3 3" />
        </svg>
      );
    case "eye":
      return (
        <svg {...common}>
          <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" />
          <circle cx="12" cy="12" r="2.5" />
        </svg>
      );
    case "eyeOff":
      return (
        <svg {...common}>
          <path d="m3 3 18 18" />
          <path d="M10.6 6.2A10.8 10.8 0 0 1 12 6c6.5 0 10 6 10 6a17 17 0 0 1-3 3.7M6.5 7.6C4 9.2 2 12 2 12s3.5 6 10 6c1.4 0 2.7-.3 3.9-.8" />
          <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
        </svg>
      );
    case "check":
      return (
        <svg {...common}>
          <path d="m5 12 4.5 4.5L19 7" />
        </svg>
      );
    case "close":
      return (
        <svg {...common}>
          <path d="M6 6l12 12M18 6 6 18" />
        </svg>
      );
    case "menu":
      return (
        <svg {...common}>
          <path d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      );
    case "sparkle":
      return (
        <svg {...common}>
          <path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z" />
          <path d="m19 16 .9 2.1L22 19l-2.1.9L19 22l-.9-2.1L16 19l2.1-.9L19 16Z" />
        </svg>
      );
    case "expand":
      return (
        <svg {...common}>
          <path d="M9 3H3v6M15 3h6v6M21 15v6h-6M3 15v6h6" />
          <path d="M3 3l6 6M21 3l-6 6M3 21l6-6M21 21l-6-6" />
        </svg>
      );
    case "note":
      return (
        <svg {...common}>
          <path d="m4 20 4.5-1 10-10-3.5-3.5-10 10L4 20Z" />
          <path d="m13.5 7.5 3.5 3.5" />
        </svg>
      );
    case "underlineU":
      return (
        <svg {...common}>
          <path d="M7 4v7a5 5 0 0 0 10 0V4" />
          <path d="M5 20h14" />
        </svg>
      );
    case "triangleRight":
      return (
        <svg {...common} fill="currentColor" stroke="none">
          <path d="M8 5v14l11-7L8 5Z" />
        </svg>
      );
    case "triangleDown":
      return (
        <svg {...common} fill="currentColor" stroke="none">
          <path d="M5 8h14l-7 11L5 8Z" />
        </svg>
      );
    case "sequential":
      return (
        <svg {...common}>
          <path d="M4 6h4M4 12h7M4 18h10" />
          <path d="m16 9 4 3-4 3" />
        </svg>
      );
    case "sortTime":
      return (
        <svg {...common}>
          <path d="M4 6h11M4 12h8M4 18h5" />
          <path d="M17 14v6m0 0-2.5-2.5M17 20l2.5-2.5" />
        </svg>
      );
    case "sortCategory":
      return (
        <svg {...common}>
          <rect x="3" y="4" width="7" height="6" rx="1" />
          <rect x="14" y="4" width="7" height="6" rx="1" />
          <rect x="3" y="14" width="7" height="6" rx="1" />
          <rect x="14" y="14" width="7" height="6" rx="1" />
        </svg>
      );
    case "sortAlpha":
      return (
        <svg {...common}>
          <path d="M4 18 8 6l4 12M5.6 14h4.8" />
          <path d="M16 8h5M16 13h5M16 18h3" />
        </svg>
      );
    case "viewList":
      return (
        <svg {...common}>
          <path d="M9 6h11M9 12h11M9 18h11" />
          <circle cx="4.5" cy="6" r="1" fill="currentColor" stroke="none" />
          <circle cx="4.5" cy="12" r="1" fill="currentColor" stroke="none" />
          <circle cx="4.5" cy="18" r="1" fill="currentColor" stroke="none" />
        </svg>
      );
    case "viewCards":
      return (
        <svg {...common}>
          <rect x="3" y="6" width="13" height="12" rx="2" />
          <path d="M8 4h11a2 2 0 0 1 2 2v11" />
        </svg>
      );
    case "hideEnglish":
      return (
        <svg {...common}>
          <path d="M4 6h9M4 12h6M4 18h9" />
          <path d="m16 15 4 4M20 15l-4 4" />
        </svg>
      );
    case "hideDutch":
      return (
        <svg {...common}>
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="M3 10h18M3 14h18" />
          <path d="m16 15 4 4M20 15l-4 4" />
        </svg>
      );
    case "starOnly":
      return (
        <svg {...common}>
          <path d="M7 4h10v16l-5-3.5L7 20V4Z" />
        </svg>
      );
    case "logout":
      return (
        <svg {...common}>
          <path d="M10 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h5" />
          <path d="M14 8l4 4-4 4M18 12H9" />
        </svg>
      );
    case "trash":
      return (
        <svg {...common}>
          <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
          <path d="M10 11v6M14 11v6" />
        </svg>
      );
    case "brain":
      return (
        <svg {...common}>
          <path d="M9 5a3 3 0 0 0-3 3 3 3 0 0 0-1 5.8V16a3 3 0 0 0 3 3h1V5H9Z" />
          <path d="M15 5a3 3 0 0 1 3 3 3 3 0 0 1 1 5.8V16a3 3 0 0 1-3 3h-1V5h1Z" />
          <path d="M12 5v14" />
        </svg>
      );
    case "send":
      return (
        <svg {...common}>
          <path d="M22 2 11 13" />
          <path d="M22 2 15 22l-4-9-9-4 20-7Z" />
        </svg>
      );
    case "copy":
      return (
        <svg {...common}>
          <rect x="8" y="8" width="12" height="12" rx="2" />
          <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
        </svg>
      );
  }
}
