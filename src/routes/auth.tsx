import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Satellite } from "lucide-react";
import { PasswordRecoveryDialog } from "@/components/auth/PasswordRecoveryDialog";
import {
  createLocalAccount,
  createMockSession,
  findRecoveryProfileByEmail,
  lookupRecoveryUser,
  recordPasswordReset,
  setLocalPassword,
  validateLocalCredentials,
} from "@/lib/passwordRecovery";
import {
  findAuthorizedUserByArmyNumber,
  formatAuthorizedUserLabel,
  upsertAuthorizedUserForSignup,
  verifySecurityGate,
  type AuthorizedUser,
} from "@/lib/userAccountStore";

const RECOVERY_SECURITY_QUESTIONS = [
  "What is your first school?",
  "What is your favorite city?",
  "What was your first posting location?",
] as const;

export const Route = createFileRoute("/auth")({
  component: AuthPage,
  head: () => ({ meta: [{ title: "Access — SSACC" }] }),
});

function AuthPage() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");

  const [recoveryUserId, setRecoveryUserId] = useState("");
  const [recoveryServiceNumber, setRecoveryServiceNumber] = useState("");
  const [recoverySecurityQuestion, setRecoverySecurityQuestion] =
    useState<string>(RECOVERY_SECURITY_QUESTIONS[0]);
  const [recoverySecurityAnswer, setRecoverySecurityAnswer] = useState("");

  const [busy, setBusy] = useState(false);
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);

  function signIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);

    if (!validateLocalCredentials(email, password)) {
      setBusy(false);
      return toast.error("Invalid credentials.");
    }

    const profile = lookupRecoveryUser(email.trim()) ?? findRecoveryProfileByEmail(email.trim());
    const sessionEmail = profile?.accountKey ?? email.trim();

    createMockSession(sessionEmail);
    setBusy(false);
    toast.success("Access granted");
    navigate({ to: "/" });
  }

  function signUp(e: React.FormEvent) {
    e.preventDefault();

    if (
      !recoveryUserId.trim() ||
      !recoveryServiceNumber.trim() ||
      !recoverySecurityAnswer.trim()
    ) {
      return toast.error("Recovery profile fields are required.");
    }

    setBusy(true);

    const result = createLocalAccount({
      email,
      password,
      userId: recoveryUserId.trim(),
      serviceNumber: recoveryServiceNumber.trim(),
      securityQuestion: recoverySecurityQuestion,
      securityAnswer: recoverySecurityAnswer.trim(),
    });

    if (!result.ok) {
      setBusy(false);
      return toast.error(result.error);
    }

    upsertAuthorizedUserForSignup({
      email,
      userId: recoveryUserId.trim(),
      serviceNumber: recoveryServiceNumber.trim(),
      fullName,
    });

    createMockSession(email);
    setBusy(false);
    toast.success("Account created — signed in");
    navigate({ to: "/" });
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md panel p-6 sm:p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="h-10 w-10 rounded-sm border border-primary/60 grid place-items-center text-primary">
            <Satellite className="h-5 w-5" />
          </div>
          <div>
            <div className="label-eyebrow">SSACC // CLASSIFIED</div>
            <h1 className="mono text-lg font-bold uppercase tracking-tight">
              Access Terminal
            </h1>
          </div>
        </div>

        <Tabs defaultValue="signin">
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="signin">Sign In</TabsTrigger>
            <TabsTrigger value="signup">Request Access</TabsTrigger>
          </TabsList>

          <TabsContent value="signin">
            <form onSubmit={signIn} className="space-y-3 mt-4">
              <Input
                type="text"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="User ID"
                required
              />
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                required
              />
              <Button type="submit" disabled={busy} className="w-full">
                {busy ? "Authenticating…" : "Authenticate"}
              </Button>
              <div className="text-center">
                <button
                  type="button"
                  onClick={() => setForgotOpen(true)}
                  className="mono text-[11px] text-muted-foreground hover:text-primary underline underline-offset-2 transition-colors"
                >
                  Forgot Password?
                </button>
              </div>
            </form>
          </TabsContent>

          <TabsContent value="signup">
            <form onSubmit={signUp} className="space-y-3 mt-4">
              <Input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Full Name"
                required
              />

              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email"
                required
              />

              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                required
                minLength={6}
              />

              <Input
                value={recoveryUserId}
                onChange={(e) => setRecoveryUserId(e.target.value)}
                placeholder="User ID"
                required
              />

              <Input
                value={recoveryServiceNumber}
                onChange={(e) => setRecoveryServiceNumber(e.target.value)}
                placeholder="Service Number"
                required
              />

              <Input
                value={recoverySecurityAnswer}
                onChange={(e) => setRecoverySecurityAnswer(e.target.value)}
                placeholder="Security Answer"
                required
              />

              <Button type="submit" disabled={busy} className="w-full">
                {busy ? "Submitting…" : "Request Access"}
              </Button>
            </form>
          </TabsContent>
        </Tabs>
      </div>

      <PasswordRecoveryDialog
        open={recoveryOpen}
        onOpenChange={setRecoveryOpen}
        onReturnToLogin={() => setRecoveryOpen(false)}
      />

      <ForgotPasswordDialog open={forgotOpen} onOpenChange={setForgotOpen} />
    </div>
  );
}

// ─── Forgot Password dialog (3-step, pure localStorage) ───────────────────────

function ForgotPasswordDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [verifiedUser, setVerifiedUser] = useState<AuthorizedUser | null>(null);

  // Step 1 — identity
  const [userId, setUserId] = useState("");
  const [name, setName] = useState("");

  // Step 2 — security questions (validated via verifySecurityGate)
  const [formationDate, setFormationDate] = useState("");
  const [aiUsed, setAiUsed] = useState("");
  const [motto, setMotto] = useState("");

  // Step 3 — new password
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  function resetAll() {
    setStep(1);
    setVerifiedUser(null);
    setUserId("");
    setName("");
    setFormationDate("");
    setAiUsed("");
    setMotto("");
    setNewPassword("");
    setConfirmPassword("");
  }

  function close() {
    resetAll();
    onOpenChange(false);
  }

  function handleIdentity(e: React.FormEvent) {
    e.preventDefault();
    const user = findAuthorizedUserByArmyNumber(userId);
    const entered = name.trim().toLowerCase();
    const matches =
      !!user &&
      entered.length > 0 &&
      (user.name.trim().toLowerCase() === entered ||
        formatAuthorizedUserLabel(user).toLowerCase() === entered);

    if (!matches) {
      return toast.error("Identity could not be verified. Check User ID and Name.");
    }
    setVerifiedUser(user);
    setStep(2);
  }

  function handleSecurity(e: React.FormEvent) {
    e.preventDefault();
    if (!verifySecurityGate({ formationDate, aiUsed, motto })) {
      return toast.error("One or more answers are incorrect. Please try again.");
    }
    setStep(3);
  }

  function handleNewPassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword.length < 6) {
      return toast.error("Password must be at least 6 characters.");
    }
    if (newPassword !== confirmPassword) {
      return toast.error("Passwords do not match.");
    }
    if (!verifiedUser) return;

    const accountEmail = verifiedUser.email.trim();
    if (!accountEmail) {
      return toast.error("No login account is linked to this user.");
    }

    const profile = findRecoveryProfileByEmail(accountEmail);
    if (profile) {
      recordPasswordReset(profile, newPassword);
    } else {
      setLocalPassword(accountEmail, newPassword);
    }

    toast.success("Password updated successfully");
    close();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="mono uppercase tracking-wider">
            Forgot Password
          </DialogTitle>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex items-center gap-2">
          <span className="mono text-[10px] uppercase tracking-wider text-primary font-bold">
            Step {step} of 3
          </span>
          <div className="flex-1 flex gap-1">
            {[1, 2, 3].map((s) => (
              <div
                key={s}
                className={`h-1 flex-1 rounded-full ${
                  s <= step ? "bg-primary" : "bg-border"
                }`}
              />
            ))}
          </div>
        </div>

        {step === 1 && (
          <form onSubmit={handleIdentity} className="space-y-3">
            <p className="mono text-[11px] text-muted-foreground">
              Verify your identity to begin password recovery.
            </p>
            <div>
              <Label className="mono text-[10px] uppercase tracking-wider">User ID (Army Number)</Label>
              <Input
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                placeholder="e.g. IC80685P"
                className="mono text-[11px] mt-1"
                required
              />
            </div>
            <div>
              <Label className="mono text-[10px] uppercase tracking-wider">Full Name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Full name on record"
                className="mono text-[11px] mt-1"
                required
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" onClick={close}>
                Cancel
              </Button>
              <Button type="submit">Continue</Button>
            </div>
          </form>
        )}

        {step === 2 && (
          <form onSubmit={handleSecurity} className="space-y-3">
            <p className="mono text-[11px] text-muted-foreground">
              Answer all three security questions correctly to proceed.
            </p>
            <div>
              <Label className="text-[10px] mono leading-snug">
                When was the Satellite Signal Analysis and Coordination Centre (SSACC) formed?
              </Label>
              <Input
                value={formationDate}
                onChange={(e) => setFormationDate(e.target.value)}
                placeholder="Month, Year"
                className="mono text-[11px] mt-1"
                required
              />
            </div>
            <div>
              <Label className="text-[10px] mono leading-snug">
                Which AI platform was used to build this dashboard?
              </Label>
              <Input
                value={aiUsed}
                onChange={(e) => setAiUsed(e.target.value)}
                placeholder="Enter answer"
                className="mono text-[11px] mt-1"
                required
              />
            </div>
            <div>
              <Label className="text-[10px] mono leading-snug">
                What is the motto of the Corps of Signals?
              </Label>
              <Input
                value={motto}
                onChange={(e) => setMotto(e.target.value)}
                placeholder="Enter answer"
                className="mono text-[11px] mt-1"
                required
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" onClick={close}>
                Cancel
              </Button>
              <Button type="submit">Verify</Button>
            </div>
          </form>
        )}

        {step === 3 && (
          <form onSubmit={handleNewPassword} className="space-y-3">
            <p className="mono text-[11px] text-muted-foreground">
              Set a new password for{" "}
              <span className="text-foreground font-bold">
                {verifiedUser ? formatAuthorizedUserLabel(verifiedUser) : ""}
              </span>
              .
            </p>
            <div>
              <Label className="mono text-[10px] uppercase tracking-wider">New Password</Label>
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Minimum 6 characters"
                className="mono text-[11px] mt-1"
                required
                minLength={6}
              />
            </div>
            <div>
              <Label className="mono text-[10px] uppercase tracking-wider">Confirm Password</Label>
              <Input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter new password"
                className="mono text-[11px] mt-1"
                required
                minLength={6}
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" onClick={close}>
                Cancel
              </Button>
              <Button type="submit">Update Password</Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
