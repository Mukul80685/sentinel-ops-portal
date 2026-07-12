/**
 * Document repository SSOT — Recent Discussions and Reports modules.
 *
 * In Electron, file bytes are stored on disk via IPC (same as equipment attachments).
 * Only metadata is kept in localStorage. Browser fallback stores small files inline.
 */

import { useEffect, useState } from "react";

export const DOCUMENT_REPO_EVENT = "ssacc-document-repo";

export type DocumentModule = "discussions" | "reports";

export type DocFolder = {
  id: string;
  name: string;
  createdAt: string;
};

export type StoredDocument = {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  uploadedAt: string;
  folderId: string | null;
  /** Inline base64 data URL (browser fallback for small files) */
  dataUrl?: string;
  /** Electron attachment path when stored on disk */
  storagePath?: string;
};

type DocumentStore = {
  folders: DocFolder[];
  documents: StoredDocument[];
};

const STORAGE_PREFIX = "ssacc_documents_";

const DISCUSSIONS_ALLOWED = ["pdf", "xlsx", "xls", "csv"];
const REPORTS_ALLOWED = ["xlsx", "xls", "csv"];

/** Browser-only inline limit — localStorage cannot hold large base64 blobs. */
const BROWSER_INLINE_MAX_BYTES = 4 * 1024 * 1024;
const DESKTOP_MAX_BYTES = 50 * 1024 * 1024;

type ElectronIpc = {
  invoke(channel: string, ...args: unknown[]): Promise<unknown>;
};

const ipc: ElectronIpc | undefined =
  typeof window !== "undefined"
    ? (window as Window & { electron?: { ipcRenderer: ElectronIpc } }).electron?.ipcRenderer
    : undefined;
const USE_IPC = !!ipc;

function storageKey(module: DocumentModule): string {
  return `${STORAGE_PREFIX}${module}`;
}

function emptyStore(): DocumentStore {
  return { folders: [], documents: [] };
}

function loadStore(module: DocumentModule): DocumentStore {
  if (typeof window === "undefined") return emptyStore();
  try {
    const raw = localStorage.getItem(storageKey(module));
    return raw ? (JSON.parse(raw) as DocumentStore) : emptyStore();
  } catch {
    return emptyStore();
  }
}

function saveStore(
  module: DocumentModule,
  store: DocumentStore,
): { ok: true } | { ok: false; error: string } {
  if (typeof window === "undefined") return { ok: true };
  try {
    localStorage.setItem(storageKey(module), JSON.stringify(store));
    window.dispatchEvent(new CustomEvent(DOCUMENT_REPO_EVENT, { detail: { module } }));
    return { ok: true };
  } catch (err) {
    const isQuota =
      err instanceof DOMException &&
      (err.name === "QuotaExceededError" || err.code === 22);
    return {
      ok: false,
      error: isQuota
        ? "Storage is full. Remove older documents or use a smaller file."
        : "Could not save document metadata.",
    };
  }
}

function ext(name: string): string {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function documentStoragePath(module: DocumentModule, docId: string, filename: string): string {
  return `documents/${module}/${docId}_${sanitizeFilename(filename)}`;
}

export function validateDocumentUpload(
  module: DocumentModule,
  file: File,
): { ok: true } | { ok: false; error: string } {
  const e = ext(file.name);
  if (module === "discussions") {
    if (!DISCUSSIONS_ALLOWED.includes(e)) {
      return { ok: false, error: "Incorrect file format. Only PDF/Excel/CSV allowed." };
    }
  } else if (!REPORTS_ALLOWED.includes(e)) {
    return { ok: false, error: "Report upload failed: only Excel/CSV formats allowed." };
  }

  const maxBytes = USE_IPC ? DESKTOP_MAX_BYTES : BROWSER_INLINE_MAX_BYTES;
  if (file.size > maxBytes) {
    return {
      ok: false,
      error: `File is too large (max ${formatFileSize(maxBytes)}).`,
    };
  }

  return { ok: true };
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file."));
    reader.readAsDataURL(file);
  });
}

async function persistDocumentBlob(storagePath: string, file: File): Promise<void> {
  const dataUrl = await readFileAsDataUrl(file);
  const base64 = dataUrl.split(",")[1];
  if (!base64) throw new Error("Could not read file contents.");
  await ipc!.invoke("attachment-save", storagePath, base64);
}

function deleteDocumentBlob(storagePath: string): void {
  void ipc?.invoke("attachment-delete", storagePath);
}

export async function resolveDocumentDataUrl(doc: StoredDocument): Promise<string> {
  if (doc.dataUrl) return doc.dataUrl;
  if (doc.storagePath && USE_IPC) {
    const base64 = (await ipc!.invoke("attachment-load", doc.storagePath)) as string | null;
    if (!base64) throw new Error("Stored file is missing on disk.");
    return `data:${doc.mimeType};base64,${base64}`;
  }
  throw new Error("Document data is unavailable.");
}

export async function uploadDocument(
  module: DocumentModule,
  file: File,
  folderId: string | null = null,
): Promise<StoredDocument | { error: string }> {
  const validation = validateDocumentUpload(module, file);
  if (!validation.ok) return { error: validation.error };

  try {
    const id = crypto.randomUUID();
    const uploadedAt = new Date().toISOString();
    const mimeType = file.type || "application/octet-stream";

    let doc: StoredDocument;

    if (USE_IPC) {
      const storagePath = documentStoragePath(module, id, file.name);
      await persistDocumentBlob(storagePath, file);
      doc = {
        id,
        filename: file.name,
        mimeType,
        size: file.size,
        uploadedAt,
        folderId,
        storagePath,
      };
    } else {
      const dataUrl = await readFileAsDataUrl(file);
      doc = {
        id,
        filename: file.name,
        mimeType,
        size: file.size,
        uploadedAt,
        folderId,
        dataUrl,
      };
    }

    const store = loadStore(module);
    store.documents.unshift(doc);
    const saved = saveStore(module, store);
    if (!saved.ok) {
      if (doc.storagePath) deleteDocumentBlob(doc.storagePath);
      return { error: saved.error };
    }
    return doc;
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Upload failed unexpectedly.",
    };
  }
}

