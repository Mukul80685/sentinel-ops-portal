import { useEffect, useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Fingerprint, Lock, Settings, ShieldCheck, Users } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import {
  changeAccountPassword,
  getCurrentAccountEmail,
  saveAuthorizedUsers,
  updateLoginUserId,
  useAuthorizedUsers,
  useUserAccount,
  verifySecurityGate,
  type AuthorizedUser,
} from "@/lib/userAccountStore";
import { useSidebarModules } from "./SidebarModulesProvider";
import {
  SidebarModalBody,
  SidebarModalContent,
  SidebarModalField,
  SidebarModalHeader,
  SidebarModalSection,
} from "./SidebarModalLayout";

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
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [formationDate, setFormationDate] = useState("");
  const [formationDateFocused, setFormationDateFocused] = useState(false);
  const [aiUsed, setAiUsed] = useState("");
  const [motto, setMotto] = useState("");
  const [editUsers, setEditUsers] = useState<AuthorizedUser[]>(authorizedUsers);

  function resetGateFields() {
    setFormationDate("");
    setFormationDateFocused(false);
    setAiUsed("");
    setMotto("");
  }

  function handleClose() {
    closeModule();
    setGateOpen(false);
    setEditDialogOpen(false);
    resetGateFields();
  }

  function handleCloseEditDialog() {
    setEditDialogOpen(false);
    setEditUsers([...authorizedUsers]);
  }

  function resolveAccountEmail(): string {
    return user?.email ?? getCurrentAccountEmail() ?? "";
  }

  function saveUserId() {
    const email = resolveAccountEmail();
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
    const email = resolveAccountEmail();
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
      setGateOpen(false);
      resetGateFields();
      setEditUsers(authorizedUsers.map((u) => ({ ...u })));
      setEditDialogOpen(true);
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
    setEditDialogOpen(false);
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
        <SidebarModalContent className="max-w-lg">
          <SidebarModalHeader
            icon={Settings}
            title="Settings"
            subtitle="Account credentials and authorized access"
          />

          <SidebarModalBody className="space-y-4">
            <SidebarModalSection title="Login User ID" icon={Fingerprint}>
              <SidebarModalField label="Portal login identifier">
                <div className="flex gap-2">
                  <Input
                    value={loginUserId}
                    onChange={(e) => setLoginUserId(e.target.value)}
                    className="mono text-[11px] bg-background/80"
                  />
                  <Button
                    type="button"
                    size="sm"
                    className="mono shrink-0 text-[10px] uppercase tracking-wider"
                    onClick={saveUserId}
                  >
                    Save
                  </Button>
                </div>
              </SidebarModalField>
            </SidebarModalSection>

            <SidebarModalSection title="Change Password" icon={Lock}>
              {account.lastPasswordChange ? (
                <p className="mono mb-3 rounded-sm border border-border/70 bg-muted/20 px-2.5 py-1.5 text-[10px] text-muted-foreground">
                  Last password change: {account.lastPasswordChange}
                </p>
              ) : null}
              <form onSubmit={(e) => void handlePasswordChange(e)} className="space-y-2.5">
                <Input
                  type="password"
                  placeholder="Current password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="mono text-[11px] bg-background/80"
                  required
                />
                <Input
                  placeholder="Army number"
                  value={armyNumber}
                  onChange={(e) => setArmyNumber(e.target.value)}
                  className="mono text-[11px] bg-background/80"
                  required
                />
                <Input
                  placeholder="Name (as in authorized list)"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mono text-[11px] bg-background/80"
                  required
                />
                <Input
                  type="password"
                  placeholder="New password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="mono text-[11px] bg-background/80"
                  required
                />
                <Input
                  type="password"
                  placeholder="Confirm new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="mono text-[11px] bg-background/80"
                  required
                />
                <Button
                  type="submit"
                  size="sm"
                  className="mono w-full text-[10px] uppercase tracking-wider"
                  disabled={busy}
                >
                  Update Password
                </Button>
              </form>
            </SidebarModalSection>

            <SidebarModalSection title="Authorized Users" icon={Users}>
              <p className="mono text-[10px] leading-snug text-muted-foreground">
                Personnel authorized for password verification are not displayed here for
                security. To update name, rank, or army number records, complete security
                verification first.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mono mt-3 border-primary/30 text-[9px] uppercase tracking-wider hover:bg-primary/5"
                onClick={() => setGateOpen(true)}
              >
                Edit Authorized List
              </Button>
            </SidebarModalSection>
          </SidebarModalBody>
        </SidebarModalContent>
      </Dialog>

      <Dialog
        open={gateOpen}
        onOpenChange={(o) => {
          setGateOpen(o);
          if (!o) resetGateFields();
        }}
      >
        <SidebarModalContent className="max-w-md">
          <SidebarModalHeader
            icon={ShieldCheck}
            title="Security Verification"
            subtitle="Answer all questions to unlock list editing"
            accent="amber"
          />
          <SidebarModalBody className="space-y-4">
            <SidebarModalSection>
              <SidebarModalField
                label="When was the Satellite Signal Analysis and Coordination Centre (SSACC) formed?"
                hint="Month, Year — e.g. June 2026"
              >
                <Input
                  value={formationDate}
                  onChange={(e) => setFormationDate(e.target.value)}
                  onFocus={() => setFormationDateFocused(true)}
                  onBlur={() => {
                    if (!formationDate.trim()) setFormationDateFocused(false);
                  }}
                  placeholder={formationDateFocused ? "" : "Example: June 2026"}
                  className="mono mt-0 text-[11px] bg-background/80"
                />
              </SidebarModalField>
            </SidebarModalSection>

            <SidebarModalSection>
              <SidebarModalField label="Which AI platform was used to build this dashboard?">
                <Input
                  value={aiUsed}
                  onChange={(e) => setAiUsed(e.target.value)}
                  placeholder="Enter answer"
                  className="mono text-[11px] bg-background/80"
                />
              </SidebarModalField>
            </SidebarModalSection>

            <SidebarModalSection>
              <SidebarModalField label="What is the motto of the Corps of Signals?">
                <Input
                  value={motto}
                  onChange={(e) => setMotto(e.target.value)}
                  placeholder="Enter answer"
                  className="mono text-[11px] bg-background/80"
                />
              </SidebarModalField>
            </SidebarModalSection>

            <Button
              type="button"
              className="mono w-full text-[10px] uppercase tracking-wider"
              onClick={tryUnlockGate}
            >
              Verify
            </Button>
          </SidebarModalBody>
        </SidebarModalContent>
      </Dialog>

      <Dialog
        open={editDialogOpen}
        onOpenChange={(o) => {
          if (!o) handleCloseEditDialog();
          else setEditDialogOpen(true);
        }}
      >
        <SidebarModalContent className="max-w-lg">
          <SidebarModalHeader
            icon={Users}
            title="Edit Authorized Users"
            subtitle={`Update ${editUsers.length} personnel record${editUsers.length !== 1 ? "s" : ""} (3–6 required)`}
          />
          <SidebarModalBody className="space-y-4">
            <p className="mono text-[10px] leading-snug text-muted-foreground">
              These details are used when changing passwords. Edit name, rank, and army number
              for each authorized user, then save.
            </p>

            <div className="space-y-2">
              <div className="mono grid grid-cols-3 gap-1.5 px-0.5 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
                <span>Name</span>
                <span>Rank</span>
                <span>Army No.</span>
              </div>
              {editUsers.map((u, i) => (
                <div key={u.id} className="grid grid-cols-3 gap-1.5">
                  <Input
                    value={u.name}
                    onChange={(e) => {
                      const next = [...editUsers];
                      next[i] = { ...u, name: e.target.value };
                      setEditUsers(next);
                    }}
                    className="mono h-8 bg-background/80 text-[10px]"
                    placeholder="Name"
                  />
                  <Input
                    value={u.rank}
                    onChange={(e) => {
                      const next = [...editUsers];
                      next[i] = { ...u, rank: e.target.value };
                      setEditUsers(next);
                    }}
                    className="mono h-8 bg-background/80 text-[10px]"
                    placeholder="Rank"
                  />
                  <Input
                    value={u.armyNumber}
                    onChange={(e) => {
                      const next = [...editUsers];
                      next[i] = { ...u, armyNumber: e.target.value };
                      setEditUsers(next);
                    }}
                    className="mono h-8 bg-background/80 text-[10px]"
                    placeholder="Army No."
                  />
                </div>
              ))}
            </div>

            <div className="flex gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mono flex-1 text-[10px] uppercase tracking-wider"
                onClick={handleCloseEditDialog}
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                className="mono flex-1 text-[10px] uppercase tracking-wider"
                onClick={saveAuthorizedList}
              >
                Save Authorized Users
              </Button>
            </div>
          </SidebarModalBody>
        </SidebarModalContent>
      </Dialog>
    </>
  );
}
