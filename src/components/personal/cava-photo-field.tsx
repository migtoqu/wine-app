"use client";

import { useEffect, useId, useRef, useState } from "react";
import { buttonStyles } from "@/components/ui";
import type { CavaFormLabels } from "@/lib/personal/cava";

// Foto de la botella con miniatura. Al elegirla (cámara o galería) se reduce en
// el navegador a JPEG de ≈1200 px, se enseña al momento y sustituye al fichero
// original en el <input>, así que el formulario envía la versión ligera.

const MAX_SIDE = 1200;
const QUALITY = 0.82;

async function shrink(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file, {
    imageOrientation: "from-image",
  });
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", QUALITY));
  if (!blob) throw new Error("toBlob");
  return new File([blob], "foto.jpg", { type: "image/jpeg" });
}

export function CavaPhotoField({
  labels,
  initialUrl,
  error,
}: {
  labels: CavaFormLabels["photo"];
  initialUrl: string | null;
  error?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(initialUrl);
  const [removed, setRemoved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [readError, setReadError] = useState(false);
  const ids = { input: useId(), hint: useId() };

  // React vacía el formulario tras cada envío (también si vuelve con errores):
  // la vista previa vuelve a la foto guardada para no enseñar una que ya no va.
  useEffect(() => {
    const form = inputRef.current?.form;
    if (!form) return;
    const onReset = () => {
      setPreview(initialUrl);
      setRemoved(false);
      setReadError(false);
    };
    form.addEventListener("reset", onReset);
    return () => form.removeEventListener("reset", onReset);
  }, [initialUrl]);

  // Libera la URL local de la vista previa al cambiarla o al salir.
  useEffect(() => {
    if (!preview?.startsWith("blob:")) return;
    return () => URL.revokeObjectURL(preview);
  }, [preview]);

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    setBusy(true);
    setReadError(false);
    try {
      const small = await shrink(file);
      const dt = new DataTransfer();
      dt.items.add(small);
      input.files = dt.files;
      setPreview(URL.createObjectURL(small));
      setRemoved(false);
    } catch {
      input.value = "";
      setReadError(true);
    } finally {
      setBusy(false);
    }
  }

  function remove() {
    if (inputRef.current) inputRef.current.value = "";
    setPreview(null);
    setRemoved(initialUrl !== null);
    setReadError(false);
  }

  const message = readError ? labels.unreadable : error;

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">{labels.label}</span>
      <div className="flex items-center gap-4">
        <div className="flex h-28 w-20 shrink-0 items-center justify-center overflow-hidden rounded-control border border-border bg-surface-2">
          {preview ? (
            // URL local (blob:) o firmada de Storage: <img> nativo.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt={labels.preview} className="h-full w-full object-cover" />
          ) : (
            <svg
              aria-hidden
              viewBox="0 0 24 24"
              className="h-8 w-8 text-muted"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path d="M10 2h4v4l1.5 2.5V21a1 1 0 0 1-1 1h-5a1 1 0 0 1-1-1V8.5L10 6V2Z" />
            </svg>
          )}
        </div>
        <div className="flex flex-col items-start gap-2">
          <label
            htmlFor={ids.input}
            className={buttonStyles({
              variant: "secondary",
              size: "sm",
              className: "cursor-pointer",
            })}
          >
            {busy ? labels.processing : preview ? labels.change : labels.add}
          </label>
          <input
            ref={inputRef}
            id={ids.input}
            type="file"
            name="foto"
            accept="image/*"
            onChange={onChange}
            disabled={busy}
            aria-invalid={message ? true : undefined}
            aria-describedby={message ? ids.hint : undefined}
            className="sr-only"
          />
          {preview && (
            <button type="button" onClick={remove} className={buttonStyles({ variant: "ghost", size: "sm" })}>
              {labels.remove}
            </button>
          )}
        </div>
      </div>
      {removed && <input type="hidden" name="foto_quitar" value="1" />}
      {message && (
        <p id={ids.hint} className="text-sm text-danger">
          {message}
        </p>
      )}
    </div>
  );
}
