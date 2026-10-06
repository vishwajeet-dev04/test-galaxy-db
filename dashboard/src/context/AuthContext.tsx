import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  SESSION_EXPIRED_EVENT,
  apiFetch,
  httpErrorMessage,
  isSessionExpiredStatus,
} from "../utils/apiError";

export interface AuthUser {
  id: number;
  username: string;
  email: string;
  full_name: string;
  role: "ceo" | "admin" | "leader" | "tl" | "user" | string;
  employee_name: string | null;
  is_active?: boolean;
}

interface AuthState {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  /** Why the user was signed out without clicking Sign out (shown on the login page). */
  sessionNotice: string | null;
  isAdmin: boolean;
  isLeader: boolean;
  seesAll: boolean;
  /**
   * Leaders page and "Including Others" card are for leaders and above. IC and TL scopes
   * contain no BU Heads/leaders, so Including Others would just repeat IC Actuals.
   */
  canSeeLeaders: boolean;
}

const TOKEN_KEY = "galaxy_token";
const USER_KEY = "galaxy_user";
const SESSION_EXPIRED_NOTICE = "Your session expired. Please sign in again.";
/** setTimeout overflows above 2^31-1 ms (~24.8 days). */
const MAX_TIMER_MS = 2_147_483_647;

/** JWT `exp` in epoch ms, or null if the token cannot be read (then only a server 401 signs out). */
function tokenExpiryMs(token: string): number | null {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const payload = JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/")));
    return typeof payload.exp === "number" ? payload.exp * 1000 : null;
  } catch (err) {
    console.error("jwt_decode_failed", err);
    return null;
  }
}

const AuthContext = createContext<AuthState | null>(null);

async function apiLogin(username: string, password: string) {
  const { res, json, raw } = await apiFetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    throw new Error(httpErrorMessage(res.status, json, raw, "Login failed"));
  }
  return json as { access_token: string; user: AuthUser };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionNotice, setSessionNotice] = useState<string | null>(null);

  const clearSession = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setToken(null);
    setUser(null);
  }, []);

  const logout = useCallback(() => {
    setSessionNotice(null);
    clearSession();
  }, [clearSession]);

  const expireSession = useCallback(() => {
    if (!localStorage.getItem(TOKEN_KEY)) return;
    setSessionNotice(SESSION_EXPIRED_NOTICE);
    clearSession();
  }, [clearSession]);

  useEffect(() => {
    window.addEventListener(SESSION_EXPIRED_EVENT, expireSession);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, expireSession);
  }, [expireSession]);

  // Sign out at the token's own expiry instead of waiting for the next API call; the
  // focus/visibility checks cover laptops that slept past the timer.
  useEffect(() => {
    if (!token) return;
    const exp = tokenExpiryMs(token);
    if (exp == null) return;
    const check = () => {
      if (Date.now() >= exp) expireSession();
    };
    const timer = window.setTimeout(expireSession, Math.min(Math.max(0, exp - Date.now()), MAX_TIMER_MS));
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", check);
    };
  }, [token, expireSession]);

  useEffect(() => {
    const t = localStorage.getItem(TOKEN_KEY);
    if (!t) {
      localStorage.removeItem(USER_KEY);
      setLoading(false);
      return;
    }
    let cancelled = false;
    apiFetch("/api/auth/me", { headers: { Authorization: `Bearer ${t}` } })
      .then(({ res, json, raw }) => {
        if (cancelled) return;
        // HTML block pages are not JWT failures — keep the stored session.
        if (isSessionExpiredStatus(res.status, raw)) {
          expireSession();
          return;
        }
        if (res.ok && json && typeof json === "object") {
          const u = json as AuthUser;
          localStorage.setItem(USER_KEY, JSON.stringify(u));
          setToken(t);
          setUser(u);
          return;
        }
        const stored = localStorage.getItem(USER_KEY);
        if (stored) {
          try {
            setUser(JSON.parse(stored) as AuthUser);
            setToken(t);
            return;
          } catch (err) {
            console.error("galaxy_user_cache_invalid", err);
          }
        }
        setToken(t);
        setUser(null);
      })
      .catch(() => {
        if (cancelled) return;
        const stored = localStorage.getItem(USER_KEY);
        if (stored) {
          try {
            setUser(JSON.parse(stored) as AuthUser);
            setToken(t);
            return;
          } catch (err) {
            console.error("galaxy_user_cache_invalid", err);
          }
        }
        setToken(null);
        setUser(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [expireSession]);

  const login = useCallback(async (username: string, password: string) => {
    const data = await apiLogin(username.trim().toLowerCase(), password);
    localStorage.setItem(TOKEN_KEY, data.access_token);
    localStorage.setItem(USER_KEY, JSON.stringify(data.user));
    setSessionNotice(null);
    setToken(data.access_token);
    setUser(data.user);
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      user,
      token,
      loading,
      login,
      logout,
      sessionNotice,
      isAdmin: user?.role === "admin",
      isLeader: user?.role === "leader" || user?.role === "tl",
      seesAll: user?.role === "admin" || user?.role === "ceo",
      canSeeLeaders: !!user && user.role !== "user" && user.role !== "tl",
    }),
    [user, token, loading, login, logout, sessionNotice],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

function storedToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function authHeaders(token?: string | null): HeadersInit {
  const t = (token || storedToken() || "").trim();
  return t ? { Authorization: `Bearer ${t}` } : {};
}
