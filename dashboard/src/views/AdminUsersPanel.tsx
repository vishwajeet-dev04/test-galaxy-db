import { FormEvent, useCallback, useEffect, useState } from "react";
import { AlertCircle, Pencil, Plus, Search, UserPlus, X } from "lucide-react";
import { authHeaders, useAuth } from "../context/AuthContext";
import { SectionHeader } from "../components/SectionHeader";
import { ui } from "../theme";

const ROLES = ["admin", "ceo", "leader", "tl", "user"] as const;

interface AdminUser {
  id: number;
  username: string;
  email: string;
  full_name: string;
  role: string;
  employee_name: string | null;
  is_active: boolean;
}

interface UserListResponse {
  items: AdminUser[];
  total: number;
  page: number;
  page_size: number;
}

interface FormState {
  username: string;
  email: string;
  full_name: string;
  role: string;
  employee_name: string;
  is_active: boolean;
  password: string;
  confirm: string;
}

interface FieldErrors {
  username?: string;
  email?: string;
  full_name?: string;
  role?: string;
  password?: string;
  confirm?: string;
}

const emptyForm = (): FormState => ({
  username: "",
  email: "",
  full_name: "",
  role: "user",
  employee_name: "",
  is_active: true,
  password: "",
  confirm: "",
});

function fromUser(u: AdminUser): FormState {
  return {
    username: u.username,
    email: u.email,
    full_name: u.full_name,
    role: u.role,
    employee_name: u.employee_name ?? "",
    is_active: u.is_active,
    password: "",
    confirm: "",
  };
}

function apiDetail(body: unknown): string {
  if (body && typeof body === "object" && "detail" in body) {
    const d = (body as { detail: unknown }).detail;
    if (typeof d === "string") return d;
    if (Array.isArray(d) && d[0] && typeof d[0] === "object" && d[0] && "msg" in d[0]) {
      return String((d[0] as { msg: string }).msg);
    }
  }
  return "Request failed";
}

function validate(form: FormState, isCreate: boolean): FieldErrors {
  const errors: FieldErrors = {};
  if (isCreate) {
    if (!/^[a-z][a-z0-9._-]{1,62}$/.test(form.username.trim().toLowerCase())) {
      errors.username = "Start with a letter; lowercase letters, digits, . _ -";
    }
  }
  if (!form.full_name.trim()) errors.full_name = "Full name is required";
  if (!form.email.trim() || !form.email.includes("@")) errors.email = "A valid email is required";
  if (!ROLES.includes(form.role as (typeof ROLES)[number])) errors.role = "Pick a role";
  if (isCreate || form.password) {
    if (form.password.length < 8) errors.password = "At least 8 characters";
    if (form.password !== form.confirm) errors.confirm = "Passwords do not match";
  }
  return errors;
}

