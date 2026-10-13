import type { CrmStatus } from "../types";

type StatusKey = "booked" | "billed" | "received";

const LABELS: Record<StatusKey, string> = {
  booked: "A",
  billed: "B",
  received: "C",
};

const CRM_STATUS_TITLES: Record<StatusKey, string> = {
  booked: "Booked",
  billed: "Billed",
  received: "Received",
};

function getBallClass(key: StatusKey, value: boolean | string): string {
  if (key === "booked") {
    return value ? "bg-emerald-500" : "bg-slate-200";
  }
  if (value === "full") {
    return key === "billed" ? "bg-sky-500" : "bg-violet-500";
  }
  if (value === "partial") {
    return key === "billed" ? "bg-sky-300" : "bg-violet-300";
  }
  return "bg-slate-200";
}

function crmStateLabel(key: StatusKey, value: boolean | string): string {
  if (key === "booked") return value ? "Yes" : "Pending";
  if (value === "full") return "Full";
  if (value === "partial") return "Partial";
  return "Pending";
}

interface DealStatusIndicatorsProps {
  crm: CrmStatus;
  compact?: boolean;
}

export function DealStatusIndicators({ crm, compact }: DealStatusIndicatorsProps) {
  const items: { key: StatusKey; value: boolean | string }[] = [
    { key: "booked", value: crm.booked },
    { key: "billed", value: crm.billed },
    { key: "received", value: crm.received },
  ];

  return (
    <div className={`flex items-center ${compact ? "gap-1" : "gap-2"}`} title="CRM: Booked · Billed · Received">
      {items.map(({ key, value }) => (
        <span
          key={key}
          className="inline-flex items-center gap-1"
          title={`${CRM_STATUS_TITLES[key]}: ${crmStateLabel(key, value)}`}
        >
          <span className={`h-2.5 w-2.5 rounded-full ${getBallClass(key, value)} ring-1 ring-white`} />
          {!compact && <span className="text-[10px] font-semibold text-slate-500">{LABELS[key]}</span>}
        </span>
      ))}
    </div>
  );
}
