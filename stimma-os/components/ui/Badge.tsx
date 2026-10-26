import clsx from "clsx";

const VARIANT_CLASSES = {
  critical: "border-transparent bg-critical-bg text-critical",
  important: "border-transparent bg-important-bg text-important",
  opportunity: "border-transparent bg-opportunity-bg text-opportunity",
  informative: "border-transparent bg-informative-bg text-informative",
  neutral: "border-border bg-surface-raised text-text-secondary",
} as const;

/** Etiqueta de estado: sempre com texto (o estado nunca depende só da cor). */
export function Badge({
  variant = "neutral",
  children,
}: {
  variant?: keyof typeof VARIANT_CLASSES;
  children: React.ReactNode;
}) {
  return (
    <span className={clsx("inline-flex items-center rounded-sm border px-1.5 py-px text-[12px] font-medium leading-5", VARIANT_CLASSES[variant])}>
      {children}
    </span>
  );
}
