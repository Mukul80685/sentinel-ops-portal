import { useMemo, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
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
  ArrowLeft,
  ArrowUpDown,
  Copy,
  Download,
  FileText,
  Folder,
  FolderPlus,
  FolderInput,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import {
  type DocumentModule,
  type DocFolder,
  type DocSortDir,
  type DocSortField,
  type StoredDocument,
  copyDocuments,
  createFolder,
  deleteDocuments,
  deleteFolder,
  downloadAndView,
  formatFileSize,
  moveDocuments,
  searchDocuments,
  sortDocuments,
  uploadDocument,
  useDocumentStore,
  validateDocumentUpload,
} from "@/lib/documentRepository";
import { toggleSelection } from "@/lib/dataTableUtils";

type Props = {
  module: DocumentModule;
  open: boolean;
  onClose: () => void;
  title: string;
  accept: string;
};

type ManagerView = "home" | "folder";

type DeleteTarget =
  | { type: "docs" }
  | { type: "folder"; folder: DocFolder }
  | null;

function DocumentTile({
  doc,
  selected,
  onToggleSelect,
  onDownloadAndView,
}: {
  doc: StoredDocument;
  selected: boolean;
  onToggleSelect: () => void;
  onDownloadAndView: () => void;
}) {
  return (
    <div className="panel p-3 flex flex-col gap-2 min-h-[100px]">
      <div className="flex items-start gap-2">
        <Checkbox checked={selected} onCheckedChange={onToggleSelect} className="mt-0.5" />
        <FileText className="h-4 w-4 text-primary shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <div className="mono text-[11px] font-semibold text-foreground truncate" title={doc.filename}>
            {doc.filename}
          </div>
          <div className="text-[9px] text-foreground font-medium mt-0.5">
            {formatFileSize(doc.size)} · {new Date(doc.uploadedAt).toLocaleDateString()}
          </div>
        </div>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-6 text-[9px] mono mt-auto w-full"
        onClick={onDownloadAndView}
      >
        <Download className="h-3 w-3 mr-0.5" /> Download &amp; View
      </Button>
    </div>
  );
}

function FolderTile({
  folder,
  docCount,
  onOpen,
  onDelete,
}: {
  folder: DocFolder;
  docCount: number;
  onOpen: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onOpen()}
      className="panel p-3 flex flex-col gap-2 min-h-[100px] text-left hover:border-primary/40 transition-colors cursor-pointer relative group"
    >
      <button
        type="button"
        title="Delete folder and its contents"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        className="absolute top-2 right-2 h-6 w-6 grid place-items-center rounded-sm border border-destructive/30
                   bg-card hover:bg-destructive/10 transition-colors text-destructive"
      >
        <Trash2 className="h-3 w-3" />
      </button>
      <div className="flex items-start gap-2 pr-7">
        <Folder className="h-4 w-4 text-primary shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <div className="mono text-[11px] font-semibold text-foreground truncate">{folder.name}</div>
          <div className="text-[9px] text-foreground font-medium mt-0.5">
            {docCount} document{docCount !== 1 ? "s" : ""}
          </div>
        </div>
      </div>
    </div>
  );
}

