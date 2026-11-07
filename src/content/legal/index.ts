import type { Locale } from "@/i18n/config";
import en from "./en";
import es from "./es";
import type { LegalContent } from "./types";

export const legalContent: Record<Locale, LegalContent> = { es, en };
