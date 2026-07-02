// Thin stroke icons (16px grid) that inherit currentColor + size from CSS.
// Kept minimal to match the Geist Mono / terminal aesthetic.
const P = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round' }

function Svg({ children }) {
  return (
    <svg className="ico" viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
      {children}
    </svg>
  )
}

export const Icon = {
  folder: () => (
    <Svg><path {...P} d="M2 4.4A1.4 1.4 0 0 1 3.4 3h2.7l1.4 1.5h5.1A1.4 1.4 0 0 1 14 5.9v5.7A1.4 1.4 0 0 1 12.6 13H3.4A1.4 1.4 0 0 1 2 11.6z" /></Svg>
  ),
  tokens: () => (
    <Svg>
      <ellipse {...P} cx="8" cy="4.4" rx="5" ry="2.1" />
      <path {...P} d="M3 4.4v3.6c0 1.16 2.24 2.1 5 2.1s5-.94 5-2.1V4.4" />
      <path {...P} d="M3 8v3.6c0 1.16 2.24 2.1 5 2.1s5-.94 5-2.1V8" />
    </Svg>
  ),
  timer: () => (
    <Svg>
      <circle {...P} cx="8" cy="9.3" r="4.4" />
      <path {...P} d="M8 9.3V6.6" />
      <path {...P} d="M6.6 2.4h2.8M8 2.4v1.6" />
    </Svg>
  ),
  history: () => (
    <Svg>
      <path {...P} d="M2.7 8a5.3 5.3 0 1 0 1.7-3.9" />
      <path {...P} d="M2.4 2.9v2.4h2.4" />
      <path {...P} d="M8 5.6v2.7l1.9 1.1" />
    </Svg>
  ),
  terminal: () => (
    <Svg>
      <path {...P} d="M3 4.2 6 7l-3 2.8" />
      <path {...P} d="M8 11h5" />
    </Svg>
  ),
  check: () => (
    <Svg><path {...P} d="M3 8.4 6.4 12 13 4.4" /></Svg>
  ),
  alert: () => (
    <Svg>
      <path {...P} d="M8 2.4 14.4 13.2H1.6z" />
      <path {...P} d="M8 6.6v3" />
      <circle cx="8" cy="11.4" r=".7" fill="currentColor" stroke="none" />
    </Svg>
  ),
  queue: () => (
    <Svg>
      <path {...P} d="M2 4.5h12M2 8h12M2 11.5h7" />
    </Svg>
  ),
  play: () => (
    <Svg><path {...P} d="M5 3.6 12 8l-7 4.4z" /></Svg>
  ),
  group: () => (
    <Svg>
      <rect {...P} x="2.5" y="2.5" width="11" height="4.2" rx="1" />
      <rect {...P} x="2.5" y="9.3" width="11" height="4.2" rx="1" />
    </Svg>
  ),
  grid: () => (
    <Svg>
      <rect {...P} x="2.5" y="2.5" width="4.4" height="4.4" rx="1" />
      <rect {...P} x="9.1" y="2.5" width="4.4" height="4.4" rx="1" />
      <rect {...P} x="2.5" y="9.1" width="4.4" height="4.4" rx="1" />
      <rect {...P} x="9.1" y="9.1" width="4.4" height="4.4" rx="1" />
    </Svg>
  ),
  bell: () => (
    <Svg>
      <path {...P} d="M4.8 6.6a3.2 3.2 0 0 1 6.4 0c0 3 1.3 3.9 1.7 4.6H3.1c.4-.7 1.7-1.6 1.7-4.6Z" />
      <path {...P} d="M6.7 13.1a1.4 1.4 0 0 0 2.6 0" />
    </Svg>
  ),
  bellOff: () => (
    <Svg>
      <path {...P} d="M5 5.3a3.2 3.2 0 0 1 6.2 1.3c0 3 1.3 3.9 1.7 4.6H6.4" />
      <path {...P} d="M6.7 13.1a1.4 1.4 0 0 0 2.6 0" />
      <path {...P} d="M2.8 2.8l10.4 10.4" />
    </Svg>
  ),
  close: () => (
    <Svg><path {...P} d="M4 4l8 8M12 4l-8 8" /></Svg>
  ),
  kebab: () => (
    <Svg>
      <circle cx="8" cy="3.3" r="1.15" fill="currentColor" stroke="none" />
      <circle cx="8" cy="8" r="1.15" fill="currentColor" stroke="none" />
      <circle cx="8" cy="12.7" r="1.15" fill="currentColor" stroke="none" />
    </Svg>
  ),
  trash: () => (
    <Svg>
      <path {...P} d="M3 4.6h10" />
      <path {...P} d="M6.4 4.6V3.3a.8.8 0 0 1 .8-.8h1.6a.8.8 0 0 1 .8.8v1.3" />
      <path {...P} d="M4.7 4.6l.5 8a1 1 0 0 0 1 .95h3.6a1 1 0 0 0 1-.95l.5-8" />
    </Svg>
  ),
  panelTop: () => (
    <Svg>
      <rect {...P} x="2.5" y="2.5" width="11" height="11" rx="1.2" />
      <path {...P} d="M2.5 6.3h11" />
    </Svg>
  ),
  panelLeft: () => (
    <Svg>
      <rect {...P} x="2.5" y="2.5" width="11" height="11" rx="1.2" />
      <path {...P} d="M6.3 2.5v11" />
    </Svg>
  ),
  expand: () => (
    <Svg>
      <path {...P} d="M9.5 3H13v3.5" />
      <path {...P} d="M13 3 8.6 7.4" />
      <path {...P} d="M6.5 13H3V9.5" />
      <path {...P} d="M3 13l4.4-4.4" />
    </Svg>
  ),
  collapse: () => (
    <Svg>
      <path {...P} d="M8.5 4.5V7.5H11.5" />
      <path {...P} d="M12.5 3.5 8.5 7.5" />
      <path {...P} d="M7.5 11.5V8.5H4.5" />
      <path {...P} d="M3.5 12.5 7.5 8.5" />
    </Svg>
  ),
  chat: () => (
    <Svg>
      <path {...P} d="M2.6 4.4A1.5 1.5 0 0 1 4.1 3h7.8a1.5 1.5 0 0 1 1.5 1.4v4.3a1.5 1.5 0 0 1-1.5 1.5H6l-3.4 2.6z" />
    </Svg>
  ),
  send: () => (
    <Svg>
      <path {...P} d="M13 3 2.5 7.2l4 1.6M13 3l-3 10-3.5-4.2M13 3 6.5 8.8" />
    </Svg>
  ),
  levelUp: () => (
    <Svg>
      <path {...P} d="M12 11.5V8a2 2 0 0 0-2-2H4" />
      <path {...P} d="M6.5 3.5 3.5 6l3 2.5" />
    </Svg>
  ),
  folderPlus: () => (
    <Svg>
      <path {...P} d="M2 4.4A1.4 1.4 0 0 1 3.4 3h2.7l1.4 1.5H14V11.6A1.4 1.4 0 0 1 12.6 13H3.4A1.4 1.4 0 0 1 2 11.6z" />
      <path {...P} d="M8 7v3.4M6.3 8.7h3.4" />
    </Svg>
  ),
  inbox: () => (
    <Svg>
      <path {...P} d="M2.5 9 4 3.6h8L13.5 9v3a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1z" />
      <path {...P} d="M2.5 9H6l1 1.4h2L10 9h3.5" />
    </Svg>
  ),
  plus: () => (
    <Svg><path {...P} d="M8 3.4v9.2M3.4 8h9.2" /></Svg>
  ),
  circle: () => (
    <Svg><circle {...P} cx="8" cy="8" r="5" /></Svg>
  ),
  grip: () => (
    <Svg>
      <circle cx="6" cy="4" r="1" fill="currentColor" stroke="none" /><circle cx="10" cy="4" r="1" fill="currentColor" stroke="none" />
      <circle cx="6" cy="8" r="1" fill="currentColor" stroke="none" /><circle cx="10" cy="8" r="1" fill="currentColor" stroke="none" />
      <circle cx="6" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="10" cy="12" r="1" fill="currentColor" stroke="none" />
    </Svg>
  ),
}