export function createFolder(module: DocumentModule, name: string): DocFolder {
  const folder: DocFolder = {
    id: crypto.randomUUID(),
    name: name.trim(),
    createdAt: new Date().toISOString(),
  };
  const store = loadStore(module);
  store.folders.push(folder);
  saveStore(module, store);
  return folder;
}

export function moveDocument(
  module: DocumentModule,
  docId: string,
  folderId: string | null,
): void {
  moveDocuments(module, [docId], folderId);
}

export function moveDocuments(
  module: DocumentModule,
  docIds: string[],
  folderId: string | null,
): void {
  const ids = new Set(docIds);
  const store = loadStore(module);
  store.documents = store.documents.map((d) =>
    ids.has(d.id) ? { ...d, folderId } : d,
  );
  saveStore(module, store);
}

/** Duplicate documents into a target folder (null = home). Copies get new ids. */
export async function copyDocuments(
  module: DocumentModule,
  docIds: string[],
  folderId: string | null,
): Promise<void> {
  const ids = new Set(docIds);
  const store = loadStore(module);
  const copies: StoredDocument[] = [];

  for (const d of store.documents.filter((doc) => ids.has(doc.id))) {
    const newId = crypto.randomUUID();
    if (d.storagePath && USE_IPC) {
      const dataUrl = await resolveDocumentDataUrl(d);
      const base64 = dataUrl.split(",")[1];
      if (!base64) continue;
      const storagePath = documentStoragePath(module, newId, d.filename);
      await ipc!.invoke("attachment-save", storagePath, base64);
      copies.push({
        ...d,
        id: newId,
        folderId,
        storagePath,
        dataUrl: undefined,
        uploadedAt: new Date().toISOString(),
      });
    } else {
      copies.push({
        ...d,
        id: newId,
        folderId,
        uploadedAt: new Date().toISOString(),
      });
    }
  }

  store.documents.unshift(...copies);
  saveStore(module, store);
}

export function deleteDocuments(module: DocumentModule, docIds: string[]): void {
  const ids = new Set(docIds);
  const store = loadStore(module);
  for (const d of store.documents) {
    if (ids.has(d.id) && d.storagePath) deleteDocumentBlob(d.storagePath);
  }
  store.documents = store.documents.filter((d) => !ids.has(d.id));
  saveStore(module, store);
}

/** Delete a folder and every document inside it. */
export function deleteFolder(module: DocumentModule, folderId: string): void {
  const store = loadStore(module);
  for (const d of store.documents) {
    if (d.folderId === folderId && d.storagePath) deleteDocumentBlob(d.storagePath);
  }
  store.folders = store.folders.filter((f) => f.id !== folderId);
  store.documents = store.documents.filter((d) => d.folderId !== folderId);
  saveStore(module, store);
}

export function getDocuments(module: DocumentModule): StoredDocument[] {
  return loadStore(module).documents;
}

export function getFolders(module: DocumentModule): DocFolder[] {
  return loadStore(module).folders;
}

export function searchDocuments(
  module: DocumentModule,
  query: string,
): StoredDocument[] {
  const q = query.trim().toLowerCase();
  if (!q) return getDocuments(module);
  return getDocuments(module).filter((d) => d.filename.toLowerCase().includes(q));
}

export function getRecentDocuments(module: DocumentModule, limit = 5): StoredDocument[] {
  return [...getDocuments(module)]
    .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt))
    .slice(0, limit);
}

export type DocSortField = "name" | "size" | "date";
export type DocSortDir = "asc" | "desc";

export function sortDocuments(
  docs: StoredDocument[],
  field: DocSortField,
  dir: DocSortDir,
): StoredDocument[] {
  const copy = [...docs];
  copy.sort((a, b) => {
    let cmp = 0;
    if (field === "name") cmp = a.filename.localeCompare(b.filename, undefined, { sensitivity: "base" });
    else if (field === "size") cmp = a.size - b.size;
    else cmp = a.uploadedAt.localeCompare(b.uploadedAt);
    return dir === "asc" ? cmp : -cmp;
  });
  return copy;
}

export async function downloadDocument(doc: StoredDocument): Promise<void> {
  const dataUrl = await resolveDocumentDataUrl(doc);
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = doc.filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

/** Download file and open with the OS default application where supported. */
export async function downloadAndView(doc: StoredDocument): Promise<void> {
  const dataUrl = await resolveDocumentDataUrl(doc);
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = doc.filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.open(dataUrl, "_blank", "noopener,noreferrer");
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function useDocumentStore(module: DocumentModule): DocumentStore {
  const [store, setStore] = useState(() => loadStore(module));
  useEffect(() => {
    const refresh = (e: Event) => {
      const detail = (e as CustomEvent<{ module: DocumentModule }>).detail;
      if (!detail || detail.module === module) setStore(loadStore(module));
    };
    refresh(new Event("init"));
    window.addEventListener(DOCUMENT_REPO_EVENT, refresh);
    return () => window.removeEventListener(DOCUMENT_REPO_EVENT, refresh);
  }, [module]);
  return store;
}
