import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Download, ExternalLink, FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  downloadDocument,
  formatFileSize,
  type StoredDocument,
} from "@/lib/documentRepository";

type PreviewState =
  | { kind: "loading" }
  | { kind: "pdf" }
  | { kind: "table"; headers: string[]; rows: string[][] }
  | { kind: "text"; content: string }
  | { kind: "error"; message: string };

function fileExt(filename: string): string {
  return filename.split(".").pop()?.toLowerCase() ?? "";
}

function dataUrlToArrayBuffer(dataUrl: string): ArrayBuffer {
  const base64 = dataUrl.split(",")[1] ?? "";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function dataUrlToText(dataUrl: string): string {
  const comma = dataUrl.indexOf(",");
  if (comma < 0) return "";
  const meta = dataUrl.slice(0, comma);
  const payload = dataUrl.slice(comma + 1);
  if (meta.includes(";base64")) return atob(payload);
  return decodeURIComponent(payload);
}

function parseDelimitedText(text: string): { headers: string[]; rows: string[][] } {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) return { headers: [], rows: [] };

  const splitLine = (line: string) => {
    const cells: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
        continue;
      }
      if (ch === "," && !inQuotes) {
        cells.push(current.trim());
        current = "";
        continue;
      }
      current += ch;
    }
    cells.push(current.trim());
    return cells;
  };

  const headers = splitLine(lines[0]);
  const rows = lines.slice(1).map(splitLine);
  return { headers, rows };
}

async function buildPreview(doc: StoredDocument): Promise<PreviewState> {
  const ext = fileExt(doc.filename);
  const mime = doc.mimeType.toLowerCase();

  if (mime.includes("pdf") || ext === "pdf") {
    return { kind: "pdf" };
  }

  if (ext === "csv" || mime.includes("csv") || mime.includes("text/plain")) {
    const text = dataUrlToText(doc.dataUrl);
    const { headers, rows } = parseDelimitedText(text);
    if (headers.length === 0 && rows.length === 0) {
      return { kind: "text", content: text || "(Empty file)" };
    }
    return { kind: "table", headers, rows };
  }

  if (ext === "xlsx" || ext === "xls" || mime.includes("spreadsheet") || mime.includes("excel")) {
    const { read, utils } = await import("xlsx");
    const workbook = read(dataUrlToArrayBuffer(doc.dataUrl), { type: "array" });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) return { kind: "error", message: "Workbook has no sheets." };

    const sheet = workbook.Sheets[sheetName];
    const matrix = utils.sheet_to_json<string[]>(sheet, { header: 1, defval: "" }) as string[][];
    if (matrix.length === 0) return { kind: "error", message: "Sheet is empty." };

    const headers = matrix[0].map((cell) => String(cell ?? ""));
    const rows = matrix.slice(1).map((row) => row.map((cell) => String(cell ?? "")));
    return { kind: "table", headers, rows };
  }

  return {
    kind: "error",
    message: "Preview is not available for this file type. Use Download or Open Externally.",
  };
}

function TablePreview({ headers, rows }: { headers: string[]; rows: string[][] }) {
  const colCount = Math.max(headers.length, ...rows.map((r) => r.length), 1);

  return (
    <div className="overflow-auto h-full border border-border rounded-sm">
      <table className="w-full text-[11px] mono border-collapse">
        <thead className="sticky top-0 bg-card z-10">
          <tr className="border-b border-border">
            {Array.from({ length: colCount }, (_, i) => (
              <th
                key={i}
                className="text-left px-2 py-1.5 text-muted-foreground uppercase tracking-wider whitespace-nowrap border-r border-border/60 last:border-r-0"
              >
                {headers[i] ?? `Col ${i + 1}`}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={colCount} className="px-2 py-4 text-center text-muted-foreground">
                No data rows
              </td>
            </tr>
          ) : (
            rows.map((row, rowIdx) => (
              <tr key={rowIdx} className="border-b border-border/50 hover:bg-secondary/30">
                {Array.from({ length: colCount }, (_, i) => (
                  <td
                    key={i}
                    className="px-2 py-1 whitespace-nowrap border-r border-border/40 last:border-r-0 max-w-[240px] truncate"
                    title={row[i] ?? ""}
                  >
                    {row[i] ?? ""}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

type Props = {
  doc: StoredDocument;
  onClose: () => void;
};

export function DocumentEditorWindow({ doc, onClose }: Props) {
  const [preview, setPreview] = useState<PreviewState>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    setPreview({ kind: "loading" });
    void buildPreview(doc).then((next) => {
      if (!cancelled) setPreview(next);
    });
    return () => {
      cancelled = true;
    };
  }, [doc]);

  const uploadedLabel = useMemo(
    () => new Date(doc.uploadedAt).toLocaleString(),
    [doc.uploadedAt],
  );

  function openExternally() {
    window.open(doc.dataUrl, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="flex flex-col h-full min-h-0 bg-card/40">
      <div className="px-4 py-2 border-b border-border flex flex-wrap items-center gap-2 shrink-0 bg-card">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 mono text-[10px]"
          onClick={onClose}
        >
          <ArrowLeft className="h-3 w-3 mr-1" /> Back to Repository
        </Button>
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <FileText className="h-4 w-4 text-primary shrink-0" />
          <div className="min-w-0">
            <div className="mono text-[11px] font-medium truncate" title={doc.filename}>
              {doc.filename}
            </div>
            <div className="text-[9px] text-muted-foreground">
              {formatFileSize(doc.size)} · Uploaded {uploadedLabel}
            </div>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 mono text-[10px]"
          onClick={() => downloadDocument(doc)}
        >
          <Download className="h-3 w-3 mr-1" /> Download
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 mono text-[10px]"
          onClick={openExternally}
        >
          <ExternalLink className="h-3 w-3 mr-1" /> Open Externally
        </Button>
      </div>

      <div className="flex-1 min-h-0 p-4">
        {preview.kind === "loading" && (
          <div className="h-full grid place-items-center text-muted-foreground mono text-[11px] gap-2">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading preview…
          </div>
        )}

        {preview.kind === "pdf" && (
          <iframe
            title={doc.filename}
            src={doc.dataUrl}
            className="w-full h-full min-h-[420px] rounded-sm border border-border bg-white"
          />
        )}

        {preview.kind === "table" && (
          <TablePreview headers={preview.headers} rows={preview.rows} />
        )}

        {preview.kind === "text" && (
          <pre className="h-full overflow-auto panel p-3 mono text-[11px] whitespace-pre-wrap">
            {preview.content}
          </pre>
        )}

        {preview.kind === "error" && (
          <div className="h-full grid place-items-center">
            <div className="panel p-6 max-w-md text-center space-y-3">
              <p className="mono text-[11px] text-muted-foreground">{preview.message}</p>
              <div className="flex justify-center gap-2">
                <Button type="button" size="sm" variant="outline" className="mono text-[10px]" onClick={() => downloadDocument(doc)}>
                  <Download className="h-3 w-3 mr-1" /> Download
                </Button>
                <Button type="button" size="sm" variant="outline" className="mono text-[10px]" onClick={openExternally}>
                  <ExternalLink className="h-3 w-3 mr-1" /> Open Externally
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
