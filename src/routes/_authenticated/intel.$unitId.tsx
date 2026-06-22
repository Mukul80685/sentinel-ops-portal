import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { Empty } from "@/components/Empty";
import { listUnits } from "@/lib/queries";
import { supabase } from "@/integrations/supabase/client";
import { useCanEdit } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertTriangle, ArrowLeft, Download, Satellite, Upload } from "lucide-react";
import { toast } from "sonner";
import {
  INT_UNITS,
  mergeRecords,
  normalizeDbRow,
  groupBySatellite,
  formatDisplayDate,
  makeSatelliteKey,
  bandToPolarizations,
  loadSatMeta,
  saveSatMeta,
  validateUploadFile,
  parseUploadedFile,
  saveImportedRecords,
  loadImportedRecords,
  ACCEPTED_FILE_TYPES,
  type SatelliteSummary,
  type RepoEntry,
} from "@/lib/intelRepository";

export const Route = createFileRoute("/_authenticated/intel/$unitId")({
  component: IntelUnitView,
});

// ─── Download helper ──────────────────────────────────────────────────────────

function downloadSatelliteReport(unitName: string, summary: SatelliteSummary) {
  const rows: string[][] = [
    ["INT Repository — Satellite Report"],
    ["Unit", unitName],
    ["Satellite", summary.satellite],
    ["Polarization", summary.polarization],
    [""],
    ["Metric", "Value"],
    ["Total Frequencies Scanned", String(summary.totalScanned)],
    ["Productive", String(summary.productive)],
    ["Non-Productive", String(summary.nonProductive)],
    ["Productivity Rate (%)", summary.totalScanned > 0
      ? String(Math.round((summary.productive / summary.totalScanned) * 100))
      : "—"],
    ["Last Updated", summary.latestUpdate ? formatDisplayDate(summary.latestUpdate) : "—"],
    ["Upload Count", String(summary.uploadCount)],
  ];
  const csv  = rows.map(r => r.map(c => `"${c}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `INT_${unitName.replace(/\s+/g,"_")}_${summary.satellite.replace(/\s+/g,"_")}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Entry scan-state badges ──────────────────────────────────────────────────

function ScanStateBadge({ entry }: { entry: RepoEntry }) {
  if (entry.isInterim) {
    const color = entry.engagementStatus === "In Progress"
      ? "text-primary bg-primary/8 border-primary/20"
      : "text-amber-600 bg-amber-400/10 border-amber-400/25";
    return (
      <span className={`mono text-[7.5px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-sm border ${color}`}>
        {entry.engagementStatus}
      </span>
    );
  }
  if (entry.uploadCount === 0) {
    return (
      <span className="mono text-[7.5px] uppercase tracking-wider px-1.5 py-0.5 rounded-sm border text-muted-foreground/40 bg-secondary/30 border-border">
        Not Uploaded
      </span>
    );
  }
  const pct = entry.totalScanned > 0 ? Math.round((entry.productive / entry.totalScanned) * 100) : 0;
  const color = pct >= 60 ? "text-emerald-700 bg-emerald-500/10 border-emerald-500/25"
    : pct >= 30 ? "text-amber-600 bg-amber-400/10 border-amber-400/25"
    : "text-destructive bg-destructive/8 border-destructive/20";
  return <span className={`mono text-[7.5px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-sm border ${color}`}>
    {pct}% productive
  </span>;
}

// ─── Upload dialog ────────────────────────────────────────────────────────────

interface UploadDialogProps {
  open: boolean;
  onClose: () => void;
  unitId: string;
  unitLabel: string;
  entry: RepoEntry | null;
  /** Available polarizations filtered from visibility matrix */
  visiblePolarizations: string[];
  onSuccess: () => void;
}

function UploadDialog({ open, onClose, unitId, unitLabel, entry, visiblePolarizations, onSuccess }: UploadDialogProps) {
  const fileRef   = useRef<HTMLInputElement>(null);
  const [pol, setPol]       = useState("");
  const [date, setDate]     = useState(new Date().toISOString().slice(0, 16));
  const [file, setFile]     = useState<File | null>(null);
  const [fileError, setFileError] = useState("");
  const [busy, setBusy]     = useState(false);

  const noVisibility = visiblePolarizations.length === 0;

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setFileError("");
    const f = e.target.files?.[0] ?? null;
    if (!f) { setFile(null); return; }
    const err = validateUploadFile(f);
    if (err) { setFileError(err); setFile(null); e.target.value = ""; return; }
    setFile(f);
  }

  async function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!file || !entry) return;
    if (!pol) { toast.error("Please select a polarization."); return; }
    if (noVisibility) { toast.error("Satellite/polarization not accessible for this unit."); return; }

    setBusy(true);
    try {
      const records = await parseUploadedFile(file, unitId, unitLabel);
      if (records.length === 0) { toast.error("No records found in uploaded file."); setBusy(false); return; }

      // Stamp records with satellite name and chosen polarization
      const satName = entry.satellite !== "—" ? entry.satellite : "Unknown";
      const stamped = records.map(r => ({
        ...r,
        satellite:    r.satellite !== "Unknown" ? r.satellite : satName,
        polarization: r.polarization !== "KU-H" ? r.polarization : pol,
        collectionDate: date.slice(0, 10),
        unitId,
      }));

      // Merge into localStorage
      const existing = loadImportedRecords(unitId);
      saveImportedRecords(unitId, [...existing, ...stamped]);

      // Mark satellite as having data
      const satKey = makeSatelliteKey(entry.satellite, pol);
      saveSatMeta(unitId, satKey, { hasData: true, lastUpload: date.slice(0, 10) });

      toast.success(`${records.length} records uploaded for ${satName}`);
      onSuccess();
      onClose();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  // Reset form when dialog opens
  const [lastEntry, setLastEntry] = useState<string | null>(null);
  if (open && entry && entry.key !== lastEntry) {
    setLastEntry(entry.key);
    setPol(visiblePolarizations[0] ?? "");
    setFile(null);
    setFileError("");
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="mono uppercase tracking-wider text-[12px]">
            Upload Interim Repository Report
          </DialogTitle>
        </DialogHeader>

        {/* Satellite context */}
        <div className="rounded-sm border border-border bg-secondary/15 px-3 py-2 space-y-1">
          <Row label="Satellite" value={entry?.satellite ?? "—"} />
          <Row label="Unit"      value={`Unit ${unitLabel}`} />
          <Row label="Status"    value={entry?.isInterim ? (entry.engagementStatus ?? "—") : "Active"} />
        </div>

        {/* Visibility block warning */}
        {noVisibility && (
          <div className="flex items-start gap-2 rounded-sm border border-destructive/30 bg-destructive/5 px-3 py-2">
            <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
            <p className="mono text-[9px] text-destructive">
              Satellite/polarization not accessible for this unit. Upload is blocked.
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3 mt-1">
          {/* Polarization — filtered from visibility matrix */}
          <div>
            <Label className="label-eyebrow">
              Polarization (Visibility-filtered)
            </Label>
            <Select value={pol} onValueChange={setPol} disabled={noVisibility}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder={noVisibility ? "No visible beams" : "Select polarization"} />
              </SelectTrigger>
              <SelectContent>
                {visiblePolarizations.map(p => (
                  <SelectItem key={p} value={p}>{p}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {visiblePolarizations.length > 0 && (
              <p className="mono text-[7.5px] text-muted-foreground/50 mt-1">
                Only polarizations visible to this unit for this satellite are shown.
              </p>
            )}
          </div>

          {/* Date */}
          <div>
            <Label className="label-eyebrow">Collection Date & Time *</Label>
            <input
              required
              type="datetime-local"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="mt-1 w-full h-9 rounded-md border border-input bg-transparent px-3 py-1 mono text-[11px] shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          {/* File upload */}
          <div>
            <Label className="label-eyebrow">Upload File *</Label>
            <div className="mt-1 flex items-center gap-2">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={noVisibility}
                className="px-3 py-1.5 rounded-sm border border-border bg-card hover:bg-secondary/50
                           mono text-[10px] uppercase tracking-wider text-foreground
                           disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Browse
              </button>
              <span className="mono text-[10px] text-muted-foreground/60 truncate flex-1">
                {file ? file.name : "No file selected"}
              </span>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept={ACCEPTED_FILE_TYPES}
              onChange={handleFileChange}
              className="hidden"
            />
            {fileError ? (
              <p className="mono text-[9px] text-destructive mt-1">{fileError}</p>
            ) : (
              <p className="mono text-[7.5px] text-muted-foreground/40 mt-1">
                Accepted: .CSV and .XLSX only · PDF, DOC, images rejected
              </p>
            )}
          </div>

          <Button
            type="submit"
            disabled={busy || !file || noVisibility || !pol}
            className="w-full mono uppercase tracking-wider text-[10px]"
          >
            {busy ? "Uploading…" : noVisibility ? "Blocked — Visibility Constraint" : "Upload Report"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="mono text-[8px] text-muted-foreground/50 uppercase tracking-wider">{label}</span>
      <span className="mono text-[9px] font-semibold text-foreground">{value}</span>
    </div>
  );
}

// ─── Main view ────────────────────────────────────────────────────────────────

function IntelUnitView() {
  const { unitId } = Route.useParams();
  const navigate   = useNavigate();
  const canEdit    = useCanEdit();
  const qc         = useQueryClient();

  const { data: dbUnits = [] } = useQuery({ queryKey: ["units"], queryFn: listUnits });

  const unit = useMemo(() => {
    const local = INT_UNITS.find((u) => u.id === unitId);
    if (local) return local;
    const db = dbUnits.find((u) => u.id === unitId);
    if (db) return { id: db.id, code: db.code, name: db.name, location: db.location ?? "—" };
    return null;
  }, [unitId, dbUnits]);

  // Intel records for this unit
  const { data: dbRows = [], isLoading, refetch: refetchIntel } = useQuery({
    queryKey: ["intel", unitId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("intel_records")
        .select("*, satellites:satellite_id(name,id), units:unit_id(code)")
        .eq("unit_id", unitId);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!unitId,
  });

  // Active engagements for this unit
  const { data: engRows = [] } = useQuery({
    queryKey: ["eng-intel", unitId],
    queryFn: async () => {
      const { data } = await supabase
        .from("engagements")
        .select("id, satellite_id, status, satellites:satellite_id(id, name)")
        .eq("unit_id", unitId)
        .in("status", ["In Progress", "Planned", "Paused"]);
      return data ?? [];
    },
    enabled: !!unitId,
  });

  // Unit beam visibility — get visible beams for this unit
  const { data: visibilityRows = [] } = useQuery({
    queryKey: ["visibility", unitId],
    queryFn: async () => {
      const { data } = await supabase
        .from("unit_beam_visibility")
        .select("beam_id, visible, beams:beam_id(band, satellite_id)")
        .eq("unit_id", unitId)
        .eq("visible", true);
      return data ?? [];
    },
    enabled: !!unitId,
  });

  // Build map: satelliteDbId → available polarizations (from visible beams)
  const satVisibilityMap = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const row of visibilityRows as any[]) {
      const beam = row.beams;
      if (!beam) continue;
      const satDbId: string = beam.satellite_id;
      const pols = bandToPolarizations(beam.band);
      if (!m.has(satDbId)) m.set(satDbId, new Set());
      for (const p of pols) m.get(satDbId)!.add(p);
    }
    return m;
  }, [visibilityRows]);

  // Existing intel records → satellite summaries
  const records = useMemo(() => {
    if (!unit) return [];
    const normalized = dbRows.map((r) => normalizeDbRow(r as Record<string, unknown>, unit.name));
    return mergeRecords(normalized, unitId, unit.name);
  }, [dbRows, unitId, unit]);

  const existingSummaries = useMemo(() => groupBySatellite(records), [records]);

  // Refresh trigger for upload success
  const [uploadVer, setUploadVer] = useState(0);
  void uploadVer; // suppress unused warning

  // Build merged entry list: existing summaries + interim entries from engagements
  const allEntries = useMemo((): RepoEntry[] => {
    const existingKeys = new Set(existingSummaries.map(s => s.key));
    const existingSatIds = new Set(
      dbRows.filter((r: any) => r.satellite_id).map((r: any) => r.satellite_id as string),
    );

    // Interim entries: engaged satellites with no intel records yet
    const interimEntries: RepoEntry[] = [];
    const seenInterim = new Set<string>();

    for (const eng of engRows as any[]) {
      const satDbId: string = eng.satellite_id;
      const satName: string = eng.satellites?.name ?? "Unknown Satellite";
      if (existingSatIds.has(satDbId)) continue; // already has data
      if (seenInterim.has(satDbId)) continue;
      seenInterim.add(satDbId);

      const key = `interim-${satDbId}`;
      if (existingKeys.has(key)) continue;

      const visiblePols = Array.from(satVisibilityMap.get(satDbId) ?? []);
      const firstPol    = visiblePols[0] ?? "—";

      interimEntries.push({
        key,
        satellite:            satName,
        polarization:         firstPol,
        country:              "—",
        totalScanned:         0,
        productive:           0,
        nonProductive:        0,
        partiallyProductive:  0,
        unknown:              0,
        latestUpdate:         null,
        firstCollection:      null,
        uploadCount:          0,
        isInterim:            true,
        engagementStatus:     eng.status,
        satelliteDbId:        satDbId,
      });
    }

    // Put interim entries first (top of list), then existing
    return [...interimEntries, ...existingSummaries];
  }, [existingSummaries, dbRows, engRows, satVisibilityMap, uploadVer]);

  // Upload dialog state
  const [uploadEntry, setUploadEntry] = useState<RepoEntry | null>(null);

  function openUpload(entry: RepoEntry) {
    setUploadEntry(entry);
  }

  function handleUploadSuccess() {
    setUploadVer(v => v + 1);
    refetchIntel();
    qc.invalidateQueries({ queryKey: ["intel", unitId] });
  }

  // Compute visible polarizations for the selected upload entry
  const uploadPolarizations = useMemo(() => {
    if (!uploadEntry) return [];
    const satDbId = (uploadEntry as any).satelliteDbId;
    if (satDbId) return Array.from(satVisibilityMap.get(satDbId) ?? []);
    // For existing entries: return all polarizations the entry already has + visible bands
    return [uploadEntry.polarization].filter(Boolean);
  }, [uploadEntry, satVisibilityMap]);

  if (!unit) {
    return (
      <AppShell title="INT Repository" showBack>
        <Empty title="Unit not found" hint="Return to the repository home and select a valid unit." />
      </AppShell>
    );
  }

  const interimCount  = allEntries.filter(e => e.isInterim).length;
  const uploadedCount = allEntries.filter(e => !e.isInterim && e.uploadCount > 0).length;

  return (
    <AppShell
      title={`INT Repository — Unit ${unit.code}`}
      subtitle={unit.name}
      showBack
      headerIcon={<Satellite className="h-4 w-4 shrink-0" />}
    >
      {/* Breadcrumb + summary strip */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate({ to: "/intel" })}
            className="mono text-[11px] uppercase tracking-wider flex items-center gap-1
                       text-muted-foreground hover:text-primary transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> All Units
          </button>
          <span className="text-muted-foreground/40">·</span>
          <span className="mono text-[10px] text-muted-foreground">
            {allEntries.length} satellite record{allEntries.length !== 1 ? "s" : ""}
          </span>
          {interimCount > 0 && (
            <>
              <span className="text-muted-foreground/40">·</span>
              <span className="mono text-[9px] text-primary/70 bg-primary/8 border border-primary/20 px-1.5 py-0.5 rounded-sm">
                {interimCount} under scan
              </span>
            </>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="mono text-[8px] uppercase tracking-[0.15em] text-muted-foreground/40">
            {uploadedCount} with data · {interimCount} awaiting upload
          </span>
        </div>
      </div>

      {isLoading ? (
        <div className="panel p-6 text-center mono text-[11px] text-muted-foreground">
          Loading collection data…
        </div>
      ) : allEntries.length === 0 ? (
        <Empty
          title="No satellite profiles"
          hint="Assign a satellite for scanning via Engagement Status to create an interim repository entry."
        />
      ) : (
        <div className="panel overflow-hidden">
          {/* Table header */}
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-secondary/20">
            <div className="flex items-center gap-2.5">
              <Satellite className="h-3.5 w-3.5 text-primary" />
              <span className="mono text-[11px] font-bold uppercase tracking-wider text-foreground">
                Satellite Archive
              </span>
              <span className="mono text-[8px] uppercase tracking-[0.18em] text-primary/70 bg-primary/8 border border-primary/20 px-1.5 py-0.5 rounded-sm leading-none">
                Unit {unit.code}
              </span>
            </div>
            <span className="mono text-[8px] uppercase tracking-[0.15em] text-muted-foreground/40">
              {allEntries.length} records
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-secondary/25">
                  <th className="px-3 py-2 text-left mono text-[8px] uppercase tracking-wider text-foreground w-8">#</th>
                  <th className="px-3 py-2 text-left mono text-[8px] uppercase tracking-wider text-foreground">Satellite</th>
                  <th className="px-3 py-2 text-left mono text-[8px] uppercase tracking-wider text-foreground">Polarization</th>
                  <th className="px-3 py-2 text-left mono text-[8px] uppercase tracking-wider text-foreground">Last Updated</th>
                  <th className="px-3 py-2 text-left mono text-[8px] uppercase tracking-wider text-foreground">Scan Summary</th>
                  <th className="px-3 py-2 text-left mono text-[8px] uppercase tracking-wider text-foreground">State</th>
                  <th className="px-3 py-2 text-center mono text-[8px] uppercase tracking-wider text-foreground w-20">Actions</th>
                </tr>
              </thead>
              <tbody>
                {allEntries.map((entry, idx) => {
                  const hasData     = !entry.isInterim && entry.uploadCount > 0;
                  const pct         = entry.totalScanned > 0
                    ? Math.round((entry.productive / entry.totalScanned) * 100)
                    : 0;
                  const isInterim   = entry.isInterim === true;

                  return (
                    <tr
                      key={entry.key}
                      className={`border-b border-border/50 transition-colors ${
                        isInterim ? "bg-primary/[0.02] hover:bg-primary/[0.04]" : "hover:bg-secondary/20"
                      }`}
                    >
                      {/* # */}
                      <td className="px-3 py-2.5">
                        <span className="mono text-[10px] text-muted-foreground/35">{idx + 1}</span>
                      </td>

                      {/* Satellite */}
                      <td className="px-3 py-2.5">
                        <span className="mono text-[11px] font-bold text-foreground whitespace-nowrap uppercase">
                          {entry.satellite}
                        </span>
                        {!isInterim && entry.country && entry.country !== "—" && (
                          <div className="mono text-[8px] text-muted-foreground/50 mt-0.5">{entry.country}</div>
                        )}
                        {isInterim && (
                          <div className="mono text-[7.5px] text-primary/50 mt-0.5 uppercase tracking-wide">
                            Interim — Engagement Active
                          </div>
                        )}
                      </td>

                      {/* Polarization */}
                      <td className="px-3 py-2.5">
                        {entry.polarization && entry.polarization !== "—" ? (
                          <span className="mono text-[9px] font-semibold text-primary/90 bg-primary/5 border border-primary/15 px-1.5 py-0.5 rounded-sm leading-none whitespace-nowrap">
                            {entry.polarization}
                          </span>
                        ) : (
                          <span className="mono text-[9px] text-muted-foreground/40">—</span>
                        )}
                      </td>

                      {/* Last Updated */}
                      <td className="px-3 py-2.5">
                        <span className="mono text-[10px] text-foreground whitespace-nowrap">
                          {entry.latestUpdate ? formatDisplayDate(entry.latestUpdate) : "—"}
                        </span>
                      </td>

                      {/* Scan Summary */}
                      <td className="px-3 py-2.5">
                        {isInterim || !hasData ? (
                          <span className="mono text-[9px] text-muted-foreground/40 italic">Not uploaded</span>
                        ) : (
                          <div className="flex items-center gap-2">
                            <span className="mono text-[10px] text-foreground">
                              {entry.totalScanned.toLocaleString()} scanned
                            </span>
                            <span className="text-muted-foreground/30">·</span>
                            <span className="mono text-[10px] text-emerald-600 font-semibold">{pct}%</span>
                            <div className="mt-0.5 w-16 h-1 rounded-full bg-secondary overflow-hidden">
                              <div
                                className={`h-full rounded-full ${pct >= 60 ? "bg-emerald-500" : pct >= 30 ? "bg-amber-400" : "bg-destructive/60"}`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        )}
                      </td>

                      {/* State badge */}
                      <td className="px-3 py-2.5">
                        <ScanStateBadge entry={entry} />
                      </td>

                      {/* Actions */}
                      <td className="px-3 py-2.5">
                        <div className="flex items-center justify-center gap-1.5">
                          {/* Upload button — shown for interim or when canEdit */}
                          {canEdit && (isInterim || true) && (
                            <button
                              type="button"
                              title="Upload Report"
                              onClick={() => openUpload(entry)}
                              className="inline-flex items-center justify-center h-7 w-7 rounded-sm border border-border bg-card
                                         hover:bg-primary/10 hover:border-primary/40 hover:text-primary
                                         text-muted-foreground transition-colors"
                            >
                              <Upload className="h-3 w-3" />
                            </button>
                          )}

                          {/* Download button — disabled if no data */}
                          <button
                            type="button"
                            title={hasData ? "Download Report" : "No report available yet"}
                            disabled={!hasData}
                            onClick={() => hasData && downloadSatelliteReport(unit.name, entry as SatelliteSummary)}
                            className={`inline-flex items-center justify-center h-7 w-7 rounded-sm border transition-colors ${
                              hasData
                                ? "border-border bg-card hover:bg-secondary/60 hover:border-primary/30 hover:text-primary text-muted-foreground"
                                : "border-border/40 bg-secondary/10 text-muted-foreground/25 cursor-not-allowed"
                            }`}
                          >
                            <Download className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Upload dialog */}
      <UploadDialog
        open={!!uploadEntry}
        onClose={() => setUploadEntry(null)}
        unitId={unitId}
        unitLabel={unit.code}
        entry={uploadEntry}
        visiblePolarizations={uploadPolarizations}
        onSuccess={handleUploadSuccess}
      />
    </AppShell>
  );
}
