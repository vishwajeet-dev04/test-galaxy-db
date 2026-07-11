import { attainmentBg, formatPct } from "../utils/format";
import { Avatar } from "./Avatar";

export interface PerformerItem {
  id: string;
  rank: number;
  name: string;
  meta: string;
  value: string;
  subValue?: string;
  attainment?: number | null;
  rankStyle?: "navy" | "emerald";
}

interface PerformerListProps {
  items: PerformerItem[];
  onSelect: (id: string) => void;
}

const rankStyles = {
  navy: "bg-galaxy-navy/8 text-galaxy-navy",
  emerald: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100",
};

export function PerformerList({ items, onSelect }: PerformerListProps) {
  return (
    <div className="divide-y divide-galaxy-border/50">
      {items.map((item) => {
        const att = item.attainment ?? 0;
        const style = item.rankStyle ?? "navy";
        return (
          <button
            key={item.id}
            onClick={() => onSelect(item.id)}
            className="group flex w-full items-center gap-3 px-1 py-3.5 text-left transition first:pt-0 last:pb-0 hover:opacity-90 sm:gap-4"
          >
            <span
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl font-mono text-xs font-bold ${rankStyles[style]}`}
            >
              {item.rank}
            </span>
            <Avatar name={item.name} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-galaxy-navy group-hover:text-galaxy-blue">
                {item.name}
              </p>
              <p className="truncate text-xs text-slate-500">{item.meta}</p>
            </div>
            <div className="text-right">
              <p className="font-mono text-sm font-semibold text-galaxy-navy">{item.value}</p>
              {item.subValue && <p className="text-[11px] text-slate-400">{item.subValue}</p>}
            </div>
            {item.attainment != null && (
              <div className="hidden w-20 sm:block">
                <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={`h-full rounded-full ${attainmentBg(att)}`}
                    style={{ width: `${Math.min(att, 100)}%` }}
                  />
                </div>
                <p className="mt-1 text-right font-mono text-[10px] text-slate-500">{formatPct(att)}</p>
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}
