import { FormEvent, Fragment, useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CloudDownload,
  Download,
  FileSpreadsheet,
  Plus,
  RefreshCw,
  Save,
  Search,
  Trash2,
  Wifi,
  WifiOff,
  Clock,
  AlertCircle,
} from "lucide-react";
import { AdminUsersPanel, type UserListResponse } from "./AdminUsersPanel";
import { authHeaders, useAuth } from "../context/AuthContext";
import { SectionHeader } from "../components/SectionHeader";
import { ui } from "../theme";
import { formatDisplayDate, toISODate } from "../utils/fiscal";
import { apiFetch, httpErrorMessage, isSessionExpiredStatus, notifySessionExpired } from "../utils/apiError";

interface SyncStatus {
  configured: boolean;
  job_id: string | null;
  status: "running" | "done" | "error" | null;
  running: boolean;
  last_run: string | null;
  last_result: { quarters: string[]; deal_counts: Record<string, number>; total_deals: number } | null;
  last_error: string | null;
  deals?: Record<string, number> | null;
  quarters?: string[];
}

interface AdminStatus {
  deals: Record<string, number>;
  quota_count: number;
  rtm_count: number;
  quota_json: { exists: boolean };
  configured?: boolean;
  job_id?: string | null;
  status?: SyncStatus["status"];
  running?: boolean;
  last_run?: string | null;
  last_result?: SyncStatus["last_result"];
  last_error?: string | null;
  quarters?: string[];
}

interface AssignmentRow {
  division: string;
  start_date: string | null;
  end_date: string | null;
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
  assignments: AssignmentRow[];
  baselineDivision: string;
  transfer_start: string | null;
  joinChoice: "moved" | "wrong" | null;
}

function formatDbDeals(deals?: Record<string, number> | null): string {
  if (!deals) return "";
  const q1 = deals.q1 ?? 0;
  const q2 = deals.q2 ?? 0;
  const q3 = deals.q3 ?? 0;
  const q4 = deals.q4 ?? 0;
  const total = deals.total ?? q1 + q2 + q3 + q4;
  return `Q1 ${q1} · Q2 ${q2} · Q3 ${q3} · Q4 ${q4} · total ${total}`;
}

function formatSyncComplete(st: SyncStatus): string {
  const counts = st.last_result?.deal_counts || {};
  const quarters = st.last_result?.quarters?.length
    ? st.last_result.quarters
    : Object.keys(counts);
  const stored =
    quarters.length > 0
      ? quarters.map((q) => `${q.toUpperCase()} stored ${counts[q] ?? 0}`).join(", ")
      : "Sync complete";
  const db = formatDbDeals(st.deals);
  return db ? `${stored} deals. Database: ${db}.` : `${stored} deals.`;
}

const DIVISIONS = ["S1", "S2", "CB", "GB", "South", "GeoX"];
const TYPES = ["IC", "TL", "AVP", "BU Head", "BU Head / TL", "Self", "Other"];
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
  assignments: [{ division: "S1", start_date: null, end_date: null }],
  baselineDivision: "S1",
  transfer_start: null,
  joinChoice: null,
});

function hydratePerson(raw: Partial<QuotaPerson> & { name: string; division?: string }): QuotaPerson {
  const division = raw.division || "S1";
  const assignments = (raw.assignments || []).map((a) => ({
    division: a.division,
    start_date: a.start_date ?? null,
    end_date: a.end_date ?? null,
  }));
  return {
    name: raw.name,
    division,
    type: raw.type || "IC",
    reporting_manager: raw.reporting_manager ?? "",
    q1_quota: raw.q1_quota ?? 0,
    q2_quota: raw.q2_quota ?? 0,
    q3_quota: raw.q3_quota ?? 0,
    q4_quota: raw.q4_quota ?? 0,
    h1_quota: raw.h1_quota ?? 0,
    h2_quota: raw.h2_quota ?? 0,
    annual_quota: raw.annual_quota ?? 0,
    assignments: assignments.length ? assignments : [{ division, start_date: null, end_date: null }],
    baselineDivision: division,
    transfer_start: null,
    joinChoice: null,
  };
}

function formatAssignmentDate(value: string | null | undefined): string {
  if (!value) return "—";
  try {
    return formatDisplayDate(value.slice(0, 10));
  } catch {
    return value;
  }
}

