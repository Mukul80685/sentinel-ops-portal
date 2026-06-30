import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Satellite } from "lucide-react";
import { PasswordRecoveryDialog } from "@/components/auth/PasswordRecoveryDialog";
import {
  createLocalAccount,
  createMockSession,
  findRecoveryProfileByEmail,
  lookupRecoveryUser,
  validateLocalCredentials,
} from "@/lib/passwordRecovery";
import { upsertAuthorizedUserForSignup } from "@/lib/userAccountStore";

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
    </div>
  );
}
