// Estado que devuelven las Server Actions de formularios del admin
// (useActionState). Solo claves de traducción: el cliente las resuelve con
// dict.admin.errors.

import type { AdminErrorKey, FieldErrors } from "./validation";

export type AdminFormState = {
  status: "idle" | "error" | "success";
  errors?: FieldErrors;
  message?: AdminErrorKey;
  // Lo enviado, para volver a rellenar el formulario tras un error.
  values?: Record<string, string | string[]>;
  // Cambia en cada respuesta: remonta el formulario con los valores nuevos.
  seq?: number;
};

export const initialAdminFormState: AdminFormState = { status: "idle" };
