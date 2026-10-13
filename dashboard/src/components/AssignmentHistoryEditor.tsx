import { KeyboardEvent, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, Plus, Save, Trash2 } from "lucide-react";
import { ui } from "../theme";
import { formatDisplayDate, toISODate } from "../utils/fiscal";

export interface AssignmentRow {
  division: string;
  start_date: string | null;
  end_date: string | null;
}

interface DraftRow {
  key: number;
  division: string;
  start: string;
  end: string;
}

interface DraftErrors {
  rows: Record<number, string>;
  form: string | null;
}

let draftKey = 0;

function toDraft(rows: AssignmentRow[]): DraftRow[] {
  return rows.map((row) => ({
    key: ++draftKey,
    division: row.division,
    start: (row.start_date || "").slice(0, 10),
    end: (row.end_date || "").slice(0, 10),
  }));
}

function toRows(draft: DraftRow[]): AssignmentRow[] {
  return draft.map((row) => ({
    division: row.division,
    start_date: row.start || null,
    end_date: row.end || null,
  }));
}

/** Same rules as `assignment_history.validate_history`; the server re-checks. ISO dates compare as strings. */
function validate(draft: DraftRow[]): DraftErrors {
  const rows: Record<number, string> = {};
  if (!draft.length) return { rows, form: "Add at least one team" };
  for (const row of draft) {
    if (!row.division) rows[row.key] = "Pick a team";
    else if (row.start && row.end && row.end < row.start) rows[row.key] = "End is before start";
  }
  if (draft.filter((row) => !row.end).length > 1) {
    return { rows, form: "Only one team can be ongoing — give the earlier team an end date" };
  }
  const span = (row: DraftRow) => [row.start || "0000-01-01", row.end || "9999-12-31"] as const;
  draft.forEach((a, i) => {
    const [aStart, aEnd] = span(a);
    for (const b of draft.slice(i + 1)) {
      const [bStart, bEnd] = span(b);
      if (aStart <= bEnd && bStart <= aEnd && !rows[b.key]) {
        rows[b.key] = `Overlaps ${a.division || "another team"}`;
      }
    }
  });
  return { rows, form: null };
}

