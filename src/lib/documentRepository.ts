/**
 * Document repository SSOT — Recent Discussions and Reports modules.
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
  /** Base64 data URL for local persistence */
  dataUrl: string;
};

type DocumentStore = {
  folders: DocFolder[];
  documents: StoredDocument[];
};

const STORAGE_PREFIX = "ssacc_documents_";

const DISCUSSIONS_ALLOWED = ["pdf", "xlsx", "xls", "csv"];
const REPORTS_ALLOWED = ["xlsx", "xls", "csv"];

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

function saveStore(module: DocumentModule, store: DocumentStore): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(storageKey(module), JSON.stringify(store));
  window.dispatchEvent(new CustomEvent(DOCUMENT_REPO_EVENT, { detail: { module } }));
}

function ext(name: string): string {
  return name.split(".").pop()?.toLowerCase() ?? "";
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
    return { ok: true };
  }
  if (!REPORTS_ALLOWED.includes(e)) {
    return { ok: false, error: "Report upload failed: only Excel/CSV formats allowed." };
  }
  return { ok: true };
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export async function uploadDocument(
  module: DocumentModule,
  file: File,
  folderId: string | null = null,
): Promise<StoredDocument | { error: string }> {
  const validation = validateDocumentUpload(module, file);
  if (!validation.ok) return { error: validation.error };

  const dataUrl = await readFileAsDataUrl(file);
  const doc: StoredDocument = {
    id: crypto.randomUUID(),
    filename: file.name,
    mimeType: file.type || "application/octet-stream",
    size: file.size,
    uploadedAt: new Date().toISOString(),
    folderId,
    dataUrl,
  };

  const store = loadStore(module);
  store.documents.unshift(doc);
  saveStore(module, store);
  return doc;
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

export function downloadDocument(doc: StoredDocument): void {
  const a = document.createElement("a");
  a.href = doc.dataUrl;
  a.download = doc.filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

/** Download file and open with the OS default application where supported. */
export function downloadAndView(doc: StoredDocument): void {
  downloadDocument(doc);
  window.open(doc.dataUrl, "_blank", "noopener,noreferrer");
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
