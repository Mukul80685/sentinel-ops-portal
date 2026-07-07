import { useEffect, useRef, useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Fingerprint, Upload, User } from "lucide-react";
import { toast } from "sonner";
import { updateUserAccount, useUserAccount } from "@/lib/userAccountStore";
import { useSidebarModules } from "./SidebarModulesProvider";
import { AvatarCropDialog } from "./AvatarCropDialog";
import {
  SidebarModalBody,
  SidebarModalContent,
  SidebarModalField,
  SidebarModalHeader,
  SidebarModalReadOnly,
  SidebarModalSection,
} from "./SidebarModalLayout";

export function UserProfileModal() {
  const { activeModule, closeModule } = useSidebarModules();
  const open = activeModule === "profile";
  const account = useUserAccount();
  const fileRef = useRef<HTMLInputElement>(null);

  const [displayName, setDisplayName] = useState(account.displayName);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [cropOpen, setCropOpen] = useState(false);

  useEffect(() => {
    setDisplayName(account.displayName);
  }, [account.displayName, account.loginUserId]);

  function handleClose() {
    closeModule();
  }

  function saveDisplayName() {
    const trimmed = displayName.trim();
    if (!trimmed) {
      toast.error("Display name cannot be empty.");
      return;
    }
    updateUserAccount({ displayName: trimmed });
    toast.success("Display name updated.");
  }

  function handleFileSelect(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file.");
      return;
    }
    setCropFile(file);
    setCropOpen(true);
    if (fileRef.current) fileRef.current.value = "";
  }

  function handleCropSave(dataUrl: string) {
    updateUserAccount({ avatarDataUrl: dataUrl });
    toast.success("Profile picture updated.");
    setCropOpen(false);
    setCropFile(null);
  }

  function handleCropCancel() {
    setCropOpen(false);
    setCropFile(null);
  }

  const initials = account.displayName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
        <SidebarModalContent className="max-w-md">
          <SidebarModalHeader
            icon={User}
            title="User Profile"
            subtitle="Identity and display preferences"
          />

          <SidebarModalBody className="space-y-4">
            <SidebarModalSection bodyClassName="flex flex-col items-center gap-4 py-5">
              <div className="relative">
                <div className="absolute -inset-1 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 blur-sm" />
                <Avatar className="relative h-24 w-24 border-2 border-primary/30 shadow-md ring-2 ring-background">
                  {account.avatarDataUrl ? (
                    <AvatarImage src={account.avatarDataUrl} alt={account.displayName} />
                  ) : null}
                  <AvatarFallback className="bg-muted mono text-base font-semibold text-foreground">
                    {initials || <User className="h-10 w-10 text-muted-foreground" />}
                  </AvatarFallback>
                </Avatar>
                <Button
                  type="button"
                  size="icon"
                  variant="secondary"
                  className="absolute -bottom-1 -right-1 h-8 w-8 rounded-full border border-border shadow-sm"
                  onClick={() => fileRef.current?.click()}
                >
                  <Upload className="h-3.5 w-3.5" />
                </Button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => handleFileSelect(e.target.files?.[0])}
                />
              </div>

              <p className="mono text-center text-[10px] uppercase tracking-wider text-muted-foreground">
                {account.displayName}
              </p>
            </SidebarModalSection>

            <SidebarModalSection title="Display Name" icon={User}>
              <SidebarModalField label="Shown across the portal">
                <div className="flex gap-2">
                  <Input
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="mono text-[11px] bg-background/80"
                  />
                  <Button
                    type="button"
                    size="sm"
                    className="mono shrink-0 text-[10px] uppercase tracking-wider"
                    onClick={saveDisplayName}
                  >
                    Save
                  </Button>
                </div>
              </SidebarModalField>
            </SidebarModalSection>

            <SidebarModalSection title="Login User ID" icon={Fingerprint}>
              <SidebarModalField
                label="Read-only identifier"
                hint="Change login User ID in Settings — updates here instantly."
              >
                <SidebarModalReadOnly value={account.loginUserId} />
              </SidebarModalField>
            </SidebarModalSection>
          </SidebarModalBody>
        </SidebarModalContent>
      </Dialog>

      <AvatarCropDialog
        open={cropOpen}
        file={cropFile}
        onSave={handleCropSave}
        onCancel={handleCropCancel}
      />
    </>
  );
}
