"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import NextLink from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { GeoJSONSource, Map as MapLibreMap, Marker, StyleSpecification } from "maplibre-gl";
import { Button } from "@/components/ui";
import { localePath, type Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/es";
import type { BodegaMapa } from "@/lib/catalog/types";
import { aGeoJson, cercanas, esAproximada, type BodegaCercana } from "@/lib/map/geo";

// Mapa de bodegas con MapLibre sobre teselas de OpenStreetMap (atribución obligatoria) y
// agrupación (clustering) de la propia fuente GeoJSON. «Cerca de mí» se calcula aquí, con
// los puntos ya cargados: la posición del usuario no se envía a ningún servidor.

// Solo cadenas: un Client Component no puede recibir funciones del diccionario.
export type MapLabels = Omit<Dictionary["map"], "intro">;
type Labels = MapLabels;
type Props = { lang: Locale; bodegas: BodegaMapa[]; labels: Labels };

const ESPANA: [number, number] = [-3.7, 40.1];
const OSM_ATRIBUCION =
  '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors';

const ESTILO: StyleSpecification = {
  version: 8,
  // Solo para el número de los grupos.
  glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      maxzoom: 19,
      attribution: OSM_ATRIBUCION,
    },
  },
  layers: [{ id: "osm", type: "raster", source: "osm" }],
};

function colorPrimario(): string {
  if (typeof window === "undefined") return "#7a1f3d";
  const v = getComputedStyle(document.documentElement).getPropertyValue("--primary").trim();
  return v || "#7a1f3d";
}

