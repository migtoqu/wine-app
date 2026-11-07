// Partes de `text` que coinciden con `query`, sin distinguir tildes ni
// mayúsculas: highlightParts("Viña Pedrosa", "vina") →
// [{ text: "Viña", match: true }, { text: " Pedrosa", match: false }].
// Resalta cada palabra de la consulta (de al menos 2 letras) donde aparezca.
export type HighlightPart = { text: string; match: boolean };

const fold = (char: string) =>
  char.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

export function highlightParts(text: string, query: string): HighlightPart[] {
  // Texto plegado carácter a carácter, con el índice original de cada uno.
  let folded = "";
  const origin: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const f = fold(text[i]);
    for (let j = 0; j < f.length; j++) {
      folded += f[j];
      origin.push(i);
    }
  }

  const marked = new Array<boolean>(text.length).fill(false);
  const words = [...new Set(query.split(/\s+/).map((w) => [...w].map(fold).join("")))].filter(
    (w) => w.length >= 2,
  );
  for (const word of words) {
    let from = folded.indexOf(word);
    while (from !== -1) {
      for (let k = from; k < from + word.length; k++) marked[origin[k]] = true;
      from = folded.indexOf(word, from + word.length);
    }
  }

  const parts: HighlightPart[] = [];
  for (let i = 0; i < text.length; i++) {
    const last = parts[parts.length - 1];
    if (last && last.match === marked[i]) last.text += text[i];
    else parts.push({ text: text[i], match: marked[i] });
  }
  return parts;
}
