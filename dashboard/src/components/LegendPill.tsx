interface LegendPillProps {
  /** Series colour from CHART_COLORS; data-driven, so it is applied inline. */
  color: string;
  label: string;
  value?: string | number;
  active?: boolean;
  onClick?: () => void;
}

/** Colour-dot pill used by chart legends and the BU Total Deals RTM chips. */
export function LegendPill({ color, label, value, active, onClick }: LegendPillProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      aria-pressed={onClick ? Boolean(active) : undefined}
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition focus:outline-none focus:ring-4 focus:ring-galaxy-navy/10 disabled:cursor-default motion-reduce:transition-none ${
        active
          ? "bg-white text-galaxy-navy ring-2 ring-galaxy-navy/40"
          : "bg-slate-50 text-slate-600 ring-1 ring-slate-100 enabled:hover:bg-white enabled:hover:ring-galaxy-navy/20"
      }`}
    >
      <span className="h-2 w-2 rounded-full" style={{ background: color }} />
      {label}
      {value != null && <span className={active ? "text-galaxy-navy" : "text-slate-400"}>{value}</span>}
    </button>
  );
}
