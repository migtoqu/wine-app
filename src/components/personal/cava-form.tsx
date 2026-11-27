"use client";

import NextLink from "next/link";
import { useActionState, useEffect, useId, useState, type ReactNode } from "react";
import { FormAlert } from "@/components/auth/form-parts";
import { SearchIcon } from "@/components/catalog/icons";
import { Button, buttonStyles, Input } from "@/components/ui";
import { localePath, type Locale } from "@/i18n/config";
import { formatPrice } from "@/i18n/format";
import { cn } from "@/lib/cn";
import {
  CAVA_FORMATOS,
  type CavaField,
  type CavaFormLabels,
  type CavaVinoData,
  type ResultadoBusquedaCava,
  type VinoSugerido,
} from "@/lib/personal/cava";
import { saveCavaLote, type CavaFormState } from "@/lib/personal/cava-actions";
import { nombreSinBodega, type ConsultaCava } from "@/lib/personal/cava-busqueda";
import { CatalogPicker } from "./catalog-picker";
import { CavaPhotoField } from "./cava-photo-field";

// Alta y edición de un lote de Mi cava, pensada para el móvil.
//
// 1. Buscar: un solo campo donde se escribe lo que pone la etiqueta. Se
//    entienden la añada, los meses, el formato y las botellas, y se proponen
//    los vinos del catálogo que mejor encajan (/api/cava/buscar).
// 2. Detalles: con el vino elegido (o escrito a mano) queda un formulario
//    corto ya rellenado: añada, botellas, formato, precio y foto. El resto va
//    plegado en «Más detalles». Guardar queda fijo abajo.

type Labels = CavaFormLabels;

export type CavaFormValues = {
  id?: string;
  vino_id: string | null;
  anada_id: string | null;
  bodega_id: string | null;
  nombre: string;
  bodega_nombre: string | null;
  anio: number | null;
  cantidad: number;
  formato_ml: number;
  precio_compra: number | null;
  fecha_compra: string | null;
  tienda: string | null;
  ubicacion: string | null;
  beber_desde: number | null;
  beber_hasta: number | null;
  notas: string | null;
  foto_url?: string | null;
};

export type CavaVino = CavaVinoData;

// Lo que se rellena al pasar de la búsqueda al formulario.
type Prefill = { anio: number | null; meses: number | null; cantidad: number | null; formato_ml: number | null };
type Libre = { nombre: string; bodega: { id: string | null; nombre: string } };

const initialState: CavaFormState = { status: "idle" };
const fill = (s: string, vars: Record<string, string | number>) =>
  s.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ""));

export function CavaForm({
  lang,
  labels,
  values,
  vino: initialVino,
}: {
  lang: Locale;
  labels: Labels;
  values: CavaFormValues;
  vino: CavaVino | null;
}) {
  const editing = Boolean(values.id);
  const [paso, setPaso] = useState<"buscar" | "detalles">(editing || initialVino ? "detalles" : "buscar");
  const [vino, setVino] = useState<CavaVino | null>(initialVino);
  const [libre, setLibre] = useState<Libre>({
    nombre: values.nombre,
    bodega: { id: values.bodega_id, nombre: values.bodega_nombre ?? "" },
  });
  const [prefill, setPrefill] = useState<Prefill | null>(null);
  const [query, setQuery] = useState("");
  // Cambia al volver de la búsqueda: reinicia los campos con los valores nuevos.
  const [ronda, setRonda] = useState(0);
  // Resultados ya pedidos: al volver a «Cambiar» se ven al momento.
  const [cache] = useState(() => new Map<string, ResultadoBusquedaCava>());

  // Al cambiar de paso, arriba del todo (en el móvil el paso anterior era largo).
  const ir = (p: "buscar" | "detalles") => {
    setPaso(p);
    window.scrollTo({ top: 0 });
  };

  const elegir = (v: VinoSugerido, c: ConsultaCava) => {
    setVino(v);
    setPrefill(c);
    setRonda((r) => r + 1);
    ir("detalles");
  };

  const aMano = (c: ConsultaCava | null, sugeridos: VinoSugerido[]) => {
    // Si el texto empieza por la bodega de un vino sugerido, se enlaza la bodega
    // y el resto queda como nombre del vino.
    const texto = c?.texto ?? "";
    const conBodega = sugeridos.find((v) => nombreSinBodega(texto, v.bodega) !== texto);
    setVino(null);
    setLibre({
      nombre: conBodega ? nombreSinBodega(texto, conBodega.bodega) : texto,
      bodega: conBodega ? { id: conBodega.bodega_id, nombre: conBodega.bodega } : { id: null, nombre: "" },
    });
    setPrefill(c);
    setRonda((r) => r + 1);
    ir("detalles");
  };

  if (paso === "buscar") {
    return (
      <BuscarVino
        labels={labels}
        cache={cache}
        query={query}
        setQuery={setQuery}
        onElegir={elegir}
        onAMano={aMano}
        cancelHref={editing ? undefined : localePath(lang, "/yo/cava")}
        onVolver={editing ? () => ir("detalles") : undefined}
      />
    );
  }

  return (
    <DetallesLote
      key={ronda}
      lang={lang}
      labels={labels}
      values={values}
      vino={vino}
      libre={libre}
      prefill={prefill}
      onCambiar={() => ir("buscar")}
    />
  );
}

