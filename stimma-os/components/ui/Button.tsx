import clsx from "clsx";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean;
}

export function Button({ loading, disabled, className, children, ...props }: ButtonProps) {
  return (
    <button
      className={clsx(
        "inline-flex items-center justify-center rounded-sm bg-accent px-4 py-2 text-sm font-medium text-surface transition-opacity disabled:opacity-60",
        className
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? "Entrando…" : children}
    </button>
  );
}
