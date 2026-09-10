import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { apiDetail } from "../utils/apiError";

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
  isAdmin: boolean;
  isLeader: boolean;
  seesAll: boolean;
}

const TOKEN_KEY = "galaxy_token";
const USER_KEY = "galaxy_user";

const AuthContext = createContext<AuthState | null>(null);

async function apiLogin(username: string, password: string) {
  const res = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(apiDetail(body, "Login failed"));
  }
  return res.json() as Promise<{ access_token: string; user: AuthUser }>;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setToken(null);
    setUser(null);
  }, []);

  useEffect(() => {
    const t = localStorage.getItem(TOKEN_KEY);
    if (!t) {
      localStorage.removeItem(USER_KEY);
      setLoading(false);
      return;
    }
    let cancelled = false;
    fetch("/api/auth/me", { headers: { Authorization: `Bearer ${t}` } })
      .then(async (r) => {
        if (!r.ok) throw new Error("session");
        return r.json() as Promise<AuthUser>;
      })
      .then((u) => {
        if (cancelled) return;
        localStorage.setItem(USER_KEY, JSON.stringify(u));
        setToken(t);
        setUser(u);
      })
      .catch(() => {
        if (cancelled) return;
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
        setToken(null);
        setUser(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const data = await apiLogin(username.trim().toLowerCase(), password);
    localStorage.setItem(TOKEN_KEY, data.access_token);
    localStorage.setItem(USER_KEY, JSON.stringify(data.user));
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
      isAdmin: user?.role === "admin",
      isLeader: user?.role === "leader" || user?.role === "tl",
      seesAll: user?.role === "admin" || user?.role === "ceo",
    }),
    [user, token, loading, login, logout],
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
