// oversee.sh mark — a "watcher monolith": a rounded-slab block (Monolith-style)
// with an eye cut into it. The iris glows green when the socket is connected.
export function Logo({ connected = true, size = 22 }) {
  return (
    <svg className="logo" width={size} height={size} viewBox="0 0 28 28" fill="none" aria-hidden="true">
      <rect x="3" y="3" width="22" height="22" rx="7" fill="var(--text)" />
      <path d="M5.4 14 Q14 6.4 22.6 14 Q14 21.6 5.4 14 Z" fill="var(--bg)" />
      <circle cx="14" cy="14" r="3.15" fill={connected ? 'var(--run)' : 'var(--faint)'} />
      <circle cx="15.15" cy="12.85" r="0.95" fill="var(--bg)" />
    </svg>
  )
}
