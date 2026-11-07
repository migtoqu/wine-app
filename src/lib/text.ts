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

// Slug para URLs: sin tildes, minúsculas y guiones (cumple el check
// `^[a-z0-9]+(-[a-z0-9]+)*$` de las tablas del catálogo).
export function slugify(input: string): string {
  return normalizeText(input)
    .replace(/&/g, " y ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
