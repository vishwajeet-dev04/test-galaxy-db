import { useState } from "react";
import { getAvatarUrl, getInitials } from "../utils/avatars";

const SIZE_CLASS = {
  xs: "h-7 w-7 text-[10px]",
  sm: "h-8 w-8 text-[11px]",
  md: "h-10 w-10 text-xs",
  lg: "h-14 w-14 text-sm",
  xl: "h-16 w-16 text-base",
} as const;

interface AvatarProps {
  name: string;
  size?: keyof typeof SIZE_CLASS;
  className?: string;
  ring?: boolean;
}

export function Avatar({ name, size = "md", className = "", ring = false }: AvatarProps) {
  const url = getAvatarUrl(name);
  const [failed, setFailed] = useState(false);
  const showImg = url && !failed;
  const initials = getInitials(name);

  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-200 font-semibold text-galaxy-navy ${SIZE_CLASS[size]} ${
        ring ? "ring-2 ring-white shadow-sm" : ""
      } ${className}`}
      title={name}
    >
      {showImg ? (
        <img
          src={url}
          alt={name}
          className="absolute inset-0 h-full w-full scale-[1.12] object-cover object-center"
          onError={() => setFailed(true)}
          loading="lazy"
        />
      ) : (
        <span aria-hidden>{initials}</span>
      )}
    </span>
  );
}
