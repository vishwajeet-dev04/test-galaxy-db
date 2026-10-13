/** Shared UI class tokens — Performance Tracker design system */

export const ui = {
  pageTitle: "text-2xl font-semibold tracking-tight text-galaxy-navy",
  pageSub: "mt-1.5 text-sm leading-relaxed text-galaxy-muted",
  card: "rounded-2xl border border-galaxy-border/80 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.04),0_4px_12px_rgba(15,23,42,0.03)]",
  cardHover: "transition hover:border-galaxy-navy/20 hover:shadow-[0_4px_16px_rgba(15,23,42,0.06)]",
  cardInner: "rounded-xl bg-slate-50/80 ring-1 ring-inset ring-galaxy-border/50",
  input:
    "w-full rounded-xl border border-galaxy-border bg-white py-2.5 pl-10 pr-4 text-sm text-galaxy-text shadow-sm placeholder:text-slate-400 focus:border-galaxy-navy/40 focus:outline-none focus:ring-4 focus:ring-galaxy-navy/10",
  field:
    "w-full rounded-xl border border-galaxy-border bg-white px-4 py-2.5 text-sm text-galaxy-text shadow-sm placeholder:text-slate-400 focus:border-galaxy-navy/40 focus:outline-none focus:ring-4 focus:ring-galaxy-navy/10 disabled:cursor-not-allowed disabled:opacity-50",
  select:
    "rounded-xl border border-galaxy-border bg-white px-4 py-2.5 text-sm text-galaxy-text shadow-sm focus:border-galaxy-navy/40 focus:outline-none focus:ring-4 focus:ring-galaxy-navy/10 disabled:cursor-not-allowed disabled:opacity-50",
  btnPrimary:
    "inline-flex items-center justify-center gap-2 rounded-xl bg-galaxy-navy px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-galaxy-navy-dark focus:outline-none focus:ring-4 focus:ring-galaxy-navy/10 disabled:cursor-not-allowed disabled:opacity-50",
  tableWrap:
    "overflow-hidden rounded-2xl border border-galaxy-border/80 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.04),0_4px_12px_rgba(15,23,42,0.03)]",
  tableHead:
    "border-b border-galaxy-border bg-slate-50/90 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500",
  tableRow: "cursor-pointer border-b border-galaxy-border/60 transition hover:bg-slate-50/80",
  tableRowSelected: "bg-galaxy-navy/[0.04]",
  badge: "rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600",
  link: "text-sm font-medium text-galaxy-blue transition hover:text-galaxy-navy",
  btnGhost: "inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-galaxy-navy focus:outline-none focus:ring-4 focus:ring-galaxy-navy/10 disabled:cursor-not-allowed disabled:opacity-50",
  btnActive: "font-medium text-galaxy-navy",
  /** Secondary button on a dark gradient (e.g. the Leaders banner). */
  btnOnDark:
    "inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-xs font-semibold text-white ring-1 ring-white/20 transition hover:bg-white/25 focus:outline-none focus:ring-4 focus:ring-white/30 disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none",
  pill: "inline-flex items-center rounded-full bg-galaxy-navy/8 px-2.5 py-0.5 text-[11px] font-semibold text-galaxy-navy",
};

export const VIEW_META: Record<
  string,
  { title: string; subtitle: string }
> = {
  overview: { title: "Executive Overview", subtitle: "Quota, pipeline & attainment at a glance" },
  divisions: { title: "RTMs", subtitle: "RTM performance · Actual / Quota · attainment" },
  bu: { title: "Business Units", subtitle: "Service-level quota & pipeline" },
  employees: { title: "Employees", subtitle: "Individual quota & closed accounts" },
  leaders: { title: "Leaders Dashboard – Bottomline", subtitle: "Cumulative team bottomline & attainment" },
  leaderboard: { title: "Leaderboard", subtitle: "Ranked sales performance" },
  accounts: { title: "Accounts", subtitle: "Customer closed value · BU mix · quota contribution" },
  brands: { title: "Brands", subtitle: "OEM / brand closed value · BU mix · quota contribution" },
  help: { title: "Help", subtitle: "User manual download and frequently asked questions" },
  admin: { title: "Admin", subtitle: "Users, Vtiger sync, and quota targets" },
};
