import type { MetadataRoute } from "next";
import { defaultLocale } from "@/i18n/config";

// Manifest de la PWA (/manifest.webmanifest). Sin service worker: el modo sin conexión es P2.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "wine-app",
    short_name: "wine-app",
    description: "Vinos y bodegas de España",
    // "/" para que el proxy redirija al idioma guardado o al del navegador.
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    lang: defaultLocale,
    background_color: "#faf7f2",
    theme_color: "#7b1e3a",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
