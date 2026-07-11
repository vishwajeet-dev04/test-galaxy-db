import { HelpCircle } from "lucide-react";

interface InfoTooltipProps {
  text: string;
}

export function InfoTooltip({ text }: InfoTooltipProps) {
  return (
    <span className="group relative inline-flex">
      <HelpCircle className="h-3.5 w-3.5 cursor-help text-slate-400 transition hover:text-galaxy-navy" />
      <span className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 hidden w-56 -translate-x-1/2 rounded-lg bg-galaxy-navy px-3 py-2 text-[11px] leading-relaxed text-white shadow-lg group-hover:block">
        {text}
        <span className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-galaxy-navy" />
      </span>
    </span>
  );
}
