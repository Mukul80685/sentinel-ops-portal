import { useEffect, useRef, useState } from "react";
import { Download, FileUp, Pencil, Plus, Trash2 } from "lucide-react";
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
import { ACCEPTED_SPREADSHEET_ACCEPT } from "@/lib/dataTableUtils";
import {
  BEIDOU_DATA_EVENT,
  BEIDOU_EQUIPMENT_COLUMNS,
  deleteBeidouEquipment,
  deleteBeidouMessageType,
  formatBeidouMessageTypeLabel,
  isBeidouEquipmentServiceable,
  listBeidouEquipment,
  listBeidouMessageTypes,
  updateBeidouEquipment,
  updateBeidouMessageType,
  addBeidouMessageType,
  type BeidouEquipmentDraft,
  type BeidouEquipmentRow,
  type BeidouMessageType,
} from "@/lib/beidouStore";
import {
  downloadBeidouEquipmentTemplate,
  importBeidouEquipmentFile,
} from "@/lib/beidouEquipmentImport";

/** Matches uploaded SVG panel backgrounds — adjust if asset grey changes. */
export const BEIDOU_PANEL_BG = "#c8ccd4";

/** Five satellites: #1 ×2, #2 ×2, #3 ×1 — labels B1–B5 with orbital positions left to right. */
const BEIDOU_SATELLITE_SLOTS = [
  { label: "B1", image: "/beidou/satellite-1.png", arcIndex: 0, orbitalPosition: "58.8°E" },
  { label: "B2", image: "/beidou/satellite-2.png", arcIndex: 1, orbitalPosition: "80°E" },
  { label: "B3", image: "/beidou/satellite-3.png", arcIndex: 2, orbitalPosition: "110.5°E" },
  { label: "B4", image: "/beidou/satellite-1.png", arcIndex: 3, orbitalPosition: "140°E" },
  { label: "B5", image: "/beidou/satellite-2.png", arcIndex: 4, orbitalPosition: "155.5°E" },
] as const;

/** All five ground antennas use the same dish asset. */
const BEIDOU_ANTENNA_IMAGE = "/beidou/antenna-2.png";

const BEIDOU_ANTENNA_SLOTS = [
  { label: "Antenna 1", image: BEIDOU_ANTENNA_IMAGE },
  { label: "Antenna 2", image: BEIDOU_ANTENNA_IMAGE },
  { label: "Antenna 3", image: BEIDOU_ANTENNA_IMAGE },
  { label: "Antenna 4", image: BEIDOU_ANTENNA_IMAGE },
  { label: "Antenna 5", image: BEIDOU_ANTENNA_IMAGE },
] as const;

/** Vertical lift (px) — centre highest, left/right ends lowest (Earth arc). */
function satelliteArcLift(arcIndex: number, total: number): number {
  const centre = (total - 1) / 2;
  if (centre === 0) return 0;
  const dist = Math.abs(arcIndex - centre) / centre;
  return Math.round((1 - dist * dist) * 52);
}

const EQUIPMENT_GRID_COLS =
  "[grid-template-columns:minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_5.5rem]";

const EMPTY_EQUIPMENT_DRAFT: BeidouEquipmentDraft = {
  equipmentName: "",
  serialNumber: "",
  serviceability: "",
};

const EQUIPMENT_FIELD_KEYS = ["equipmentName", "serialNumber", "serviceability"] as const;