export function WineryMap({ lang, bodegas, labels }: Props) {
  const contenedor = useRef<HTMLDivElement>(null);
  const mapa = useRef<MapLibreMap | null>(null);
  const marcador = useRef<Marker | null>(null);
  const router = useRouter();
  const [estado, setEstado] = useState<"cargando" | "listo" | "error">("cargando");
  const [cerca, setCerca] = useState<{ estado: "inactivo" | "buscando" | "error" | "ok"; lista: BodegaCercana[] }>({
    estado: "inactivo",
    lista: [],
  });
  const geojson = useMemo(() => aGeoJson(bodegas), [bodegas]);

  useEffect(() => {
    let cancelado = false;
    let instancia: MapLibreMap | null = null;
    (async () => {
      try {
        const maplibre = await import("maplibre-gl");
        if (cancelado || !contenedor.current) return;
        // Con el bundler no se puede deducir la URL del worker: lo copia scripts/copiar-maplibre-worker.mjs.
        maplibre.setWorkerUrl(`/vendor/maplibre-gl-worker-${maplibre.getVersion()}.mjs`);
        const primario = colorPrimario();
        instancia = new maplibre.Map({
          container: contenedor.current,
          style: ESTILO,
          center: ESPANA,
          zoom: 5,
          minZoom: 4,
          maxZoom: 18,
          attributionControl: { compact: false },
        });
        mapa.current = instancia;
        instancia.addControl(new maplibre.NavigationControl({ showCompass: false }), "top-right");
        instancia.on("error", (e) => console.warn("mapa:", e.error?.message));

        instancia.on("load", () => {
          if (!instancia) return;
          instancia.addSource("bodegas", {
            type: "geojson",
            data: geojson,
            cluster: true,
            clusterRadius: 45,
            clusterMaxZoom: 12,
          });
          instancia.addLayer({
            id: "grupos",
            type: "circle",
            source: "bodegas",
            filter: ["has", "point_count"],
            paint: {
              "circle-color": primario,
              "circle-opacity": 0.85,
              "circle-stroke-color": "#ffffff",
              "circle-stroke-width": 2,
              "circle-radius": ["step", ["get", "point_count"], 14, 10, 18, 50, 24, 150, 30],
            },
          });
          instancia.addLayer({
            id: "grupos-numero",
            type: "symbol",
            source: "bodegas",
            filter: ["has", "point_count"],
            layout: {
              "text-field": ["get", "point_count_abbreviated"],
              "text-font": ["Open Sans Semibold"],
              "text-size": 13,
            },
            paint: { "text-color": "#ffffff" },
          });
          // Bodega: punto relleno; centroide de municipio: aro hueco (nunca parece exacto).
          instancia.addLayer({
            id: "bodegas",
            type: "circle",
            source: "bodegas",
            filter: ["!", ["has", "point_count"]],
            paint: {
              "circle-color": ["case", ["get", "aproximada"], "#ffffff", primario],
              "circle-stroke-color": primario,
              "circle-stroke-width": ["case", ["get", "aproximada"], 2.5, 1.5],
              "circle-radius": ["case", ["get", "aproximada"], 7, 6],
            },
          });

          instancia.on("click", "grupos", async (e) => {
            const f = e.features?.[0];
            if (!f || f.geometry.type !== "Point") return;
            const fuente = instancia!.getSource("bodegas") as GeoJSONSource;
            const zoom = await fuente.getClusterExpansionZoom(f.properties.cluster_id as number);
            instancia!.easeTo({ center: f.geometry.coordinates as [number, number], zoom });
          });
          instancia.on("click", "bodegas", (e) => {
            const f = e.features?.[0];
            if (!f || f.geometry.type !== "Point") return;
            const p = f.properties as { slug: string; nombre: string; lugar: string; aproximada: boolean | string };
            new maplibre.Popup({ closeButton: true, maxWidth: "260px" })
              .setLngLat(f.geometry.coordinates as [number, number])
              .setDOMContent(popup(p, lang, labels, (href) => router.push(href)))
              .addTo(instancia!);
          });
          for (const capa of ["grupos", "bodegas"]) {
            instancia.on("mouseenter", capa, () => (instancia!.getCanvas().style.cursor = "pointer"));
            instancia.on("mouseleave", capa, () => (instancia!.getCanvas().style.cursor = ""));
          }
          setEstado("listo");
        });
      } catch (e) {
        console.error(e);
        if (!cancelado) setEstado("error");
      }
    })();
    return () => {
      cancelado = true;
      instancia?.remove();
      mapa.current = null;
    };
    // El mapa se crea una vez; los datos no cambian durante la visita.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function buscarCerca() {
    if (!("geolocation" in navigator)) {
      setCerca({ estado: "error", lista: [] });
      return;
    }
    setCerca({ estado: "buscando", lista: [] });
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const yo = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        const lista = cercanas(bodegas, yo, 10, 150);
        setCerca({ estado: "ok", lista });
        const m = mapa.current;
        if (!m) return;
        const maplibre = await import("maplibre-gl");
        marcador.current?.remove();
        marcador.current = new maplibre.Marker({ color: "#2563eb" }).setLngLat([yo.lng, yo.lat]).addTo(m);
        if (lista.length > 0) {
          const limites = new maplibre.LngLatBounds([yo.lng, yo.lat], [yo.lng, yo.lat]);
          for (const b of lista) limites.extend([b.lng, b.lat]);
          m.fitBounds(limites, { padding: 48, maxZoom: 13 });
        } else {
          m.easeTo({ center: [yo.lng, yo.lat], zoom: 9 });
        }
      },
      () => setCerca({ estado: "error", lista: [] }),
      { enableHighAccuracy: false, timeout: 15_000, maximumAge: 300_000 },
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted">
        <span className="inline-flex items-center gap-2">
          <span aria-hidden className="size-3 rounded-full bg-primary" />
          {labels.legendExact}
        </span>
        <span className="inline-flex items-center gap-2">
          <span aria-hidden className="size-3 rounded-full border-2 border-primary bg-white" />
          {labels.legendApprox}
        </span>
      </div>

      <div className="relative overflow-hidden rounded-card border border-border bg-surface-2">
        <div
          ref={contenedor}
          role="region"
          aria-label={labels.regionLabel}
          className="h-[65vh] min-h-[22rem] w-full"
        />
        {estado !== "listo" && (
          <p className="absolute inset-0 grid place-items-center text-sm text-muted" aria-live="polite">
            {estado === "error" ? labels.unavailable : labels.loading}
          </p>
        )}
      </div>
      <p className="text-xs text-muted">{labels.attribution}</p>

      <section className="flex flex-col gap-3" aria-labelledby="cerca-de-mi">
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={buscarCerca} disabled={cerca.estado === "buscando"}>
            {cerca.estado === "buscando" ? labels.locating : labels.nearMe}
          </Button>
          <p className="text-sm text-muted">{labels.nearMeHint}</p>
        </div>
        <div aria-live="polite">
          {cerca.estado === "error" && <p className="text-sm text-danger">{labels.geoDenied}</p>}
          {cerca.estado === "ok" && (
            <>
              <h2 id="cerca-de-mi" className="text-xl font-semibold">
                {labels.nearTitle}
              </h2>
              {cerca.lista.length === 0 ? (
                <p className="text-sm text-muted">{labels.nearNone}</p>
              ) : (
                <ol className="mt-2 divide-y divide-border rounded-card border border-border bg-surface">
                  {cerca.lista.map((b) => (
                    <li key={b.id} className="flex items-baseline justify-between gap-4 px-4 py-3">
                      <div className="flex flex-col">
                        <NextLink
                          href={localePath(lang, `/bodega/${b.slug}`)}
                          className="font-semibold text-fg underline decoration-1 underline-offset-4 hover:decoration-2"
                        >
                          {b.nombre}
                        </NextLink>
                        <span className="text-sm text-muted">
                          {[b.municipio, b.provincia !== b.municipio ? b.provincia : null].filter(Boolean).join(", ")}
                          {esAproximada(b) ? ` · ${labels.approxNote}` : ""}
                        </span>
                      </div>
                      <span className="shrink-0 text-sm tabular-nums text-muted">
                        {new Intl.NumberFormat(lang, { maximumFractionDigits: b.distanciaKm < 10 ? 1 : 0 }).format(
                          b.distanciaKm,
                        )}{" "}
                        {labels.kilometers}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </>
          )}
        </div>
      </section>
    </div>
  );
}

/** Contenido del popup como DOM (sin HTML interpolado: los nombres vienen de fuentes externas). */
function popup(
  p: { slug: string; nombre: string; lugar: string; aproximada: boolean | string },
  lang: Locale,
  labels: Labels,
  navegar: (href: string) => void,
): HTMLElement {
  const raiz = document.createElement("div");
  raiz.className = "flex flex-col gap-1 text-sm text-neutral-900";
  const titulo = document.createElement("strong");
  titulo.className = "text-base";
  titulo.textContent = p.nombre;
  raiz.append(titulo);
  if (p.lugar) {
    const lugar = document.createElement("span");
    lugar.textContent = p.lugar;
    raiz.append(lugar);
  }
  // MapLibre serializa las propiedades de la fuente: el booleano puede llegar como texto.
  if (p.aproximada === true || p.aproximada === "true") {
    const nota = document.createElement("span");
    nota.className = "text-xs italic text-neutral-600";
    nota.textContent = labels.approxNote;
    raiz.append(nota);
  }
  const href = localePath(lang, `/bodega/${p.slug}`);
  const enlace = document.createElement("a");
  enlace.href = href;
  enlace.className = "mt-1 font-semibold underline underline-offset-4";
  enlace.textContent = labels.viewWinery;
  enlace.addEventListener("click", (e) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    navegar(href);
  });
  raiz.append(enlace);
  return raiz;
}
