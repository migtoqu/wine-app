import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  cacheLife: {
    // Catálogo (fichas, opciones de filtro): los scrapers lo actualizan cada
    // semana. Se revalida a diario en segundo plano y nunca se sirve una
    // versión de más de una semana. Para refrescar al momento tras una carga:
    // revalidateTag("catalogo").
    catalogo: { stale: 300, revalidate: 86_400, expire: 604_800 },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
