/**
 * Monochrome line icons — a single geometric set, no emoji anywhere in the UI.
 * Every glyph is drawn on a 24-unit grid with a 1.6 stroke so they sit together.
 */
const PATHS = {
  cake: (
    <>
      <path d="M4 20h16" />
      <path d="M4 20v-5.5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2V20" />
      <path d="M4 16.5c1.6 0 1.6 1.3 3.2 1.3S8.8 16.5 10.4 16.5s1.6 1.3 3.2 1.3 1.6-1.3 3.2-1.3 1.6 1.3 3.2 1.3" />
      <path d="M12 12.5V9" />
      <path d="M12 6.2c0-1 1.2-1.8 0-3.2-1.2 1.4 0 2.2 0 3.2Z" />
    </>
  ),
  bell: (
    <>
      <path d="M18 8.8a6 6 0 1 0-12 0c0 5-2 6.2-2 6.2h16s-2-1.2-2-6.2Z" />
      <path d="M13.7 19a2 2 0 0 1-3.4 0" />
    </>
  ),
  bellOff: (
    <>
      <path d="M9.4 4.2A6 6 0 0 1 18 8.8c0 1.9.3 3.3.7 4.3" />
      <path d="M16.5 15H4s2-1.2 2-6.2a6 6 0 0 1 .8-3" />
      <path d="M13.7 19a2 2 0 0 1-3.4 0" />
      <path d="m3 3 18 18" />
    </>
  ),
  plus: (
    <>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </>
  ),
  upload: (
    <>
      <path d="M21 15v3.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5V15" />
      <path d="m7.5 8.5 4.5-4.5 4.5 4.5" />
      <path d="M12 4v11.5" />
    </>
  ),
  pencil: (
    <>
      <path d="M16.5 3.9a2 2 0 0 1 2.8 2.8L7.8 18.2 4 20l1.8-3.8Z" />
      <path d="m14.8 5.6 3.6 3.6" />
    </>
  ),
  trash: (
    <>
      <path d="M4 6.5h16" />
      <path d="M9.5 6.5V4.8A1.3 1.3 0 0 1 10.8 3.5h2.4a1.3 1.3 0 0 1 1.3 1.3v1.7" />
      <path d="M6.5 6.5 7.4 19a1.5 1.5 0 0 0 1.5 1.4h6.2a1.5 1.5 0 0 0 1.5-1.4l.9-12.5" />
      <path d="M10.5 10.5v6M13.5 10.5v6" />
    </>
  ),
  check: <path d="m4.5 12.5 5 5 10-11" />,
  close: (
    <>
      <path d="m5 5 14 14" />
      <path d="m19 5-14 14" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4.5 4.5" />
    </>
  ),
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
      <path d="M3.5 10h17" />
      <path d="M8 3v4M16 3v4" />
    </>
  ),
  device: (
    <>
      <rect x="7" y="2.5" width="10" height="19" rx="2.5" />
      <path d="M11 18.5h2" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5.5" />
      <path d="M12 7.8h.01" />
    </>
  ),
  alert: (
    <>
      <path d="M12 3.8 21 19.5H3Z" />
      <path d="M12 9.8v4.2" />
      <path d="M12 17h.01" />
    </>
  ),
};

export function Icon({ name, className = "size-5", ...rest }) {
  const path = PATHS[name];
  if (!path) return null;
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {path}
    </svg>
  );
}
