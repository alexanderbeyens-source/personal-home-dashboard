export type IconName =
  | "sun"
  | "cloud"
  | "calendar"
  | "news"
  | "ball"
  | "chart"
  | "home"
  | "grid"
  | "arrow"
  | "clock"
  | "wind"
  | "drop"
  | "refresh"
  | "trophy"
  | "rain"
  | "snow"
  | "fog"
  | "storm"
  | "moon"
  | "partly"
  | "trend"
  | "check"
  | "heart"
  | "flame"
  | "car";

const paths: Record<IconName, React.ReactNode> = {
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42" />
    </>
  ),
  cloud: <path d="M20 16.2a4.8 4.8 0 0 0-3.9-7.5 6 6 0 0 0-11.6 1.9A4.5 4.5 0 0 0 5 19.5h11.5a3.5 3.5 0 0 0 3.5-3.3Z" />,
  calendar: <path d="M8 2v4m8-4v4M3.5 9h17M5 4.5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-12a2 2 0 0 1 2-2Z" />,
  news: <path d="M4 5.5h13a2 2 0 0 1 2 2V20H5a2 2 0 0 1-2-2V6.5a1 1 0 0 1 1-1Zm4 4h7m-7 4h7m-7 4h4" />,
  ball: <><circle cx="12" cy="12" r="9" /><path d="m8.5 4 3.5 3 3.5-3M3.5 9l4.3 1.5L9 15l-3.5 3M20.5 9l-4.3 1.5L15 15l3.5 3M9 15h6" /></>,
  chart: <path d="M4 19V5m0 14h16M8 15l3-4 3 2 5-7" />,
  heart: <path d="M12 20s-7.5-4.6-9.2-9.4C1.6 7.2 3.8 4 7.2 4c2 0 3.5 1.1 4.8 2.8C13.3 5.1 14.8 4 16.8 4c3.4 0 5.6 3.2 4.4 6.6C19.5 15.4 12 20 12 20Z" />,
  flame: <path d="M12 21c-3.9 0-7-2.8-7-6.6 0-2.9 1.8-5 3.4-6.9.3 1.6 1.2 2.8 2.4 3.4C10.6 7.5 12 4.6 14.5 3c-.3 2.6.9 4.4 2.3 6.1 1.3 1.6 2.2 3.2 2.2 5.3C19 18.2 15.9 21 12 21Z" />,
  car: <><path d="M5 16.5h14M3.5 16.5V12l2.2-5a2 2 0 0 1 1.8-1.2h9a2 2 0 0 1 1.8 1.2l2.2 5v4.5a1 1 0 0 1-1 1h-1.5a1 1 0 0 1-1-1V16h-10v.5a1 1 0 0 1-1 1H4.5a1 1 0 0 1-1-1ZM3.5 12h17" /><path d="M7.5 14h.01M16.5 14h.01" /></>,
  check: <path d="M5 4.5h14a1.5 1.5 0 0 1 1.5 1.5v12a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 18V6A1.5 1.5 0 0 1 5 4.5Zm3 7.5 3 3 5-6" />,
  home: <path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z" />,
  grid: <><rect x="3" y="3" width="8" height="8" rx="2" /><rect x="13" y="3" width="8" height="5" rx="2" /><rect x="13" y="10" width="8" height="11" rx="2" /><rect x="3" y="13" width="8" height="8" rx="2" /></>,
  arrow: <path d="M7 17 17 7M7 7h10v10" />,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  wind: <path d="M3 8h12a3 3 0 1 0-3-3M2 12h17a3 3 0 1 1-3 3M4 16h6a2 2 0 1 1-2 2" />,
  drop: <path d="M12 3s7 7.3 7 12a7 7 0 0 1-14 0c0-4.7 7-12 7-12Z" />,
  rain: <><path d="M19 13.5a4 4 0 0 0-3.3-6.3 5.5 5.5 0 0 0-10.6 1.6A3.8 3.8 0 0 0 5.5 16H17a3 3 0 0 0 2-2.5Z" /><path d="m8 19-1 2m5-2-1 2m5-2-1 2" /></>,
  snow: <><path d="M19 13.5a4 4 0 0 0-3.3-6.3 5.5 5.5 0 0 0-10.6 1.6A3.8 3.8 0 0 0 5.5 16H17a3 3 0 0 0 2-2.5Z" /><path d="M8 19.5h.01M12 20.5h.01M16 19.5h.01M10 22h.01M14 22h.01" /></>,
  fog: <path d="M4 9h16M3 13h18M5 17h14M8 5h8" />,
  storm: <><path d="M19 13.5a4 4 0 0 0-3.3-6.3 5.5 5.5 0 0 0-10.6 1.6A3.8 3.8 0 0 0 5.5 16H8" /><path d="m13 13-3 5h4l-2 4" /></>,
  moon: <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z" />,
  partly: <><path d="M8 3v1.5M3.5 8H2m3.2-3.8 1 1m6.3-1-1 1" /><path d="M5.5 10.3A3.5 3.5 0 0 1 11.7 7" /><path d="M20 17a3.5 3.5 0 0 0-2.8-5.4 4.8 4.8 0 0 0-9.2 1.4A3.3 3.3 0 0 0 8.5 20H17a3 3 0 0 0 3-3Z" /></>,
  trophy: <path d="M8 4h8v5a4 4 0 0 1-8 0V4Zm0 2H4.5a3 3 0 0 0 3.5 4M16 6h3.5a3 3 0 0 1-3.5 4M12 13v4m-4 3h8m-6-3h4" />,
  trend: <path d="m3 17 6-6 4 4 8-8m0 0h-5m5 0v5" />,
  refresh: <path d="M20 7v5h-5M4 17v-5h5m-4.2-2A7.5 7.5 0 0 1 18 7l2 5M4 12l2 5a7.5 7.5 0 0 0 13.2-3" />,
};

export function Icon({
  name,
  size = 18,
  className,
}: {
  name: IconName;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name]}
    </svg>
  );
}
