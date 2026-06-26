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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  ArrowUpDown,
  Download,
  FileText,
  Folder,
  FolderPlus,
  Search,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import {
  type DocumentModule,
  type DocFolder,
  type DocSortDir,
  type DocSortField,
  type StoredDocument,
  createFolder,
  downloadAndView,
  formatFileSize,
  getRecentDocuments,
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
          <div className="mono text-[11px] font-medium truncate" title={doc.filename}>
            {doc.filename}
          </div>
          <div className="text-[9px] text-muted-foreground mt-0.5">
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
}: {
  folder: DocFolder;
  docCount: number;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="panel p-3 flex flex-col gap-2 min-h-[100px] text-left hover:border-primary/40 transition-colors"
    >
      <div className="flex items-start gap-2">
        <Folder className="h-4 w-4 text-primary shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <div className="mono text-[11px] font-medium truncate">{folder.name}</div>
          <div className="text-[9px] text-muted-foreground mt-0.5">
            {docCount} document{docCount !== 1 ? "s" : ""}
          </div>
        </div>
      </div>
    </button>
  );
}

export function DocumentModuleModal({ module, open, onClose, title, accept }: Props) {
  const store = useDocumentStore(module);
  const fileRef = useRef<HTMLInputElement>(null);

  const [search, setSearch] = useState("");
  const [managerOpen, setManagerOpen] = useState(false);
  const [managerView, setManagerView] = useState<ManagerView>("home");
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  const [sortField, setSortField] = useState<DocSortField>("date");
  const [sortDir, setSortDir] = useState<DocSortDir>("desc");
  const [newFolderName, setNewFolderName] = useState("");
  const [selectedDocIds, setSelectedDocIds] = useState<Set<string>>(new Set());
  const [moveTargetFolderId, setMoveTargetFolderId] = useState<string>("__home__");

  const recent = useMemo(() => getRecentDocuments(module, 5), [store.documents, module]);

  const searchResults = useMemo(() => {
    if (!search.trim()) return null;
    return searchDocuments(module, search);
  }, [search, store.documents, module]);

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
    if (search.trim() && managerOpen) {
      return sortDocuments(searchDocuments(module, search), sortField, sortDir);
    }
    if (managerView === "folder" && activeFolderId) {
      return sortDocuments(folderDocs, sortField, sortDir);
    }
    return sortDocuments(homeDocs, sortField, sortDir);
  }, [search, managerOpen, managerView, activeFolderId, folderDocs, homeDocs, sortField, sortDir, module]);

  function resetManagerHome() {
    setManagerView("home");
    setActiveFolderId(null);
    setSelectedDocIds(new Set());
    setMoveTargetFolderId("__home__");
    setSearch("");
  }

  function openManagerHome() {
    resetManagerHome();
    setManagerOpen(true);
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

  async function handleUpload(files: FileList | null, folderId: string | null = activeFolderId) {
    if (!files?.length) return;
    for (const file of Array.from(files)) {
      const validation = validateDocumentUpload(module, file);
      if (!validation.ok) {
        toast.error(validation.error);
        continue;
      }
      const result = await uploadDocument(module, file, managerView === "folder" ? folderId : null);
      if ("error" in result) toast.error(result.error);
      else toast.success(`Uploaded ${file.name}`);
    }
    if (fileRef.current) fileRef.current.value = "";
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

  function handleMoveSelected() {
    if (selectedDocIds.size === 0) {
      toast.error("Select at least one document to move.");
      return;
    }
    const targetId = moveTargetFolderId === "__home__" ? null : moveTargetFolderId;
    moveDocuments(module, Array.from(selectedDocIds), targetId);
    toast.success(`${selectedDocIds.size} document${selectedDocIds.size !== 1 ? "s" : ""} moved.`);
    setSelectedDocIds(new Set());
  }

  function folderDocCount(folderId: string) {
    return store.documents.filter((d) => d.folderId === folderId).length;
  }

  return (
    <>
      <Dialog open={open && !managerOpen} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-w-xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="mono uppercase tracking-wider">{title}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by filename…"
                className="pl-8 mono text-[11px]"
              />
            </div>

            {search.trim() && (
              <div>
                {searchResults && searchResults.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground mono">No result found</p>
                ) : (
                  <ul className="space-y-1">
                    {searchResults?.map((d) => (
                      <li key={d.id} className="flex items-center justify-between gap-2">
                        <button
                          type="button"
                          className="mono text-[11px] hover:text-primary text-left truncate flex-1"
                          onClick={() => downloadAndView(d)}
                        >
                          {d.filename}
                        </button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-6 text-[9px] mono shrink-0"
                          onClick={() => downloadAndView(d)}
                        >
                          Download &amp; View
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <div>
              <div className="label-eyebrow mb-2">Last 5 uploads</div>
              {recent.length === 0 ? (
                <p className="text-[11px] text-muted-foreground mono">No documents uploaded yet.</p>
              ) : (
                <ul className="space-y-1">
                  {recent.map((d) => (
                    <li key={d.id} className="flex items-center justify-between gap-2">
                      <span className="mono text-[11px] truncate flex-1">{d.filename}</span>
                      <span className="text-[9px] text-muted-foreground shrink-0 hidden sm:inline">
                        {new Date(d.uploadedAt).toLocaleDateString()}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 text-[9px] mono shrink-0"
                        onClick={() => downloadAndView(d)}
                      >
                        Download &amp; View
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mono text-[10px] uppercase flex-1"
                onClick={openManagerHome}
              >
                View All
              </Button>
              <Button
                type="button"
                size="sm"
                className="mono text-[10px] uppercase flex-1"
                onClick={() => fileRef.current?.click()}
              >
                <Upload className="h-3 w-3 mr-1" /> Upload
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept={accept}
                multiple
                className="hidden"
                onChange={(e) => void handleUpload(e.target.files, null)}
              />
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Full-screen document manager */}
      <Dialog
        open={managerOpen}
        onOpenChange={(o) => {
          setManagerOpen(o);
          if (!o) resetManagerHome();
        }}
      >
        <DialogContent className="max-w-[95vw] w-full h-[95vh] max-h-[95vh] flex flex-col p-0 gap-0">
          <DialogHeader className="px-4 pt-4 pb-2 pr-12 border-b shrink-0">
            <div className="flex items-center justify-between gap-2">
              <DialogTitle className="mono uppercase tracking-wider">
                {title} — Document Manager
                {managerView === "folder" && activeFolder ? ` / ${activeFolder.name}` : " / Home"}
              </DialogTitle>
              <Button type="button" variant="outline" size="sm" className="h-7 mono text-[10px] shrink-0 mr-2" onClick={() => fileRef.current?.click()}>
                <Upload className="h-3 w-3 mr-1" /> Upload
              </Button>
            </div>
          </DialogHeader>

          <div className="flex flex-1 min-h-0">
            <aside className="w-52 border-r border-border p-2 shrink-0 overflow-auto flex flex-col gap-2">
              <div className="panel p-2 space-y-2 border border-border/80">
                <p className="text-[9px] mono uppercase tracking-wider text-muted-foreground">Create Folder</p>
                <p className="text-[10px] mono">1. Enter Folder Name</p>
                <Input
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  className="h-7 text-[10px] mono"
                  placeholder="Folder name"
                  onKeyDown={(e) => e.key === "Enter" && handleCreateFolder()}
                />
                <p className="text-[10px] mono">2. Press Create Folder</p>
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
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search within repository…"
                    className="pl-8 mono text-[11px] h-8"
                  />
                </div>
                <Button type="button" variant="ghost" size="sm" className="mono text-[9px] h-8" onClick={() => cycleSort("name")}>
                  Name <ArrowUpDown className="h-3 w-3 ml-1" />
                </Button>
                <Button type="button" variant="ghost" size="sm" className="mono text-[9px] h-8" onClick={() => cycleSort("size")}>
                  Size <ArrowUpDown className="h-3 w-3 ml-1" />
                </Button>
                <Button type="button" variant="ghost" size="sm" className="mono text-[9px] h-8" onClick={() => cycleSort("date")}>
                  Date <ArrowUpDown className="h-3 w-3 ml-1" />
                </Button>
              </div>

              {selectedDocIds.size > 0 && (
                <div className="px-4 py-2 border-b bg-secondary/20 flex flex-wrap items-center gap-2 shrink-0">
                  <span className="mono text-[10px]">{selectedDocIds.size} selected</span>
                  <Select value={moveTargetFolderId} onValueChange={setMoveTargetFolderId}>
                    <SelectTrigger className="h-8 text-[10px] mono w-[160px]">
                      <SelectValue placeholder="Move to Folder" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__home__">Home (no folder)</SelectItem>
                      {store.folders.map((f) => (
                        <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button type="button" size="sm" className="h-8 mono text-[10px]" onClick={handleMoveSelected}>
                    Move to Folder
                  </Button>
                </div>
              )}

              <div className="flex-1 overflow-auto p-4">
                {managerView === "home" && !search.trim() && store.folders.length === 0 && managerContent.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground mono">No folders or documents yet.</p>
                ) : managerView === "folder" && !search.trim() && managerContent.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground mono">No documents in this folder.</p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                    {managerView === "home" && !search.trim() &&
                      store.folders.map((folder) => (
                        <FolderTile
                          key={folder.id}
                          folder={folder}
                          docCount={folderDocCount(folder.id)}
                          onOpen={() => enterFolder(folder.id)}
                        />
                      ))}
                    {managerContent.map((doc) => (
                      <DocumentTile
                        key={doc.id}
                        doc={doc}
                        selected={selectedDocIds.has(doc.id)}
                        onToggleSelect={() => setSelectedDocIds((s) => toggleSelection(s, doc.id))}
                        onDownloadAndView={() => downloadAndView(doc)}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
