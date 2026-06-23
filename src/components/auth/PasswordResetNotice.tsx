import { Info } from "lucide-react";
import { getActiveResetNotification } from "@/lib/passwordRecovery";

type Props = {
  email: string | undefined;
};

export function PasswordResetNotice({ email }: Props) {
  if (!email) return null;

  const record = getActiveResetNotification(email);
  if (!record) return null;

  return (
    <div
      role="status"
      className="mb-3 rounded-sm border border-primary/25 bg-primary/5 px-3 py-2.5 flex items-start gap-2.5"
    >
      <Info className="h-4 w-4 text-primary shrink-0 mt-0.5" />
      <div className="min-w-0">
        <p className="mono text-[9px] font-bold uppercase tracking-wider text-primary">Notice</p>
        <p className="mono text-[10px] text-foreground leading-snug mt-0.5">
          Your password was reset on{" "}
          <span className="font-semibold">{record.displayLine}</span>.
        </p>
      </div>
    </div>
  );
}
