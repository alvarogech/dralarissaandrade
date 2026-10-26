import clsx from "clsx";

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={clsx(
        "min-h-10 w-full rounded-control border border-border-strong bg-surface px-3 py-2 text-sm text-text-primary outline-none transition-colors placeholder:text-text-muted hover:border-text-muted focus:border-accent focus:ring-2 focus:ring-accent-soft disabled:bg-surface-raised disabled:text-text-disabled",
        className
      )}
      {...props}
    />
  );
}
