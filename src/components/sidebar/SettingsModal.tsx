import { useEffect, useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Fingerprint, Lock, Settings, ShieldCheck, Users } from "lucide-react";
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

            <SidebarModalSection title={`Authorized Users (${authorizedUsers.length})`} icon={Users}>
              <div className="mb-3 flex items-center justify-end">
                {!gateUnlocked ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mono h-7 border-primary/30 text-[9px] uppercase tracking-wider hover:bg-primary/5"
                    onClick={() => setGateOpen(true)}
                  >
                    Edit List
                  </Button>
                ) : null}
              </div>

              <ul className="space-y-1.5">
                {authorizedUsers.map((u) => (
                  <li
                    key={u.id}
                    className="mono flex items-center justify-between gap-2 rounded-sm border border-border/70 bg-muted/15 px-2.5 py-2 text-[10px]"
                  >
                    <span className="font-medium text-foreground">{formatAuthorizedUserLabel(u)}</span>
                    <span className="text-muted-foreground">{u.armyNumber}</span>
                  </li>
                ))}
              </ul>

              {gateUnlocked ? (
                <div className="mt-3 space-y-2 rounded-sm border border-primary/25 bg-primary/[0.04] p-3">
                  <p className="mono text-[9px] font-semibold uppercase tracking-wider text-primary">
                    Editing authorized users
                  </p>
                  {editUsers.map((u, i) => (
                    <div key={u.id} className="grid grid-cols-3 gap-1.5">
                      <Input
                        value={u.name}
                        onChange={(e) => {
                          const next = [...editUsers];
                          next[i] = { ...u, name: e.target.value };
                          setEditUsers(next);
                        }}
                        className="mono h-7 bg-background/80 text-[10px]"
                        placeholder="Name"
                      />
                      <Input
                        value={u.rank}
                        onChange={(e) => {
                          const next = [...editUsers];
                          next[i] = { ...u, rank: e.target.value };
                          setEditUsers(next);
                        }}
                        className="mono h-7 bg-background/80 text-[10px]"
                        placeholder="Rank"
                      />
                      <Input
                        value={u.armyNumber}
                        onChange={(e) => {
                          const next = [...editUsers];
                          next[i] = { ...u, armyNumber: e.target.value };
                          setEditUsers(next);
                        }}
                        className="mono h-7 bg-background/80 text-[10px]"
                        placeholder="Army No."
                      />
                    </div>
                  ))}
                  <Button
                    type="button"
                    size="sm"
                    className="mono w-full text-[10px] uppercase tracking-wider"
                    onClick={saveAuthorizedList}
                  >
                    Save Authorized Users
                  </Button>
                </div>
              ) : null}
            </SidebarModalSection>
          </SidebarModalBody>
        </SidebarModalContent>
      </Dialog>

      <Dialog open={gateOpen} onOpenChange={setGateOpen}>
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
                hint="Month, Year — e.g. March 1998"
              >
                <Input
                  value={formationDate}
                  onChange={(e) => setFormationDate(e.target.value)}
                  onFocus={() => setFormationDateFocused(true)}
                  onBlur={() => {
                    if (!formationDate.trim()) setFormationDateFocused(false);
                  }}
                  placeholder={formationDateFocused ? "" : "Example: March 1998"}
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
    </>
  );
}
