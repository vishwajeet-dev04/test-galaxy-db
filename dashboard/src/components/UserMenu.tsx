import { useEffect, useRef, useState } from "react";
import { ChevronDown, LogOut } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { Avatar } from "./Avatar";

export function UserMenu() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  if (!user) return null;

  const avatarName = user.employee_name || user.full_name || user.username;
  const roleLabel = user.role === "ceo" ? "CEO" : user.role === "admin" ? "Admin" : "User";

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2.5 rounded-xl border border-galaxy-border/80 bg-white py-1.5 pl-1.5 pr-2.5 shadow-sm transition hover:border-galaxy-navy/25 hover:bg-slate-50"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <Avatar name={avatarName} size="sm" />
        <span className="hidden min-w-0 text-left sm:block">
          <span className="block max-w-[140px] truncate text-sm font-semibold text-galaxy-navy">
            {user.full_name}
          </span>
          <span className="block text-[11px] text-slate-500">@{user.username}</span>
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-xl border border-galaxy-border bg-white py-1 shadow-lg"
        >
          <div className="border-b border-galaxy-border/60 px-3 py-2.5">
            <p className="truncate text-sm font-semibold text-galaxy-navy">{user.full_name}</p>
            <p className="truncate text-xs text-slate-500">
              @{user.username} · {roleLabel}
            </p>
            {user.email && <p className="mt-0.5 truncate text-[11px] text-slate-400">{user.email}</p>}
          </div>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              logout();
            }}
            className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-medium text-galaxy-primary transition hover:bg-red-50"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