export function BeidouMonitoringView() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [equipment, setEquipment] = useState<BeidouEquipmentRow[]>(() => listBeidouEquipment());
  const [messageTypes, setMessageTypes] = useState<BeidouMessageType[]>(() =>
    listBeidouMessageTypes(),
  );

  const [editEquipment, setEditEquipment] = useState<BeidouEquipmentRow | null>(null);
  const [equipmentDraft, setEquipmentDraft] = useState<BeidouEquipmentDraft>(EMPTY_EQUIPMENT_DRAFT);
  const [deleteEquipment, setDeleteEquipment] = useState<BeidouEquipmentRow | null>(null);

  const [editMessage, setEditMessage] = useState<BeidouMessageType | null>(null);
  const [messageDraft, setMessageDraft] = useState("");
  const [deleteMessage, setDeleteMessage] = useState<BeidouMessageType | null>(null);
  const [newMessageLabel, setNewMessageLabel] = useState("");

  useEffect(() => {
    const refresh = () => {
      setEquipment(listBeidouEquipment());
      setMessageTypes(listBeidouMessageTypes());
    };
    window.addEventListener(BEIDOU_DATA_EVENT, refresh);
    return () => window.removeEventListener(BEIDOU_DATA_EVENT, refresh);
  }, []);

  function openEquipmentEdit(row: BeidouEquipmentRow) {
    setEditEquipment(row);
    setEquipmentDraft({
      equipmentName: row.equipmentName,
      serialNumber: row.serialNumber,
      serviceability: row.serviceability,
    });
  }

  function saveEquipmentEdit() {
    if (!editEquipment) return;
    if (!equipmentDraft.equipmentName.trim()) {
      toast.error("Equipment is required.");
      return;
    }
    const updated = updateBeidouEquipment(editEquipment.id, equipmentDraft);
    if (!updated) {
      toast.error("Could not save equipment row.");
      return;
    }
    toast.success("Equipment updated.");
    setEditEquipment(null);
  }

  function confirmEquipmentDelete() {
    if (!deleteEquipment) return;
    const ok = deleteBeidouEquipment(deleteEquipment.id);
    if (ok) toast.success(`Removed "${deleteEquipment.equipmentName}".`);
    else toast.error("Could not delete this row.");
    setDeleteEquipment(null);
  }

  async function handleEquipmentImport(file: File) {
    const result = await importBeidouEquipmentFile(file, "append");
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(
      `Imported ${result.imported} row${result.imported !== 1 ? "s" : ""}. Total: ${result.total}.`,
    );
  }

  function saveMessageEdit() {
    if (!editMessage) return;
    if (!messageDraft.trim()) {
      toast.error("Message type label is required.");
      return;
    }
    const updated = updateBeidouMessageType(editMessage.id, messageDraft);
    if (!updated) {
      toast.error("Could not save message type.");
      return;
    }
    toast.success("Message type updated.");
    setEditMessage(null);
  }

  function confirmMessageDelete() {
    if (!deleteMessage) return;
    const ok = deleteBeidouMessageType(deleteMessage.id);
    if (ok) toast.success(`Removed "${deleteMessage.label}".`);
    else toast.error("Could not delete message type.");
    setDeleteMessage(null);
  }

  function handleAddMessageType() {
    if (!newMessageLabel.trim()) {
      toast.error("Enter a message type label.");
      return;
    }
    const created = addBeidouMessageType(newMessageLabel);
    if (!created) {
      toast.error("Could not add message type.");
      return;
    }
    toast.success(`Added "${created.label}".`);
    setNewMessageLabel("");
  }

  return (
    <div className="flex flex-col gap-4 min-h-0 flex-1">
      {/* ── Unified sky-to-ground panel (satellites arc + antennas) ── */}
      <section
        className="rounded-lg overflow-hidden shrink-0"
        style={{ backgroundColor: BEIDOU_PANEL_BG }}
      >
        <div className="relative px-4 sm:px-8 pt-5 sm:pt-6 pb-5 sm:pb-6 w-full max-w-6xl mx-auto">
          {/* Satellite images — curved arc; centre (B3) highest, ends level */}
          <div className="flex items-end justify-between gap-2 sm:gap-4 min-h-[7.5rem] sm:min-h-[9rem]">
            {BEIDOU_SATELLITE_SLOTS.map((slot) => {
              const lift = satelliteArcLift(slot.arcIndex, BEIDOU_SATELLITE_SLOTS.length);
              return (
                <div
                  key={`${slot.label}-img`}
                  className="flex flex-1 min-w-0 justify-center"
                  style={{ transform: `translateY(${-lift}px)` }}
                >
                  <img
                    src={slot.image}
                    alt={slot.label}
                    draggable={false}
                    className="w-full max-w-[4.5rem] sm:max-w-[5.5rem] md:max-w-[6.5rem] lg:max-w-[7.5rem] h-auto object-contain drop-shadow-sm"
                  />
                </div>
              );
            })}
          </div>

          {/* Satellite labels — straight horizontal baseline */}
          <div className="flex justify-between gap-2 sm:gap-4 mt-3 sm:mt-4">
            {BEIDOU_SATELLITE_SLOTS.map((slot) => (
              <div
                key={`${slot.label}-labels`}
                className="flex flex-1 min-w-0 flex-col items-center text-center"
              >
                <span className="mono text-xs sm:text-sm font-bold uppercase tracking-wider text-gray-800">
                  {slot.label}
                </span>
                <span className="mono mt-0.5 text-[11px] sm:text-xs font-semibold tracking-wide text-gray-700">
                  {slot.orbitalPosition}
                </span>
              </div>
            ))}
          </div>

          {/* Antennas — straight line, mixed types, larger */}
          <div className="flex items-end justify-between gap-2 sm:gap-4 mt-8 sm:mt-10 pt-2">
            {BEIDOU_ANTENNA_SLOTS.map((slot) => (
              <div key={slot.label} className="flex flex-1 min-w-0 flex-col items-center gap-2">
                <img
                  src={slot.image}
                  alt={slot.label}
                  draggable={false}
                  className="w-full max-w-[6rem] sm:max-w-[8rem] md:max-w-[9.5rem] lg:max-w-[11rem] h-auto object-contain"
                />
                <span className="mono text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-gray-800">
                  {slot.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Equipment + message types ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 min-h-0 flex-1">
        {/* Equipment details */}
        <section className="panel flex flex-col min-h-[18rem] overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-b border-border bg-secondary/20">
            <h3 className="mono text-[10px] font-bold uppercase tracking-wider text-foreground">
              Equipment Details
            </h3>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mono text-[10px] uppercase tracking-wider h-7"
                onClick={() => downloadBeidouEquipmentTemplate()}
              >
                <Download className="h-3 w-3 mr-1" />
                Template
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mono text-[10px] uppercase tracking-wider h-7"
                onClick={() => fileRef.current?.click()}
              >
                <FileUp className="h-3 w-3 mr-1" />
                Import
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept={ACCEPTED_SPREADSHEET_ACCEPT}
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (file) void handleEquipmentImport(file);
                }}
              />
            </div>
          </div>

          <div
            className={`grid ${EQUIPMENT_GRID_COLS} gap-2 px-3 py-2 border-b border-border mono text-[9px] font-bold uppercase tracking-wider text-muted-foreground shrink-0`}
          >
            {BEIDOU_EQUIPMENT_COLUMNS.map((col) => (
              <span key={col}>{col}</span>
            ))}
            <span className="text-center">Actions</span>
          </div>

          {equipment.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground flex-1">
              No equipment loaded. Download the template, fill in details, and import.
            </p>
          ) : (
            <div className="overflow-y-auto flex-1 min-h-0 max-h-[22rem]">
              {equipment.map((row) => {
                const serviceable = isBeidouEquipmentServiceable(row.serviceability);
                return (
                <div
                  key={row.id}
                  className={`grid ${EQUIPMENT_GRID_COLS} gap-2 px-3 py-2 border-b border-border/60 items-center text-[12px] sm:text-[13px] mono`}
                >
                  <span className="flex items-center gap-2 min-w-0 font-semibold" title={row.equipmentName}>
                    {serviceable ? (
                      <span
                        className="inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.65)]"
                        aria-label="Serviceable"
                        title="Serviceable"
                      />
                    ) : (
                      <span className="inline-block h-2.5 w-2.5 shrink-0" aria-hidden="true" />
                    )}
                    <span className="truncate">{row.equipmentName}</span>
                  </span>
                  <span className="truncate" title={row.serialNumber}>
                    {row.serialNumber || "—"}
                  </span>
                  <span className="truncate" title={row.serviceability}>
                    {row.serviceability || "—"}
                  </span>
                  <div className="flex items-center justify-center gap-1">
                    <button
                      type="button"
                      aria-label={`Edit ${row.equipmentName}`}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-sm border border-border hover:bg-secondary/60"
                      onClick={() => openEquipmentEdit(row)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      aria-label={`Delete ${row.equipmentName}`}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-sm border border-border text-destructive hover:bg-destructive/10"
                      onClick={() => setDeleteEquipment(row)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
              })}
            </div>
          )}
        </section>

        {/* Message types */}
        <section className="panel flex flex-col min-h-[18rem] overflow-hidden">
          <div className="px-3 py-2 border-b border-border bg-secondary/20 text-center">
            <h3 className="mono text-[10px] font-bold uppercase tracking-wider text-foreground">
              Type of Messages
            </h3>
          </div>

          <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-border/60 shrink-0">
            <Input
              value={newMessageLabel}
              onChange={(e) => setNewMessageLabel(e.target.value)}
              placeholder="New message type…"
              className="h-8 flex-1 min-w-[8rem] text-[12px] mono"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAddMessageType();
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mono text-[10px] uppercase tracking-wider h-8 shrink-0"
              onClick={handleAddMessageType}
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              Add
            </Button>
          </div>

          <ul className="overflow-y-auto flex-1 min-h-0 max-h-[22rem] divide-y divide-border/60">
            {messageTypes.map((item, index) => (
              <li
                key={item.id}
                className="flex items-center justify-between gap-2 px-3 py-3 text-sm sm:text-base mono"
              >
                <span className="text-muted-foreground w-7 shrink-0 text-sm">{index + 1}.</span>
                <span className="flex-1 font-semibold truncate" title={item.label}>
                  {formatBeidouMessageTypeLabel(item.label)}
                </span>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    aria-label={`Edit ${item.label}`}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-sm border border-border hover:bg-secondary/60"
                    onClick={() => {
                      setEditMessage(item);
                      setMessageDraft(item.label);
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete ${item.label}`}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-sm border border-border text-destructive hover:bg-destructive/10"
                    onClick={() => setDeleteMessage(item)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {/* Equipment edit dialog */}
      <Dialog open={!!editEquipment} onOpenChange={(open) => !open && setEditEquipment(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="mono uppercase tracking-wider">Edit Equipment</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {BEIDOU_EQUIPMENT_COLUMNS.map((col, index) => {
              const field = EQUIPMENT_FIELD_KEYS[index];
              return (
                <div key={col} className="space-y-1.5">
                  <Label className="mono text-[10px] uppercase tracking-wider">{col}</Label>
                  <Input
                    value={equipmentDraft[field]}
                    onChange={(e) =>
                      setEquipmentDraft((prev) => ({ ...prev, [field]: e.target.value }))
                    }
                  />
                </div>
              );
            })}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setEditEquipment(null)}>
              Cancel
            </Button>
            <Button type="button" onClick={saveEquipmentEdit}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Equipment delete confirm */}
      <AlertDialog
        open={!!deleteEquipment}
        onOpenChange={(open) => !open && setDeleteEquipment(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="mono uppercase tracking-wider">
              Delete equipment row?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Remove <strong>{deleteEquipment?.equipmentName}</strong> from the equipment table?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmEquipmentDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Message type edit dialog */}
      <Dialog open={!!editMessage} onOpenChange={(open) => !open && setEditMessage(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="mono uppercase tracking-wider">Edit Message Type</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label className="mono text-[10px] uppercase tracking-wider">Label</Label>
            <Input
              value={messageDraft}
              onChange={(e) => setMessageDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveMessageEdit();
              }}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setEditMessage(null)}>
              Cancel
            </Button>
            <Button type="button" onClick={saveMessageEdit}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Message type delete confirm */}
      <AlertDialog open={!!deleteMessage} onOpenChange={(open) => !open && setDeleteMessage(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="mono uppercase tracking-wider">
              Delete message type?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Remove <strong>{deleteMessage?.label}</strong> from the list?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmMessageDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
