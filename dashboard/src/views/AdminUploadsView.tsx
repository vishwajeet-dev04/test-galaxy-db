import { FormEvent, useEffect, useState } from "react";
import {
  CheckCircle2,
  CloudDownload,
  Database,
  FileSpreadsheet,
  RefreshCw,
  Upload,
  Wifi,
  WifiOff,
  Clock,
  AlertCircle,
} from "lucide-react";
import { authHeaders, useAuth } from "../context/AuthContext";
import { SectionHeader } from "../components/SectionHeader";
import { ui } from "../theme";

interface FileStatus {
  path: string;
  exists: boolean;
  size: number;
}

interface SyncStatus {
  configured: boolean;
  vtiger_url: string | null;
  running: boolean;
  last_run: string | null;
  last_result: { quarters: string[]; deal_counts: Record<string, number>; total_deals: number } | null;
  last_error: string | null;
}

const QUARTER_OPTIONS = [
  { value: "h1", label: "H1 — Q1 + Q2 (Apr–Sep)" },
  { value: "q1", label: "Q1 only (Apr–Jun)" },
  { value: "q2", label: "Q2 only (Jul–Sep)" },
  { value: "h2", label: "H2 — Q3 + Q4 (Oct–Mar)" },
  { value: "all", label: "Full Year (all quarters)" },
];

