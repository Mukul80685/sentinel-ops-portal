import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  recordPasswordReset,
  recoveryRequiresSecurityStep,
  verifyDualIdentity,
  verifySecurityAnswer,
  type PasswordResetRecord,
  type RecoveryUserProfile,
} from "@/lib/passwordRecovery";
import { KeyRound, ShieldCheck } from "lucide-react";

type Step = "identify" | "verify" | "reset" | "confirmed";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onReturnToLogin: () => void;
};

const GENERIC_CREDENTIALS_ERROR = "Invalid credentials.";

export function PasswordRecoveryDialog({ open, onOpenChange, onReturnToLogin }: Props) {
  const [step, setStep] = useState<Step>("identify");
  const [userId, setUserId] = useState("");
  const [serviceNumber, setServiceNumber] = useState("");
  const [verifiedProfile, setVerifiedProfile] = useState<RecoveryUserProfile | null>(null);
  const [securityAnswer, setSecurityAnswer] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [resetRecord, setResetRecord] = useState<PasswordResetRecord | null>(null);

  function resetFlow() {
    setStep("identify");
    setUserId("");
    setServiceNumber("");
    setVerifiedProfile(null);
    setSecurityAnswer("");
    setNewPassword("");
    setConfirmPassword("");
    setError("");
    setResetRecord(null);
  }

  useEffect(() => {
    if (open) resetFlow();
  }, [open]);

  function handleClose(next: boolean) {
    if (!next) {
      resetFlow();
      onOpenChange(false);
    }
  }

  function handleLookup(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const profile = verifyDualIdentity(userId, serviceNumber);
    if (!profile) {
      setError(GENERIC_CREDENTIALS_ERROR);
      return;
    }
    setVerifiedProfile(profile);
    setStep(recoveryRequiresSecurityStep(profile) ? "verify" : "reset");
  }

  function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!verifiedProfile || !verifySecurityAnswer(verifiedProfile.userId, securityAnswer)) {
      setError(GENERIC_CREDENTIALS_ERROR);
      return;
    }
    setStep("reset");
  }

  function handleReset(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!verifiedProfile) return;
    if (!newPassword.trim()) {
      setError("New password is required.");
      return;
    }
    if (!confirmPassword.trim()) {
      setError("Please confirm your new password.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (newPassword.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    const record = recordPasswordReset(verifiedProfile, newPassword);
    setResetRecord(record);
    setStep("confirmed");
  }

  function handleReturnToLogin() {
    resetFlow();
    onOpenChange(false);
    onReturnToLogin();
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        className="max-w-md border-border bg-card p-0 gap-0 overflow-hidden"
        data-testid="password-recovery-dialog"
      >
        <div className="px-5 pt-5 pb-3 border-b border-border bg-secondary/15">
          <DialogHeader className="text-left space-y-1">
            <DialogTitle className="mono text-sm font-bold uppercase tracking-wide flex items-center gap-2">
              {step === "confirmed" ? (
                <>
                  <ShieldCheck className="h-4 w-4 text-emerald-600" />
                  Password Successfully Reset
                </>
              ) : (
                <>
                  <KeyRound className="h-4 w-4 text-primary" />
                  Password Recovery
                </>
              )}
            </DialogTitle>
            {step !== "confirmed" && (
              <DialogDescription className="mono text-[10px] text-foreground/80">
                Enter your registered User ID and Service Number to continue.
              </DialogDescription>
            )}
          </DialogHeader>
        </div>

        <div className="px-5 py-4">
          {step === "identify" && (
            <form onSubmit={handleLookup} className="space-y-3" autoComplete="off">
              <div>
                <Label className="label-eyebrow">User ID</Label>
                <Input
                  required
                  value={userId}
                  onChange={(e) => setUserId(e.target.value)}
                  className="mono mt-1"
                  autoComplete="off"
                  name="recovery-user-id"
                  data-1p-ignore
                  data-lpignore="true"
                />
              </div>
              <div>
                <Label className="label-eyebrow">Service Number</Label>
                <Input
                  required
                  value={serviceNumber}
                  onChange={(e) => setServiceNumber(e.target.value)}
                  className="mono mt-1"
                  autoComplete="off"
                  name="recovery-service-number"
                  data-1p-ignore
                  data-lpignore="true"
                />
              </div>
              {error && <ErrorBox message={error} />}
              <Button type="submit" className="w-full mono uppercase tracking-wider text-xs">
                Continue
              </Button>
            </form>
          )}

          {step === "verify" && verifiedProfile && (
            <form onSubmit={handleVerify} className="space-y-3" autoComplete="off">
              <div>
                <Label className="label-eyebrow">Security Question</Label>
                <p className="mono text-[11px] text-foreground mt-1.5 px-2 py-2 rounded-sm border border-border bg-secondary/10">
                  {verifiedProfile.securityQuestion}
                </p>
              </div>
              <div>
                <Label className="label-eyebrow">Security Answer</Label>
                <Input
                  required
                  value={securityAnswer}
                  onChange={(e) => setSecurityAnswer(e.target.value)}
                  className="mono mt-1"
                  autoComplete="off"
                  name="recovery-security-answer"
                  data-1p-ignore
                  data-lpignore="true"
                />
              </div>
              {error && <ErrorBox message={error} />}
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1 mono uppercase tracking-wider text-xs"
                  onClick={() => {
                    setStep("identify");
                    setVerifiedProfile(null);
                    setSecurityAnswer("");
                    setError("");
                  }}
                >
                  Back
                </Button>
                <Button type="submit" className="flex-1 mono uppercase tracking-wider text-xs">
                  Verify
                </Button>
              </div>
            </form>
          )}

          {step === "reset" && (
            <form onSubmit={handleReset} className="space-y-3" autoComplete="off">
              <div>
                <Label className="label-eyebrow">New Password</Label>
                <Input
                  type="password"
                  required
                  minLength={6}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="mono mt-1"
                  autoComplete="new-password"
                />
              </div>
              <div>
                <Label className="label-eyebrow">Confirm New Password</Label>
                <Input
                  type="password"
                  required
                  minLength={6}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="mono mt-1"
                  autoComplete="new-password"
                />
              </div>
              {error && <ErrorBox message={error} />}
              <Button type="submit" className="w-full mono uppercase tracking-wider text-xs">
                Reset Password
              </Button>
            </form>
          )}

          {step === "confirmed" && resetRecord && (
            <div className="space-y-4">
              <p className="mono text-[11px] text-foreground leading-relaxed">
                Password successfully reset on:
              </p>
              <p
                className="mono text-[12px] font-bold text-foreground border border-emerald-500/30 bg-emerald-500/8
                            rounded-sm px-3 py-2.5 text-center"
              >
                {resetRecord.displayLine}
              </p>
              <p className="mono text-[9px] text-foreground/75 leading-snug">
                You may now sign in with your new passcode. A notice will appear on your dashboard for 15 days.
              </p>
              <Button
                type="button"
                className="w-full mono uppercase tracking-wider text-xs"
                onClick={handleReturnToLogin}
              >
                Return to Login
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="rounded-sm border border-destructive/40 bg-destructive/8 px-3 py-2">
      <p className="mono text-[10px] text-destructive leading-snug">{message}</p>
    </div>
  );
}
