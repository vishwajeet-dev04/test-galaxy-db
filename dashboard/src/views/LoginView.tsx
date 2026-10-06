import { FormEvent, useState } from "react";
import { Eye, EyeOff, Lock, User } from "lucide-react";
import { useAuth } from "../context/AuthContext";

export function LoginView() {
  const { login, sessionNotice } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(username, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
      setShowPassword(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="app-shell flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="rounded-3xl border border-galaxy-border/80 bg-white p-8 shadow-[0_8px_40px_rgba(15,23,42,0.08)]">
          <div className="text-center">
            <img src="/galaxy-logo.webp" alt="Galaxy" className="mx-auto h-12 object-contain" />
            <p className="mt-4 text-[10px] font-bold uppercase tracking-[0.2em] text-galaxy-primary">
              Sales Intelligence
            </p>
            <h1 className="mt-1.5 text-xl font-semibold tracking-tight text-galaxy-navy">
              Galaxy Sales Performance Tracker
            </h1>
            <p className="mt-2 text-sm text-slate-500">Sign in to view your sales dashboard</p>
          </div>

          <form onSubmit={onSubmit} className="mt-8 space-y-4">
            {sessionNotice && !error && (
              <p
                role="status"
                className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800 ring-1 ring-amber-100"
              >
                {sessionNotice}
              </p>
            )}
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500">
                Username
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  required
                  className="w-full rounded-xl border border-galaxy-border bg-white py-2.5 pl-10 pr-4 text-sm text-galaxy-text shadow-sm placeholder:text-slate-400 focus:border-galaxy-navy/40 focus:outline-none focus:ring-4 focus:ring-galaxy-navy/10"
                  placeholder="e.g. richat"
                />
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                  className="w-full rounded-xl border border-galaxy-border bg-white py-2.5 pl-10 pr-11 text-sm text-galaxy-text shadow-sm placeholder:text-slate-400 focus:border-galaxy-navy/40 focus:outline-none focus:ring-4 focus:ring-galaxy-navy/10"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  aria-pressed={showPassword}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-galaxy-navy focus:outline-none focus:ring-4 focus:ring-galaxy-navy/10 motion-reduce:transition-none"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {error && (
              <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-galaxy-primary ring-1 ring-red-100">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-xl bg-galaxy-navy px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-galaxy-navy-dark disabled:opacity-60"
            >
              {busy ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
