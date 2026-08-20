import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import {
  dateRangePresets,
  formatDisplayDate,
  parseISODate,
  toISODate,
  type DateRangeValue,
} from "../utils/fiscal";

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const CELL = 32;
const MONTH_WIDTH = CELL * 7;
const PRESET_WIDTH = 168;
const PANEL_PAD = 32;
const MONTH_GAP = 32;
const PANEL_WIDTH = MONTH_WIDTH * 2 + MONTH_GAP + PANEL_PAD + PRESET_WIDTH;

interface DateRangeFilterProps {
  value: DateRangeValue;
  onApply: (next: DateRangeValue) => void;
}

function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function daySpan(start: string, end: string) {
  const a = parseISODate(start).getTime();
  const b = parseISODate(end).getTime();
  return Math.round(Math.abs(b - a) / 86_400_000) + 1;
}

function addMonths(year: number, month: number, delta: number) {
  const d = new Date(year, month + delta, 1);
  return { year: d.getFullYear(), month: d.getMonth() };
}

function MonthGrid({
  year,
  month,
  start,
  end,
  hover,
  fillRange,
  onPick,
  onHover,
}: {
  year: number;
  month: number;
  start: string;
  end: string;
  hover: string | null;
  fillRange: boolean;
  onPick: (iso: string) => void;
  onHover: (iso: string | null) => void;
}) {
  const first = new Date(year, month, 1).getDay();
  const count = daysInMonth(year, month);
  const cells: (string | null)[] = [];
  for (let i = 0; i < first; i++) cells.push(null);
  for (let d = 1; d <= count; d++) cells.push(toISODate(new Date(year, month, d)));

  const previewEnd = hover && hover !== start ? hover : end;
  const lo = start <= previewEnd ? start : previewEnd;
  const hi = start <= previewEnd ? previewEnd : start;
  const gridStyle = { gridTemplateColumns: `repeat(7, ${CELL}px)` };

  return (
    <div style={{ width: MONTH_WIDTH }} className="shrink-0">
      <p className="mb-2 text-center text-sm font-semibold text-galaxy-navy">
        {MONTHS[month]} {year}
      </p>
      <div
        className="grid text-center text-[10px] font-semibold uppercase tracking-wider text-slate-400"
        style={gridStyle}
      >
        {WEEKDAYS.map((d) => (
          <span key={d} className="py-1">
            {d}
          </span>
        ))}
      </div>
      <div className="grid" style={gridStyle}>
        {cells.map((iso, i) => {
          if (!iso) return <span key={`e-${i}`} className="h-8 w-8" />;
          const selected = iso === start || iso === end;
          const mid = fillRange && iso >= lo && iso <= hi;
          return (
            <button
              key={iso}
              type="button"
              onClick={() => onPick(iso)}
              onMouseEnter={() => onHover(iso)}
              className={`h-8 w-8 text-xs ${
                selected
                  ? "rounded-full bg-galaxy-navy font-semibold text-white"
                  : mid
                    ? "bg-sky-100 text-galaxy-navy"
                    : "rounded-full text-slate-700 hover:bg-slate-100"
              }`}
            >
              {Number(iso.slice(-2))}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function DateRangeFilter({ value, onApply }: DateRangeFilterProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const [picking, setPicking] = useState<"start" | "end">("start");
  const [hover, setHover] = useState<string | null>(null);
  const [leftMonth, setLeftMonth] = useState(() => {
    const d = new Date();
    return addMonths(d.getFullYear(), d.getMonth(), 0);
  });
  const [pos, setPos] = useState({ top: 72, left: 80 });
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const presets = useMemo(() => dateRangePresets(), []);

  const place = () => {
    const btn = btnRef.current;
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    const width = Math.min(PANEL_WIDTH, window.innerWidth - 16);
    let left = r.right - width;
    left = Math.min(Math.max(8, left), window.innerWidth - width - 8);
    let top = r.bottom + 8;
    const estHeight = 430;
    if (top + estHeight > window.innerHeight - 8) {
      top = Math.max(8, r.top - estHeight - 8);
    }
    setPos({ top, left });
  };

  useEffect(() => {
    if (!open) return;
    setDraft(value);
    const now = new Date();
    setLeftMonth({ year: now.getFullYear(), month: now.getMonth() });
    setPicking("start");
    setHover(null);
    place();
  }, [open, value]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (rootRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onReposition = () => place();
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  }, [open]);

  const rightMonth = addMonths(leftMonth.year, leftMonth.month, 1);
  const fillRange = daySpan(draft.start, draft.end) <= 62;

  const pickDay = (iso: string) => {
    if (draft.preset === "specific" || picking === "start") {
      setDraft({
        ...draft,
        start: iso,
        end: iso,
        preset: draft.preset === "specific" ? "specific" : "custom",
        label: draft.preset === "specific" ? "Specific date" : "Custom",
      });
      setPicking(draft.preset === "specific" ? "start" : "end");
      return;
    }
    const start = iso < draft.start ? iso : draft.start;
    const end = iso < draft.start ? draft.start : iso;
    setDraft({ ...draft, start, end, preset: "custom", label: "Custom" });
    setPicking("start");
  };

  const applyPreset = (preset: DateRangeValue) => {
    setDraft(preset);
    setPicking("start");
    setHover(null);
    const now = new Date();
    setLeftMonth({ year: now.getFullYear(), month: now.getMonth() });
  };

  const apply = () => {
    const label =
      draft.preset === "custom"
        ? `${formatDisplayDate(draft.start)} – ${formatDisplayDate(draft.end)}`
        : draft.preset === "specific"
          ? formatDisplayDate(draft.start)
          : draft.label;
    onApply({ ...draft, label });
    setOpen(false);
  };

  const panel = open
    ? createPortal(
        <div
          ref={panelRef}
          className="fixed z-[200] overflow-hidden rounded-2xl border border-galaxy-border bg-white shadow-2xl"
          style={{ top: pos.top, left: pos.left, width: Math.min(PANEL_WIDTH, window.innerWidth - 16) }}
        >
          <div className="flex">
            <div className="p-4">
              <div className="mb-3 flex items-center justify-between" style={{ width: MONTH_WIDTH * 2 + MONTH_GAP }}>
                <button
                  type="button"
                  onClick={() => setLeftMonth((m) => addMonths(m.year, m.month, -1))}
                  className="rounded-lg p-1 text-slate-500 hover:bg-slate-100"
                  aria-label="Previous month"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <p className="text-xs font-medium text-slate-500">
                  {formatDisplayDate(draft.start)} – {formatDisplayDate(draft.end)}
                </p>
                <button
                  type="button"
                  onClick={() => setLeftMonth((m) => addMonths(m.year, m.month, 1))}
                  className="rounded-lg p-1 text-slate-500 hover:bg-slate-100"
                  aria-label="Next month"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
              <div className="flex" style={{ gap: MONTH_GAP }}>
                <MonthGrid
                  year={leftMonth.year}
                  month={leftMonth.month}
                  start={draft.start}
                  end={draft.end}
                  hover={hover}
                  fillRange={fillRange}
                  onPick={pickDay}
                  onHover={setHover}
                />
                <MonthGrid
                  year={rightMonth.year}
                  month={rightMonth.month}
                  start={draft.start}
                  end={draft.end}
                  hover={hover}
                  fillRange={fillRange}
                  onPick={pickDay}
                  onHover={setHover}
                />
              </div>
              <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
                <p className="text-xs text-slate-500">
                  Timezone: <span className="font-semibold text-galaxy-navy">IST</span>
                </p>
                <button
                  type="button"
                  onClick={apply}
                  className="rounded-lg bg-galaxy-navy px-4 py-1.5 text-sm font-semibold text-white"
                >
                  Update
                </button>
              </div>
            </div>
            <div className="shrink-0 border-l border-slate-100 bg-slate-50 py-2" style={{ width: PRESET_WIDTH }}>
              {presets.map((p) => {
                const active = draft.preset === p.preset;
                return (
                  <button
                    key={p.preset}
                    type="button"
                    onClick={() => applyPreset(p)}
                    className={`block w-full px-4 py-1.5 text-left text-[13px] ${
                      active ? "bg-sky-100 font-semibold text-galaxy-navy" : "text-slate-600 hover:bg-white"
                    }`}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>,
        document.body,
      )
    : null;

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 rounded-xl border border-galaxy-border bg-white px-3 py-2 text-sm font-semibold text-galaxy-navy shadow-sm hover:bg-slate-50"
      >
        <CalendarDays className="h-4 w-4 shrink-0 text-galaxy-primary" />
        <span className="max-w-[160px] truncate">{value.label}</span>
      </button>
      {panel}
    </div>
  );
}
