import { useId, useState } from "react";
import { AlertCircle, ChevronDown, Download } from "lucide-react";
import { HELP_FAQ } from "../content/helpFaq";
import { SectionHeader } from "../components/SectionHeader";
import { authHeaders, useAuth } from "../context/AuthContext";
import { httpErrorMessage, isSessionExpiredStatus, notifySessionExpired } from "../utils/apiError";
import { ui } from "../theme";

export function HelpView() {
  const { token } = useAuth();
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const baseId = useId();

  const downloadManual = async () => {
    if (downloading || !token) return;
    setDownloading(true);
    setError(null);
    try {
      const res = await fetch("/api/help/manual", { headers: authHeaders(token) });
      if (!res.ok) {
        const raw = await res.text();
        if (isSessionExpiredStatus(res.status, raw)) notifySessionExpired();
        let json: unknown = null;
        try {
          json = raw ? JSON.parse(raw) : {};
        } catch (err) {
          console.error("help_manual_not_json", err);
        }
        throw new Error(httpErrorMessage(res.status, json, raw, "Could not download the user manual"));
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "Galaxy_Sales_Performance_User_Manual_v5.pdf";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not download the user manual");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className={`${ui.card} space-y-5 p-6`}>
        <SectionHeader
          label="User Manual"
          description="Download the Galaxy Performance Tracker user manual (PDF) to your computer."
        />
        <button
          type="button"
          onClick={() => void downloadManual()}
          disabled={downloading || !token}
          className={ui.btnPrimary}
        >
          <Download className="h-4 w-4" />
          {downloading ? "Downloading…" : "Download user manual"}
        </button>
        {error && (
          <p className="flex items-start gap-2 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-100">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            {error}
          </p>
        )}
      </div>

      <div className={`${ui.card} space-y-5 p-6`}>
        <SectionHeader
          label="FAQ"
          description="Answers from the user manual. Expand a question to read it."
        />
        {HELP_FAQ.length === 0 ? (
          <p className="text-sm text-galaxy-muted">No frequently asked questions are available yet.</p>
        ) : (
          <div className="space-y-6">
            {HELP_FAQ.map((section) => (
              <div key={section.title} className="space-y-2">
                <h3 className="text-sm font-semibold text-galaxy-navy">{section.title}</h3>
                <div className="divide-y divide-galaxy-border/60 overflow-hidden rounded-xl ring-1 ring-galaxy-border/70">
                  {section.items.map((item, index) => {
                    const key = `${section.title}-${index}`;
                    const open = openKey === key;
                    const panelId = `${baseId}-${index}-${section.title.replace(/\s+/g, "-")}`;
                    return (
                      <div key={key} className="bg-white">
                        <button
                          type="button"
                          aria-expanded={open}
                          aria-controls={panelId}
                          onClick={() => setOpenKey(open ? null : key)}
                          className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left text-sm font-medium text-galaxy-navy transition hover:bg-slate-50 focus:outline-none focus:ring-4 focus:ring-galaxy-navy/10"
                        >
                          <span>{item.question}</span>
                          <ChevronDown
                            className={`mt-0.5 h-4 w-4 shrink-0 text-galaxy-muted transition motion-reduce:transition-none ${open ? "rotate-180" : ""}`}
                          />
                        </button>
                        {open && (
                          <p id={panelId} className="px-4 pb-4 text-sm leading-relaxed text-galaxy-muted">
                            {item.answer}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
