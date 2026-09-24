import { Link } from 'react-router-dom'

export function LogoMark({ size = 24 }) {
  return (
    <svg className="logo-mark" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <g transform="skewX(-14) translate(4 0)">
        <rect x="3" y="12" width="4" height="9" rx="1.2" />
        <rect x="9" y="8" width="4" height="13" rx="1.2" />
        <rect x="15" y="3" width="4" height="18" rx="1.2" />
      </g>
    </svg>
  )
}

export function Logo({ to = '/', className = '' }) {
  return (
    <Link to={to} className={`logo ${className}`} aria-label="Orchestra home">
      <LogoMark />
      <span>ORCHESTRA</span>
    </Link>
  )
}
