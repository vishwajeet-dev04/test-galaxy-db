import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { AuthProvider } from "./context/AuthContext";
import { PwaStatus } from "./components/PwaStatus";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { installChunkReload } from "./utils/chunkReload";
import { isNativeApp } from "./utils/apiBase";
import "./index.css";

installChunkReload();

const native = isNativeApp();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary area="app" fullScreen>
      <AuthProvider>
        <App />
      </AuthProvider>
    </ErrorBoundary>
    {!native && <PwaStatus />}
  </StrictMode>
);