export function AdminUsersPanel() {
  const { token, user: me } = useAuth();
  const [items, setItems] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [q, setQ] = useState("");
  const [appliedQ, setAppliedQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [banner, setBanner] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        page_size: String(pageSize),
      });
      if (appliedQ) params.set("q", appliedQ);
      const res = await fetch(`/api/admin/users?${params}`, { headers: authHeaders(token) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(apiDetail(body));
      const data = body as UserListResponse;
      setItems(data.items || []);
      setTotal(data.total ?? 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load users");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [token, page, pageSize, appliedQ]);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setFieldErrors({});
    setBanner(null);
    setFormOpen(true);
  };

  const openEdit = (u: AdminUser) => {
    setEditing(u);
    setForm(fromUser(u));
    setFieldErrors({});
    setBanner(null);
    setFormOpen(true);
  };

  const closeForm = () => {
    if (saving) return;
    setFormOpen(false);
    setEditing(null);
    setFieldErrors({});
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (saving || !token) return;
    const isCreate = editing == null;
    const errors = validate(form, isCreate);
    setFieldErrors(errors);
    if (Object.keys(errors).length) return;

    setSaving(true);
    setBanner(null);
    try {
      if (isCreate) {
        const res = await fetch("/api/admin/users", {
          method: "POST",
          headers: { ...authHeaders(token), "Content-Type": "application/json" },
          body: JSON.stringify({
            username: form.username.trim().toLowerCase(),
            email: form.email.trim(),
            full_name: form.full_name.trim(),
            role: form.role,
            password: form.password,
            employee_name: form.employee_name.trim() || null,
          }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(apiDetail(body));
        setBanner("User created");
      } else {
        const payload: Record<string, unknown> = {
          email: form.email.trim(),
          full_name: form.full_name.trim(),
          role: form.role,
          employee_name: form.employee_name.trim(),
          is_active: form.is_active,
        };
        if (form.password) payload.password = form.password;
        const res = await fetch(`/api/admin/users/${editing.id}`, {
          method: "PATCH",
          headers: { ...authHeaders(token), "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(apiDetail(body));
        setBanner(form.password ? "User updated and password changed" : "User updated");
      }
      setFormOpen(false);
      setEditing(null);
      await load();
    } catch (err) {
      setBanner(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const isCreate = editing == null;

  return (
    <div className={`${ui.card} space-y-5 p-6`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SectionHeader
          label="Users"
          description="Create logins, set roles, and change passwords. Employee name must match the quota roster for IC scoping."
        />
        <button type="button" onClick={openCreate} className={ui.btnPrimary}>
          <Plus className="h-4 w-4" />
          Add user
        </button>
      </div>

      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          setPage(1);
          setAppliedQ(q.trim());
        }}
      >
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">Search users</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-galaxy-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, username, email"
            className={ui.input}
          />
        </label>
        <button type="submit" className={`${ui.btnPrimary} sm:w-auto`}>
          Search
        </button>
      </form>

      {banner && !formOpen && (
        <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800 ring-1 ring-emerald-100">{banner}</p>
      )}

      {loading && <p className="text-sm text-galaxy-muted">Loading users…</p>}
      {error && !loading && (
        <p className="flex items-start gap-2 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-100">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </p>
      )}
      {!loading && !error && items.length === 0 && (
        <p className="text-sm text-galaxy-muted">No users match this search.</p>
      )}

      {!loading && !error && items.length > 0 && (
        <>
          <div className="hidden overflow-x-auto md:block">
            <table className="min-w-full text-sm">
              <thead className={ui.tableHead}>
                <tr>
                  <th className="px-3 py-2">Username</th>
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">Email</th>
                  <th className="px-3 py-2">Role</th>
                  <th className="px-3 py-2">Employee name</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2 text-right"> </th>
                </tr>
              </thead>
              <tbody>
                {items.map((u) => (
                  <tr key={u.id} className="border-b border-galaxy-border/60">
                    <td className="px-3 py-2 font-medium text-galaxy-navy">{u.username}</td>
                    <td className="px-3 py-2">{u.full_name}</td>
                    <td className="px-3 py-2 text-galaxy-muted">{u.email}</td>
                    <td className="px-3 py-2">
                      <span className={ui.badge}>{u.role}</span>
                    </td>
                    <td className="px-3 py-2 text-galaxy-muted">{u.employee_name || "—"}</td>
                    <td className="px-3 py-2">{u.is_active ? "Active" : "Inactive"}</td>
                    <td className="px-3 py-2 text-right">
                      <button type="button" onClick={() => openEdit(u)} className={ui.btnGhost}>
                        <Pencil className="h-4 w-4" />
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="space-y-3 md:hidden">
            {items.map((u) => (
              <div key={u.id} className={`${ui.cardInner} p-4`}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-galaxy-navy">{u.full_name}</p>
                    <p className="text-xs text-galaxy-muted">{u.username}</p>
                  </div>
                  <span className={ui.badge}>{u.role}</span>
                </div>
                <p className="mt-2 text-sm text-galaxy-muted">{u.email}</p>
                <p className="mt-1 text-xs text-galaxy-muted">{u.employee_name || "No roster name"} · {u.is_active ? "Active" : "Inactive"}</p>
                <button type="button" onClick={() => openEdit(u)} className={`${ui.btnGhost} mt-2`}>
                  <Pencil className="h-4 w-4" />
                  Edit
                </button>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between text-sm text-galaxy-muted">
            <span>
              {total} user{total === 1 ? "" : "s"} · page {page} of {pageCount}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                className={ui.btnGhost}
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </button>
              <button
                type="button"
                className={ui.btnGhost}
                disabled={page >= pageCount}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}

      {formOpen && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-galaxy-navy/20 p-0 sm:items-center sm:p-6">
          <form
            onSubmit={(e) => void onSubmit(e)}
            className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-6 shadow-lg sm:rounded-2xl"
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="flex items-center gap-2 font-semibold text-galaxy-navy">
                <UserPlus className="h-4 w-4" />
                {isCreate ? "Add user" : `Edit ${editing.username}`}
              </h3>
              <button type="button" onClick={closeForm} disabled={saving} className={ui.btnGhost} aria-label="Close">
                <X className="h-4 w-4" />
              </button>
            </div>

            {banner && formOpen && (
              <p className="mb-4 flex items-start gap-2 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-100">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                {banner}
              </p>
            )}

            <div className="space-y-3">
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-galaxy-navy">Username</span>
                <input
                  value={form.username}
                  onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                  disabled={!isCreate || saving}
                  autoComplete="off"
                  className={ui.field}
                />
                {fieldErrors.username && <span className="mt-1 block text-xs text-red-600">{fieldErrors.username}</span>}
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-galaxy-navy">Full name</span>
                <input
                  value={form.full_name}
                  onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
                  disabled={saving}
                  className={ui.field}
                />
                {fieldErrors.full_name && <span className="mt-1 block text-xs text-red-600">{fieldErrors.full_name}</span>}
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-galaxy-navy">Email</span>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  disabled={saving}
                  className={ui.field}
                />
                {fieldErrors.email && <span className="mt-1 block text-xs text-red-600">{fieldErrors.email}</span>}
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-galaxy-navy">Role</span>
                <select
                  value={form.role}
                  onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                  disabled={saving || (!isCreate && editing?.id === me?.id)}
                  className={`${ui.select} w-full`}
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
                {fieldErrors.role && <span className="mt-1 block text-xs text-red-600">{fieldErrors.role}</span>}
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-galaxy-navy">Employee name (roster)</span>
                <input
                  value={form.employee_name}
                  onChange={(e) => setForm((f) => ({ ...f, employee_name: e.target.value }))}
                  disabled={saving}
                  placeholder="e.g. Richa Tiwari"
                  className={ui.field}
                />
              </label>
              {!isCreate && (
                <label className="flex items-center gap-2 text-sm text-galaxy-navy">
                  <input
                    type="checkbox"
                    checked={form.is_active}
                    disabled={saving || editing?.id === me?.id}
                    onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
                    className="h-4 w-4 rounded border-galaxy-border text-galaxy-navy focus:ring-galaxy-navy/30"
                  />
                  Active (can sign in)
                </label>
              )}
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-galaxy-navy">
                  {isCreate ? "Password" : "New password (leave blank to keep)"}
                </span>
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  disabled={saving}
                  autoComplete="new-password"
                  className={ui.field}
                />
                {fieldErrors.password && <span className="mt-1 block text-xs text-red-600">{fieldErrors.password}</span>}
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-galaxy-navy">Confirm password</span>
                <input
                  type="password"
                  value={form.confirm}
                  onChange={(e) => setForm((f) => ({ ...f, confirm: e.target.value }))}
                  disabled={saving}
                  autoComplete="new-password"
                  className={ui.field}
                />
                {fieldErrors.confirm && <span className="mt-1 block text-xs text-red-600">{fieldErrors.confirm}</span>}
              </label>
            </div>

            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" onClick={closeForm} disabled={saving} className={ui.btnGhost}>
                Cancel
              </button>
              <button type="submit" disabled={saving} className={ui.btnPrimary}>
                {saving ? "Saving…" : isCreate ? "Create user" : "Save changes"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
