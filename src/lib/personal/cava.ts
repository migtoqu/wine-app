// Mi cava: validación del formulario y utilidades de presentación. Módulo puro
// (sin Supabase ni Next) para poder testearlo. Los límites son los mismos que
// las restricciones de la tabla (20261116180000_mi_cava.sql y 20261126214633_cava_fotos.sql).

import type { Dictionary } from "@/i18n/dictionaries/es";
import { isUuid } from "./validation";

export const CAVA_FORMATOS = [187, 375, 500, 750, 1500, 3000] as const;

export type CavaField =
  | "nombre"
  | "bodega_nombre"
  | "anio"
  | "cantidad"
  | "formato_ml"
  | "precio_compra"
  | "fecha_compra"
  | "tienda"
  | "ubicacion"
  | "beber_desde"
  | "beber_hasta"
  | "notas"
  | "foto";

export type CavaErrorKey = "required" | "tooLong" | "number" | "range" | "date" | "window" | "photo";

export type CavaInput = {
  vino_id: string | null;
  anada_id: string | null;
  bodega_id: string | null;
  nombre: string;
  bodega_nombre: string | null;
  anio: number | null;
  cantidad: number;
  formato_ml: number;
  precio_compra: number | null;
  fecha_compra: string | null;
  tienda: string | null;
  ubicacion: string | null;
  beber_desde: number | null;
  beber_hasta: number | null;
  notas: string | null;
};

type Result =
  | { ok: true; data: CavaInput }
  | { ok: false; errors: Partial<Record<CavaField, CavaErrorKey>> };

function text(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value.replace(/\r\n?/g, "\n").trim() : "";
}

export function validateCava(form: FormData): Result {
  const errors: Partial<Record<CavaField, CavaErrorKey>> = {};

  const optionalText = (field: CavaField, max: number): string | null => {
    const value = text(form, field);
    if (value.length > max) errors[field] = "tooLong";
    return value || null;
  };

  const integer = (field: CavaField, min: number, max: number, required = false): number | null => {
    const raw = text(form, field);
    if (raw === "") {
      if (required) errors[field] = "required";
      return null;
    }
    if (!/^\d+$/.test(raw)) {
      errors[field] = "number";
      return null;
    }
    const n = Number(raw);
    if (n < min || n > max) errors[field] = "range";
    return n;
  };

  const nombre = text(form, "nombre");
  if (nombre === "") errors.nombre = "required";
  else if (nombre.length > 200) errors.nombre = "tooLong";

  const bodega_nombre = optionalText("bodega_nombre", 200);
  const anio = integer("anio", 1800, 2200);
  const cantidad = integer("cantidad", 0, 9999, true) ?? 0;
  const formato_ml = integer("formato_ml", 50, 30000) ?? 750;

  // Acepta coma o punto decimal («12,50»).
  let precio_compra: number | null = null;
  const precioRaw = text(form, "precio_compra").replace(",", ".");
  if (precioRaw !== "") {
    if (!/^\d+(\.\d{1,2})?$/.test(precioRaw)) errors.precio_compra = "number";
    else {
      precio_compra = Number(precioRaw);
      if (precio_compra >= 1_000_000) errors.precio_compra = "range";
    }
  }

  let fecha_compra: string | null = text(form, "fecha_compra") || null;
  if (fecha_compra && !isIsoDate(fecha_compra)) {
    errors.fecha_compra = "date";
    fecha_compra = null;
  }

  const tienda = optionalText("tienda", 120);
  const ubicacion = optionalText("ubicacion", 120);
  const beber_desde = integer("beber_desde", 1800, 2200);
  const beber_hasta = integer("beber_hasta", 1800, 2200);
  if (beber_desde !== null && beber_hasta !== null && beber_hasta < beber_desde && !errors.beber_hasta) {
    errors.beber_hasta = "window";
  }
  const notas = optionalText("notas", 2000);

  const vino = text(form, "vino_id");
  const anada = text(form, "anada_id");
  // Con vino enlazado, la base de datos fija la bodega del vino (trigger).
  const bodega = text(form, "bodega_id");

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    data: {
      vino_id: isUuid(vino) ? vino.toLowerCase() : null,
      anada_id: isUuid(anada) ? anada.toLowerCase() : null,
      bodega_id: isUuid(bodega) ? bodega.toLowerCase() : null,
      nombre,
      bodega_nombre,
      anio,
      cantidad,
      formato_ml,
      precio_compra,
      fecha_compra,
      tienda,
      ubicacion,
      beber_desde,
      beber_hasta,
      notas,
    },
  };
}

