"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { BackIcon } from "@/components/catalog/icons";
import { localeFromPathname, localePath } from "@/i18n/config";
import { parentPath } from "@/lib/navigation";

// Botón «Atrás» de la cabecera. Instalada como PWA (display: standalone) la app
// no tiene la barra del navegador, así que este es el único atrás visible.
// Vuelve en el historial si la página anterior es de la app; si se entró
// directamente (enlace compartido, PWA recién abierta), sube a la ruta padre.
export function BackButton({ label }: { label: string }) {
  const pathname = usePathname();
  const router = useRouter();
  // Páginas vistas en esta pestaña: a partir de la segunda hay un atrás propio.
  const visited = useRef(0);
  useEffect(() => {
    visited.current += 1;
  }, [pathname]);

  function goBack() {
    const inApp = visited.current > 1 || document.referrer.startsWith(window.location.origin);
    if (inApp) router.back();
    else router.push(parent ?? localePath(lang!));
  }

  const lang = localeFromPathname(pathname);
  const parent = parentPath(pathname);
  // En el inicio (/es) no hay adónde volver.
  if (!lang || parent === null) return null;

  return (
    <button
      type="button"
      onClick={goBack}
      aria-label={label}
      title={label}
      className="inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-fg hover:bg-surface-2"
    >
      <BackIcon className="size-5" />
    </button>
  );
}
