interface ProgressRingProps {
  value: number;
  size?: number;
  stroke?: number;
  color?: string;
  trackColor?: string;
}

export function ProgressRing({
  value,
  size = 44,
  stroke = 4,
  color = "#3c3f8e",
  trackColor = "#e8ecf4",
}: ProgressRingProps) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.min(Math.max(value, 0), 100);
  const offset = c - (pct / 100) * c;

  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={trackColor} strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeDasharray={c}
        strokeDashoffset={offset}
        strokeLinecap="round"
        className="transition-all duration-700"
      />
    </svg>
  );
}
