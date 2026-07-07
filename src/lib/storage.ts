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
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(files));
  } catch (err) {
    if (err instanceof DOMException && err.name === "QuotaExceededError") {
      throw new Error(
        "Storage limit reached — too many images saved. Delete unused photos or use smaller image files.",
      );
    }
    throw err;
  }
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

/** Resize/compress large photos so many antenna images fit in localStorage. */
async function compressImageIfNeeded(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  if (file.size < 250_000) return file;

  return new Promise((resolve) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const maxW = 1280;
      const maxH = 960;
      let { width, height } = img;
      const scale = Math.min(maxW / width, maxH / height, 1);
      width = Math.max(1, Math.round(width * scale));
      height = Math.max(1, Math.round(height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(file);
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            resolve(file);
            return;
          }
          const base = file.name.replace(/\.[^.]+$/, "") || "photo";
          resolve(new File([blob], `${base}.jpg`, { type: "image/jpeg", lastModified: Date.now() }));
        },
        "image/jpeg",
        0.82,
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(file);
    };
    img.src = objectUrl;
  });
}

/** Store a file locally and return its virtual path key. */
export async function uploadFile(file: File, prefix: string): Promise<string> {
  const processed = await compressImageIfNeeded(file);
  const path = `${prefix}/${Date.now()}-${processed.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  const dataUrl = await readFileAsDataUrl(processed);
  const files = loadFiles();
  files[path] = dataUrl;
  try {
    saveFiles(files);
  } catch (err) {
    if (err instanceof DOMException && err.name === "QuotaExceededError") {
      throw new Error(
        "Storage limit reached — too many images saved. Delete unused photos or use smaller image files.",
      );
    }
    throw err;
  }
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
