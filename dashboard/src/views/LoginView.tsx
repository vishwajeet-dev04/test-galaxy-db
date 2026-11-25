import { FormEvent, useEffect, useState } from "react";
import { ArrowLeft, Eye, EyeOff, Lock, Mail } from "lucide-react";
import { useAuth, type AuthUser } from "../context/AuthContext";
import { apiFetch, httpErrorMessage } from "../utils/apiError";
import { ui } from "../theme";

type Step = "email" | "password" | "sent";

/** React Strict Mode remounts effects once in dev — only consume each token once. */
const magicTokensInFlight = new Set<string>();

export function LoginView() {
  const { login, applySession, sessionNotice } = useAuth();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [consuming, setConsuming] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("magic_token");
    if (!token || magicTokensInFlight.has(token)) return;
    magicTokensInFlight.add(token);
    // Drop token from the URL before the request so a remount cannot fire again.
    window.history.replaceState({}, "", window.location.pathname);

    setConsuming(true);
    setError(null);
    (async () => {
      try {
        const { res, json, raw } = await apiFetch("/api/auth/magic-link/consume", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        if (!res.ok) throw new Error(httpErrorMessage(res.status, json, raw, "Sign-in link failed"));
        const data = json as { access_token: string; user: AuthUser };
        applySession(data.access_token, data.user);
      } catch (err) {
        magicTokensInFlight.delete(token);
        setError(err instanceof Error ? err.message : "Sign-in link failed");
      } finally {
        setConsuming(false);
      }
    })();
  }, [applySession]);

  const onEmailContinue = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const { res, json, raw } = await apiFetch("/api/auth/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      if (!res.ok) throw new Error(httpErrorMessage(res.status, json, raw, "No account for this email"));
      const data = json as { requires_password: boolean };
      if (data.requires_password) {
        setStep("password");
        return;
      }
      const magic = await apiFetch("/api/auth/magic-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      if (!magic.res.ok) {
        throw new Error(httpErrorMessage(magic.res.status, magic.json, magic.raw, "Could not send sign-in link"));
      }
      setStep("sent");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lookup failed");
    } finally {
      setBusy(false);
    }
  };

  const onAdminLogin = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(email.trim().toLowerCase(), password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
      setShowPassword(false);
    } finally {
      setBusy(false);
    }
  };

  if (consuming) {
    return (
      <div className="app-shell flex min-h-screen items-center justify-center p-4 sm:p-6">
        <p className="text-sm text-galaxy-muted">Signing you in…</p>
      </div>
    );
  }

  return (
    <div className="app-shell flex min-h-screen items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-md">
        <div className="rounded-3xl border border-galaxy-border/80 bg-white p-5 shadow-[0_8px_40px_rgba(15,23,42,0.08)] sm:p-8">
          <div className="text-center">
            <img src="/galaxy-logo.webp" alt="Galaxy" className="mx-auto h-12 object-contain" />
            <p className="mt-4 text-[10px] font-bold uppercase tracking-[0.2em] text-galaxy-primary">
              Sales Intelligence
            </p>
            <h1 className="mt-1.5 text-xl font-semibold tracking-tight text-galaxy-navy">
              Galaxy Sales Performance Tracker
            </h1>
            <p className="mt-2 text-sm text-slate-500">
              {step === "sent"
                ? "Check your email"
                : step === "password"
                  ? "Enter your admin password"
                  : "Sign in with your work email"}
            </p>
          </div>

          {sessionNotice && !error && (
            <p
              role="status"
              className="mt-6 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800 ring-1 ring-amber-100"
            >
              {sessionNotice}
            </p>
          )}

          {error && (
            <p className="mt-6 rounded-xl bg-red-50 px-3 py-2 text-sm text-galaxy-primary ring-1 ring-red-100">
              {error}
            </p>
          )}

          {step === "email" && (
            <form onSubmit={(e) => void onEmailContinue(e)} className="mt-8 space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Email
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    required
                    className="w-full rounded-xl border border-galaxy-border bg-white py-2.5 pl-10 pr-4 text-sm text-galaxy-text shadow-sm placeholder:text-slate-400 focus:border-galaxy-navy/40 focus:outline-none focus:ring-4 focus:ring-galaxy-navy/10"
                    placeholder="you@goapl.com"
                  />
                </div>
              </div>
              <button type="submit" disabled={busy || !email.trim()} className={`${ui.btnPrimary} w-full min-h-11`}>
                {busy ? "Checking…" : "Continue"}
              </button>
            </form>
          )}

          {step === "password" && (
            <form onSubmit={(e) => void onAdminLogin(e)} className="mt-8 space-y-4">
              <p className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-galaxy-navy ring-1 ring-slate-100">
                {email}
              </p>
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
              <button type="submit" disabled={busy} className={`${ui.btnPrimary} w-full min-h-11`}>
                {busy ? "Signing in…" : "Sign in"}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setStep("email");
                  setPassword("");
                  setError(null);
                }}
                className={`${ui.btnGhost} w-full justify-center min-h-10`}
              >
                <ArrowLeft className="h-4 w-4" />
                Use a different email
              </button>
            </form>
          )}

          {step === "sent" && (
            <div className="mt-8 space-y-4">
              <p className="rounded-xl bg-emerald-50 px-3 py-3 text-sm text-emerald-800 ring-1 ring-emerald-100">
                If <span className="font-semibold">{email}</span> is registered, we sent a sign-in link. It expires in
                15 minutes and can be used once.
              </p>
              <p className="text-xs text-galaxy-muted">
                Local testing without SMTP: open the backend log for the magic link URL.
              </p>
              <button
                type="button"
                onClick={() => {
                  setStep("email");
                  setError(null);
                }}
                className={`${ui.btnGhost} w-full justify-center min-h-10`}
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
