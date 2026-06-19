import type { ReactNode } from "react";

export function Empty({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="panel p-10 text-center">
      <div className="mono text-sm font-bold uppercase tracking-wider text-muted-foreground">{title}</div>
      {hint && <div className="text-xs text-muted-foreground mt-2">{hint}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}