// --- Paso 1: buscar ----------------------------------------------------------

const MIN_CHARS = 2;
const DEBOUNCE_MS = 250;

function BuscarVino({
  labels,
  cache,
  query,
  setQuery,
  onElegir,
  onAMano,
  cancelHref,
  onVolver,
}: {
  labels: Labels;
  cache: Map<string, ResultadoBusquedaCava>;
  query: string;
  setQuery: (q: string) => void;
  onElegir: (v: VinoSugerido, c: ConsultaCava) => void;
  onAMano: (c: ConsultaCava | null, vinos: VinoSugerido[]) => void;
  cancelHref?: string;
  onVolver?: () => void;
}) {
  const a = labels.alta;
  const id = useId();
  const trimmed = query.trim();
  const key = trimmed.toLowerCase();
  // Última respuesta recibida: se sigue enseñando (atenuada) mientras llega la nueva.
  const [ultima, setUltima] = useState<ResultadoBusquedaCava | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (key.length < MIN_CHARS || cache.has(key)) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      setFailed(false);
      try {
        const r = await fetch(`/api/cava/buscar?q=${encodeURIComponent(trimmed)}`, { signal: controller.signal });
        if (!r.ok) throw new Error(String(r.status));
        const data = (await r.json()) as ResultadoBusquedaCava;
        cache.set(key, data);
        setUltima(data);
      } catch (e) {
        if ((e as Error).name !== "AbortError") setFailed(true);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [key, trimmed, cache]);

  const activo = trimmed.length >= MIN_CHARS;
  const enCache = cache.get(key);
  const actual = activo ? (enCache ?? ultima) : null;
  const vinos = actual?.vinos ?? [];
  const consulta = actual?.consulta ?? null;
  const settled = Boolean(enCache);
  const detectado = consulta ? chipsDetectados(consulta, labels) : [];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <label htmlFor={`${id}-q`} className="text-lg font-semibold">
          {a.searchLabel}
        </label>
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted" />
          <input
            id={`${id}-q`}
            type="search"
            enterKeyHint="search"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            // El usuario viene a escribir: el teclado sale directamente.
            autoFocus
            maxLength={200}
            placeholder={a.searchPlaceholder}
            value={query}
            aria-describedby={`${id}-ej`}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              // Intro cierra el teclado para ver los resultados.
              if (e.key === "Enter") {
                e.preventDefault();
                e.currentTarget.blur();
              }
            }}
            className="h-12 w-full rounded-control border border-border-strong bg-surface pl-10 pr-3 text-base text-fg placeholder:text-muted [&::-webkit-search-cancel-button]:cursor-pointer"
          />
        </div>
        <p id={`${id}-ej`} className="text-sm text-muted">
          {a.searchExample}
        </p>
      </div>

      {detectado.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted">{a.detected}:</span>
          {detectado.map((c) => (
            <span key={c} className="rounded-full bg-primary-soft px-2.5 py-0.5 font-medium text-primary-soft-fg">
              {c}
            </span>
          ))}
        </div>
      )}

      <p aria-live="polite" className="sr-only">
        {activo ? (loading ? a.searching : settled ? fill(a.resultsCount, { n: vinos.length }) : "") : ""}
      </p>

      {activo && (
        <section aria-labelledby={`${id}-res`} className="flex flex-col gap-2">
          <h2 id={`${id}-res`} className="text-xs font-semibold uppercase tracking-wide text-muted">
            {a.results}
          </h2>
          {failed ? (
            <p className="text-sm font-medium text-danger">{a.searchError}</p>
          ) : vinos.length === 0 ? (
            <p className="text-sm text-muted">{settled ? a.noResults : a.searching}</p>
          ) : (
            <ul className={cn("flex flex-col gap-2 transition-opacity", !settled && "opacity-60")}>
              {vinos.map((v) => (
                <li key={v.id}>
                  <button
                    type="button"
                    onClick={() => onElegir(v, consulta!)}
                    className="flex w-full items-center gap-3 rounded-card border border-border bg-surface p-3 text-left hover:bg-surface-2 active:bg-surface-2"
                  >
                    <VinoThumb vino={v} />
                    <span className="flex min-w-0 flex-col">
                      <span className="font-semibold text-fg">{v.nombre}</span>
                      <span className="truncate text-sm text-muted">
                        {[v.bodega, v.denominacion].filter(Boolean).join(" · ")}
                      </span>
                      <span className="text-sm text-muted">{lineaVino(v, labels)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <button
        type="button"
        onClick={() => onAMano(consulta, vinos)}
        className="flex w-full flex-col items-start gap-0.5 rounded-card border border-dashed border-border-strong px-4 py-3 text-left hover:bg-surface-2"
      >
        <span className="font-medium text-primary">
          {activo && consulta?.texto ? fill(a.manual, { q: consulta.texto }) : a.manualEmpty}
        </span>
        <span className="text-sm text-muted">{a.manualHint}</span>
      </button>

      {(cancelHref || onVolver) &&
        (onVolver ? (
          <Button variant="ghost" onClick={onVolver} className="self-start">
            {labels.cancel}
          </Button>
        ) : (
          <NextLink href={cancelHref!} className={buttonStyles({ variant: "ghost", className: "self-start" })}>
            {labels.cancel}
          </NextLink>
        ))}
    </div>
  );
}

function chipsDetectados(c: ConsultaCava, labels: Labels): string[] {
  const a = labels.alta;
  return [
    c.anio ? fill(a.anada, { anio: c.anio }) : null,
    c.meses ? fill(a.meses, { n: c.meses }) : null,
    c.formato_ml ? (labels.formatos[c.formato_ml] ?? `${c.formato_ml / 10} cl`) : null,
    c.cantidad ? (c.cantidad === 1 ? a.bottle1 : fill(a.bottlesN, { n: c.cantidad })) : null,
  ].filter((x): x is string => Boolean(x));
}

function lineaVino(v: CavaVino, labels: Labels): string {
  const anios = v.anadas.flatMap((x) => (x.anio ? [x.anio] : []));
  return [
    v.tipo ? labels.wineTypes[v.tipo] : null,
    v.crianza && v.crianza !== "otra" ? labels.agings[v.crianza] : null,
    anios.length > 0 ? (anios.length > 3 ? `${anios.slice(0, 3).join(", ")}…` : anios.join(", ")) : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

const tipoColor: Record<string, string> = {
  tinto: "bg-[#7a1f2b]",
  rosado: "bg-[#e7a1a8]",
  blanco: "bg-[#e9d98b]",
  espumoso: "bg-[#efe3b0]",
  generoso: "bg-[#b8782f]",
  dulce: "bg-[#c98b2b]",
  naranja: "bg-[#d98a3d]",
};

function VinoThumb({ vino }: { vino: CavaVino }) {
  // Muchas fotos son de webs de bodegas que bloquean el enlace directo: si no
  // carga, el marcador del color del vino.
  const [rota, setRota] = useState(false);
  return (
    <span className="flex h-16 w-12 shrink-0 items-center justify-center overflow-hidden rounded-control bg-surface-2">
      {vino.imagen_url && !rota ? (
        // Imágenes de terceros de distintos dominios: <img> nativo, como en la cava.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={vino.imagen_url}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setRota(true)}
          className="h-full w-full bg-white object-contain"
        />
      ) : (
        <span aria-hidden className={cn("h-10 w-3 rounded-full", tipoColor[vino.tipo ?? ""] ?? "bg-border-strong")} />
      )}
    </span>
  );
}

// --- Paso 2: detalles ----------------------------------------------------------

function DetallesLote({
  lang,
  labels,
  values,
  vino,
  libre,
  prefill,
  onCambiar,
}: {
  lang: Locale;
  labels: Labels;
  values: CavaFormValues;
  vino: CavaVino | null;
  libre: Libre;
  prefill: Prefill | null;
  onCambiar: () => void;
}) {
  const a = labels.alta;
  const [state, action, pending] = useActionState(saveCavaLote, initialState);
  const err = (f: CavaField) => (state.errors?.[f] ? labels.errors[state.errors[f]!] : undefined);
  const ids = { notas: useId(), mas: useId() };
  const [bodega, setBodega] = useState(libre.bodega);

  const cantidadInicial = prefill?.cantidad ?? values.cantidad;
  const formatoInicial = prefill?.formato_ml ?? values.formato_ml;
  // Los habituales primero.
  const orden = [750, 1500, 375, 500, 187, 3000].filter((ml) => (CAVA_FORMATOS as readonly number[]).includes(ml));
  const formatos = orden.includes(formatoInicial) ? orden : [...orden, formatoInicial];

  // Campos plegados: se abren si ya tienen algo o si alguno tiene error.
  const plegados: CavaField[] = ["fecha_compra", "tienda", "ubicacion", "beber_desde", "beber_hasta", "notas"];
  const abrirMas =
    plegados.some((f) => state.errors?.[f]) ||
    Boolean(values.tienda || values.ubicacion || values.beber_desde || values.beber_hasta || values.notas);

  return (
    <form action={action} className="flex flex-col gap-6" noValidate>
      <input type="hidden" name="lang" value={lang} />
      {values.id && <input type="hidden" name="id" value={values.id} />}
      {state.message && <FormAlert>{labels.errors.generic}</FormAlert>}

      {vino ? (
        <div className="flex items-center gap-3 rounded-card bg-surface-2 p-3">
          <VinoThumb vino={vino} />
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted">{labels.fromCatalog}</span>
            <span className="font-semibold">{vino.nombre}</span>
            <span className="truncate text-sm text-muted">
              {[vino.bodega, vino.denominacion].filter(Boolean).join(" · ")}
            </span>
          </div>
          <Button variant="secondary" size="sm" onClick={onCambiar} className="shrink-0">
            {a.change}
          </Button>
          <input type="hidden" name="vino_id" value={vino.id} />
          <input type="hidden" name="nombre" value={vino.nombre} />
          <input type="hidden" name="bodega_nombre" value={vino.bodega} />
          <input type="hidden" name="bodega_id" value={vino.bodega_id} />
        </div>
      ) : (
        <fieldset className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3">
            <legend className="text-xs font-semibold uppercase tracking-wide text-muted">{a.newWine}</legend>
            <Button variant="ghost" size="sm" onClick={onCambiar} className="shrink-0 text-primary">
              <SearchIcon className="size-4" />
              {a.searchCatalog}
            </Button>
          </div>
          <Input
            label={labels.fields.nombre}
            name="nombre"
            required
            maxLength={200}
            autoComplete="off"
            defaultValue={libre.nombre}
            error={err("nombre")}
          />
          <CatalogPicker
            entidad="bodega"
            name="bodega_nombre"
            label={labels.fields.bodega}
            placeholder={labels.picker.bodegaPlaceholder}
            defaultValue={bodega.nombre}
            linked={bodega.id !== null}
            error={err("bodega_nombre")}
            hint={labels.bodegaHint}
            labels={{
              suggestions: labels.picker.suggestions,
              loading: labels.picker.loading,
              none: labels.picker.none,
              linked: labels.picker.linked,
              keepText: labels.picker.keepText,
            }}
            onPick={(item) => setBodega({ id: item.id, nombre: item.nombre })}
            // Al reescribir el nombre deja de estar enlazada.
            onType={(text) => setBodega({ id: null, nombre: text })}
          />
          {bodega.id && <input type="hidden" name="bodega_id" value={bodega.id} />}
        </fieldset>
      )}

      <AnadaField labels={labels} vino={vino} values={values} prefill={prefill} error={err("anio")} />

      <div className="grid gap-6 sm:grid-cols-2">
        <Stepper labels={labels} initial={cantidadInicial} error={err("cantidad")} />
        <Input
          label={labels.fields.precio}
          name="precio_compra"
          inputMode="decimal"
          placeholder="18,50"
          defaultValue={str(values.precio_compra)}
          hint={vino?.precio_desde ? fill(a.priceFrom, { precio: formatPrice(lang, vino.precio_desde) }) : undefined}
          error={err("precio_compra")}
        />
      </div>

      <ChipGroup
        legend={labels.fields.formato}
        name="formato_ml"
        options={formatos.map((ml) => ({ value: String(ml), label: labels.formatos[ml] ?? `${ml / 10} cl` }))}
        defaultValue={String(formatoInicial)}
      />

      <CavaPhotoField labels={labels.photo} initialUrl={values.foto_url ?? null} error={err("foto")} />

      <details id={ids.mas} open={abrirMas} className="group rounded-card border border-border">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
          <span className="flex flex-col">
            <span className="font-medium">{a.moreDetails}</span>
            <span className="text-sm text-muted">{a.moreDetailsHint}</span>
          </span>
          <span aria-hidden className="text-muted transition-transform group-open:rotate-180">
            ▾
          </span>
        </summary>
        <div className="flex flex-col gap-5 border-t border-border px-4 py-4">
          <div className="grid gap-5 sm:grid-cols-2">
            <Input
              label={labels.fields.fecha}
              name="fecha_compra"
              type="date"
              defaultValue={str(values.fecha_compra)}
              error={err("fecha_compra")}
            />
            <Input
              label={labels.fields.tienda}
              name="tienda"
              maxLength={120}
              defaultValue={str(values.tienda)}
              error={err("tienda")}
            />
          </div>
          <Input
            label={labels.fields.ubicacion}
            name="ubicacion"
            maxLength={120}
            hint={labels.fields.ubicacionHint}
            defaultValue={str(values.ubicacion)}
            error={err("ubicacion")}
          />
          <div className="grid grid-cols-2 gap-4">
            <Input
              label={labels.fields.beberDesde}
              name="beber_desde"
              inputMode="numeric"
              placeholder="2027"
              defaultValue={str(values.beber_desde)}
              error={err("beber_desde")}
            />
            <Input
              label={labels.fields.beberHasta}
              name="beber_hasta"
              inputMode="numeric"
              placeholder="2035"
              defaultValue={str(values.beber_hasta)}
              error={err("beber_hasta")}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={ids.notas} className="text-sm font-medium">
              {labels.fields.notas}
            </label>
            <textarea
              id={ids.notas}
              name="notas"
              rows={3}
              maxLength={2000}
              defaultValue={str(values.notas)}
              aria-invalid={err("notas") ? true : undefined}
              className="w-full rounded-control border border-border-strong bg-surface px-3 py-2 text-base text-fg aria-invalid:border-danger"
            />
          </div>
        </div>
      </details>

      {/* Guardar siempre a mano del pulgar; respeta la barra de inicio del móvil. */}
      <div className="sticky bottom-0 z-30 -mx-4 flex gap-3 border-t border-border bg-bg/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
        <Button type="submit" size="lg" loading={pending} className="flex-1 sm:flex-none">
          {labels.save}
        </Button>
        <NextLink href={localePath(lang, "/yo/cava")} className={buttonStyles({ variant: "ghost", size: "lg" })}>
          {labels.cancel}
        </NextLink>
      </div>
    </form>
  );
}

// Añada: con vino del catálogo, sus años como botones (y «Otra» para escribir
// un año que no está); sin vino, el año a mano. Envía anada_id y anio.
function AnadaField({
  labels,
  vino,
  values,
  prefill,
  error,
}: {
  labels: Labels;
  vino: CavaVino | null;
  values: CavaFormValues;
  prefill: Prefill | null;
  error?: string;
}) {
  const a = labels.alta;
  const id = useId();
  const anadas = vino?.anadas ?? [];
  const conAnio = anadas.some((x) => x.anio !== null);

  // Elección inicial: la del lote al editar; si no, la del año o los meses
  // escritos; si no, la más reciente.
  const inicial = (() => {
    const anio = prefill ? prefill.anio : values.anio;
    if (!prefill && values.anada_id && anadas.some((x) => x.id === values.anada_id)) {
      return { anada: values.anada_id, otro: "" };
    }
    if (anio !== null) {
      const m = anadas.find((x) => x.anio === anio);
      return m ? { anada: m.id, otro: "" } : { anada: "otra", otro: String(anio) };
    }
    const porMeses = prefill?.meses ? anadas.find((x) => x.meses === prefill.meses) : undefined;
    return { anada: porMeses?.id ?? anadas[0]?.id ?? "otra", otro: "" };
  })();
  const [anada, setAnada] = useState(inicial.anada);
  const [otro, setOtro] = useState(inicial.otro);

  if (!vino || !conAnio) {
    return (
      <Input
        label={labels.fields.anada}
        name="anio"
        inputMode="numeric"
        placeholder="2020"
        maxLength={4}
        defaultValue={otro || (prefill ? "" : values.anio ? String(values.anio) : "")}
        error={error}
      />
    );
  }

  const elegida = anadas.find((x) => x.id === anada);
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-sm font-medium">{labels.fields.anada}</legend>
      <div role="radiogroup" className="flex flex-wrap gap-2">
        {anadas.map((x) => (
          <Chip key={x.id} name={`${id}-anada`} value={x.id} checked={anada === x.id} onChange={setAnada}>
            <span>
              {x.anio ?? labels.fields.sinAnada}
              {x.meses ? <span className="text-xs opacity-75">{` · ${fill(a.meses, { n: x.meses })}`}</span> : null}
            </span>
          </Chip>
        ))}
        <Chip name={`${id}-anada`} value="otra" checked={anada === "otra"} onChange={setAnada}>
          {a.otherYear}
        </Chip>
      </div>
      {anada === "otra" && (
        <Input
          label={a.yearInput}
          inputMode="numeric"
          placeholder="2020"
          maxLength={4}
          value={otro}
          onChange={(e) => setOtro(e.target.value)}
          error={error}
        />
      )}
      {anada !== "otra" && error && <p className="text-sm font-medium text-danger">{error}</p>}
      <input type="hidden" name="anada_id" value={elegida?.id ?? ""} />
      <input type="hidden" name="anio" value={elegida ? str(elegida.anio) : otro} />
    </fieldset>
  );
}

function str(v: number | string | null | undefined): string {
  return v === null || v === undefined ? "" : String(v);
}

// Botón de opción con aspecto de chip (radio nativo, accesible con teclado).
function Chip({
  name,
  value,
  checked,
  onChange,
  children,
}: {
  name: string;
  value: string;
  checked?: boolean;
  onChange?: (v: string) => void;
  children: ReactNode;
}) {
  return (
    <label
      className={cn(
        "inline-flex min-h-11 cursor-pointer items-center rounded-full border px-4 text-sm font-medium",
        "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
        "border-border-strong bg-surface text-fg has-[:checked]:border-primary has-[:checked]:bg-primary has-[:checked]:text-primary-fg",
      )}
    >
      <input
        type="radio"
        name={name}
        value={value}
        className="sr-only"
        {...(onChange ? { checked, onChange: () => onChange(value) } : { defaultChecked: checked })}
      />
      {children}
    </label>
  );
}

function ChipGroup({
  legend,
  name,
  options,
  defaultValue,
}: {
  legend: string;
  name: string;
  options: { value: string; label: string }[];
  defaultValue: string;
}) {
  return (
    <fieldset className="flex flex-col">
      <legend className="mb-2 text-sm font-medium">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <Chip key={o.value} name={name} value={o.value} checked={o.value === defaultValue}>
            {o.label}
          </Chip>
        ))}
      </div>
    </fieldset>
  );
}

// Botellas con − y + grandes; el número también se puede escribir.
function Stepper({ labels, initial, error }: { labels: Labels; initial: number; error?: string }) {
  const id = useId();
  const [n, setN] = useState(String(initial));
  const num = Number(n);
  const set = (v: number) => setN(String(Math.min(9999, Math.max(0, v))));
  const btn =
    "flex size-12 shrink-0 items-center justify-center rounded-control border border-border-strong bg-surface text-2xl leading-none text-fg hover:bg-surface-2 disabled:opacity-40";
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {labels.fields.cantidad}
      </label>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className={btn}
          aria-label={labels.alta.less}
          disabled={!(num > 0)}
          onClick={() => set((Number.isFinite(num) ? num : 1) - 1)}
        >
          −
        </button>
        <input
          id={id}
          name="cantidad"
          inputMode="numeric"
          value={n}
          onChange={(e) => setN(e.target.value.replace(/\D/g, "").slice(0, 4))}
          aria-invalid={error ? true : undefined}
          className="h-12 w-full min-w-0 rounded-control border border-border-strong bg-surface text-center text-lg font-semibold text-fg aria-invalid:border-danger"
        />
        <button
          type="button"
          className={btn}
          aria-label={labels.alta.more}
          onClick={() => set((Number.isFinite(num) ? num : 0) + 1)}
        >
          +
        </button>
      </div>
      {error && <p className="text-sm font-medium text-danger">{error}</p>}
    </div>
  );
}
