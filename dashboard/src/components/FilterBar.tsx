import { Search } from "lucide-react";
import { ui } from "../theme";

export interface FilterOption {
  label: string;
  value: string;
}

export interface FilterConfig {
  key: string;
  label: string;
  value: string;
  options: FilterOption[];
  onChange: (value: string) => void;
}

interface FilterBarProps {
  search?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  filters?: FilterConfig[];
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
      {filters.map((f) => (
        <select
          key={f.key}
          value={f.value}
          onChange={(e) => f.onChange(e.target.value)}
          className={ui.select}
          aria-label={f.label}
        >
          {f.options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      ))}
    </div>
  );
}
