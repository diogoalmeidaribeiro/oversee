// oversee.sh mark — a minimalist radar scope: two concentric rings with a sweep
// arm and a blip that glow green when the control socket is connected.
export function Logo({ connected = true, size = 22 }) {
  const active = connected ? 'var(--run)' : 'var(--faint)'
  return (
    <svg className="logo" width={size} height={size} viewBox="0 0 28 28" fill="none" aria-hidden="true">
      <circle cx="14" cy="14" r="10.5" stroke="var(--text)" strokeWidth="1.8" fill="none" />
      <circle cx="14" cy="14" r="5.4" stroke="var(--faint)" strokeWidth="1.2" fill="none" />
      <line x1="14" y1="14" x2="22.4" y2="8.6" stroke={active} strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="19.5" cy="10.2" r="1.9" fill={active} />
    </svg>
  )
}
