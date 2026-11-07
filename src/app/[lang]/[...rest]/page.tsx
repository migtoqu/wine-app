import { notFound } from "next/navigation";

// Cualquier ruta sin coincidencia bajo /[lang] muestra el 404 localizado de [lang]/not-found.tsx
// (sin esto, Next usaría su 404 genérico, sin layout ni idioma).
// Siempre lanza notFound(): no hay nada que validar para navegación instantánea.
export const instant = false;

export default function CatchAll() {
  notFound();
}
