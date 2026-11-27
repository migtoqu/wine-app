// Buscador general de Mi cava: interpreta lo que el usuario escribe («Dehesa de
// los Canónigos 15 meses cosecha 2019 mágnum x6») para rellenar el formulario.
// Saca la añada, los meses de crianza, el formato y la cantidad, y deja el
// resto como palabras para buscar el vino (RPC buscar_vinos_cava) y como
// nombre si el vino no está en el catálogo. Módulo puro, testeable.

export type ConsultaCava = {
  // Palabras normalizadas para buscar (minúsculas, sin tildes ni palabras vacías).
  palabras: string[];
  // Texto que queda tal cual lo escribió el usuario, para el nombre de un vino nuevo.
  texto: string;
  anio: number | null;
  meses: number | null;
  formato_ml: number | null;
  cantidad: number | null;
};

const VACIAS = new Set([
  "de", "del", "la", "las", "el", "los", "lo", "y", "e", "en", "con", "a", "al",
  "vino", "vinos", "bodega", "bodegas", "cosecha", "anada", "botella", "botellas",
  "do", "dop", "doca", "ca", "igp", "vt", "the", "of",
]);

const quitarTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");

export function normalizarPalabra(s: string): string {
  return quitarTildes(s.toLowerCase()).replace(/[^a-z0-9ñ]/g, "");
}

// Patrones sobre el texto en minúsculas y sin tildes. Cada uno se quita del
// texto al reconocerlo. El orden importa: «doble mágnum» antes que «mágnum».
const FORMATOS: [RegExp, number][] = [
  [/\b(doble\s+magnum|jeroboam|3\s*(l|litros))\b/, 3000],
  [/\b(magnum|1[.,]5\s*(l|litros?)|150\s*cl)\b/, 1500],
  [/\b(media(\s+botella)?|37[.,]5\s*cl|375\s*ml)\b/, 375],
  [/\b(benjamin|18[.,]7\s*cl|187\s*ml)\b/, 187],
  [/\b(50\s*cl|500\s*ml)\b/, 500],
  [/\b(75\s*cl|750\s*ml)\b/, 750],
];

export function interpretarConsulta(entrada: string, anioActual = new Date().getFullYear()): ConsultaCava {
  // Trabaja sobre una copia sin tildes y en minúsculas que conserva las
  // posiciones del original (quitar tildes con NFD + filtro no cambia la
  // longitud de los caracteres españoles habituales tras recomponer).
  const original = entrada.replace(/\s+/g, " ").trim().slice(0, 200);
  let resto = ` ${quitarTildes(original.toLowerCase())} `;
  let base = ` ${original} `;
  // Mantiene `base` (texto original) alineado con `resto` al borrar.
  const quitar = (re: RegExp): RegExpExecArray | null => {
    const m = re.exec(resto);
    if (!m) return null;
    const ini = m.index;
    const fin = ini + m[0].length;
    resto = `${resto.slice(0, ini)} ${resto.slice(fin)}`;
    base = `${base.slice(0, ini)} ${base.slice(fin)}`;
    return m;
  };
  if (resto.length !== base.length) base = resto; // tildes raras: sin texto original

  let formato_ml: number | null = null;
  for (const [re, ml] of FORMATOS) {
    if (quitar(re)) {
      formato_ml = ml;
      break;
    }
  }

  let cantidad: number | null = null;
  const c =
    quitar(/\b(?:caja|estuche|pack)\s+de\s+(\d{1,3})\b/) ??
    quitar(/(?:^|\s)x\s*(\d{1,3})\b/) ??
    quitar(/\b(\d{1,3})\s*x(?=\s)/) ??
    quitar(/\b(\d{1,3})\s*(?:botellas?|uds?\.?|unidades)(?=\s)/);
  if (c) {
    const n = Number(c[1]);
    if (n >= 1 && n <= 999) cantidad = n;
  }

  let meses: number | null = null;
  const m = quitar(/\b(\d{1,2})\s*(?:meses|mes|m)\b(?:\s+(?:en|de)\s+barrica)?/);
  if (m) meses = Number(m[1]);

  let anio: number | null = null;
  const a = quitar(new RegExp(`\\b(?:cosecha|anada|vendimia)?\\s*((?:19[5-9]|20[0-9])\\d)\\b`));
  if (a) {
    const n = Number(a[1]);
    if (n <= anioActual + 1) anio = n;
  }

  const texto = base.replace(/\s+/g, " ").trim();
  const palabras = [
    ...new Set(
      resto
        .split(/\s+/)
        .map(normalizarPalabra)
        .filter((w) => w.length >= 2 && !VACIAS.has(w)),
    ),
  ].slice(0, 12);

  return { palabras, texto, anio, meses, formato_ml, cantidad };
}

// Quita del texto el nombre de la bodega si el usuario lo ha escrito, para
// proponer el nombre de un vino nuevo («Dehesa de los Canónigos Roble» con la
// bodega «Dehesa de los Canónigos» → «Roble»). Si no queda nada, el texto entero.
export function nombreSinBodega(texto: string, bodega: string): string {
  const norm = (s: string) => quitarTildes(s.toLowerCase());
  const t = norm(texto);
  const sinPrefijo = norm(bodega).replace(/^(bodegas?|celler|cellers|vinos|vinedos|bodegas y vinedos)\s+/, "");
  for (const b of [norm(bodega), sinPrefijo]) {
    const i = b.length >= 3 ? t.indexOf(b) : -1;
    if (i >= 0) {
      const resto = `${texto.slice(0, i)} ${texto.slice(i + b.length)}`.replace(/\s+/g, " ").trim();
      return resto.length >= 2 ? resto : texto;
    }
  }
  return texto;
}