export function AdminUploadsView({ onDataRefresh }: { onDataRefresh: () => void }) {
  const { token } = useAuth();
  const [status, setStatus] = useState<AdminStatus | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [people, setPeople] = useState<QuotaPerson[]>([]);
  const [loginSeed, setLoginSeed] = useState<UserListResponse | null>(null);
  const [loginSeedReady, setLoginSeedReady] = useState(false);
  const [buQuotas, setBuQuotas] = useState<Record<string, Record<string, number>>>({});
  const [divFilter, setDivFilter] = useState("all");
  const [nameQuery, setNameQuery] = useState("");

  const [busy, setBusy] = useState(false);
  const [syncBusy, setSyncBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [syncStatusReady, setSyncStatusReady] = useState(false);
  const [newRow, setNewRow] = useState<QuotaPerson>(emptyPerson());
  const [expandedHistory, setExpandedHistory] = useState<Record<string, boolean>>({});
  const fileRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeJobId = useRef<string | null>(null);
  const jobFinished = useRef(false);
  const pollFails = useRef(0);

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const getJson = async <T,>(input: RequestInfo | URL, init: RequestInit | undefined, fallback: string) => {
    const { res, json, raw } = await apiFetch(input, init);
    if (!res.ok) throw new Error(httpErrorMessage(res.status, json, raw, fallback));
    return json as T;
  };

  const parseCrm = (body: Record<string, unknown>): SyncStatus => {
    const crm = (
      body.crm && typeof body.crm === "object" ? body.crm : {}
    ) as Partial<SyncStatus> & { deals?: Record<string, number> };
    if (crm.deals) {
      setStatus((prev) => ({
        deals: crm.deals as Record<string, number>,
        quota_count: prev?.quota_count ?? 0,
        rtm_count: prev?.rtm_count ?? 0,
        quota_json: prev?.quota_json ?? { exists: false },
      }));
    }
    return {
      configured: Boolean(crm.configured),
      job_id: crm.job_id ?? null,
      status: crm.status ?? null,
      running: Boolean(crm.running),
      last_run: crm.last_run ?? null,
      last_result: crm.last_result ?? null,
      last_error: crm.last_error ?? null,
      deals: crm.deals,
      quarters: crm.quarters,
    };
  };

  const fetchJobStatus = async (_jobId?: string | null): Promise<SyncStatus> => {
    const body = await getJson<Record<string, unknown>>(
      "/api/admin/quotas",
      { headers: authHeaders(token) },
      `Request failed`,
    );
    return parseCrm(body);
  };

  const applyJobFinished = async (st: SyncStatus) => {
    if (jobFinished.current) return;
    jobFinished.current = true;
    stopPolling();
    activeJobId.current = null;
    setSyncBusy(false);
    if (st.status === "error" || st.last_error) {
      setError(`Sync failed: ${st.last_error || "Sync failed"}`);
      setMessage(null);
      return;
    }
    if (st.status === "done" && st.last_result) {
      setMessage(formatSyncComplete(st));
      await loadQuotas();
      onDataRefresh();
      return;
    }
    if (st.status === "done") {
      setMessage("Sync complete. Dashboard updated.");
      await loadQuotas();
      onDataRefresh();
    }
  };

  const startPolling = (jobId: string) => {
    stopPolling();
    pollFails.current = 0;
    activeJobId.current = jobId;
    jobFinished.current = false;
    const tick = async () => {
      if (jobFinished.current) return;
      try {
        const st = await fetchJobStatus(jobId);
        pollFails.current = 0;
        setSyncStatus(st);
        if (st.job_id && st.job_id !== jobId) return;
        if (st.status === "running" || st.running) return;
        if (st.status === "done" || st.status === "error") {
          await applyJobFinished(st);
        }
      } catch (err) {
        pollFails.current += 1;
        if (pollFails.current >= 8) {
          stopPolling();
          setSyncBusy(false);
          setError("Could not read sync status. Try Sync again.");
        }
      }
    };
    void tick();
    pollRef.current = setInterval(() => {
      void tick();
    }, 2500);
  };

  const loadQuotas = async () => {
    try {
      const body = await getJson<Record<string, unknown>>(
        "/api/admin/quotas",
        { headers: authHeaders(token) },
        `Could not load quota roster`,
      );
      setPeople(((body.people as QuotaPerson[]) || []).map((p: QuotaPerson) => hydratePerson(p)));
      setBuQuotas((body.bu_annual_quotas as Record<string, Record<string, number>>) || {});
      setLoginSeed((body.accounts as UserListResponse) || { items: [], total: 0, page: 1, page_size: 20 });
      setLoginSeedReady(true);
      const st = parseCrm(body);
      setSyncStatus(st);
      if (st.running && st.job_id && !pollRef.current) {
        startPolling(st.job_id);
      }
    } catch (err) {
      setLoginSeed({ items: [], total: 0, page: 1, page_size: 20 });
      setLoginSeedReady(true);
      setError(err instanceof Error ? err.message : `Could not load quota roster`);
    } finally {
      setSyncStatusReady(true);
    }
  };

  useEffect(() => {
    void loadQuotas();
    return () => {
      stopPolling();
    };
  }, [token]);

  const triggerSync = async () => {
    setSyncBusy(true);
    setError(null);
    setMessage(null);
    try {
      const body = await getJson<Record<string, unknown>>(
        "/api/admin/quotas",
        {
          method: "PUT",
          headers: { ...authHeaders(token), "Content-Type": "application/json" },
          body: JSON.stringify({ sync: true }),
        },
        `Request failed`,
      );
      const jobId = body.job_id as string | undefined;
      if (!jobId) throw new Error("Sync did not return a job id");
      setMessage("Sync started — fetching Closed Won for the full FY (Q1–Q4)…");
      setSyncStatus((prev) => ({
        configured: prev?.configured ?? true,
        job_id: jobId,
        status: "running",
        running: true,
        last_run: prev?.last_run ?? null,
        last_result: prev?.last_result ?? null,
        last_error: null,
        deals: prev?.deals,
        quarters: Array.isArray(body.quarters) ? (body.quarters as string[]) : undefined,
      }));
      startPolling(jobId);
    } catch (err) {
      stopPolling();
      setSyncBusy(false);
      setError(err instanceof Error ? err.message : "Sync failed");
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
      const unanswered = cleaned.find((p) => p.division !== p.baselineDivision && !p.joinChoice);
      if (unanswered) {
        throw new Error(`Say when ${unanswered.name} joined ${unanswered.division}`);
      }
      const missingDate = cleaned.find(
        (p) => p.division !== p.baselineDivision && p.joinChoice === "moved" && !p.transfer_start,
      );
      if (missingDate) {
        throw new Error(`Pick the date ${missingDate.name} joined ${missingDate.division}`);
      }
      const payload = cleaned.map((p) => ({
        name: p.name,
        division: p.division,
        type: p.type,
        reporting_manager: p.reporting_manager,
        q1_quota: p.q1_quota,
        q2_quota: p.q2_quota,
        q3_quota: p.q3_quota,
        q4_quota: p.q4_quota,
        h1_quota: p.h1_quota,
        h2_quota: p.h2_quota,
        annual_quota: p.annual_quota,
        assignments: p.assignments,
        transfer_start: p.division !== p.baselineDivision && p.joinChoice === "moved" ? p.transfer_start : null,
        rtm_correction: p.division !== p.baselineDivision && p.joinChoice === "wrong",
      }));
      const body = await getJson<Record<string, unknown>>(
        "/api/admin/quotas",
        {
          method: "PUT",
          headers: { ...authHeaders(token), "Content-Type": "application/json" },
          body: JSON.stringify({ people: payload, bu_annual_quotas: buQuotas }),
        },
        "Save failed",
      );
      setMessage(typeof body.message === "string" ? body.message : "Quotas saved");
      await loadQuotas();
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
      const body = await getJson<Record<string, unknown>>(
        "/api/admin/reparse",
        { method: "POST", headers: authHeaders(token) },
        "Rebuild failed",
      );
      setMessage(typeof body.message === "string" ? body.message : "Dashboard rebuilt");
      await loadQuotas();
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
      if (!res.ok) {
        const raw = await res.text();
        if (isSessionExpiredStatus(res.status, raw)) notifySessionExpired();
        let json: unknown = null;
        try {
          json = raw ? JSON.parse(raw) : {};
        } catch (err) {
          console.error("template_download_not_json", err);
        }
        throw new Error(httpErrorMessage(res.status, json, raw, "Could not download template"));
      }
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
      const body = await getJson<Record<string, unknown>>(
        "/api/admin/quotas/import",
        { method: "POST", headers: authHeaders(token), body: form },
        "Import failed",
      );
      setMessage(typeof body.message === "string" ? body.message : "Template imported");
      await loadQuotas();
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
    setPeople((prev) => [...prev, hydratePerson({ ...newRow, name })]);
    setNewRow(emptyPerson());
    setError(null);
  };

  const removePerson = (index: number) => {
    const name = people[index]?.name;
    if (!window.confirm(`Remove ${name} from the quota roster?`)) return;
    setPeople((prev) => prev.filter((_, i) => i !== index));
  };

  const visible = useMemo(() => {
    const q = nameQuery.trim().toLowerCase().replace(/\s+/g, " ");
    return people.filter((p) => {
      if (divFilter !== "all" && p.division !== divFilter) return false;
      if (!q) return true;
      return p.name.toLowerCase().replace(/\s+/g, " ").includes(q);
    });
  }, [people, divFilter, nameQuery]);

  // Managers such as Sanjay Patodia are stored on rows but are not roster people.
  const managerOptions = useMemo(() => {
    const names = new Set<string>();
    for (const person of people) {
      const name = person.name.trim();
      if (name) names.add(name);
      const manager = (person.reporting_manager || "").trim();
      if (manager) names.add(manager);
    }
    return [...names];
  }, [people]);

  const isRunning = syncStatus?.running || syncBusy || syncStatus?.status === "running";
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

      <AdminUsersPanel seed={loginSeed} seedReady={loginSeedReady} onRefresh={loadQuotas} />

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
            description="Pulls Closed Won for the full FY (Q1–Q4)."
          />
          <div className="flex items-center gap-1.5 text-xs font-medium">
            {!syncStatusReady ? (
              <span className="text-slate-400">Checking…</span>
            ) : !syncStatus ? (
              <>
                <WifiOff className="h-3.5 w-3.5 text-amber-500" />
                <span className="text-amber-700">Status unavailable</span>
              </>
            ) : syncStatus.configured ? (
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
          <p className="flex items-center gap-1 text-xs text-galaxy-muted">
            <Clock className="h-3 w-3" />
            Last sync {syncStatus.last_run ? new Date(syncStatus.last_run + "Z").toLocaleString("en-IN") : "—"}
            {syncStatus.last_result.quarters?.length
              ? ` · ${syncStatus.last_result.quarters.map((q) => `${q.toUpperCase()} ${syncStatus.last_result?.deal_counts?.[q] ?? 0}`).join(" · ")}`
              : ""}
            {formatDbDeals(dealCounts) ? ` · database ${formatDbDeals(dealCounts)}` : ""}
          </p>
        )}

        {syncStatus?.last_error && !isRunning && (
          <p className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-600 ring-1 ring-red-100">
            Last error: {syncStatus.last_error}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-4">
          <button
            type="button"
            onClick={() => void triggerSync()}
            disabled={isRunning || busy || !syncStatus?.configured}
            className={ui.btnPrimary}
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
            disabled={busy || isRunning}
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
            description="H1, H2 and Annual are independent Finance figures. Changing a team asks when they joined it. A move keeps the old team until that date. A wrong label is corrected with no date."
          />
          <div className="flex items-center gap-3">
            <div className="relative w-52">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={nameQuery}
                onChange={(e) => setNameQuery(e.target.value)}
                placeholder="Search name"
                aria-label="Search roster by name"
                className={`${ui.input} py-2`}
              />
            </div>
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
              disabled={busy || isRunning}
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
              disabled={busy || isRunning}
              className="inline-flex items-center gap-2 rounded-xl bg-galaxy-navy px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            >
              <Save className="h-4 w-4" />
              {busy ? "Saving…" : "Save quotas & refresh"}
            </button>
          </div>
        </div>

        {visible.length === 0 && (nameQuery.trim() || divFilter !== "all") && (
          <p className="text-sm text-slate-500">
            No one matches
            {nameQuery.trim() ? ` “${nameQuery.trim()}”` : ""}
            {divFilter !== "all" ? ` in ${divFilter}` : ""}.
          </p>
        )}

        <div className="overflow-x-auto rounded-xl ring-1 ring-slate-100">
          <table className="min-w-full text-sm">
            <thead className={ui.tableHead}>
              <tr>
                <th className="px-3 py-2" />
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">RTM/BU</th>
                <th className="px-3 py-2">Joined</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Reports to</th>
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
                const rtmChanged = p.division !== p.baselineDivision;
                const historyOpen = expandedHistory[p.name];
                return (
                  <RosterPersonRows
                    key={`${p.name}-${idx}`}
                    p={p}
                    rtmChanged={rtmChanged}
                    historyOpen={!!historyOpen}
                    onToggleHistory={() =>
                      setExpandedHistory((prev) => ({ ...prev, [p.name]: !prev[p.name] }))
                    }
                    onChangeDivision={(value) =>
                      updatePerson(idx, {
                        division: value,
                        joinChoice: value === p.baselineDivision ? null : p.joinChoice,
                        transfer_start:
                          value === p.baselineDivision || p.joinChoice !== "moved" ? null : p.transfer_start,
                      })
                    }
                    onChangeJoin={(choice) =>
                      updatePerson(idx, {
                        joinChoice: choice,
                        transfer_start: choice === "moved" ? p.transfer_start || toISODate(new Date()) : null,
                      })
                    }
                    onChangeTransferStart={(value) => updatePerson(idx, { transfer_start: value || null })}
                    onChangeType={(value) => updatePerson(idx, { type: value })}
                    managerNames={managerOptions.filter((name) => name !== p.name)}
                    onChangeManager={(value) => updatePerson(idx, { reporting_manager: value || null })}
                    onChangeQuota={(key, value) => updatePerson(idx, { [key]: value })}
                    onRemove={() => removePerson(idx)}
                  />
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
            onChange={(e) =>
              setNewRow((r) => ({
                ...r,
                division: e.target.value,
                baselineDivision: e.target.value,
                assignments: [{ division: e.target.value, start_date: null, end_date: null }],
              }))
            }
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

function RosterPersonRows({
  p,
  rtmChanged,
  historyOpen,
  onToggleHistory,
  onChangeDivision,
  onChangeJoin,
  onChangeTransferStart,
  onChangeType,
  managerNames,
  onChangeManager,
  onChangeQuota,
  onRemove,
}: {
  p: QuotaPerson;
  rtmChanged: boolean;
  historyOpen: boolean;
  onToggleHistory: () => void;
  onChangeDivision: (value: string) => void;
  onChangeJoin: (choice: "moved" | "wrong") => void;
  onChangeTransferStart: (value: string) => void;
  onChangeType: (value: string) => void;
  managerNames: string[];
  onChangeManager: (value: string) => void;
  onChangeQuota: (key: (typeof QUOTA_KEYS)[number], value: number) => void;
  onRemove: () => void;
}) {
  const rtmOptions = DIVISIONS.includes(p.division) ? DIVISIONS : [p.division, ...DIVISIONS];
  return (
    <Fragment>
      <tr className="border-b border-slate-100">
        <td className="px-2 py-1.5">
          <button
            type="button"
            onClick={onToggleHistory}
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-galaxy-navy"
            aria-label={`Toggle assignment history for ${p.name}`}
          >
            {historyOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
        </td>
        <td className="px-3 py-1.5 font-medium text-galaxy-navy">{p.name}</td>
        <td className="px-3 py-1.5">
          <select
            value={p.division}
            onChange={(e) => onChangeDivision(e.target.value)}
            className="rounded-lg border border-galaxy-border bg-white px-2 py-1 text-xs"
          >
            {rtmOptions.map((d) => (
              <option key={d || "blank"} value={d}>
                {d || "—"}
              </option>
            ))}
          </select>
        </td>
        <td className="px-3 py-1.5">
          {rtmChanged ? (
            <span className="text-xs font-medium text-galaxy-navy">
              {p.joinChoice === "moved"
                ? formatAssignmentDate(p.transfer_start)
                : p.joinChoice === "wrong"
                  ? "Corrected"
                  : "Choose"}
            </span>
          ) : (
            <span className="text-xs text-slate-400">—</span>
          )}
        </td>
        <td className="px-3 py-1.5">
          <select
            value={p.type}
            onChange={(e) => onChangeType(e.target.value)}
            className="rounded-lg border border-galaxy-border bg-white px-2 py-1 text-xs"
          >
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </td>
        <td className="px-3 py-1.5">
          <select
            value={p.reporting_manager || ""}
            onChange={(e) => onChangeManager(e.target.value)}
            aria-label={`Reporting manager for ${p.name}`}
            className="max-w-[10rem] rounded-lg border border-galaxy-border bg-white px-2 py-1 text-xs focus:border-galaxy-navy/40 focus:outline-none focus:ring-4 focus:ring-galaxy-navy/10"
          >
            <option value="">—</option>
            {(p.reporting_manager && !managerNames.includes(p.reporting_manager)
              ? [p.reporting_manager, ...managerNames]
              : managerNames
            ).map((name) => (
              <option key={name} value={name}>
                {name}
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
              onChange={(e) => onChangeQuota(key, e.target.value === "" ? 0 : Number(e.target.value))}
              className={`w-20 rounded-lg border px-2 py-1 text-right font-mono text-xs ${
                FIXED_HALF_KEYS.has(key) ? "border-amber-200 bg-amber-50" : "border-galaxy-border"
              }`}
              title={FIXED_HALF_KEYS.has(key) ? "Finance-fixed — not derived from quarters" : undefined}
            />
          </td>
        ))}
        <td className="px-3 py-1.5">
          <button type="button" onClick={onRemove} className="text-slate-400 hover:text-red-600">
            <Trash2 className="h-4 w-4" />
          </button>
        </td>
      </tr>
      {rtmChanged && (
        <tr className="border-b border-slate-100 bg-amber-50/70">
          <td colSpan={14} className="px-6 py-3">
            <fieldset>
              <legend className="text-sm font-medium text-galaxy-navy">
                When did they join {p.division}?
              </legend>
              <p className="mt-0.5 text-xs text-galaxy-muted">
                {p.name} is on {p.baselineDivision} today.
              </p>
              <div className="mt-3 flex flex-col gap-2">
                <label className="flex flex-wrap items-center gap-2 text-sm text-galaxy-text">
                  <input
                    type="radio"
                    name={`join-${p.name}`}
                    checked={p.joinChoice === "moved"}
                    onChange={() => onChangeJoin("moved")}
                    className="h-4 w-4 border-galaxy-border text-galaxy-navy focus:outline-none focus:ring-4 focus:ring-galaxy-navy/10"
                  />
                  They moved
                  {p.joinChoice === "moved" && (
                    <input
                      type="date"
                      value={p.transfer_start || ""}
                      onChange={(e) => onChangeTransferStart(e.target.value)}
                      aria-label={`Date ${p.name} joined ${p.division}`}
                      className="rounded-lg border border-galaxy-border bg-white px-2 py-1 text-xs focus:border-galaxy-navy/40 focus:outline-none focus:ring-4 focus:ring-galaxy-navy/10"
                    />
                  )}
                </label>
                {p.joinChoice === "moved" && (
                  <p className="pl-6 text-xs text-galaxy-muted">
                    Deals closed before this date stay on {p.baselineDivision}.
                  </p>
                )}
                <label className="flex items-center gap-2 text-sm text-galaxy-text">
                  <input
                    type="radio"
                    name={`join-${p.name}`}
                    checked={p.joinChoice === "wrong"}
                    onChange={() => onChangeJoin("wrong")}
                    className="h-4 w-4 border-galaxy-border text-galaxy-navy focus:outline-none focus:ring-4 focus:ring-galaxy-navy/10"
                  />
                  The old team was wrong
                </label>
                {p.joinChoice === "wrong" && (
                  <p className="pl-6 text-xs text-galaxy-muted">
                    This open stretch counts on {p.division}. Closed past teams stay as they are.
                  </p>
                )}
              </div>
            </fieldset>
          </td>
        </tr>
      )}
      {historyOpen && (
        <tr className="border-b border-slate-100 bg-slate-50/80">
          <td colSpan={14} className="px-6 py-3">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Assignment history
            </p>
            <table className="w-full max-w-lg text-xs">
              <thead>
                <tr className="text-left text-slate-400">
                  <th className="py-1 pr-4 font-medium">RTM/BU</th>
                  <th className="py-1 pr-4 font-medium">Start Date</th>
                  <th className="py-1 font-medium">End Date</th>
                </tr>
              </thead>
              <tbody>
                {p.assignments.map((a, i) => (
                  <tr key={`${a.division}-${a.start_date}-${i}`}>
                    <td className="py-1 pr-4 font-medium text-galaxy-navy">{a.division}</td>
                    <td className="py-1 pr-4 text-slate-600">{formatAssignmentDate(a.start_date)}</td>
                    <td className="py-1 text-slate-600">{a.end_date ? formatAssignmentDate(a.end_date) : "Ongoing"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </td>
        </tr>
      )}
    </Fragment>
  );
}
