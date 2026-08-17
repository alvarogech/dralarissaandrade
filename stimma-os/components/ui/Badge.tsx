import clsx from "clsx";

const VARIANT_CLASSES = {
  critical: "bg-critical-bg text-critical",
  important: "bg-important-bg text-important",
  opportunity: "bg-opportunity-bg text-opportunity",
  informative: "bg-informative-bg text-informative",
  neutral: "bg-surface-raised text-text-secondary",
} as const;

export function Badge({
  variant = "neutral",
  children,
}: {
  variant?: keyof typeof VARIANT_CLASSES;
  children: React.ReactNode;
}) {
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-sm px-2 py-0.5 text-xs font-medium",
        VARIANT_CLASSES[variant]
      )}
    >
      {children}
    </span>
  );
}
