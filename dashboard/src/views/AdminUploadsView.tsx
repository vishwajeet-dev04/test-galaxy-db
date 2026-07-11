import { FormEvent, useEffect, useState } from "react";
import { CheckCircle2, FileSpreadsheet, RefreshCw, Upload } from "lucide-react";
import { authHeaders, useAuth } from "../context/AuthContext";
import { SectionHeader } from "../components/SectionHeader";
import { ui } from "../theme";

interface FileStatus {
  path: string;
  exists: boolean;
  size: number;
}

export function AdminUploadsView({ onDataRefresh }: { onDataRefresh: () => void }) {
  const { token } = useAuth();
  const [status, setStatus] = useState<Record<string, FileStatus> | null>(null);
  const [quota, setQuota] = useState<{ exists: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [quotaFile, setQuotaFile] = useState<File | null>(null);
  const [pipelineFile, setPipelineFile] = useState<File | null>(null);
  const [salesFile, setSalesFile] = useState<File | null>(null);

  const loadStatus = async () => {
    const res = await fetch("/api/admin/uploads/status", { headers: authHeaders(token) });
    if (!res.ok) return;
    const body = await res.json();
    setStatus(body.files);
    setQuota(body.quota_json);
  };

  useEffect(() => {
    void loadStatus();
  }, [token]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const fd = new FormData();
      if (quotaFile) fd.append("quota_tracker", quotaFile);
      if (pipelineFile) fd.append("opportunity_pipeline", pipelineFile);
      if (salesFile) fd.append("sales_team", salesFile);
      if (!quotaFile && !pipelineFile && !salesFile) {
        throw new Error("Select at least one Excel file");
      }
      const res = await fetch("/api/admin/uploads", {
        method: "POST",
        headers: authHeaders(token),
        body: fd,
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.detail || "Upload failed");
      setMessage(body.message || "Upload complete");
      setQuotaFile(null);
      setPipelineFile(null);
      setSalesFile(null);
      await loadStatus();
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
    try {
      const res = await fetch("/api/admin/reparse", {
        method: "POST",
        headers: authHeaders(token),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.detail || "Reparse failed");
      setMessage(body.message);
      await loadStatus();
      onDataRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reparse failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className={ui.pageTitle}>Admin · Data uploads</h2>
        <p className={ui.pageSub}>
          Upload Quota Tracker, Opportunity Pipeline, and Sales Team Excel files in the same format.
          The dashboard regenerates automatically.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { key: "quota_tracker", label: "Quota Tracker" },
          { key: "opportunity_pipeline", label: "Opportunity Pipeline" },
          { key: "sales_team", label: "Sales Team" },
        ].map(({ key, label }) => {
          const f = status?.[key];
          return (
            <div key={key} className={`${ui.card} p-4`}>
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="h-4 w-4 text-galaxy-navy" />
                <p className="text-sm font-semibold text-galaxy-navy">{label}</p>
              </div>
              <p className="mt-2 text-xs text-slate-500">
                {f?.exists ? `On disk · ${(f.size / 1024).toFixed(0)} KB` : "Not found"}
              </p>
            </div>
          );
        })}
      </div>

      <form onSubmit={onSubmit} className={`${ui.card} space-y-5 p-6`}>
        <SectionHeader label="Upload Excel files" description="Same columns/sheets as the current workbooks" />
        <FileField
          label="Galaxy Quota Tracker (.xlsx)"
          file={quotaFile}
          onChange={setQuotaFile}
        />
        <FileField
          label="Opportunity Pipeline (.xlsx)"
          file={pipelineFile}
          onChange={setPipelineFile}
        />
        <FileField label="Sales Team (.xlsx)" file={salesFile} onChange={setSalesFile} />

        {error && (
          <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-galaxy-primary ring-1 ring-red-100">{error}</p>
        )}
        {message && (
          <p className="flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700 ring-1 ring-emerald-100">
            <CheckCircle2 className="h-4 w-4" />
            {message}
          </p>
        )}

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
        {quota && (
          <p className="text-xs text-slate-400">
            Generated data file: {quota.exists ? "ready" : "missing"}
          </p>
        )}
      </form>
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
