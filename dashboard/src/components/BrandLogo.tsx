import { useEffect, useMemo, useState } from "react";
import { getBrandInitials, getBrandLogoCandidates, brandAccent } from "../utils/brandLogos";

const SIZE = {
  sm: { box: "h-10 w-10", pad: "p-1.5", text: "text-[11px]", radius: "rounded-xl" },
  md: { box: "h-12 w-12", pad: "p-2", text: "text-sm", radius: "rounded-xl" },
  lg: { box: "h-[4.25rem] w-[4.25rem]", pad: "p-2.5", text: "text-base", radius: "rounded-2xl" },
  xl: { box: "h-20 w-20", pad: "p-3", text: "text-lg", radius: "rounded-2xl" },
} as const;

interface BrandLogoProps {
  brand: string;
  size?: keyof typeof SIZE;
  className?: string;
}

/** OEM / vendor logo tile — Logo.dev first when VITE_LOGO_DEV_TOKEN is set. */
export function BrandLogo({ brand, size = "md", className = "" }: BrandLogoProps) {
  const candidates = useMemo(() => getBrandLogoCandidates(brand), [brand]);
  const [idx, setIdx] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(candidates.length === 0);

  useEffect(() => {
    setIdx(0);
    setLoaded(false);
    setFailed(candidates.length === 0);
  }, [candidates]);

  const src = !failed && idx < candidates.length ? candidates[idx] : null;
  const initials = getBrandInitials(brand);
  const accent = brandAccent(brand);
  const s = SIZE[size];
  const showLogo = Boolean(src && loaded);
  const showMono = failed || !src;

  const advance = () => {
    setLoaded(false);
    setIdx((i) => {
      const next = i + 1;
      if (next >= candidates.length) {
        setFailed(true);
        return i;
      }
      return next;
    });
  };

  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden ${s.box} ${s.radius} ${
        showLogo ? s.pad : ""
      } ${
        showMono
          ? `${accent.bg} ring-1 ring-black/[0.04]`
          : "bg-white shadow-[inset_0_0_0_1px_rgba(15,23,42,0.08)]"
      } ${className}`}
      title={brand}
    >
      {src && !loaded && !failed && (
        <span className="absolute inset-0 animate-pulse bg-slate-100/90" aria-hidden />
      )}
      {src && (
        <img
          key={src}
          src={src}
          alt=""
          className={`relative z-[1] h-full w-full object-contain transition-opacity duration-200 ${
            loaded ? "opacity-100" : "opacity-0"
          }`}
          loading="lazy"
          decoding="async"
          referrerPolicy="origin"
          onLoad={() => setLoaded(true)}
          onError={advance}
        />
      )}
      {showMono && (
        <span className={`font-semibold tracking-tight ${s.text} ${accent.fg}`} aria-hidden>
          {initials}
        </span>
      )}
    </span>
  );
}
