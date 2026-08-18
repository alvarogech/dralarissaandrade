import clsx from "clsx";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean;
  loadingText?: string;
}

export function Button({ loading, loadingText = "Entrando…", disabled, className, children, ...props }: ButtonProps) {
  return (
    <button
      className={clsx(
        "inline-flex items-center justify-center rounded-sm bg-accent px-4 py-2 text-sm font-medium text-surface transition-opacity disabled:opacity-60",
        className
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? loadingText : children}
    </button>
  );
}
