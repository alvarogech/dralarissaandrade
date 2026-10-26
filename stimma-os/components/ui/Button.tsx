import clsx from "clsx";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean;
  loadingText?: string;
  /** primario = bordô (ação principal da tela); secundario = contorno grafite; discreto = só texto. */
  variante?: "primario" | "secundario" | "discreto";
}

const VARIANTES = {
  primario: "bg-accent text-white hover:bg-accent-hover",
  secundario: "border border-border-strong bg-surface text-text-primary hover:bg-surface-hover",
  discreto: "text-text-secondary underline-offset-4 hover:text-text-primary hover:underline",
} as const;

export function Button({ loading, loadingText = "Entrando…", variante = "primario", disabled, className, children, ...props }: ButtonProps) {
  return (
    <button
      className={clsx(
        "inline-flex min-h-10 items-center justify-center gap-2 rounded-control px-4 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-55",
        VARIANTES[variante],
        className
      )}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && <span aria-hidden className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-r-transparent" />}
      {loading ? loadingText : children}
    </button>
  );
}
