"use client";

import { useRouter } from "next/navigation";
import { useTransition, type FormEvent, type ReactNode } from "react";
import { parseSearchFilters, serializeSearchFilters, type RawSearchParams } from "@/lib/catalog/filters";

type Props = {
  action: string;
  children: ReactNode;
  className?: string;
};

// <form method="get"> de filtros. Sin JS envía la URL tal cual con el botón
// "Aplicar"; con JS navega en cliente al cambiar cualquier control, con la
// URL canónica (sin valores vacíos ni por defecto, y de vuelta a la página 1).
export function FilterForm({ action, children, className }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const navigate = (form: HTMLFormElement) => {
    const params: RawSearchParams = {};
    for (const [key, value] of new FormData(form)) {
      if (typeof value !== "string" || value === "" || key === "pagina") continue;
      const prev = params[key];
      params[key] = prev === undefined ? value : [...(Array.isArray(prev) ? prev : [prev]), value];
    }
    const href = action + serializeSearchFilters(parseSearchFilters(params));
    if (href === window.location.pathname + window.location.search) return;
    startTransition(() => router.push(href, { scroll: false }));
  };

  return (
    <form
      action={action}
      method="get"
      aria-busy={pending || undefined}
      className={className}
      // Los campos numéricos (precio) se aplican al salir del campo o con Enter, no a cada tecla.
      onChange={(event) => {
        if ((event.target as unknown as HTMLInputElement).type !== "number") navigate(event.currentTarget);
      }}
      onBlur={(event) => {
        if ((event.target as unknown as HTMLInputElement).type === "number") navigate(event.currentTarget);
      }}
      onSubmit={(event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        navigate(event.currentTarget);
      }}
    >
      {children}
    </form>
  );
}
