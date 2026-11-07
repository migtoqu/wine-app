// Normaliza texto para búsqueda y emparejamiento: sin tildes, en minúsculas
// y con espacios colapsados. Equivalente en cliente de public.f_unaccent.
export function normalizeText(input: string): string {
  return input
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}
