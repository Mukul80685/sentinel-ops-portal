import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Settings, Lock, Users } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import {
  changeAccountPassword,
  formatAuthorizedUserLabel,
  getCurrentAccountEmail,
  saveAuthorizedUsers,
  updateLoginUserId,
  useAuthorizedUsers,
  useUserAccount,
  verifySecurityGate,
  type AuthorizedUser,
} from "@/lib/userAccountStore";
import { useSidebarModules } from "./SidebarModulesProvider";

export function SettingsModal() {
  const { activeModule, closeModule } = useSidebarModules();
  const open = activeModule === "settings";
  const { user } = useAuth();
  const account = useUserAccount();
  const authorizedUsers = useAuthorizedUsers();

  const [loginUserId, setLoginUserId] = useState(account.loginUserId);

  useEffect(() => {
    setLoginUserId(account.loginUserId);
  }, [account.loginUserId]);
  const [currentPassword, setCurrentPassword] = useState("");
  const [armyNumber, setArmyNumber] = useState("");
  const [name, setName] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const [gateOpen, setGateOpen] = useState(false);
  const [formationDate, setFormationDate] = useState("");
  const [formationDateFocused, setFormationDateFocused] = useState(false);
  const [aiUsed, setAiUsed] = useState("");
  const [motto, setMotto] = useState("");
  const [gateUnlocked, setGateUnlocked] = useState(false);
  const [editUsers, setEditUsers] = useState<AuthorizedUser[]>(authorizedUsers);

  function handleClose() {
    closeModule();
    setGateUnlocked(false);
    setGateOpen(false);
  }

  async function saveUserId() {
    const email = user?.email ?? (await getCurrentAccountEmail()) ?? "";
    if (!email) {
      toast.error("No active account email found.");
      return;
    }
    const result = updateLoginUserId(loginUserId, email);
    if (!result.ok) toast.error(result.error);
    else toast.success("User ID updated globally.");
  }

  async function handlePasswordChange(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error("New passwords do not match.");
      return;
    }
    const email = user?.email ?? (await getCurrentAccountEmail()) ?? "";
    if (!email) {
      toast.error("No active account email found.");
      return;
    }
    setBusy(true);
    const result = await changeAccountPassword({
      email,
      currentPassword,
      armyNumber,
      name,
      newPassword,
    });
    setBusy(false);
    if (!result.ok) toast.error(result.error);
    else {
      toast.success("Password updated.");
      setCurrentPassword("");
      setArmyNumber("");
      setName("");
      setNewPassword("");
      setConfirmPassword("");
    }
  }

  function tryUnlockGate() {
    if (verifySecurityGate({ formationDate, aiUsed, motto })) {
      setGateUnlocked(true);
      setGateOpen(false);
      setEditUsers([...authorizedUsers]);
      toast.success("Security verification passed.");
    } else {
      toast.error("Security verification failed. All answers must be correct.");
    }
  }

  function saveAuthorizedList() {
    if (editUsers.length < 3 || editUsers.length > 6) {
      toast.error("Authorized users list must contain 3–6 users.");
      return;
    }
    saveAuthorizedUsers(editUsers);
    toast.success("Authorized users list updated.");
    setGateUnlocked(false);
  }

  return (
    <>
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="mono uppercase tracking-wider flex items-center gap-2">
            <Settings className="h-4 w-4 text-primary" />
            Settings
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          <section className="space-y-2">
            <Label className="mono text-[10px] uppercase tracking-wider">Login User ID</Label>
            <div className="flex gap-2">
              <Input
                value={loginUserId}
                onChange={(e) => setLoginUserId(e.target.value)}
                className="mono text-[11px]"
              />
              <Button type="button" size="sm" className="mono text-[10px] shrink-0" onClick={() => void saveUserId()}>
                Save
              </Button>
            </div>
          </section>

          <section className="space-y-3 border-t border-border pt-4">
            <div className="flex items-center gap-2 label-eyebrow">
              <Lock className="h-3 w-3" /> Change Password
            </div>
            {account.lastPasswordChange && (
              <p className="text-[10px] text-muted-foreground mono">
                Last password change: {account.lastPasswordChange}
              </p>
            )}
            <form onSubmit={(e) => void handlePasswordChange(e)} className="space-y-2">
              <Input
                type="password"
                placeholder="Current password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="mono text-[11px]"
                required
              />
              <Input
                placeholder="Army number"
                value={armyNumber}
                onChange={(e) => setArmyNumber(e.target.value)}
                className="mono text-[11px]"
                required
              />
              <Input
                placeholder="Name (as in authorized list)"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mono text-[11px]"
                required
              />
              <Input
                type="password"
                placeholder="New password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="mono text-[11px]"
                required
              />
              <Input
                type="password"
                placeholder="Confirm new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="mono text-[11px]"
                required
              />
              <Button type="submit" size="sm" className="mono text-[10px] uppercase w-full" disabled={busy}>
                Update Password
              </Button>
            </form>
          </section>

          <section className="space-y-3 border-t border-border pt-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 label-eyebrow">
                <Users className="h-3 w-3" /> Authorized Users ({authorizedUsers.length})
              </div>
              {!gateUnlocked && (
                <Button type="button" variant="outline" size="sm" className="mono text-[9px] h-7" onClick={() => setGateOpen(true)}>
                  Edit List
                </Button>
              )}
            </div>
            <ul className="space-y-1">
              {authorizedUsers.map((u) => (
                <li key={u.id} className="mono text-[10px] panel px-2 py-1.5 flex justify-between gap-2">
                  <span>{formatAuthorizedUserLabel(u)}</span>
                  <span className="text-muted-foreground">{u.armyNumber}</span>
                </li>
              ))}
            </ul>

            {gateUnlocked && (
              <div className="space-y-2 border border-primary/30 rounded-sm p-3">
                <p className="text-[9px] text-muted-foreground mono uppercase">Editing authorized users</p>
                {editUsers.map((u, i) => (
                  <div key={u.id} className="grid grid-cols-3 gap-1">
                    <Input
                      value={u.name}
                      onChange={(e) => {
                        const next = [...editUsers];
                        next[i] = { ...u, name: e.target.value };
                        setEditUsers(next);
                      }}
                      className="h-7 text-[10px] mono"
                      placeholder="Name"
                    />
                    <Input
                      value={u.rank}
                      onChange={(e) => {
                        const next = [...editUsers];
                        next[i] = { ...u, rank: e.target.value };
                        setEditUsers(next);
                      }}
                      className="h-7 text-[10px] mono"
                      placeholder="Rank"
                    />
                    <Input
                      value={u.armyNumber}
                      onChange={(e) => {
                        const next = [...editUsers];
                        next[i] = { ...u, armyNumber: e.target.value };
                        setEditUsers(next);
                      }}
                      className="h-7 text-[10px] mono"
                      placeholder="Army No."
                    />
                  </div>
                ))}
                <Button type="button" size="sm" className="mono text-[10px] w-full" onClick={saveAuthorizedList}>
                  Save Authorized Users
                </Button>
              </div>
            )}
          </section>
        </div>
      </DialogContent>
    </Dialog>

      <Dialog open={gateOpen} onOpenChange={setGateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="mono uppercase text-sm">Security Verification</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-[10px] mono leading-snug">
                When was the Satellite Signal Analysis and Coordination Centre (SSACC) formed?
              </Label>
              <Input
                value={formationDate}
                onChange={(e) => setFormationDate(e.target.value)}
                onFocus={() => setFormationDateFocused(true)}
                onBlur={() => {
                  if (!formationDate.trim()) setFormationDateFocused(false);
                }}
                placeholder={formationDateFocused ? "" : "Example: March 1998"}
                className="mono text-[11px] mt-1"
              />
              <p className="text-[9px] text-muted-foreground mt-1 mono">Month, Year</p>
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
              />
            </div>
            <Button type="button" className="w-full mono text-[10px] uppercase" onClick={tryUnlockGate}>
              Verify
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
