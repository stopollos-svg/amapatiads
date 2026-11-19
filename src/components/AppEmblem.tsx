import { AccentKey } from '../types';

const THEME_MAP: Record<AccentKey, { bg: string; stroke: string; accent: string }> = {
  emerald: { bg: 'bg-teal-950', stroke: '#99F6E4', accent: '#14B8A6' },
  slate: { bg: 'bg-slate-900', stroke: '#E2E8F0', accent: '#64748B' },
  indigo: { bg: 'bg-indigo-950', stroke: '#C7D2FE', accent: '#6366F1' },
  amber: { bg: 'bg-stone-900', stroke: '#FDE68A', accent: '#D97706' },
};

export function AppEmblem({
  name,
  accentKey,
}: {
  name: string;
  accentKey: AccentKey;
}) {
  const palette = THEME_MAP[accentKey] || THEME_MAP.emerald;
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || '')
    .join('');

  return (
    <div
      className={`w-12 h-12 rounded-xl ${palette.bg} flex items-center justify-center relative overflow-hidden shrink-0 border border-slate-900/10`}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 48 48"
        className="absolute inset-0 w-full h-full opacity-35"
        fill="none"
      >
        <circle cx="24" cy="24" r="16" stroke={palette.stroke} strokeWidth="1.25" />
        <path d="M8 24H40M24 8V40" stroke={palette.accent} strokeWidth="1" />
      </svg>
      <span className="relative text-sm font-semibold tracking-tight text-white font-display">
        {initials || 'AP'}
      </span>
    </div>
  );
}
