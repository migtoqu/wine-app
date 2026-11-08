import { describe, expect, it } from "vitest";
import { slugify } from "@/lib/text";
import {
  estadoInvitacion,
  formValues,
  nextFreeSlug,
  parseUvas,
  splitList,
  validateAnada,
  validateBodega,
  validateInvitacion,
  validateUva,
  validateVino,
} from "./validation";

function form(entries: Record<string, string | string[]>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) {
    for (const item of Array.isArray(v) ? v : [v]) f.append(k, item);
  }
  return f;
}

const D1 = "d0000000-0000-4000-8000-000000000001";
const D2 = "d0000000-0000-4000-8000-000000000002";
const B1 = "b0000000-0000-4000-8000-000000000001";

describe("slugs", () => {
  it("slugify quita tildes, símbolos y guiones sobrantes", () => {
    expect(slugify("  Bodegas Peñafiel & Hijos, S.L. ")).toBe("bodegas-penafiel-y-hijos-s-l");
    expect(slugify("¡¡¡")).toBe("");
  });

  it("nextFreeSlug añade -2, -3… si está ocupado", () => {
    expect(nextFreeSlug("aalto", [])).toBe("aalto");
    expect(nextFreeSlug("aalto", ["aalto", "aalto-2"])).toBe("aalto-3");
  });
});

describe("validateBodega", () => {
  const base = { nombre: " Aalto ", estado: "activa" };

  it("normaliza vacíos a null y números", () => {
    const r = validateBodega(form({ ...base, hectareas: "12,5", anio_fundacion: "1999", web: "" }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data).toMatchObject({ nombre: "Aalto", hectareas: 12.5, anio_fundacion: 1999, web: null });
    expect(r.data.denominaciones).toEqual([]);
  });

  it("valida nombre, URL, email, rango y slug", () => {
    const r = validateBodega(
      form({ nombre: "", estado: "activa", web: "ftp://x", email: "no", anio_fundacion: "3000", slug: "Mal Slug" }),
    );
    expect(r).toEqual({
      ok: false,
      errors: {
        nombre: "required",
        web: "invalidUrl",
        email: "invalidEmail",
        anio_fundacion: "outOfRange",
        slug: "invalidSlug",
      },
    });
  });

  it("D.O.: sin repetidos y la principal tiene que estar marcada", () => {
    const ok = validateBodega(form({ ...base, denominaciones: [D1, D1, D2, "x"], principal: D2 }));
    expect(ok.ok && ok.data).toMatchObject({ denominaciones: [D1, D2], principal: D2 });
    const ko = validateBodega(form({ ...base, denominaciones: [D1], principal: D2 }));
    expect(ko).toEqual({ ok: false, errors: { denominaciones: "principalNotSelected" } });
  });
});

describe("validateVino", () => {
  it("exige bodega y tipo válidos", () => {
    expect(validateVino(form({ nombre: "X", bodega_id: "no", tipo: "verde" }))).toEqual({
      ok: false,
      errors: { bodega_id: "invalidOption", tipo: "invalidOption" },
    });
    const r = validateVino(form({ nombre: "X", bodega_id: B1, tipo: "tinto", crianza: "" }));
    expect(r.ok && r.data).toMatchObject({ bodega_id: B1, tipo: "tinto", crianza: null });
  });
});

describe("añadas y uvas", () => {
  it("ignora filas vacías y rechaza más del 100 %", () => {
    expect(parseUvas(form({ uva_0: D1, pct_0: "60", uva_1: "", pct_1: "", uva_2: D2 }))).toEqual({
      ok: true,
      data: [
        { variedad_id: D1, porcentaje: 60 },
        { variedad_id: D2, porcentaje: null },
      ],
    });
    expect(parseUvas(form({ uva_0: D1, pct_0: "60", uva_1: D2, pct_1: "50" }))).toEqual({
      ok: false,
      errors: { uvas: "grapesOver100" },
    });
    expect(parseUvas(form({ uva_0: D1, uva_1: D1 }))).toEqual({ ok: false, errors: { uvas: "grapesDuplicate" } });
    expect(parseUvas(form({ pct_0: "10" }))).toEqual({ ok: false, errors: { uvas: "grapeMissing" } });
  });

  it("temperatura mínima ≤ máxima; sin año = sin añada", () => {
    expect(validateAnada(form({ temp_servicio_min: "18", temp_servicio_max: "14" }))).toEqual({
      ok: false,
      errors: { temp_servicio_max: "tempRange" },
    });
    const r = validateAnada(form({ anio: "", grado: "14.5" }));
    expect(r.ok && r.data).toMatchObject({ anio: null, grado: 14.5, uvas: [] });
  });
});

describe("uvas y listas", () => {
  it("separa sinónimos por comas y líneas", () => {
    expect(splitList("Tinta del País, Tinto Fino\nTinta del País,")).toEqual(["Tinta del País", "Tinto Fino"]);
    const r = validateUva(form({ nombre: "Tempranillo", sinonimos: "Tinto Fino", color: "tinta" }));
    expect(r.ok && r.data.sinonimos).toEqual(["Tinto Fino"]);
  });
});

describe("invitaciones", () => {
  const now = new Date("2026-11-07T10:00:00Z");

  it("normaliza el email y calcula la caducidad", () => {
    const r = validateInvitacion(form({ email: " Ana@Example.COM ", rol: "user", caduca_dias: "14" }), now);
    expect(r).toEqual({
      ok: true,
      data: { email: "ana@example.com", rol: "user", caduca: new Date("2026-11-21T10:00:00Z") },
    });
    const sin = validateInvitacion(form({ email: "a@b.es", rol: "admin", caduca_dias: "0" }), now);
    expect(sin.ok && sin.data.caduca).toBeNull();
  });

  it("estado: usada, caducada o pendiente", () => {
    expect(estadoInvitacion({ usada_en: "2026-11-01T00:00:00Z", caduca: null }, now)).toBe("usada");
    expect(estadoInvitacion({ usada_en: null, caduca: "2026-11-07T09:59:59Z" }, now)).toBe("caducada");
    expect(estadoInvitacion({ usada_en: null, caduca: null }, now)).toBe("pendiente");
  });
});

describe("formValues", () => {
  it("agrupa los valores repetidos y omite los campos internos de React", () => {
    expect(formValues(form({ a: "1", b: ["x", "y"], $ACTION_ID_1: "z" }))).toEqual({ a: "1", b: ["x", "y"] });
  });
});
