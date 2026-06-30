const STORAGE_KEY = "ssacc_local_files";

export const BUCKET = "ssacc-files";

function loadFiles(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function saveFiles(files: Record<string, string>): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(files));
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

/** Store a file locally and return its virtual path key. */
export async function uploadFile(file: File, prefix: string): Promise<string> {
  const path = `${prefix}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  const dataUrl = await readFileAsDataUrl(file);
  const files = loadFiles();
  files[path] = dataUrl;
  saveFiles(files);
  return path;
}

/** Resolve a stored path (or passthrough URL) to a browser-usable src URL. */
export function fileUrl(path: string): string {
  if (!path) return "";
  if (
    path.startsWith("data:") ||
    path.startsWith("http://") ||
    path.startsWith("https://") ||
    path.startsWith("blob:")
  ) {
    return path;
  }
  return loadFiles()[path] ?? "";
}

/** Local files do not expire — returns the same URL as fileUrl. */
export async function signedUrl(path: string, _expires = 3600): Promise<string> {
  return fileUrl(path);
}
