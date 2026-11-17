// Copia el worker de MapLibre a public/vendor/ (lo pide el mapa con setWorkerUrl): con el
// bundler, MapLibre no puede deducir la URL del worker a partir de import.meta.url.
// Se ejecuta en predev y prebuild; public/vendor/ no se versiona.
import { copyFile, mkdir, readFile } from "node:fs/promises";

const pkg = JSON.parse(await readFile(new URL("../node_modules/maplibre-gl/package.json", import.meta.url), "utf8"));
const destino = new URL("../public/vendor/", import.meta.url);
await mkdir(destino, { recursive: true });
await copyFile(
  new URL("../node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url),
  new URL(`maplibre-gl-worker-${pkg.version}.mjs`, destino),
);
console.log(`maplibre-gl-worker-${pkg.version}.mjs → public/vendor/`);