export function DocumentModuleModal({ module, open, onClose, title, accept }: Props) {
  const store = useDocumentStore(module);
  const fileRef = useRef<HTMLInputElement>(null);

  const [search, setSearch] = useState("");
  const [managerView, setManagerView] = useState<ManagerView>("home");
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  const [sortField, setSortField] = useState<DocSortField>("date");
  const [sortDir, setSortDir] = useState<DocSortDir>("desc");
  const [newFolderName, setNewFolderName] = useState("");
  const [selectedDocIds, setSelectedDocIds] = useState<Set<string>>(new Set());
  const [targetFolderId, setTargetFolderId] = useState<string>("__home__");
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null);

  const activeFolder = store.folders.find((f) => f.id === activeFolderId) ?? null;

  const homeDocs = useMemo(
    () => store.documents.filter((d) => !d.folderId),
    [store.documents],
  );

  const folderDocs = useMemo(() => {
    if (!activeFolderId) return [];
    return store.documents.filter((d) => d.folderId === activeFolderId);
  }, [store.documents, activeFolderId]);

  const managerContent = useMemo(() => {
    if (search.trim()) {
      return sortDocuments(searchDocuments(module, search), sortField, sortDir);
    }
    if (managerView === "folder" && activeFolderId) {
      return sortDocuments(folderDocs, sortField, sortDir);
    }
    return sortDocuments(homeDocs, sortField, sortDir);
  }, [search, managerView, activeFolderId, folderDocs, homeDocs, sortField, sortDir, module]);

  function resetState() {
    setManagerView("home");
    setActiveFolderId(null);
    setSelectedDocIds(new Set());
    setTargetFolderId("__home__");
    setSearch("");
    setDeleteTarget(null);
  }

  function handleClose() {
    resetState();
    onClose();
  }

  function enterFolder(folderId: string) {
    setActiveFolderId(folderId);
    setManagerView("folder");
    setSelectedDocIds(new Set());
  }

  function goBackToHome() {
    setManagerView("home");
    setActiveFolderId(null);
    setSelectedDocIds(new Set());
  }

  async function handleUpload(files: FileList | null) {
    if (!files?.length) return;
    const targetId = managerView === "folder" ? activeFolderId : null;
    for (const file of Array.from(files)) {
      const validation = validateDocumentUpload(module, file);
      if (!validation.ok) {
        toast.error(validation.error);
        continue;
      }
      try {
        const result = await uploadDocument(module, file, targetId);
        if ("error" in result) toast.error(result.error);
        else toast.success(`Uploaded ${file.name}`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Upload failed.");
      }
    }
    if (fileRef.current) fileRef.current.value = "";
  }

  async function handleDownloadAndView(doc: StoredDocument) {
    try {
      await downloadAndView(doc);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not open document.");
    }
  }

  function cycleSort(field: DocSortField) {
    if (sortField === field) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortField(field);
      setSortDir(field === "name" ? "asc" : "desc");
    }
  }

  function handleCreateFolder() {
    if (!newFolderName.trim()) {
      toast.error("Enter a folder name first.");
      return;
    }
    createFolder(module, newFolderName);
    setNewFolderName("");
    toast.success("Folder created");
  }

  function resolveTargetFolderId(): string | null {
    return targetFolderId === "__home__" ? null : targetFolderId;
  }

  function handleMoveSelected() {
    if (selectedDocIds.size === 0) {
      toast.error("Select at least one document to move.");
      return;
    }
    moveDocuments(module, Array.from(selectedDocIds), resolveTargetFolderId());
    toast.success(`${selectedDocIds.size} document${selectedDocIds.size !== 1 ? "s" : ""} moved.`);
    setSelectedDocIds(new Set());
  }

  async function handleCopySelected() {
    if (selectedDocIds.size === 0) {
      toast.error("Select at least one document to copy.");
      return;
    }
    try {
      await copyDocuments(module, Array.from(selectedDocIds), resolveTargetFolderId());
      toast.success(`${selectedDocIds.size} document${selectedDocIds.size !== 1 ? "s" : ""} copied.`);
      setSelectedDocIds(new Set());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not copy documents.");
    }
  }

  function confirmDelete() {
    if (!deleteTarget) return;

    if (deleteTarget.type === "docs") {
      const count = selectedDocIds.size;
      deleteDocuments(module, Array.from(selectedDocIds));
      setSelectedDocIds(new Set());
      toast.success(`${count} document${count !== 1 ? "s" : ""} deleted.`);
    } else {
      const { folder } = deleteTarget;
      deleteFolder(module, folder.id);
      if (activeFolderId === folder.id) goBackToHome();
      toast.success(`Folder "${folder.name}" deleted.`);
    }
    setDeleteTarget(null);
  }

  function folderDocCount(folderId: string) {
    return store.documents.filter((d) => d.folderId === folderId).length;
  }

  const deleteDescription =
    deleteTarget?.type === "folder"
      ? `Delete folder "${deleteTarget.folder.name}" and ${folderDocCount(deleteTarget.folder.id)} document(s) inside? This cannot be undone.`
      : `Delete ${selectedDocIds.size} document${selectedDocIds.size !== 1 ? "s" : ""}? This cannot be undone.`;

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
        <DialogContent className="max-w-[95vw] w-full h-[95vh] max-h-[95vh] flex flex-col p-0 gap-0">
          <DialogHeader className="px-4 pt-4 pb-2 pr-12 border-b shrink-0">
            <div className="flex items-center justify-between gap-2">
              <DialogTitle className="mono uppercase tracking-wider text-foreground font-bold">
                {title}
                {managerView === "folder" && activeFolder ? ` / ${activeFolder.name}` : " / Home"}
              </DialogTitle>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 mono text-[10px] shrink-0 mr-2"
                onClick={() => fileRef.current?.click()}
              >
                <Upload className="h-3 w-3 mr-1" /> Upload
              </Button>
            </div>
          </DialogHeader>

          <input
            ref={fileRef}
            type="file"
            accept={accept}
            multiple
            className="hidden"
            onChange={(e) => void handleUpload(e.target.files)}
          />

          <div className="flex flex-1 min-h-0">
            <aside className="w-52 border-r border-border p-2 shrink-0 overflow-auto flex flex-col gap-2">
              <div className="panel p-2 space-y-2 border border-border/80">
                <p className="text-[9px] mono uppercase tracking-wider text-foreground font-semibold">Create Folder</p>
                <Input
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  className="h-7 text-[10px] mono"
                  placeholder="Folder name"
                  onKeyDown={(e) => e.key === "Enter" && handleCreateFolder()}
                />
                <Button type="button" size="sm" variant="outline" className="w-full h-7 text-[9px] mono" onClick={handleCreateFolder}>
                  <FolderPlus className="h-3 w-3 mr-1" /> Create Folder
                </Button>
              </div>
            </aside>

            <div className="flex-1 flex flex-col min-w-0">
              <div className="px-4 py-2 border-b flex flex-wrap items-center gap-2 shrink-0">
                {managerView === "folder" && (
                  <Button type="button" variant="outline" size="sm" className="mono text-[9px] h-8" onClick={goBackToHome}>
                    <ArrowLeft className="h-3 w-3 mr-1" /> Back
                  </Button>
                )}
                <div className="relative flex-1 min-w-[160px]">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-foreground/60" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search within repository…"
                    className="pl-8 mono text-[11px] h-8"
                  />
                </div>
                <Button type="button" variant="ghost" size="sm" className="mono text-[9px] h-8 text-foreground font-medium" onClick={() => cycleSort("name")}>
                  Name <ArrowUpDown className="h-3 w-3 ml-1" />
                </Button>
                <Button type="button" variant="ghost" size="sm" className="mono text-[9px] h-8 text-foreground font-medium" onClick={() => cycleSort("size")}>
                  Size <ArrowUpDown className="h-3 w-3 ml-1" />
                </Button>
                <Button type="button" variant="ghost" size="sm" className="mono text-[9px] h-8 text-foreground font-medium" onClick={() => cycleSort("date")}>
                  Date <ArrowUpDown className="h-3 w-3 ml-1" />
                </Button>
              </div>

              {selectedDocIds.size > 0 && (
                <div className="px-4 py-2 border-b bg-secondary/20 flex flex-wrap items-center gap-2 shrink-0">
                  <span className="mono text-[10px] text-foreground font-semibold">{selectedDocIds.size} selected</span>
                  <Select value={targetFolderId} onValueChange={setTargetFolderId}>
                    <SelectTrigger className="h-8 text-[10px] mono w-[160px]">
                      <SelectValue placeholder="Target folder" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__home__">Home (no folder)</SelectItem>
                      {store.folders.map((f) => (
                        <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button type="button" size="sm" variant="outline" className="h-8 mono text-[10px]" onClick={handleMoveSelected}>
                    <FolderInput className="h-3 w-3 mr-1" /> Move
                  </Button>
                  <Button type="button" size="sm" variant="outline" className="h-8 mono text-[10px]" onClick={handleCopySelected}>
                    <Copy className="h-3 w-3 mr-1" /> Copy
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    className="h-8 mono text-[10px]"
                    onClick={() => setDeleteTarget({ type: "docs" })}
                  >
                    <Trash2 className="h-3 w-3 mr-1" /> Delete
                  </Button>
                </div>
              )}

              <div className="flex-1 overflow-auto p-4">
                {managerView === "home" && !search.trim() && store.folders.length === 0 && managerContent.length === 0 ? (
                  <p className="text-[11px] text-foreground mono font-medium">No folders or documents yet. Use "Upload" to add files.</p>
                ) : managerView === "folder" && !search.trim() && managerContent.length === 0 ? (
                  <p className="text-[11px] text-foreground mono font-medium">No documents in this folder.</p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                    {managerView === "home" && !search.trim() &&
                      store.folders.map((folder) => (
                        <FolderTile
                          key={folder.id}
                          folder={folder}
                          docCount={folderDocCount(folder.id)}
                          onOpen={() => enterFolder(folder.id)}
                          onDelete={() => setDeleteTarget({ type: "folder", folder })}
                        />
                      ))}
                    {managerContent.map((doc) => (
                      <DocumentTile
                        key={doc.id}
                        doc={doc}
                        selected={selectedDocIds.has(doc.id)}
                        onToggleSelect={() => setSelectedDocIds((s) => toggleSelection(s, doc.id))}
                        onDownloadAndView={() => void handleDownloadAndView(doc)}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle className="mono text-sm uppercase tracking-wide">
              {deleteTarget?.type === "folder" ? "Delete Folder" : "Delete Documents"}
            </AlertDialogTitle>
            <AlertDialogDescription className="mono text-[11px] text-foreground">
              {deleteDescription}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="mono text-[11px] uppercase tracking-wider">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="mono text-[11px] uppercase tracking-wider bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                confirmDelete();
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
