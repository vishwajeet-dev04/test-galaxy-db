import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  CloudDownload,
  Database,
  Download,
  FileSpreadsheet,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  Wifi,
  WifiOff,
  Clock,
  AlertCircle,
} from "lucide-react";
import { authHeaders, useAuth } from "../context/AuthContext";
import { SectionHeader } from "../components/SectionHeader";
import { ui } from "../theme";

interface SyncStatus {
  configured: boolean;
  vtiger_url: string | null;
  running: boolean;
  last_run: string | null;
  last_result: { quarters: string[]; deal_counts: Record<string, number>; total_deals: number } | null;
  last_error: string | null;
  deals?: Record<string, number> | null;
}

interface AdminStatus {
  deals: Record<string, number>;
  quota_count: number;
  rtm_count: number;
  quota_json: { exists: boolean };
}

interface QuotaPerson {
  name: string;
  division: string;
  type: string;
  reporting_manager?: string | null;
  q1_quota: number | null;
  q2_quota: number | null;
  q3_quota: number | null;
  q4_quota: number | null;
  h1_quota: number | null;
  h2_quota: number | null;
  annual_quota: number | null;
}

const QUARTER_OPTIONS = [
  { value: "h1", label: "H1 — Q1 + Q2 (Apr–Sep)" },
  { value: "q1", label: "Q1 only (Apr–Jun)" },
  { value: "q2", label: "Q2 only (Jul–Sep)" },
  { value: "h2", label: "H2 — Q3 + Q4 (Oct–Mar)" },
  { value: "all", label: "Full Year (all quarters)" },
];

const DIVISIONS = ["S1", "S2", "CB", "GB", "South", "GeoX"];
const TYPES = ["IC", "TL", "AVP", "BU Head", "BU Head / TL", "Topline", "Bottomline", "Other"];
const QUOTA_KEYS = ["q1_quota", "q2_quota", "h1_quota", "q3_quota", "q4_quota", "h2_quota", "annual_quota"] as const;
const FIXED_HALF_KEYS = new Set(["h1_quota", "h2_quota", "annual_quota"]);

const emptyPerson = (): QuotaPerson => ({
  name: "",
  division: "S1",
  type: "IC",
  reporting_manager: "",
  q1_quota: 0,
  q2_quota: 0,
  q3_quota: 0,
  q4_quota: 0,
  h1_quota: 0,
  h2_quota: 0,
  annual_quota: 0,
});

