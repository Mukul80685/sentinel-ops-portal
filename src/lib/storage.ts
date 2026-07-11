const STORAGE_KEY = "ssacc_local_files";
export const BUCKET = "ssacc-files";

const ipc = (window as any).electron?.ipcRenderer;
const USE_IPC = !!ipc;

// Legacy localStorage fallback (for non-Electron or migration reads)
function loadFiles(): Record<string, string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch { return {}; }
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

async function compressEquipmentPhoto(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  return new Promise((resolve) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const maxW = 800, maxH = 600;
      let { width, height } = img;
      const scale = Math.min(maxW / width, maxH / height, 1);
      width = Math.max(1, Math.round(width * scale));
      height = Math.max(1, Math.round(height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) { resolve(file); return; }
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob((blob) => {
        if (!blob) { resolve(file); return; }
        const base = file.name.replace(/\.[^.]+$/, "") || "photo";
        resolve(new File([blob], `${base}.jpg`, { type: "image/jpeg", lastModified: Date.now() }));
      }, "image/jpeg", 0.72);
    };
    img.onerror = () => { URL.revokeObjectURL(objectUrl); resolve(file); };
    img.src = objectUrl;
  });
}

async function compressImageIfNeeded(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.size < 250_000) return file;
  return new Promise((resolve) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const maxW = 1280, maxH = 960;
      let { width, height } = img;
      const scale = Math.min(maxW / width, maxH / height, 1);
      width = Math.max(1, Math.round(width * scale));
      height = Math.max(1, Math.round(height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) { resolve(file); return; }
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob((blob) => {
        if (!blob) { resolve(file); return; }
        const base = file.name.replace(/\.[^.]+$/, "") || "photo";
        resolve(new File([blob], `${base}.jpg`, { type: "image/jpeg", lastModified: Date.now() }));
      }, "image/jpeg", 0.82);
    };
    img.onerror = () => { URL.revokeObjectURL(objectUrl); resolve(file); };
    img.src = objectUrl;
  });
}

export async function uploadFile(file: File, prefix: string): Promise<string> {
  const processed = prefix.startsWith("equipment/")
    ? await compressEquipmentPhoto(file)
    : await compressImageIfNeeded(file);
  const path = `${prefix}/${Date.now()}-${processed.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  const dataUrl = await readFileAsDataUrl(processed);
  const base64 = dataUrl.split(",")[1];

  if (USE_IPC) {
    await ipc.invoke('attachment-save', path, base64);
    // Store only the path key in localStorage (tiny — no blob)
    const index = loadFiles();
    index[path] = "__ipc__";
    localStorage.setItem(STORAGE_KEY, JSON.stringify(index));
  } else {
    const files = loadFiles();
    files[path] = dataUrl;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(files));
  }
  return path;
}

export function deleteStoredFile(path: string): void {
  if (!path || path.startsWith("data:") || path.startsWith("http") || path.startsWith("blob:")) return;
  if (USE_IPC) ipc.invoke('attachment-delete', path);
  const files = loadFiles();
  delete files[path];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(files));
}

export function fileUrl(path: string): string {
  if (!path) return "";
  if (path.startsWith("data:") || path.startsWith("http") || path.startsWith("blob:")) return path;
  const files = loadFiles();
  if (files[path] && files[path] !== "__ipc__") return files[path]; // legacy blob still in localStorage
  if (USE_IPC) {
    // Synchronous read not possible — callers that need async should use signedUrl()
    // Return empty; components using signedUrl() will get the real URL
    return "";
  }
  return files[path] ?? "";
}

export async function signedUrl(path: string, _expires = 3600): Promise<string> {
  if (!path) return "";
  if (path.startsWith("data:") || path.startsWith("http") || path.startsWith("blob:")) return path;
  const files = loadFiles();
  if (files[path] && files[path] !== "__ipc__") return files[path]; // legacy
  if (USE_IPC) {
    const base64 = await ipc.invoke('attachment-load', path);
    if (!base64) return "";
    // Detect mime from path extension
    const ext = path.split('.').pop()?.toLowerCase();
    const mime = ext === 'png' ? 'image/png' : 'image/jpeg';
    return `data:${mime};base64,${base64}`;
  }
  return "";
}