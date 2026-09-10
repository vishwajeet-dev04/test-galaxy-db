import { useCallback, useEffect, useState } from "react";
import type { QuotaData } from "../types";
import { authHeaders, useAuth } from "../context/AuthContext";
import { defaultDateRange, type DateRangeValue } from "../utils/fiscal";
import { apiDetail } from "../utils/apiError";

export function useQuotaData(dateRange?: DateRangeValue) {
  const { token, user, logout } = useAuth();
  const [data, setData] = useState<QuotaData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const refresh = useCallback(() => setReloadKey((k) => k + 1), []);
  const range = dateRange ?? defaultDateRange();

  useEffect(() => {
    if (!token || !user) {
      setData(null);
      setLoading(false);
      setRefreshing(false);
      return;
    }
    let cancelled = false;
    if (!data) setLoading(true);
    else setRefreshing(true);
    setError(null);
    const params = new URLSearchParams({ from: range.start, to: range.end });
    fetch(`/api/quota?${params.toString()}`, { headers: authHeaders(token) })
      .then(async (r) => {
        if (r.status === 401) {
          logout();
          throw new Error("Session expired — please sign in again");
        }
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          throw new Error(apiDetail(body, `Failed to load data (${r.status})`));
        }
        return r.json();
      })
      .then((json) => {
        if (!cancelled) {
          setData(json);
          setError(null);
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
          setRefreshing(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [token, user, reloadKey, logout, range.start, range.end]);

  return { data, loading, error, refresh, refreshing };
}