export function AssignmentHistoryEditor({
  name,
  assignments,
  teamOptions,
  lockedReason,
  onSave,
}: {
  name: string;
  assignments: AssignmentRow[];
  teamOptions: string[];
  /** When set, the history is shown read-only with this explanation. */
  lockedReason: string | null;
  /** Resolves when saved; rejects with a user-facing message. */
  onSave: (rows: AssignmentRow[]) => Promise<void>;
}) {
  const [draft, setDraft] = useState<DraftRow[]>(() => toDraft(assignments));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  // Reset the draft when the saved history changes (after our own save) without remounting,
  // so the "Saved" confirmation survives.
  const savedSig = JSON.stringify(assignments);
  const [syncedSig, setSyncedSig] = useState(savedSig);
  if (savedSig !== syncedSig) {
    setSyncedSig(savedSig);
    setDraft(toDraft(assignments));
  }

  const errors = useMemo(() => validate(draft), [draft]);
  const invalid = Boolean(errors.form) || Object.keys(errors.rows).length > 0;
  const dirty = JSON.stringify(toRows(draft)) !== JSON.stringify(toRows(toDraft(assignments)));
  const locked = Boolean(lockedReason);
  const noCurrentTeam = useMemo(() => {
    if (!draft.length || draft.some((row) => !row.end)) return null;
    const lastEnd = draft.reduce((max, row) => (row.end > max ? row.end : max), "");
    return lastEnd <= toISODate(new Date()) ? lastEnd : null;
  }, [draft]);
  const options = useMemo(() => {
    const extra = draft.map((row) => row.division).filter((d) => d && !teamOptions.includes(d));
    return [...new Set([...teamOptions, ...extra])];
  }, [draft, teamOptions]);

  const edit = (update: (prev: DraftRow[]) => DraftRow[]) => {
    setJustSaved(false);
    setDraft(update);
  };
  const patch = (key: number, change: Partial<DraftRow>) =>
    edit((prev) => prev.map((row) => (row.key === key ? { ...row, ...change } : row)));

  const submit = async () => {
    if (saving || invalid || !dirty || locked) return;
    setSaving(true);
    setSaveError(null);
    setJustSaved(false);
    try {
      await onSave(toRows(draft));
      setJustSaved(true);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Could not save history");
    } finally {
      setSaving(false);
    }
  };

  return (
    // Rendered inside the roster <form>, so this is a group, not a nested form; Enter must not save the roster.
    <div
      role="group"
      aria-label={`Team history for ${name}`}
      className="max-w-3xl space-y-3"
      onKeyDown={(e: KeyboardEvent<HTMLDivElement>) => {
        if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT") e.preventDefault();
      }}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Team history</p>
        <p className="text-xs text-galaxy-muted">
          Blank start = not known. Blank end = current team. Deals follow the team on their close date; quotas do
          not move.
        </p>
      </div>

      {lockedReason && (
        <p className="flex items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          {lockedReason}
        </p>
      )}

      {draft.length === 0 ? (
        <p className="rounded-lg border border-dashed border-galaxy-border px-3 py-4 text-center text-xs text-galaxy-muted">
          No teams yet. Add the team {name} is on.
        </p>
      ) : (
        <ul className="space-y-2">
          {draft.map((row, i) => {
            const rowError = errors.rows[row.key];
            const errorId = `history-${name}-${row.key}-error`;
            return (
              <li key={row.key} className="rounded-xl bg-white p-3 ring-1 ring-galaxy-border/60">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-4 sm:items-end">
                  <label className="text-xs text-galaxy-muted">
                    Team
                    <select
                      value={row.division}
                      disabled={locked || saving}
                      onChange={(e) => patch(row.key, { division: e.target.value })}
                      aria-invalid={Boolean(rowError)}
                      aria-describedby={rowError ? errorId : undefined}
                      className={`${ui.select} mt-1 w-full`}
                    >
                      <option value="">Choose…</option>
                      {options.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-xs text-galaxy-muted">
                    Start
                    <input
                      type="date"
                      value={row.start}
                      disabled={locked || saving}
                      onChange={(e) => patch(row.key, { start: e.target.value })}
                      aria-label={`Start date, row ${i + 1}`}
                      className={`${ui.field} mt-1`}
                    />
                  </label>
                  <label className="text-xs text-galaxy-muted">
                    End
                    <input
                      type="date"
                      value={row.end}
                      disabled={locked || saving}
                      onChange={(e) => patch(row.key, { end: e.target.value })}
                      aria-label={`End date, row ${i + 1}`}
                      className={`${ui.field} mt-1`}
                    />
                  </label>
                  <button
                    type="button"
                    disabled={locked || saving}
                    onClick={() => edit((prev) => prev.filter((r) => r.key !== row.key))}
                    className={`${ui.btnGhost} justify-center text-xs hover:text-red-600`}
                    aria-label={`Remove ${row.division || "row"} ${i + 1}`}
                  >
                    <Trash2 className="h-4 w-4" />
                    Remove
                  </button>
                </div>
                {rowError && (
                  <p id={errorId} className="mt-1.5 text-xs text-red-600">
                    {rowError}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {errors.form && <p className="text-xs text-red-600">{errors.form}</p>}
      {noCurrentTeam && !errors.form && (
        <p className="flex items-start gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Every team has an end date, so {name} has no team after {formatDisplayDate(noCurrentTeam)}. If they are still
          on that team, leave its End blank.
        </p>
      )}
      {saveError && (
        <p role="alert" className="text-xs text-red-600">
          {saveError}
        </p>
      )}
      {justSaved && !dirty && (
        <p
          role="status"
          className="flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800 ring-1 ring-emerald-100"
        >
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
          Saved. Dashboard rebuilt — deals now follow this history.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={locked || saving}
          onClick={() => edit((prev) => [...prev, { key: ++draftKey, division: "", start: "", end: "" }])}
          className={`${ui.btnGhost} text-xs`}
        >
          <Plus className="h-4 w-4" />
          Add team
        </button>
        <div className="ml-auto flex gap-2">
          <button
            type="button"
            disabled={!dirty || saving}
            onClick={() => {
              edit(() => toDraft(assignments));
              setSaveError(null);
            }}
            className={`${ui.btnGhost} text-xs`}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={locked || saving || invalid || !dirty}
            className={ui.btnPrimary}
          >
            {justSaved && !dirty ? <CheckCircle2 className="h-4 w-4" /> : <Save className="h-4 w-4" />}
            {saving ? "Saving…" : justSaved && !dirty ? "Saved" : "Save history"}
          </button>
        </div>
      </div>
    </div>
  );
}
