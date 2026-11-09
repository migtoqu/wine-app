// Normalización de texto compartida por todas las fuentes.

/** Quita tildes y diacríticos (ñ → n, ç → c, ü → u). */
export function quitarTildes(s: string): string {
  return s.normalize("NFD").replace(/\p{M}+/gu, "");
}

/** Colapsa espacios (incluidos saltos de línea y nbsp) y recorta extremos. */
export function limpiarEspacios(s: string): string {
  return s.replace(/[\s ]+/g, " ").trim();
}

/** Texto limpio o null si queda vacío. */
export function textoONull(s: string | null | undefined): string | null {
  if (s == null) return null;
  const limpio = limpiarEspacios(s);
  return limpio === "" ? null : limpio;
}

/** Slug compatible con el check de la BD: ^[a-z0-9]+(-[a-z0-9]+)*$ */
export function slugify(s: string): string {
  return quitarTildes(s)
    .toLowerCase()
    .replace(/&/g, " y ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Formas societarias al final del nombre: «S.L.», «S.L.U.», «S.A.», «S.A.T.»,
// «S.C.», «S.Coop.», «Soc. Coop.», «Sociedad Cooperativa», «C.B.», «S.R.L.»…
// Se exige un separador (espacio o coma) delante para no comerse palabras.
// Siglas con puntos opcionales («S.L.», «SL», «S. L.»).
const siglas = (letras: string) => letras.split("").join("\\.?\\s?") + "\\.?";
// Siglas que solo se aceptan con puntos: sin ellos son palabras («SAL»).
const siglasConPuntos = (letras: string) => letras.split("").join("\\.\\s?") + "\\.?";

const FORMA_SOCIETARIA = new RegExp(
  "[,\\s]+(?:" +
    [
      ...["slne", "slu", "sll", "sau", "sat", "scl", "scp", "srl", "sl", "sa", "sc", "cb"].map(siglas),
      siglasConPuntos("sal"),
      "s\\.?\\s?coop\\.?(?:\\s?(?:ltda|l|and|cast|gall|cyl|clm)\\.?)?", // S.Coop., S.Coop. Ltda.
      "(?:soc(?:iedad)?|sdad)\\.?\\s?coop(?:erativa)?\\.?(?:\\s?(?:limitada|ltda|l)\\.?)?",
      "ltda\\.?",
    ].join("|") +
    ")[\\s.,;]*$",
  "i",
);

/** Quita la forma societaria final (repetida si hace falta) y la puntuación sobrante. */
export function quitarFormaSocietaria(nombre: string): string {
  let s = limpiarEspacios(nombre);
  for (let i = 0; i < 3; i++) {
    const sin = s.replace(FORMA_SOCIETARIA, "");
    if (sin === s || sin === "") break;
    s = sin;
  }
  return s.replace(/[\s.,;:]+$/, "");
}

// Palabras que van en minúscula salvo al principio del nombre.
const PARTICULAS = new Set(["de", "del", "la", "las", "los", "el", "y", "e", "en", "a", "al", "o"]);
const ROMANO = /^(?=[ivxlcdm]+$)m{0,3}(cm|cd|d?c{0,3})(xc|xl|l?x{0,3})(ix|iv|v?i{0,3})$/i;

/**
 * Si el texto viene entero en mayúsculas («AALTO BODEGAS Y VIÑEDOS») lo pasa
 * a «Aalto Bodegas y Viñedos». Si ya mezcla mayúsculas y minúsculas, lo respeta.
 */
export function capitalizarSiMayusculas(s: string): string {
  const limpio = limpiarEspacios(s);
  if (!/\p{Lu}/u.test(limpio) || /\p{Ll}/u.test(limpio)) return limpio;
  return limpio
    .split(" ")
    .map((palabra, i) => {
      const min = palabra.toLocaleLowerCase("es");
      if (i > 0 && PARTICULAS.has(min)) return min;
      if (ROMANO.test(palabra) && palabra.length > 1) return palabra;
      // Mayúscula tras guion, apóstrofo o paréntesis: «Viña-Mayor», «D'Anvers».
      return min.replace(/(^|[-'’(/])(\p{Ll})/gu, (_m, sep: string, c: string) =>
        sep + c.toLocaleUpperCase("es"),
      );
    })
    .join(" ");
}

/** Nombre de bodega para mostrar: sin forma societaria ni mayúsculas forzadas. */
export function nombreBodegaParaMostrar(razonSocial: string): string {
  return capitalizarSiMayusculas(quitarFormaSocietaria(razonSocial));
}

// Palabras genéricas que no distinguen una bodega de otra.
const GENERICAS_BODEGA = new Set([
  "bodega", "bodegas", "vinedo", "vinedos", "vino", "vinos", "celler", "cellers",
  "grupo", "hacienda", "de", "del", "la", "las", "los", "el", "y", "e", "the",
]);

/**
 * Clave de comparación de nombres de bodega: sin tildes, minúsculas, sin
 * forma societaria, sin puntuación ni palabras genéricas.
 * «BODEGAS Y VIÑEDOS CONDE DE SAN CRISTÓBAL, S.L.» → «conde san cristobal».
 */
export function claveNombreBodega(nombre: string): string {
  const base = quitarTildes(quitarFormaSocietaria(nombre))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  const palabras = base.split(" ").filter((p) => p !== "" && !GENERICAS_BODEGA.has(p));
  // Si el nombre es solo palabras genéricas («Bodegas y Viñedos»), se usa entero.
  return palabras.length > 0 ? palabras.join(" ") : base;
}

/** Clave de comparación genérica (marcas, nombres de vino): sin tildes ni puntuación. */
export function claveTexto(s: string): string {
  return quitarTildes(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
