import { useCallback, useEffect, useState } from "react";
import type { QuotaData } from "../types";
import { authHeaders, useAuth } from "../context/AuthContext";
import { defaultDateRange, type DateRangeValue } from "../utils/fiscal";

export function useQuotaData(dateRange?: DateRangeValue) {
  const { token, user, logout } = useAuth();
  const [data, setData] = useState<QuotaData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const refresh = useCallback(() => setReloadKey((k) => k + 1), []);
  const range = dateRange ?? defaultDateRange();

  useEffect(() => {
    if (!token || !user) {
      setData(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    if (!data) setLoading(true);
    setError(null);
    const params = new URLSearchParams({ from: range.start, to: range.end });
    fetch(`/api/quota?${params.toString()}`, { headers: authHeaders(token) })
      .then(async (r) => {
        if (r.status === 401) {
          // Token is expired — clear auth state so App.tsx redirects to LoginView
          logout();
          throw new Error("Session expired — please sign in again");
        }
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          throw new Error(body.detail || `Failed to load data (${r.status})`);
        }
        return r.json();
      })
      .then((json) => {
        if (!cancelled) setData(json);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, user, reloadKey, logout, range.start, range.end]);

  return { data, loading, error, refresh };
}
