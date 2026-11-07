// Estado que devuelven las Server Actions de formularios (useActionState).
// Solo claves de traducción: el cliente las resuelve con dict.auth.errors.

import type { Dictionary } from "@/i18n/dictionaries/es";
import type { FieldErrors } from "./validation";

export type MessageKey = keyof Dictionary["auth"]["errors"];

export type FormState<F extends string = string> = {
  status: "idle" | "error" | "success";
  errors?: FieldErrors<F>;
  message?: MessageKey;
  // Valores no secretos para volver a rellenar el formulario tras un error.
  values?: Record<string, string>;
};

export const initialFormState: FormState = { status: "idle" };
