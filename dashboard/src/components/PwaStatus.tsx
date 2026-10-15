import { useState } from "react";
import { RefreshCw, WifiOff, X } from "lucide-react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { useOnlineStatus } from "../hooks/useOnlineStatus";
import { ui } from "../theme";

/** Installed tabs can stay open for days; look for a new deploy this often. */
const UPDATE_CHECK_MS = 60 * 60 * 1000;

/**
 * App-wide PWA notices: "new version" prompt and offline banner.
 * Mounted outside the auth gate so both also show on the login screen.
 * Browsers only register the service worker on HTTPS or localhost; on plain HTTP this renders
 * the offline banner only.
 */
export function PwaStatus() {
  const online = useOnlineStatus();
  const [updating, setUpdating] = useState(false);
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(swUrl, registration) {
      if (!registration) return;
      window.setInterval(() => {
        registration.update().catch((err: unknown) => {
          console.warn("pwa_update_check_failed", { swUrl, err });
        });
      }, UPDATE_CHECK_MS);
    },
    onRegisterError(err: unknown) {
      console.error("pwa_register_failed", err);
    },
  });

  const reload = () => {
    setUpdating(true);
    updateServiceWorker(true).catch((err: unknown) => {
      console.error("pwa_update_failed", err);
      setUpdating(false);
    });
  };

  if (online && !needRefresh) return null;

  return (
    <div className="pointer-events-none fixed inset-x-4 bottom-4 z-50 flex flex-col gap-2 sm:left-auto sm:w-96">
      {!online && (
        <div
          role="status"
          className="pointer-events-auto flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 shadow-lg transition duration-200 starting:translate-y-2 starting:opacity-0 motion-reduce:transition-none"
        >
          <WifiOff className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p>
            <span className="font-semibold">You're offline.</span> Numbers load from the server, so they will
            refresh when you reconnect.
          </p>
        </div>
      )}
      {needRefresh && (
        <div
          role="status"
          className={`${ui.card} pointer-events-auto flex items-center gap-3 px-4 py-3 shadow-lg transition duration-200 starting:translate-y-2 starting:opacity-0 motion-reduce:transition-none`}
        >
          <RefreshCw className="h-4 w-4 shrink-0 text-galaxy-navy" aria-hidden />
          <p className="min-w-0 flex-1 text-sm text-galaxy-text">A new version of Galaxy is available.</p>
          <button type="button" onClick={reload} disabled={updating} className={ui.btnPrimary}>
            {updating ? "Updating…" : "Reload"}
          </button>
          <button
            type="button"
            onClick={() => setNeedRefresh(false)}
            disabled={updating}
            className={ui.btnGhost}
            aria-label="Remind me later"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      )}
    </div>
  );
}
