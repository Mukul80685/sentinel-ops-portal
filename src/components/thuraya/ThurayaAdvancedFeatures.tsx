import { useRef, useState } from "react";
import { ImageUp, Pencil, Plus, Settings2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  addThurayaUnit,
  deleteThurayaUnit,
  readThurayaImageFile,
  renameThurayaUnit,
  setThurayaUnitImage,
  type ThurayaUnit,
} from "@/lib/thurayaStore";

export function ThurayaAdvancedFeatures({
  units,
  onChanged,
}: {
  units: ThurayaUnit[];
  onChanged?: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);

  const [unitName, setUnitName] = useState("");
  const [renameName, setRenameName] = useState("");
  const [uploadTargetId, setUploadTargetId] = useState<string>("");
  const [pendingDelete, setPendingDelete] = useState<ThurayaUnit | null>(null);
  const [pendingRename, setPendingRename] = useState<ThurayaUnit | null>(null);

  function notifyChanged() {
    onChanged?.();
  }

  function handleAddUnit(event: React.FormEvent) {
    event.preventDefault();
    if (!unitName.trim()) {
      toast.error("Unit name is required.");
      return;
    }
    const created = addThurayaUnit(unitName);
    if (!created) {
      toast.error("Could not add unit.");
      return;
    }
    toast.success(`Added "${created.name}" to Thuraya only.`);
    setUnitName("");
    setAddOpen(false);
    notifyChanged();
  }

  function openRenameDialog(unit: ThurayaUnit) {
    setPendingRename(unit);
    setRenameName(unit.name);
    setRenameOpen(true);
  }

  function confirmRename() {
    if (!pendingRename) return;
    const updated = renameThurayaUnit(pendingRename.id, renameName);
    if (!updated) {
      toast.error("Unit name is required.");
      return;
    }
    toast.success(`Renamed to "${updated.name}" (Thuraya only).`);
    setRenameOpen(false);
    setPendingRename(null);
    notifyChanged();
  }

  function confirmDelete() {
    if (!pendingDelete) return;
    const ok = deleteThurayaUnit(pendingDelete.id);
    if (ok) toast.success(`Removed "${pendingDelete.name}" from Thuraya.`);
    else toast.error("Could not delete unit.");
    setPendingDelete(null);
    setDeleteOpen(false);
    notifyChanged();
  }

  async function handleImageUpload(file: File) {
    if (!uploadTargetId) {
      toast.error("Select a unit first.");
      return;
    }
    try {
      const dataUrl = await readThurayaImageFile(file);
      const updated = setThurayaUnitImage(uploadTargetId, dataUrl);
      if (!updated) {
        toast.error("Could not save image.");
        return;
      }
      toast.success(`Image uploaded for "${updated.name}".`);
      setUploadOpen(false);
      notifyChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Image upload failed.");
    }
  }

  return (
    <>
      <div className="flex justify-end">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mono text-[10px] uppercase tracking-wider h-8"
          onClick={() => setAdvancedOpen(true)}
        >
          <Settings2 className="h-3.5 w-3.5 mr-1" />
          Advanced Features
        </Button>
      </div>

      <Dialog open={advancedOpen} onOpenChange={setAdvancedOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="mono uppercase tracking-wider">Thuraya Advanced Features</DialogTitle>
          </DialogHeader>
          <p className="mono text-[10px] text-muted-foreground leading-relaxed">
            Changes here apply only to the Thuraya tab. They do not affect administrator modules or
            any other part of the system.
          </p>
          <div className="grid gap-2 pt-1">
            <Button type="button" variant="secondary" className="justify-start" onClick={() => setAddOpen(true)}>
              <Plus className="h-4 w-4" />
              Add Unit
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="justify-start"
              onClick={() => {
                if (units.length === 0) {
                  toast.error("No units to rename.");
                  return;
                }
                setPendingRename(units[0]);
                setRenameName(units[0].name);
                setRenameOpen(true);
              }}
            >
              <Pencil className="h-4 w-4" />
              Rename Unit
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="justify-start"
              onClick={() => {
                if (units.length === 0) {
                  toast.error("No units to delete.");
                  return;
                }
                setPendingDelete(units[0]);
                setDeleteOpen(true);
              }}
            >
              <Trash2 className="h-4 w-4" />
              Delete Unit
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="justify-start"
              onClick={() => {
                if (units.length === 0) {
                  toast.error("Add a unit before uploading an image.");
                  return;
                }
                setUploadTargetId(units[0].id);
                setUploadOpen(true);
              }}
            >
              <ImageUp className="h-4 w-4" />
              Upload Unit Image
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-sm">
          <form onSubmit={handleAddUnit}>
            <DialogHeader>
              <DialogTitle className="mono uppercase tracking-wider">Add Unit</DialogTitle>
            </DialogHeader>
            <div className="space-y-1.5 py-2">
              <Label className="mono text-[10px] uppercase tracking-wider">Unit Name</Label>
              <Input value={unitName} onChange={(e) => setUnitName(e.target.value)} autoFocus />
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setAddOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">Add</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="mono uppercase tracking-wider">Rename Unit</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1.5">
              <Label className="mono text-[10px] uppercase tracking-wider">Select Unit</Label>
              <Select
                value={pendingRename?.id ?? ""}
                onValueChange={(id) => {
                  const unit = units.find((u) => u.id === id);
                  if (unit) {
                    setPendingRename(unit);
                    setRenameName(unit.name);
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose unit" />
                </SelectTrigger>
                <SelectContent>
                  {units.map((unit) => (
                    <SelectItem key={unit.id} value={unit.id}>
                      {unit.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="mono text-[10px] uppercase tracking-wider">New Name</Label>
              <Input value={renameName} onChange={(e) => setRenameName(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setRenameOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={confirmRename}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="mono uppercase tracking-wider">Delete unit?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>This removes the unit from Thuraya only. Other modules are not affected.</p>
                <Select
                  value={pendingDelete?.id ?? ""}
                  onValueChange={(id) => {
                    const unit = units.find((u) => u.id === id);
                    if (unit) setPendingDelete(unit);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choose unit" />
                  </SelectTrigger>
                  <SelectContent>
                    {units.map((unit) => (
                      <SelectItem key={unit.id} value={unit.id}>
                        {unit.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="mono uppercase tracking-wider">Upload Unit Image</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1.5">
              <Label className="mono text-[10px] uppercase tracking-wider">Select Unit</Label>
              <Select value={uploadTargetId} onValueChange={setUploadTargetId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose unit" />
                </SelectTrigger>
                <SelectContent>
                  {units.map((unit) => (
                    <SelectItem key={unit.id} value={unit.id}>
                      {unit.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="mono text-[10px] text-muted-foreground">
              Maximum image size: 100 KB. Larger files are rejected.
            </p>
            <Button type="button" variant="outline" onClick={() => fileRef.current?.click()}>
              <ImageUp className="h-4 w-4 mr-1" />
              Choose Image
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) void handleImageUpload(file);
              }}
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
