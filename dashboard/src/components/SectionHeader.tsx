interface SectionHeaderProps {
  label: string;
  description?: string;
  action?: { label: string; onClick: () => void };
  rightContent?: React.ReactNode;
}

export function SectionHeader({ label, description, action, rightContent }: SectionHeaderProps) {
  return (
    <div className="flex items-end justify-between gap-4">
      <div>
        <h2 className="text-sm font-bold uppercase tracking-[0.12em] text-galaxy-navy">{label}</h2>
        {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
      </div>
      {(action || rightContent) ? (
        <div className="flex items-center gap-3">
          {rightContent}
          {action && (
            <button
              onClick={action.onClick}
              className="shrink-0 text-xs font-semibold text-galaxy-blue transition hover:text-galaxy-navy"
            >
              {action.label} →
            </button>
          )}
        </div>
      ) : (
        <div className="hidden h-px flex-1 bg-gradient-to-r from-galaxy-border to-transparent sm:block" />
      )}
    </div>
  );
}
