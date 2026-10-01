import { Link } from 'react-router-dom';

export function LeafMark({ className = 'h-8 w-8' }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <rect width="64" height="64" rx="16" fill="#100e28" stroke="rgba(155,111,241,.4)" />
      <path
        d="M46 14C28 14 16 24 16 40c0 3 .6 6 1.6 8.4C21 38 29 31 40 27c-9 6-15 13-18 23 2 .6 4.3 1 6.7 1C43 51 50 40 50 24c0-3.6-.6-7-1.6-10H46z"
        fill="#9b6ff1"
      />
    </svg>
  );
}

export default function Logo({ onClick }) {
  return (
    <Link to="/" onClick={onClick} className="flex items-center gap-2.5 text-lg font-extrabold tracking-tight text-white">
      <LeafMark />
      <span>
        Eco<span className="text-brand-400">AI</span>
      </span>
    </Link>
  );
}
