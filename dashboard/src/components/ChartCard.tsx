import type { ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";
import { ui } from "../theme";

interface ChartCardProps {
  title: ReactNode;
  subtitle?: string;
  action?: { label: string; onClick: () => void };
  children: ReactNode;
  className?: string;
  noPadding?: boolean;
}

export function ChartCard({ title, subtitle, action, children, className = "", noPadding }: ChartCardProps) {
  return (
    <div className={`${ui.card} overflow-hidden ${className}`}>
      <div className="flex items-start justify-between gap-4 border-b border-galaxy-border/50 px-6 py-4">
        <div>
          <h3 className="text-[15px] font-semibold tracking-tight text-galaxy-navy">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{subtitle}</p>}
        </div>
        {action && (
          <button
            onClick={action.onClick}
            className="group flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-galaxy-blue transition hover:bg-galaxy-blue/5 hover:text-galaxy-navy"
          >
            {action.label}
            <ArrowUpRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </button>
        )}
      </div>
      <div className={noPadding ? "" : "px-6 py-5"}>{children}</div>
    </div>
  );
}
