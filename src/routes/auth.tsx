import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Satellite } from "lucide-react";
import { PasswordRecoveryDialog } from "@/components/auth/PasswordRecoveryDialog";
import {
  canSignInWithRecoveryOverride,
  createMockSession,
  registerRecoveryProfileForSignup,
} from "@/lib/passwordRecovery";

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
  const [recoverySecurityQuestion, setRecoverySecurityQuestion] = useState<string>(
    RECOVERY_SECURITY_QUESTIONS[0],
  );
  const [recoverySecurityAnswer, setRecoverySecurityAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [recoveryOpen, setRecoveryOpen] = useState(false);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      if (canSignInWithRecoveryOverride(email, password)) {
        await supabase.auth.signOut({ scope: "local" });
        createMockSession(email);
        toast.success("Access granted");
        setBusy(false);
        navigate({ to: "/" });
        return;
      }
      setBusy(false);
      return toast.error(error.message);
    }

    setBusy(false);
    toast.success("Access granted");
    navigate({ to: "/" });
  }

  async function signUp(e: React.FormEvent) {
    e.preventDefault();
    if (!recoveryUserId.trim() || !recoveryServiceNumber.trim() || !recoverySecurityAnswer.trim()) {
      return toast.error("Recovery profile fields are required.");
    }
    setBusy(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin,
        data: { full_name: fullName },
      },
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    registerRecoveryProfileForSignup(email, {
      userId: recoveryUserId.trim(),
      serviceNumber: recoveryServiceNumber.trim(),
      securityQuestion: recoverySecurityQuestion,
      securityAnswer: recoverySecurityAnswer.trim(),
    });
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
            <h1 className="mono text-lg font-bold uppercase tracking-tight">Access Terminal</h1>
          </div>
        </div>
        <Tabs defaultValue="signin">
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="signin" className="mono uppercase text-xs tracking-wider">
              Sign In
            </TabsTrigger>
            <TabsTrigger value="signup" className="mono uppercase text-xs tracking-wider">
              Request Access
            </TabsTrigger>
          </TabsList>
          <TabsContent value="signin">
            <form onSubmit={signIn} className="space-y-3 mt-4">
              <div>
                <Label className="label-eyebrow">Operator ID (Email)</Label>
                <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="mono" />
              </div>
              <div>
                <Label className="label-eyebrow">Passcode</Label>
                <Input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="mono" />
              </div>
              <div className="flex justify-end -mt-1">
                <button
                  type="button"
                  data-testid="forgot-password-trigger"
                  onClick={() => setRecoveryOpen(true)}
                  className="mono text-[10px] uppercase tracking-wider text-foreground/75 hover:text-primary
                             transition-colors underline-offset-2 hover:underline cursor-pointer"
                >
                  Forgot Password?
                </button>
              </div>
              <Button type="submit" disabled={busy} className="w-full mono uppercase tracking-wider">
                {busy ? "Authenticating…" : "Authenticate"}
              </Button>
            </form>
          </TabsContent>
          <TabsContent value="signup">
            <form onSubmit={signUp} className="space-y-3 mt-4">
              <div>
                <Label className="label-eyebrow">Full Name</Label>
                <Input required value={fullName} onChange={(e) => setFullName(e.target.value)} className="mono" />
              </div>
              <div>
                <Label className="label-eyebrow">Operator ID (Email)</Label>
                <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="mono" />
              </div>
              <div>
                <Label className="label-eyebrow">Passcode</Label>
                <Input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} className="mono" />
              </div>
              <div className="border-t border-border/60 pt-3 space-y-3">
                <p className="label-eyebrow">Password Recovery Profile</p>
                <div>
                  <Label className="label-eyebrow">User ID</Label>
                  <Input
                    required
                    value={recoveryUserId}
                    onChange={(e) => setRecoveryUserId(e.target.value)}
                    className="mono"
                    autoComplete="off"
                  />
                </div>
                <div>
                  <Label className="label-eyebrow">Service Number</Label>
                  <Input
                    required
                    value={recoveryServiceNumber}
                    onChange={(e) => setRecoveryServiceNumber(e.target.value)}
                    className="mono"
                    autoComplete="off"
                  />
                </div>
                <div>
                  <Label className="label-eyebrow">Security Question</Label>
                  <Select value={recoverySecurityQuestion} onValueChange={setRecoverySecurityQuestion}>
                    <SelectTrigger className="mono mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {RECOVERY_SECURITY_QUESTIONS.map((q) => (
                        <SelectItem key={q} value={q} className="mono text-xs">
                          {q}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="label-eyebrow">Security Answer</Label>
                  <Input
                    required
                    value={recoverySecurityAnswer}
                    onChange={(e) => setRecoverySecurityAnswer(e.target.value)}
                    className="mono"
                    autoComplete="off"
                  />
                </div>
              </div>
              <Button type="submit" disabled={busy} className="w-full mono uppercase tracking-wider">
                {busy ? "Submitting…" : "Request Access"}
              </Button>
              <p className="text-[11px] text-muted-foreground mono">
                First account becomes ADMIN. Subsequent accounts default to VIEWER pending role grant.
              </p>
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
