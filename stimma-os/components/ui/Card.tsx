import clsx from "clsx";

export function Card({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={clsx(
        "rounded-md border border-border bg-surface-raised/60 p-5",
        className
      )}
    >
      {children}
    </div>
  );
}
