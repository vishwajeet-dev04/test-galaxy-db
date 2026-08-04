import { useState, useRef, useEffect } from "react";
import { Search, ChevronDown } from "lucide-react";
import { ui } from "../theme";

export interface FilterOption {
  label: string;
  value: string;
}

export interface FilterConfig {
  key: string;
  label: string;
  value?: string;
  values?: string[];
  isMulti?: boolean;
  options: FilterOption[];
  onChange?: (value: string) => void;
  onToggle?: (value: string) => void;
}

interface FilterBarProps {
  search?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  filters?: FilterConfig[];
}

function MultiSelectFilter({ config }: { config: FilterConfig }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedCount = config.values?.length ?? 0;
  const label = selectedCount === 0 ? config.label : selectedCount === 1 ? config.values![0] : `${selectedCount} selected`;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className={`${ui.select} flex min-w-[140px] items-center justify-between gap-2 pr-10 text-left`}
        aria-label={config.label}
      >
        <span className="truncate">{label}</span>
      </button>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 max-h-60 w-48 overflow-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg ring-1 ring-black/5">
          {config.options.map((opt) => {
            const isSelected = config.values?.includes(opt.value);
            return (
              <label
                key={opt.value}
                className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-slate-50"
              >
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300 text-galaxy-navy focus:ring-galaxy-navy"
                  checked={isSelected}
                  onChange={() => config.onToggle?.(opt.value)}
                />
                <span className={isSelected ? "font-medium text-galaxy-navy" : "text-slate-600"}>
                  {opt.label}
                </span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function FilterBar({
  search,
  onSearchChange,
  searchPlaceholder = "Search...",
  filters = [],
}: FilterBarProps) {
  const showSearch = onSearchChange != null;

  if (!showSearch && filters.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-3">
      {showSearch && (
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-galaxy-muted" />
          <input
            value={search ?? ""}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder}
            className={ui.input}
          />
        </div>
      )}
      {filters.map((f) => {
        if (f.isMulti) {
          return <MultiSelectFilter key={f.key} config={f} />;
        }
        return (
          <select
            key={f.key}
            value={f.value}
            onChange={(e) => f.onChange?.(e.target.value)}
            className={ui.select}
            aria-label={f.label}
          >
            {f.options.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        );
      })}
    </div>
  );
}