// Vino del catálogo al que se enlaza un lote: nombre y bodega fijos y la añada
// se elige de su lista.
export type CavaVinoData = {
  id: string;
  nombre: string;
  bodega: string;
  bodega_id: string;
  anadas: { id: string; anio: number | null }[];
};

export function toCavaVino(ficha: {
  id: string;
  nombre: string;
  bodega: { id: string; nombre: string };
  anadas: { id: string; anio: number | null }[];
}): CavaVinoData {
  return {
    id: ficha.id,
    nombre: ficha.nombre,
    bodega: ficha.bodega.nombre,
    bodega_id: ficha.bodega.id,
    anadas: ficha.anadas.map((a) => ({ id: a.id, anio: a.anio })),
  };
}

// Foto de la botella. El navegador ya la reduce a JPEG; aquí solo se comprueba
// tipo y tamaño (los mismos que admite el bucket `cava-fotos`).
export const CAVA_FOTO_MAX_BYTES = 2 * 1024 * 1024;
export const CAVA_FOTO_TIPOS = ["image/jpeg", "image/png", "image/webp"] as const;

export type FotoInput = { ok: true; file: File | null; quitar: boolean } | { ok: false; error: CavaErrorKey };

export function parseFoto(form: FormData): FotoInput {
  const quitar = form.get("foto_quitar") === "1";
  const value = form.get("foto");
  if (!(value instanceof File) || value.size === 0) return { ok: true, file: null, quitar };
  if (!(CAVA_FOTO_TIPOS as readonly string[]).includes(value.type) || value.size > CAVA_FOTO_MAX_BYTES) {
    return { ok: false, error: "photo" };
  }
  return { ok: true, file: value, quitar: false };
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

// Momento de consumo según la ventana «beber entre/hasta» y el año actual.
export type DrinkWindow = "unknown" | "wait" | "ready" | "last" | "past";

export function drinkWindow(desde: number | null, hasta: number | null, year: number): DrinkWindow {
  if (desde === null && hasta === null) return "unknown";
  if (desde !== null && year < desde) return "wait";
  if (hasta !== null && year > hasta) return "past";
  if (hasta !== null && year === hasta) return "last";
  return "ready";
}

// Totales de la cava: botellas y valor de compra de lo que queda.
export function cavaTotals(lotes: { cantidad: number; precio_compra: number | null }[]) {
  return lotes.reduce(
    (acc, l) => ({
      botellas: acc.botellas + l.cantidad,
      valor: acc.valor + (l.precio_compra ?? 0) * l.cantidad,
    }),
    { botellas: 0, valor: 0 },
  );
}

// Textos del formulario de la cava. El formulario es un Client Component y el
// diccionario completo incluye funciones (total, bottles…), que React no puede
// pasar del servidor al cliente: se le envían solo los textos que usa.
export type CavaFormLabels = Pick<
  Dictionary["cava"],
  "fromCatalog" | "catalogHint" | "bodegaHint" | "fields" | "picker" | "formatos" | "save" | "cancel" | "errors"
> & { photo: Omit<Dictionary["cava"]["photo"], "alt"> };

export function cavaFormLabels(cava: Dictionary["cava"]): CavaFormLabels {
  const { fromCatalog, catalogHint, bodegaHint, fields, formatos, save, cancel, errors, picker } = cava;
  const { label, add, change, remove, preview, processing, unreadable } = cava.photo;
  const photo = { label, add, change, remove, preview, processing, unreadable };
  return { fromCatalog, catalogHint, bodegaHint, fields, formatos, save, cancel, errors, photo, picker };
}
