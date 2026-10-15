import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import { isChunkLoadError } from "../utils/chunkReload";
import { ui } from "../theme";

interface Props {
  children: ReactNode;
  /** Which part of the UI this guards; goes into the console log. */
  area: string;
  /** Root boundary: nothing else is on screen, so centre the card on the page. */
  fullScreen?: boolean;
  /** Clears a caught error when it changes (e.g. the user navigates), without remounting healthy children. */
  resetKey?: string;
}

interface State {
  error: Error | null;
}

/** Without this, any render error unmounts the whole tree and leaves a blank page. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: unknown): State {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("ui_crash", { area: this.props.area, message: error.message, componentStack: info.componentStack });
  }

  componentDidUpdate(prevProps: Props): void {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  private retry = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const outdated = isChunkLoadError(error);
    const card = (
      <div role="alert" className={`${ui.card} mx-auto max-w-md space-y-4 p-6 text-center`}>
        <AlertCircle className="mx-auto h-8 w-8 text-galaxy-primary" aria-hidden />
        <div className="space-y-1.5">
          <p className="font-semibold text-galaxy-navy">
            {outdated ? "Galaxy has been updated" : "This page could not be shown"}
          </p>
          <p className="text-sm text-galaxy-muted">
            {outdated
              ? "Reload to get the latest version."
              : "Something went wrong while showing this page. Reload, or pick another page from the menu."}
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <button type="button" onClick={() => window.location.reload()} className={ui.btnPrimary}>
            <RefreshCw className="h-4 w-4" aria-hidden />
            Reload
          </button>
          {!outdated && !this.props.fullScreen && (
            <button type="button" onClick={this.retry} className={ui.btnGhost}>
              Try again
            </button>
          )}
        </div>
      </div>
    );

    return this.props.fullScreen ? (
      <div className="app-shell flex min-h-screen items-center justify-center p-4">{card}</div>
    ) : (
      card
    );
  }
}
