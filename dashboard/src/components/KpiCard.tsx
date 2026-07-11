import type { ReactNode } from "react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { attainmentBarColor, attainmentColor } from "../utils/format";
import { ProgressRing } from "./ProgressRing";

interface KpiCardProps {
  label: string;
  value: string;
  sub?: string;
  trend?: number | null;
  icon?: ReactNode;
  accent?: string;
  variant?: "default" | "hero";
}

export function KpiCard({
  label,
  value,
  sub,
  trend,
  icon,
  accent = "border-l-galaxy-navy",
  variant = "default",
}: KpiCardProps) {
  const isHero = variant === "hero";
  const ringColor = trend != null ? attainmentBarColor(trend) : "#3c3f8e";

  return (
    <div
      className={`group relative overflow-hidden rounded-2xl border border-galaxy-border/70 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_rgba(15,23,42,0.04)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_12px_32px_rgba(15,23,42,0.08)] ${
        isHero ? "border-l-[3px] p-6" : "border-l-[3px] p-5"
      } ${accent}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-400">{label}</p>
          <p
            className={`mt-2 font-mono font-semibold leading-none tracking-tight text-galaxy-navy ${
              isHero ? "text-3xl" : "text-[1.6rem]"
            }`}
          >
            {value}
          </p>
          {sub && (
            <p className={`mt-2 text-sm leading-snug ${trend != null ? attainmentColor(trend) : "text-slate-500"}`}>
              {sub}
            </p>
          )}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2">
          {trend != null ? (
            <div className="relative">
              <ProgressRing value={trend} size={isHero ? 52 : 44} color={ringColor} />
              <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold text-slate-600">
                {Math.round(trend)}%
              </span>
            </div>
          ) : (
            icon && (
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-50 text-galaxy-navy ring-1 ring-slate-100">
                {icon}
              </div>
            )
          )}
        </div>
      </div>

      {trend != null && (
        <div className="mt-4 flex items-center gap-1.5 border-t border-galaxy-border/40 pt-3 text-[11px] font-medium text-slate-400">
          {trend >= 50 ? (
            <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
          ) : trend >= 25 ? (
            <Minus className="h-3.5 w-3.5 text-amber-500" />
          ) : (
            <TrendingDown className="h-3.5 w-3.5 text-galaxy-primary" />
          )}
          <span>vs quota target</span>
        </div>
      )}
    </div>
  );
}
