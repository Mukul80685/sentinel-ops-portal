import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const HEADER_GRADIENT =
  "linear-gradient(160deg, oklch(0.96 0.018 145) 0%, oklch(0.90 0.026 145) 55%, oklch(0.88 0.028 145) 100%)";

export function SidebarModalContent({
  className,
  children,
  ...props
}: React.ComponentPropsWithoutRef<typeof DialogContent>) {
  return (
    <DialogContent
      className={cn(
        "gap-0 overflow-hidden border-border/80 p-0 shadow-xl sm:rounded-lg",
        className,
      )}
      {...props}
    >
      {children}
    </DialogContent>
  );
}

export function SidebarModalHeader({
  icon: Icon,
  title,
  subtitle,
  accent = "primary",
}: {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  accent?: "primary" | "amber";
}) {
  const iconWrap =
    accent === "amber"
      ? "surface-primary border-amber-600/40"
      : "surface-primary border-primary/35";

  return (
    <DialogHeader className="relative overflow-hidden border-b border-border px-5 py-4 text-left space-y-0">
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: HEADER_GRADIENT }}
      />
      <div className="relative flex items-center gap-3">
        <div
          className={cn(
            "grid h-10 w-10 shrink-0 place-items-center rounded-md border shadow-sm",
            iconWrap,
          )}
        >
          <Icon className="h-4 w-4 text-primary-foreground" />
        </div>
        <div className="min-w-0">
          <DialogTitle className="mono text-sm font-bold uppercase tracking-wider text-foreground">
            {title}
          </DialogTitle>
          {subtitle ? (
            <p className="mono mt-0.5 text-[10px] leading-snug text-muted-foreground">{subtitle}</p>
          ) : null}
        </div>
      </div>
    </DialogHeader>
  );
}

export function SidebarModalBody({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "max-h-[72vh] overflow-y-auto bg-gradient-to-b from-card/50 to-background px-5 py-4",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function SidebarModalSection({
  title,
  icon: Icon,
  children,
  className,
  bodyClassName,
}: {
  title?: string;
  icon?: LucideIcon;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn("panel overflow-hidden shadow-sm", className)}>
      {title ? (
        <div className="surface-secondary flex items-center gap-2 border-b border-primary/20 px-3 py-2.5">
          {Icon ? <Icon className="h-3.5 w-3.5 shrink-0 text-primary-foreground" /> : null}
          <h3 className="mono text-[10px] font-semibold uppercase tracking-wider text-primary-foreground">
            {title}
          </h3>
        </div>
      ) : null}
      <div className={cn("p-3", bodyClassName)}>{children}</div>
    </section>
  );
}

export function SidebarModalField({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="mono text-[10px] font-semibold uppercase tracking-wider text-foreground/85">
        {label}
      </label>
      {children}
      {hint ? (
        <p className="mono text-[9px] leading-snug text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

export function SidebarModalReadOnly({
  value,
  mono = true,
}: {
  value: string;
  mono?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-sm border border-border/80 bg-muted/25 px-3 py-2 text-[11px] text-foreground/80",
        mono && "mono",
      )}
    >
      {value}
    </div>
  );
}
