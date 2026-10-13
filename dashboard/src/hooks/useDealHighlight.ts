import { useEffect, useRef, useState } from "react";

const HIGHLIGHT_MS = 3000;

/**
 * Scroll to and briefly highlight the deal a user arrived for (`drill.deal`).
 * Rows are found by `data-deal` inside `containerRef`, so duplicate opportunity numbers need no per-row refs.
 */
export function useDealHighlight(dealId: string | undefined) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    if (!dealId) {
      setActive(null);
      return;
    }
    setActive(dealId);
    const row = containerRef.current?.querySelector<HTMLElement>(`[data-deal="${CSS.escape(dealId)}"]`);
    if (row) {
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      row.scrollIntoView({ block: "center", behavior: reduceMotion ? "auto" : "smooth" });
    }
    const timer = window.setTimeout(() => setActive(null), HIGHLIGHT_MS);
    return () => window.clearTimeout(timer);
  }, [dealId]);

  return {
    containerRef,
    isHighlighted: (opportunityNumber: string | null | undefined) =>
      Boolean(active && opportunityNumber && opportunityNumber === active),
  };
}
