"use client";

import NextLink from "next/link";
import { useActionState, useId, useState, useTransition } from "react";
import { FormAlert } from "@/components/auth/form-parts";
import { Button, buttonStyles, Input } from "@/components/ui";
import { localePath, type Locale } from "@/i18n/config";
import { CAVA_FORMATOS, type CavaField, type CavaFormLabels, type CavaVinoData } from "@/lib/personal/cava";
import { getCavaVino, saveCavaLote, type CavaFormState } from "@/lib/personal/cava-actions";
import { CatalogPicker } from "./catalog-picker";
import { CavaPhotoField } from "./cava-photo-field";

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

// Vino del catálogo al que se enlaza el lote: nombre y bodega fijos y la añada
// se elige de la lista. Sin vino, nombre y bodega se buscan en el catálogo
// (para enlazarlos) o se escriben como texto libre.
export type CavaVino = CavaVinoData;

const initialState: CavaFormState = { status: "idle" };
const fieldClass =
  "w-full rounded-control border border-border-strong bg-surface px-3 text-base text-fg aria-invalid:border-danger";

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
  const [state, action, pending] = useActionState(saveCavaLote, initialState);
  const err = (f: CavaField) => (state.errors?.[f] ? labels.errors[state.errors[f]!] : undefined);
  const ids = { anada: useId(), formato: useId(), notas: useId() };
  const str = (v: number | string | null | undefined) => (v === null || v === undefined ? "" : String(v));
  const formatos = CAVA_FORMATOS.includes(values.formato_ml as (typeof CAVA_FORMATOS)[number])
    ? CAVA_FORMATOS
    : [...CAVA_FORMATOS, values.formato_ml];

  // Vino y bodega enlazados. Al quitar el vino, el texto de los buscadores
  // vuelve a ser editable (la clave los reinicia con el valor nuevo).
  const [vino, setVino] = useState<CavaVino | null>(initialVino);
  const [bodega, setBodega] = useState({ id: values.bodega_id, nombre: str(values.bodega_nombre) });
  const [pickerKey, setPickerKey] = useState(0);
  const [nombreLibre, setNombreLibre] = useState(values.nombre);
  const [loadingVino, startLoadingVino] = useTransition();
  const [vinoError, setVinoError] = useState(false);
  const p = labels.picker;
  const pickerLabels = { suggestions: p.suggestions, loading: p.loading, none: p.none, linked: p.linked, keepText: p.keepText };

  const pickVino = (slug: string) => {
    setVinoError(false);
    startLoadingVino(async () => {
      const data = await getCavaVino({ lang, slug }).catch(() => null);
      if (data) {
        setVino(data);
        setBodega({ id: data.bodega_id, nombre: data.bodega });
      } else setVinoError(true);
    });
  };

  const unlinkVino = () => {
    if (!vino) return;
    setNombreLibre("");
    setBodega({ id: vino.bodega_id, nombre: vino.bodega });
    setVino(null);
    setPickerKey((k) => k + 1);
  };

  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      <input type="hidden" name="lang" value={lang} />
      {values.id && <input type="hidden" name="id" value={values.id} />}
      {state.message && <FormAlert>{labels.errors.generic}</FormAlert>}

      {vino ? (
        <div className="flex flex-wrap items-start justify-between gap-3 rounded-control bg-surface-2 px-3 py-2">
          <div className="flex min-w-0 flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted">{labels.fromCatalog}</span>
            <span className="font-semibold">{vino.nombre}</span>
            <span className="text-sm text-muted">{vino.bodega}</span>
          </div>
          <button type="button" onClick={unlinkVino} className={buttonStyles({ variant: "ghost", size: "sm" })}>
            {p.change}
          </button>
          <input type="hidden" name="vino_id" value={vino.id} />
          <input type="hidden" name="nombre" value={vino.nombre} />
          <input type="hidden" name="bodega_nombre" value={vino.bodega} />
          <input type="hidden" name="bodega_id" value={vino.bodega_id} />
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-1.5" aria-busy={loadingVino || undefined}>
            <CatalogPicker
              key={`vino-${pickerKey}`}
              entidad="vino"
              name="nombre"
              label={labels.fields.nombre}
              placeholder={p.vinoPlaceholder}
              required
              defaultValue={nombreLibre}
              error={err("nombre")}
              hint={loadingVino ? p.loading : labels.catalogHint}
              labels={pickerLabels}
              onPick={(item) => pickVino(item.slug)}
              onType={setNombreLibre}
            />
            {vinoError && <p className="text-sm font-medium text-danger">{p.loadError}</p>}
          </div>
          <CatalogPicker
            key={`bodega-${pickerKey}`}
            entidad="bodega"
            name="bodega_nombre"
            label={labels.fields.bodega}
            placeholder={p.bodegaPlaceholder}
            defaultValue={bodega.nombre}
            linked={bodega.id !== null}
            error={err("bodega_nombre")}
            hint={labels.bodegaHint}
            labels={pickerLabels}
            onPick={(item) => setBodega({ id: item.id, nombre: item.nombre })}
            // Al reescribir el nombre deja de estar enlazada.
            onType={(text) => setBodega({ id: null, nombre: text })}
          />
          {bodega.id && <input type="hidden" name="bodega_id" value={bodega.id} />}
        </>
      )}

      <CavaPhotoField labels={labels.photo} initialUrl={values.foto_url ?? null} error={err("foto")} />

      <div className="grid gap-5 sm:grid-cols-2">
        {vino && vino.anadas.some((a) => a.anio !== null) ? (
          <AnadaSelect key={vino.id} id={ids.anada} labels={labels} vino={vino} values={values} />
        ) : (
          <Input
            key={vino?.id ?? "libre"}
            label={labels.fields.anada}
            name="anio"
            inputMode="numeric"
            placeholder="2020"
            defaultValue={str(values.anio)}
            error={err("anio")}
          />
        )}
        <Input
          label={labels.fields.cantidad}
          name="cantidad"
          type="number"
          inputMode="numeric"
          min={0}
          max={9999}
          required
          defaultValue={str(values.cantidad)}
          error={err("cantidad")}
        />
        <div className="flex flex-col gap-1.5">
          <label htmlFor={ids.formato} className="text-sm font-medium">
            {labels.fields.formato}
          </label>
          <select id={ids.formato} name="formato_ml" defaultValue={values.formato_ml} className={`${fieldClass} h-11`}>
            {formatos.map((ml) => (
              <option key={ml} value={ml}>
                {labels.formatos[ml] ?? `${ml / 10} cl`}
              </option>
            ))}
          </select>
        </div>
        <Input
          label={labels.fields.precio}
          name="precio_compra"
          inputMode="decimal"
          placeholder="18,50"
          defaultValue={str(values.precio_compra)}
          error={err("precio_compra")}
        />
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

      <Input
        label={labels.fields.ubicacion}
        name="ubicacion"
        maxLength={120}
        hint={labels.fields.ubicacionHint}
        defaultValue={str(values.ubicacion)}
        error={err("ubicacion")}
      />
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
          className={`${fieldClass} py-2`}
        />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Button type="submit" loading={pending}>
          {labels.save}
        </Button>
        <NextLink href={localePath(lang, "/yo/cava")} className={buttonStyles({ variant: "secondary" })}>
          {labels.cancel}
        </NextLink>
      </div>
    </form>
  );
}

// Añadas del vino del catálogo. Al elegir una se envían su id y su año.
function AnadaSelect({
  id,
  labels,
  vino,
  values,
}: {
  id: string;
  labels: Labels;
  vino: CavaVino;
  values: CavaFormValues;
}) {
  const selected = vino.anadas.find((a) => a.id === values.anada_id) ?? vino.anadas[0];
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {labels.fields.anada}
      </label>
      <select
        id={id}
        name="anada_id"
        defaultValue={selected?.id ?? ""}
        onChange={(e) => {
          const anio = vino.anadas.find((a) => a.id === e.target.value)?.anio;
          const input = e.target.form?.elements.namedItem("anio") as HTMLInputElement | null;
          if (input) input.value = anio ? String(anio) : "";
        }}
        className={`${fieldClass} h-11`}
      >
        {vino.anadas.map((a) => (
          <option key={a.id} value={a.id}>
            {a.anio ?? labels.fields.sinAnada}
          </option>
        ))}
      </select>
      <input type="hidden" name="anio" defaultValue={selected?.anio ?? ""} />
    </div>
  );
}
