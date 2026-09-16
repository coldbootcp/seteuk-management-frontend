/**
 * 화면 아이콘.
 *
 * 예전에는 이모지(🚪 🔍 ⚙️ …)를 아이콘 자리에 넣었다. 이모지는 기기마다 그림과 색이
 * 달라 같은 화면이 사람마다 다르게 보이고, 글자라서 굵기·크기도 나머지 아이콘과 맞지
 * 않는다. 아이콘은 전부 여기서 같은 규격으로 그린다 — 24 좌표계, 선 굵기 2, 둥근 끝,
 * 채움 없음, 색은 `currentColor`로 부모 글자색을 따른다.
 *
 * 쓰는 법: `<Icon name="search" />`. 기본 크기는 16px이고 `size`로 키운다. 아이콘은
 * 언제나 장식으로 취급하므로(`aria-hidden`) 옆에 뜻을 말하는 글자나 `aria-label`이
 * 있어야 한다.
 */

const PATHS = {
  alert: (
    <>
      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </>
  ),
  bot: (
    <>
      <rect x="4" y="8" width="16" height="12" rx="2" />
      <path d="M12 8V5" />
      <circle cx="12" cy="3.5" r="1.5" />
      <line x1="9" y1="13" x2="9" y2="14" />
      <line x1="15" y1="13" x2="15" y2="14" />
      <path d="M2 13v3" />
      <path d="M22 13v3" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </>
  ),
  chart: (
    <>
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </>
  ),
  check: <polyline points="20 6 9 17 4 12" />,
  "check-circle": (
    <>
      <path d="M21.5 11.1V12a9.5 9.5 0 1 1-5.6-8.7" />
      <polyline points="21.5 4.5 12 14 9 11" />
    </>
  ),
  cloud: (
    <>
      <path d="M17.5 19a4.5 4.5 0 0 0 .5-8.97A6 6 0 0 0 6.2 11.2 3.5 3.5 0 0 0 7 19h10.5z" />
      <polyline points="9.5 14.5 12 12 14.5 14.5" />
      <line x1="12" y1="12" x2="12" y2="18" />
    </>
  ),
  compass: (
    <>
      <circle cx="12" cy="12" r="9" />
      <polygon points="16.2 7.8 14.1 14.1 7.8 16.2 9.9 9.9" />
    </>
  ),
  file: (
    <>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </>
  ),
  graduation: (
    <>
      <path d="M21.5 8.5 12 4 2.5 8.5 12 13z" />
      <path d="M6 10.8V16c0 1.7 2.7 3 6 3s6-1.3 6-3v-5.2" />
      <line x1="21.5" y1="8.5" x2="21.5" y2="14" />
    </>
  ),
  lightbulb: (
    <>
      <path d="M9 17.5a5.5 5.5 0 0 1-2-4.2 5 5 0 1 1 10 0 5.5 5.5 0 0 1-2 4.2V19a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1z" />
      <line x1="10" y1="22.5" x2="14" y2="22.5" />
    </>
  ),
  lock: (
    <>
      <rect x="4" y="10" width="16" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </>
  ),
  logout: (
    <>
      <path d="M14 20H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h8" />
      <polyline points="17 16 21 12 17 8" />
      <line x1="21" y1="12" x2="10" y2="12" />
    </>
  ),
  mail: (
    <>
      <rect x="2.5" y="5" width="19" height="14" rx="2" />
      <polyline points="3 7 12 13.5 21 7" />
    </>
  ),
  map: (
    <>
      <polygon points="2.5 6.5 9 4 15 7 21.5 4.5 21.5 17.5 15 20 9 17 2.5 19.5" />
      <line x1="9" y1="4" x2="9" y2="17" />
      <line x1="15" y1="7" x2="15" y2="20" />
    </>
  ),
  "map-pin": (
    <>
      <path d="M19 10.5c0 5-7 11-7 11s-7-6-7-11a7 7 0 1 1 14 0z" />
      <circle cx="12" cy="10.5" r="2.5" />
    </>
  ),
  message: <path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8z" />,
  microscope: (
    <>
      <path d="M10 5h3v7h-3z" />
      <path d="M11.5 12a5.5 5.5 0 0 1 3.4 9.8" />
      <line x1="8.5" y1="5" x2="14.5" y2="5" />
      <line x1="4" y1="21.5" x2="20" y2="21.5" />
      <path d="M6 21.5a6 6 0 0 1 5.5-8.4" />
    </>
  ),
  pen: (
    <>
      <path d="M15.5 4.5 19.5 8.5" />
      <path d="M17 3a2.1 2.1 0 0 1 3 3L7.5 18.5 3 20l1.5-4.5z" />
    </>
  ),
  refresh: (
    <>
      <polyline points="20.5 4 20.5 9.5 15 9.5" />
      <polyline points="3.5 20 3.5 14.5 9 14.5" />
      <path d="M5.6 9.5a7 7 0 0 1 11.5-2.6l3.4 3.1" />
      <path d="M18.4 14.5a7 7 0 0 1-11.5 2.6L3.5 14" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 14.5a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2v.2a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0-1.2-2.9h-.2a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3h.1a1.7 1.7 0 0 0 1-1.5v-.2a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9v.1a1.7 1.7 0 0 0 1.5 1h.2a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </>
  ),
  sparkles: (
    <>
      <path d="M9.5 3.5 11 8l4.5 1.5L11 11l-1.5 4.5L8 11l-4.5-1.5L8 8z" />
      <path d="M17.5 13.5 18.4 16l2.6.9-2.6.9-.9 2.6-.9-2.6-2.6-.9 2.6-.9z" />
    </>
  ),
  sprout: (
    <>
      <path d="M12 21v-8" />
      <path d="M12 13C12 9.7 9.3 7 6 7H4v1.5A5.5 5.5 0 0 0 9.5 14H12z" />
      <path d="M12 13.5c0-3 2.5-5.5 5.5-5.5H20V9a5 5 0 0 1-5 5h-3z" />
    </>
  ),
  target: (
    <>
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
    </>
  ),
  timer: (
    <>
      <circle cx="12" cy="13" r="8" />
      <polyline points="12 9 12 13 14.5 14.5" />
      <line x1="9" y1="2.5" x2="15" y2="2.5" />
    </>
  ),
  "trending-up": (
    <>
      <polyline points="3 17 9.5 10.5 13.5 14.5 21 7" />
      <polyline points="15.5 7 21 7 21 12.5" />
    </>
  ),
  upload: (
    <>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7.5 8.5 12 4 16.5 8.5" />
      <line x1="12" y1="4" x2="12" y2="15.5" />
    </>
  ),
  user: (
    <>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </>
  ),
  utensils: (
    <>
      <path d="M6 2.5v7a2.5 2.5 0 0 0 5 0v-7" />
      <line x1="8.5" y1="9.5" x2="8.5" y2="21.5" />
      <path d="M17.5 2.5c-1.7 1.3-2.5 3.2-2.5 5.5 0 1.7.8 2.8 2.5 3.3v10.2" />
    </>
  ),
  zap: <polygon points="13 2 4 14 11 14 10 22 19 10 12.5 10" />,
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({
  className,
  name,
  size = 16,
  strokeWidth = 2,
}: {
  className?: string;
  name: IconName;
  /** px. 16이 기본이고, 큰 안내 화면에서만 키운다. */
  size?: number;
  strokeWidth?: number;
}) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      height={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={strokeWidth}
      viewBox="0 0 24 24"
      width={size}
    >
      {PATHS[name]}
    </svg>
  );
}
