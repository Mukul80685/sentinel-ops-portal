import { createFileRoute, useNavigate, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Satellite } from "lucide-react";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
  head: () => ({ meta: [{ title: "Access — SSACC" }] }),
});

function AuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState(false);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Access granted");
    navigate({ to: "/" });
  }

  async function signUp(e: React.FormEvent) {
    e.preventDefault();
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
    </div>
  );
}