export function AdminUploadsView({ onDataRefresh }: { onDataRefresh: () => void }) {
  const { token } = useAuth();
  const [fileStatus, setFileStatus] = useState<Record<string, FileStatus> | null>(null);
  const [quotaJson, setQuotaJson] = useState<{ exists: boolean } | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);

  const [busy, setBusy] = useState(false);
  const [syncBusy, setSyncBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedQuarter, setSelectedQuarter] = useState("h1");

  // Quota Tracker upload (only remaining manual file)
  const [quotaFile, setQuotaFile] = useState<File | null>(null);
  const [salesFile, setSalesFile] = useState<File | null>(null);

  const loadFileStatus = async () => {
    const res = await fetch("/api/admin/uploads/status", { headers: authHeaders(token) });
    if (!res.ok) return;
    const body = await res.json();
    setFileStatus(body.files);
    setQuotaJson(body.quota_json);
  };

  const loadSyncStatus = async () => {
    const res = await fetch("/api/admin/vtiger-sync/status", { headers: authHeaders(token) });
    if (!res.ok) return;
    setSyncStatus(await res.json());
  };

  useEffect(() => {
    void loadFileStatus();
    void loadSyncStatus();
  }, [token]);

  // Poll while sync is running
  useEffect(() => {
    if (!syncStatus?.running) return;
    const id = setInterval(async () => {
      await loadSyncStatus();
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

      // Poll until done
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
            setMessage(
              `Sync complete — ${st.last_result.total_deals} deals fetched. Dashboard updated.`
            );
          }
          await loadFileStatus();
          onDataRefresh();
        }
      }, 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncBusy(false);
    }
  };

  const onUploadQuota = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const fd = new FormData();
      if (quotaFile) fd.append("quota_tracker", quotaFile);
      if (salesFile) fd.append("sales_team", salesFile);
      if (!quotaFile && !salesFile) throw new Error("Select at least one file");
      const res = await fetch("/api/admin/uploads", {
        method: "POST",
        headers: authHeaders(token),
        body: fd,
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.detail || "Upload failed");
      setMessage(body.message || "Upload complete — dashboard regenerated");
      setQuotaFile(null);
      setSalesFile(null);
      await loadFileStatus();
      onDataRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  const reparse = async () => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/reparse", {
        method: "POST",
        headers: authHeaders(token),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.detail || "Reparse failed");
      setMessage("Dashboard data regenerated from existing files");
      await loadFileStatus();
      onDataRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reparse failed");
    } finally {
      setBusy(false);
    }
  };

  const isRunning = syncStatus?.running || syncBusy;

  return (
    <div className="space-y-8">
      <div>
        <h2 className={ui.pageTitle}>Admin · Data Management</h2>
        <p className={ui.pageSub}>
          Sync pipeline data directly from Vtiger CRM. Quota targets are updated by uploading the
          Quota Tracker Excel file.
        </p>
      </div>

      {/* ── Alert banner ─────────────────────────────────────────── */}
      {(error || message) && (
        <div
          className={`flex items-start gap-3 rounded-xl px-4 py-3 text-sm ring-1 ${
            error
              ? "bg-red-50 text-red-700 ring-red-200"
              : "bg-emerald-50 text-emerald-700 ring-emerald-200"
          }`}
        >
          {error ? (
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          ) : (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          )}
          <span>{error ?? message}</span>
        </div>
      )}

      {/* ── Section 1: Vtiger CRM Sync ───────────────────────────── */}
      <div className={`${ui.card} space-y-5 p-6`}>
        <div className="flex items-center justify-between">
          <SectionHeader
            label="Sync from Vtiger CRM"
            description="Fetches all Closed Won opportunities for the selected period directly from the CRM — no Excel export needed"
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

        {/* Last sync result */}
        {syncStatus?.last_result && !isRunning && (
          <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-100">
            <p className="text-xs font-semibold text-slate-600">Last sync result</p>
            <div className="mt-1.5 flex flex-wrap gap-3">
              {Object.entries(syncStatus.last_result.deal_counts).map(([q, n]) => (
                <span key={q} className="rounded-lg bg-white px-2.5 py-1 text-xs font-medium text-galaxy-navy ring-1 ring-galaxy-border">
                  {q.toUpperCase()}: {n} deals
                </span>
              ))}
              <span className="rounded-lg bg-galaxy-navy/10 px-2.5 py-1 text-xs font-medium text-galaxy-navy">
                Total: {syncStatus.last_result.total_deals} deals
              </span>
            </div>
            {syncStatus.last_run && (
              <p className="mt-2 flex items-center gap-1 text-xs text-slate-400">
                <Clock className="h-3 w-3" />
                {new Date(syncStatus.last_run + "Z").toLocaleString("en-IN")}
              </p>
            )}
          </div>
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
        </div>

        {!syncStatus?.configured && (
          <p className="text-xs text-amber-600">
            Set <code className="rounded bg-amber-50 px-1 font-mono">VTIGER_URL</code>,{" "}
            <code className="rounded bg-amber-50 px-1 font-mono">VTIGER_USERNAME</code>, and{" "}
            <code className="rounded bg-amber-50 px-1 font-mono">VTIGER_ACCESS_KEY</code> in{" "}
            <code className="rounded bg-amber-50 px-1 font-mono">backend/.env</code> to enable CRM sync.
          </p>
        )}
      </div>

      {/* ── Section 2: Quota Tracker upload ─────────────────────── */}
      <form onSubmit={onUploadQuota} className={`${ui.card} space-y-5 p-6`}>
        <SectionHeader
          label="Upload Quota Tracker"
          description="Quota targets are set twice a year (H1 + H2). Upload the updated Quota Tracker Excel to refresh IC targets."
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <div className={`${ui.card} p-4`}>
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="h-4 w-4 text-galaxy-navy" />
              <p className="text-sm font-semibold text-galaxy-navy">Quota Tracker</p>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              {fileStatus?.quota_tracker?.exists
                ? `On disk · ${((fileStatus.quota_tracker.size || 0) / 1024).toFixed(0)} KB`
                : "Not found"}
            </p>
          </div>
          <div className={`${ui.card} p-4`}>
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="h-4 w-4 text-galaxy-navy" />
              <p className="text-sm font-semibold text-galaxy-navy">Sales Team</p>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              {fileStatus?.sales_team?.exists
                ? `On disk · ${((fileStatus.sales_team.size || 0) / 1024).toFixed(0)} KB`
                : "Not found"}
            </p>
          </div>
        </div>

        <FileField
          label="Galaxy Quota Tracker (.xlsx)"
          file={quotaFile}
          onChange={setQuotaFile}
        />
        <FileField
          label="Sales Team (.xlsx)  — update when org structure changes"
          file={salesFile}
          onChange={setSalesFile}
        />

        <div className="flex flex-wrap gap-3">
          <button
            type="submit"
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-xl bg-galaxy-navy px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-galaxy-navy-dark disabled:opacity-60"
          >
            <Upload className="h-4 w-4" />
            {busy ? "Processing…" : "Upload & refresh"}
          </button>
          <button
            type="button"
            onClick={() => void reparse()}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-xl border border-galaxy-border bg-white px-4 py-2.5 text-sm font-semibold text-galaxy-navy hover:bg-slate-50 disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} />
            Reparse existing files
          </button>
        </div>

        {quotaJson && (
          <p className="text-xs text-slate-400">
            Dashboard data file: {quotaJson.exists ? "ready" : "missing — run a sync or upload files"}
          </p>
        )}
      </form>

      {/* ── Section 3: Pipeline files info ──────────────────────── */}
      <div className={`${ui.card} p-5`}>
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
          Auto-generated pipeline files (from Vtiger sync)
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            { key: "opportunity_pipeline", label: "Pipeline Q1 (Apr–Jun)" },
            { key: "opportunity_pipeline_q2", label: "Pipeline Q2 (Jul–Sep)" },
          ].map(({ key, label }) => {
            const f = fileStatus?.[key] ?? fileStatus?.opportunity_pipeline;
            return (
              <div key={key} className="flex items-center gap-2 text-xs text-slate-500">
                <div className={`h-1.5 w-1.5 rounded-full ${f?.exists ? "bg-emerald-400" : "bg-slate-300"}`} />
                <span>
                  {label} — {f?.exists ? `${((f.size || 0) / 1024).toFixed(0)} KB` : "not synced yet"}
                </span>
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-xs text-slate-400">
          These files are written automatically when you click "Sync from Vtiger". You do not need to upload them manually.
        </p>
      </div>
    </div>
  );
}

function FileField({
  label,
  file,
  onChange,
}: {
  label: string;
  file: File | null;
  onChange: (f: File | null) => void;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500">
        {label}
      </label>
      <input
        type="file"
        accept=".xlsx,.xls"
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
        className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-galaxy-navy/10 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-galaxy-navy"
      />
      {file && <p className="mt-1 text-xs text-slate-500">{file.name}</p>}
    </div>
  );
}
