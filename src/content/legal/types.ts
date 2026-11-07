import type { ReactNode } from "react";

export type LegalContent = {
  // Fecha ISO de la última revisión del texto.
  lastUpdated: string;
  privacy: ReactNode;
  cookies: ReactNode;
  legalNotice: ReactNode;
};
