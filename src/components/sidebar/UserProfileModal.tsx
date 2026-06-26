import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { User, Upload } from "lucide-react";
import { toast } from "sonner";
import { updateUserAccount, useUserAccount } from "@/lib/userAccountStore";
import { useSidebarModules } from "./SidebarModulesProvider";
import { AvatarCropDialog } from "./AvatarCropDialog";

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
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="mono uppercase tracking-wider flex items-center gap-2">
              <User className="h-4 w-4 text-primary" />
              User Profile
            </DialogTitle>
          </DialogHeader>

          <div className="flex flex-col items-center gap-4">
            <div className="relative">
              <Avatar className="h-24 w-24 border-2 border-border">
                {account.avatarDataUrl ? (
                  <AvatarImage src={account.avatarDataUrl} alt={account.displayName} />
                ) : null}
                <AvatarFallback className="bg-secondary mono text-sm">
                  {initials || <User className="h-10 w-10 text-muted-foreground" />}
                </AvatarFallback>
              </Avatar>
              <Button
                type="button"
                size="icon"
                variant="secondary"
                className="absolute -bottom-1 -right-1 h-8 w-8 rounded-full"
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

            <div className="w-full space-y-3">
              <div>
                <Label className="mono text-[10px] uppercase tracking-wider">Display Name</Label>
                <div className="flex gap-2 mt-1">
                  <Input
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="mono text-[11px]"
                  />
                  <Button type="button" size="sm" className="mono text-[10px] shrink-0" onClick={saveDisplayName}>
                    Save
                  </Button>
                </div>
              </div>

              <div>
                <Label className="mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  Login User ID (read-only)
                </Label>
                <div className="mono text-[11px] panel px-3 py-2 mt-1 text-muted-foreground">
                  {account.loginUserId}
                </div>
                <p className="text-[9px] text-muted-foreground mt-1">
                  Change login User ID in Settings — updates here instantly.
                </p>
              </div>
            </div>
          </div>
        </DialogContent>
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