export function AdminUploadsView({ onDataRefresh }: { onDataRefresh: () => void }) {
  const { token } = useAuth();
  const [status, setStatus] = useState<AdminStatus | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [people, setPeople] = useState<QuotaPerson[]>([]);
  const [buQuotas, setBuQuotas] = useState<Record<string, Record<string, number>>>({});
  const [divFilter, setDivFilter] = useState("all");

  const [busy, setBusy] = useState(false);
  const [syncBusy, setSyncBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedQuarter, setSelectedQuarter] = useState("h1");
  const [newRow, setNewRow] = useState<QuotaPerson>(emptyPerson());
  const fileRef = useRef<HTMLInputElement>(null);

  const loadStatus = async () => {
    const res = await fetch("/api/admin/status", { headers: authHeaders(token) });
    if (!res.ok) return;
    setStatus(await res.json());
  };

  const loadSyncStatus = async () => {
    const res = await fetch("/api/admin/vtiger-sync/status", { headers: authHeaders(token) });
    if (!res.ok) return;
    setSyncStatus(await res.json());
  };

  const loadQuotas = async () => {
    const res = await fetch("/api/admin/quotas", { headers: authHeaders(token) });
    if (!res.ok) return;
    const body = await res.json();
    setPeople(body.people || []);
    setBuQuotas(body.bu_annual_quotas || {});
  };

  useEffect(() => {
    void loadStatus();
    void loadSyncStatus();
    void loadQuotas();
  }, [token]);

  useEffect(() => {
    if (!syncStatus?.running) return;
    const id = setInterval(() => {
      void loadSyncStatus();
    }, 3000);
    return () => clearInterval(id);
  }, [syncStatus?.running]);

  const triggerSync = async () => {
    setSyncBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/vtiger-sync?quarter=${selectedQuarter}`, {
        method: "POST",
        headers: authHeaders(token),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.detail || "Sync failed");
      setMessage(`Sync started for ${selectedQuarter.toUpperCase()} — fetching from Vtiger CRM...`);
      await loadSyncStatus();

      const poll = setInterval(async () => {
        const s = await fetch("/api/admin/vtiger-sync/status", { headers: authHeaders(token) });
        const st: SyncStatus = await s.json();
        setSyncStatus(st);
        if (!st.running) {
          clearInterval(poll);
          if (st.last_error) {
            setError(`Sync failed: ${st.last_error}`);
            setMessage(null);
          } else if (st.last_result) {
            setMessage(`Sync complete — ${st.last_result.total_deals} deals stored in the database. Dashboard updated.`);
          }
          await loadStatus();
          onDataRefresh();
        }
      }, 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncBusy(false);
    }
  };

  const saveQuotas = async (e?: FormEvent) => {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const cleaned = people.filter((p) => p.name.trim());
      if (!cleaned.length) throw new Error("Add at least one person");
      const res = await fetch("/api/admin/quotas", {
        method: "PUT",
        headers: { ...authHeaders(token), "Content-Type": "application/json" },
        body: JSON.stringify({ people: cleaned, bu_annual_quotas: buQuotas }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.detail || "Save failed");
      setMessage(body.message || "Quotas saved");
      await loadQuotas();
      await loadStatus();
      onDataRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  const rebuild = async () => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/reparse", {
        method: "POST",
        headers: authHeaders(token),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.detail || "Rebuild failed");
      setMessage(body.message || "Dashboard rebuilt");
      await loadStatus();
      onDataRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Rebuild failed");
    } finally {
      setBusy(false);
    }
  };

  const downloadTemplate = async () => {
    try {
      const res = await fetch("/api/admin/templates/data", { headers: authHeaders(token) });
      if (!res.ok) throw new Error("Could not download template");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "Galaxy_Data_Templates.xlsx";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Download failed");
    }
  };

  const importTemplate = async (file: File) => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/admin/quotas/import", {
        method: "POST",
        headers: authHeaders(token),
        body: form,
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.detail || "Import failed");
      setMessage(body.message || "Template imported");
      await loadQuotas();
      await loadStatus();
      onDataRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const updatePerson = (index: number, patch: Partial<QuotaPerson>) => {
    setPeople((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...patch };
      return next;
    });
  };

  const addPerson = () => {
    const name = newRow.name.trim();
    if (!name) {
      setError("Enter a name before adding");
      return;
    }
    if (people.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
      setError(`"${name}" is already on the roster`);
      return;
    }
    setPeople((prev) => [...prev, { ...newRow, name }]);
    setNewRow(emptyPerson());
    setError(null);
  };

  const removePerson = (index: number) => {
    const name = people[index]?.name;
    if (!window.confirm(`Remove ${name} from the quota roster?`)) return;
    setPeople((prev) => prev.filter((_, i) => i !== index));
  };

  const visible = useMemo(
    () => (divFilter === "all" ? people : people.filter((p) => p.division === divFilter)),
    [people, divFilter],
  );

  const isRunning = syncStatus?.running || syncBusy;
  const dealCounts = status?.deals || syncStatus?.deals || {};
  const buNames = Object.keys(buQuotas);
  const buDivs = ["S1", "S2", "CB", "GB", "South", "GeoX"];

  return (
    <div className="space-y-8">
      <div>
        <h2 className={ui.pageTitle}>Admin · Data Management</h2>
        <p className={ui.pageSub}>
          Sync Closed Won deals from Vtiger. Quota targets come from Finance (T1 template) — H1 and H2 are fixed and never auto-summed from Q1–Q4.
        </p>
      </div>

      {(message || error) && (
        <div
          className={`flex items-start gap-2 rounded-xl px-4 py-3 text-sm ${
            error ? "bg-red-50 text-red-700 ring-1 ring-red-100" : "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-100"
          }`}
        >
          {error ? <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />}
          <span>{error ?? message}</span>
        </div>
      )}

      <div className={`${ui.card} space-y-5 p-6`}>
        <div className="flex items-center justify-between">
          <SectionHeader
            label="Sync from Vtiger CRM"
            description="Fetches Closed Won opportunities for the selected period and stores them in SQLite — no Excel export"
          />
          <div className="flex items-center gap-1.5 text-xs font-medium">
            {syncStatus?.configured ? (
              <>
                <Wifi className="h-3.5 w-3.5 text-emerald-500" />
                <span className="text-emerald-600">Connected</span>
              </>
            ) : (
              <>
                <WifiOff className="h-3.5 w-3.5 text-red-400" />
                <span className="text-red-500">Not configured</span>
              </>
            )}
          </div>
        </div>

        {syncStatus?.vtiger_url && (
          <p className="flex items-center gap-1.5 text-xs text-slate-400">
            <Database className="h-3 w-3" />
            {syncStatus.vtiger_url}
          </p>
        )}

        <div className="grid gap-3 sm:grid-cols-5">
          {["q1", "q2", "q3", "q4"].map((q) => (
            <div key={q} className="rounded-xl bg-slate-50 px-3 py-2 ring-1 ring-slate-100">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{q}</p>
              <p className="font-mono text-lg font-semibold text-galaxy-navy">{dealCounts[q] ?? 0}</p>
              <p className="text-[10px] text-slate-400">deals in database</p>
            </div>
          ))}
          <div className="rounded-xl bg-galaxy-navy/5 px-3 py-2 ring-1 ring-galaxy-navy/10">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-galaxy-navy/60">Total</p>
            <p className="font-mono text-lg font-semibold text-galaxy-navy">{dealCounts.total ?? 0}</p>
            <p className="text-[10px] text-slate-400">Closed Won</p>
          </div>
        </div>

        {syncStatus?.last_result && !isRunning && (
          <p className="flex items-center gap-1 text-xs text-slate-400">
            <Clock className="h-3 w-3" />
            Last sync {syncStatus.last_run ? new Date(syncStatus.last_run + "Z").toLocaleString("en-IN") : "—"}
            {syncStatus.last_result.total_deals != null ? ` · ${syncStatus.last_result.total_deals} deals` : ""}
          </p>
        )}

        {syncStatus?.last_error && !isRunning && (
          <p className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-600 ring-1 ring-red-100">
            Last error: {syncStatus.last_error}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-4">
          <select
            value={selectedQuarter}
            onChange={(e) => setSelectedQuarter(e.target.value)}
            disabled={isRunning || !syncStatus?.configured}
            className="rounded-xl border border-galaxy-border bg-white px-3 py-2.5 text-sm text-galaxy-navy focus:outline-none focus:ring-2 focus:ring-galaxy-navy/30 disabled:opacity-50"
          >
            {QUARTER_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void triggerSync()}
            disabled={isRunning || !syncStatus?.configured}
            className="inline-flex items-center gap-2 rounded-xl bg-galaxy-navy px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-galaxy-navy-dark disabled:opacity-50"
          >
            {isRunning ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" />
                Syncing…
              </>
            ) : (
              <>
                <CloudDownload className="h-4 w-4" />
                Sync from Vtiger
              </>
            )}
          </button>
          <button
            type="button"
            onClick={() => void rebuild()}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-xl border border-galaxy-border bg-white px-4 py-2.5 text-sm font-semibold text-galaxy-navy hover:bg-slate-50 disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} />
            Rebuild dashboard
          </button>
        </div>
      </div>

      <form onSubmit={(e) => void saveQuotas(e)} className={`${ui.card} space-y-5 p-6`}>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <SectionHeader
            label="Quota roster"
            description="H1, H2 and Annual are independent Finance figures. Changing Q1–Q4 does not rewrite them. Change RTM to transfer an IC — Admin only."
          />
          <div className="flex items-center gap-3">
            <select
              value={divFilter}
              onChange={(e) => setDivFilter(e.target.value)}
              className="rounded-xl border border-galaxy-border bg-white px-3 py-2 text-sm"
            >
              <option value="all">All divisions ({people.length})</option>
              {DIVISIONS.filter(Boolean).map((d) => (
                <option key={d} value={d}>
                  {d} ({people.filter((p) => p.division === d).length})
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-xl border border-galaxy-border bg-white px-3 py-2 text-sm font-semibold text-galaxy-navy hover:bg-slate-50 disabled:opacity-60"
            >
              <FileSpreadsheet className="h-4 w-4" />
              Import T1
            </button>
            <button
              type="button"
              onClick={() => void downloadTemplate()}
              className="inline-flex items-center gap-2 rounded-xl border border-galaxy-border bg-white px-3 py-2 text-sm font-semibold text-galaxy-navy hover:bg-slate-50"
            >
              <Download className="h-4 w-4" />
              Template
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void importTemplate(f);
              }}
            />
            <button
              type="submit"
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-xl bg-galaxy-navy px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            >
              <Save className="h-4 w-4" />
              {busy ? "Saving…" : "Save quotas & refresh"}
            </button>
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl ring-1 ring-slate-100">
          <table className="min-w-full text-sm">
            <thead className={ui.tableHead}>
              <tr>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">RTM</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2 text-right">Q1</th>
                <th className="px-3 py-2 text-right">Q2</th>
                <th className="px-3 py-2 text-right">H1</th>
                <th className="px-3 py-2 text-right">Q3</th>
                <th className="px-3 py-2 text-right">Q4</th>
                <th className="px-3 py-2 text-right">H2</th>
                <th className="px-3 py-2 text-right">Annual</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {visible.map((p) => {
                const idx = people.indexOf(p);
                return (
                  <tr key={`${p.name}-${idx}`} className="border-b border-slate-100">
                    <td className="px-3 py-1.5 font-medium text-galaxy-navy">{p.name}</td>
                    <td className="px-3 py-1.5">
                      <select
                        value={p.division}
                        onChange={(e) => updatePerson(idx, { division: e.target.value })}
                        className="rounded-lg border border-galaxy-border bg-white px-2 py-1 text-xs"
                      >
                        { (DIVISIONS.includes(p.division) ? DIVISIONS : [p.division, ...DIVISIONS]).map((d) => (
                          <option key={d || "blank"} value={d}>
                            {d || "—"}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-1.5">
                      <select
                        value={p.type}
                        onChange={(e) => updatePerson(idx, { type: e.target.value })}
                        className="rounded-lg border border-galaxy-border bg-white px-2 py-1 text-xs"
                      >
                        {TYPES.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                    </td>
                    {QUOTA_KEYS.map((key) => (
                      <td key={key} className="px-3 py-1.5 text-right">
                        <input
                          type="number"
                          step="0.01"
                          value={p[key] ?? 0}
                          onChange={(e) => updatePerson(idx, { [key]: e.target.value === "" ? 0 : Number(e.target.value) })}
                          className={`w-20 rounded-lg border px-2 py-1 text-right font-mono text-xs ${
                            FIXED_HALF_KEYS.has(key)
                              ? "border-amber-200 bg-amber-50"
                              : "border-galaxy-border"
                          }`}
                          title={FIXED_HALF_KEYS.has(key) ? "Finance-fixed — not derived from quarters" : undefined}
                        />
                      </td>
                    ))}
                    <td className="px-3 py-1.5">
                      <button type="button" onClick={() => removePerson(idx)} className="text-slate-400 hover:text-red-600">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-end gap-2 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-100">
          <label className="text-xs">
            <span className="mb-1 block font-semibold uppercase tracking-wider text-slate-400">Add person</span>
            <input
              value={newRow.name}
              onChange={(e) => setNewRow((r) => ({ ...r, name: e.target.value }))}
              placeholder="Full name (canonical)"
              className="w-48 rounded-lg border border-galaxy-border px-2 py-1.5 text-sm"
            />
          </label>
          <select
            value={newRow.division}
            onChange={(e) => setNewRow((r) => ({ ...r, division: e.target.value }))}
            className="rounded-lg border border-galaxy-border px-2 py-1.5 text-sm"
          >
            {DIVISIONS.filter(Boolean).map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
          <select
            value={newRow.type}
            onChange={(e) => setNewRow((r) => ({ ...r, type: e.target.value }))}
            className="rounded-lg border border-galaxy-border px-2 py-1.5 text-sm"
          >
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          {QUOTA_KEYS.map((key) => (
            <label key={key} className="text-xs">
              <span className="mb-1 block uppercase tracking-wider text-slate-400">{key.replace("_quota", "").toUpperCase()}</span>
              <input
                type="number"
                step="0.01"
                value={newRow[key] ?? 0}
                onChange={(e) => setNewRow((r) => ({ ...r, [key]: Number(e.target.value) }))}
                className={`w-20 rounded-lg border px-2 py-1.5 text-right font-mono text-sm ${
                  FIXED_HALF_KEYS.has(key) ? "border-amber-200 bg-amber-50" : "border-galaxy-border"
                }`}
              />
            </label>
          ))}
          <button
            type="button"
            onClick={addPerson}
            className="inline-flex items-center gap-1 rounded-xl border border-galaxy-border bg-white px-3 py-1.5 text-sm font-semibold text-galaxy-navy"
          >
            <Plus className="h-4 w-4" />
            Add
          </button>
        </div>
      </form>

      {buNames.length > 0 && (
        <div className={`${ui.card} space-y-4 p-6`}>
          <SectionHeader
            label="BU annual quotas (₹ Cr)"
            description="Used on the Business Units page. Saved together with the IC roster."
          />
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className={ui.tableHead}>
                <tr>
                  <th className="px-3 py-2">BU</th>
                  {buDivs.map((d) => (
                    <th key={d} className="px-3 py-2 text-right">
                      {d}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {buNames.map((bu) => (
                  <tr key={bu} className="border-b border-slate-100">
                    <td className="px-3 py-1.5 font-semibold text-galaxy-navy">{bu}</td>
                    {buDivs.map((d) => (
                      <td key={d} className="px-3 py-1.5 text-right">
                        <input
                          type="number"
                          step="0.01"
                          value={buQuotas[bu]?.[d] ?? 0}
                          onChange={(e) =>
                            setBuQuotas((prev) => ({
                              ...prev,
                              [bu]: { ...prev[bu], [d]: Number(e.target.value) },
                            }))
                          }
                          className="w-20 rounded-lg border border-galaxy-border px-2 py-1 text-right font-mono text-xs"
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
