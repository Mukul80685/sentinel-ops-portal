import { useCallback, useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { renderAvatarCropFromImage } from "@/lib/userAccountStore";

type Props = {
  open: boolean;
  file: File | null;
  onSave: (dataUrl: string) => void;
  onCancel: () => void;
};

const PREVIEW_SIZE = 220;

export function AvatarCropDialog({ open, file, onSave, onCancel }: Props) {
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [imgSize, setImgSize] = useState({ w: 0, h: 0 });
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, ox: 0, oy: 0 });
  const previewRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!file || !open) {
      setImgUrl(null);
      setImgSize({ w: 0, h: 0 });
      setOffset({ x: 0, y: 0 });
      return;
    }
    const url = URL.createObjectURL(file);
    setImgUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file, open]);

  const coverScale =
    imgSize.w && imgSize.h
      ? Math.max(PREVIEW_SIZE / imgSize.w, PREVIEW_SIZE / imgSize.h)
      : 1;
  const imgW = imgSize.w * coverScale;
  const imgH = imgSize.h * coverScale;

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!imgUrl) return;
      previewRef.current?.setPointerCapture(e.pointerId);
      setDragging(true);
      dragStart.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
    },
    [imgUrl, offset.x, offset.y],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging) return;
      setOffset({
        x: dragStart.current.ox + (e.clientX - dragStart.current.x),
        y: dragStart.current.oy + (e.clientY - dragStart.current.y),
      });
    },
    [dragging],
  );

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    setDragging(false);
    previewRef.current?.releasePointerCapture(e.pointerId);
  }, []);

  async function handleSave() {
    if (!imgUrl || !imgSize.w) return;
    const dataUrl = await renderAvatarCropFromImage(imgUrl, imgSize.w, imgSize.h, offset.x, offset.y, PREVIEW_SIZE);
    onSave(dataUrl);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="mono uppercase tracking-wider text-sm">
            Adjust Profile Picture
          </DialogTitle>
        </DialogHeader>
        <p className="text-[10px] text-muted-foreground mono">
          Drag the image to position your face within the circle, then save.
        </p>
        <div
          ref={previewRef}
          className="mx-auto relative rounded-full overflow-hidden border-2 border-border bg-secondary cursor-move touch-none"
          style={{ width: PREVIEW_SIZE, height: PREVIEW_SIZE }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
        >
          {imgUrl && (
            <img
              src={imgUrl}
              alt="Crop preview"
              draggable={false}
              className="absolute select-none pointer-events-none max-w-none"
              onLoad={(e) => {
                const el = e.currentTarget;
                setImgSize({ w: el.naturalWidth, h: el.naturalHeight });
              }}
              style={{
                width: imgW || PREVIEW_SIZE,
                height: imgH || PREVIEW_SIZE,
                left: (PREVIEW_SIZE - (imgW || PREVIEW_SIZE)) / 2 + offset.x,
                top: (PREVIEW_SIZE - (imgH || PREVIEW_SIZE)) / 2 + offset.y,
              }}
            />
          )}
        </div>
        <div className="flex gap-2 justify-end">
          <Button type="button" variant="outline" size="sm" className="mono text-[10px]" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" size="sm" className="mono text-[10px]" onClick={() => void handleSave()} disabled={!imgUrl}>
            Save Picture
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
