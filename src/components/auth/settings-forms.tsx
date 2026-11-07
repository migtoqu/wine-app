"use client";

import { useActionState, useEffect } from "react";
import { updateProfile, updateWinePrefs } from "@/app/[lang]/yo/ajustes/actions";
import { Button, Input } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/es";
import { initialFormState, type FormState } from "@/lib/auth/form-state";
import {
  CRIANZAS_VINO,
  IDIOMAS,
  PREFS_EMAIL,
  TEMAS,
  TIPOS_VINO,
  type CrianzaVino,
  type Idioma,
  type PrefsEmail,
  type Tema,
  type TipoVino,
} from "@/lib/auth/validation";
import { applyThemePreference } from "@/lib/preferences";
import { Checkbox, Fieldset, FormAlert } from "./form-parts";

// Textos de ajustes sin spaceGreeting: las funciones no pueden pasar a Client Components.
export type SettingsLabels = Omit<Dictionary["settings"], "spaceGreeting"> & {
  errors: Dictionary["auth"]["errors"];
};

function useMessages(labels: SettingsLabels, state: FormState) {
  return {
    field: (name: string) => {
      const key = state.errors?.[name];
      return key ? labels.errors[key] : undefined;
    },
    alert:
      state.status === "success" ? (
        <FormAlert tone="success">{labels.saved}</FormAlert>
      ) : state.message ? (
        <FormAlert>{labels.errors[state.message]}</FormAlert>
      ) : null,
  };
}

const radioClass = "flex cursor-pointer items-center gap-3 text-sm";

export function ProfileForm({
  lang,
  labels,
  email,
  profile,
}: {
  lang: Locale;
  labels: SettingsLabels;
  email: string | null;
  profile: { nombre: string | null; idioma: Idioma; tema: Tema; prefs_email: PrefsEmail };
}) {
  const [state, action, pending] = useActionState(updateProfile, initialFormState);
  const { field, alert } = useMessages(labels, state);

  // Aplica el tema guardado sin recargar (ThemeScript solo lo lee al cargar).
  const savedTheme = state.status === "success" ? state.values?.theme : undefined;
  useEffect(() => {
    if (savedTheme === "light" || savedTheme === "dark" || savedTheme === "system") {
      applyThemePreference(savedTheme);
    }
  }, [state, savedTheme]);

  return (
    <form action={action} className="flex flex-col gap-6" noValidate>
      <input type="hidden" name="lang" value={lang} />
      <h2 className="text-xl font-semibold">{labels.profileTitle}</h2>
      {alert}
      {email && (
        <p className="text-sm">
          <span className="text-muted">{labels.accountEmail}: </span>
          <span className="font-medium">{email}</span>
        </p>
      )}
      <Input
        label={labels.nombre}
        name="nombre"
        autoComplete="given-name"
        maxLength={80}
        defaultValue={profile.nombre ?? ""}
        error={field("nombre")}
      />
      <Fieldset legend={labels.idioma} error={field("idioma")}>
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          {IDIOMAS.map((value) => (
            <label key={value} className={radioClass}>
              <input
                type="radio"
                name="idioma"
                value={value}
                defaultChecked={profile.idioma === value}
                className="size-5 accent-primary"
              />
              <span lang={value}>{labels.idiomas[value]}</span>
            </label>
          ))}
        </div>
      </Fieldset>
      <Fieldset legend={labels.tema} error={field("tema")}>
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          {TEMAS.map((value) => (
            <label key={value} className={radioClass}>
              <input
                type="radio"
                name="tema"
                value={value}
                defaultChecked={profile.tema === value}
                className="size-5 accent-primary"
              />
              {labels.temas[value]}
            </label>
          ))}
        </div>
      </Fieldset>
      <Fieldset legend={labels.emailTitle}>
        {PREFS_EMAIL.map((key) => (
          <Checkbox
            key={key}
            name={`email_${key}`}
            label={labels.emailPrefs[key]}
            defaultChecked={profile.prefs_email[key]}
          />
        ))}
      </Fieldset>
      <Button type="submit" loading={pending} className="self-start">
        {labels.save}
      </Button>
    </form>
  );
}

type Option = { id: string; nombre: string };

export type WinePrefs = {
  tipos: TipoVino[];
  crianzas: CrianzaVino[];
  variedad_uva_ids: string[];
  denominacion_ids: string[];
  precio_min: number | null;
  precio_max: number | null;
};

function OptionGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">{children}</div>;
}

export function WinePrefsForm({
  lang,
  labels,
  prefs,
  variedades,
  denominaciones,
}: {
  lang: Locale;
  labels: SettingsLabels;
  prefs: WinePrefs;
  variedades: Option[];
  denominaciones: Option[];
}) {
  const [state, action, pending] = useActionState(updateWinePrefs, initialFormState);
  const { field, alert } = useMessages(labels, state);

  return (
    <form action={action} className="flex flex-col gap-6" noValidate>
      <input type="hidden" name="lang" value={lang} />
      <div>
        <h2 className="text-xl font-semibold">{labels.winesTitle}</h2>
        <p className="mt-1 text-sm text-muted">{labels.winesIntro}</p>
      </div>
      {alert}
      <Fieldset legend={labels.tipos} error={field("tipos")}>
        <OptionGrid>
          {TIPOS_VINO.map((value) => (
            <Checkbox
              key={value}
              name="tipos"
              value={value}
              label={labels.tiposVino[value]}
              defaultChecked={prefs.tipos.includes(value)}
            />
          ))}
        </OptionGrid>
      </Fieldset>
      <Fieldset legend={labels.crianzas} error={field("crianzas")}>
        <OptionGrid>
          {CRIANZAS_VINO.map((value) => (
            <Checkbox
              key={value}
              name="crianzas"
              value={value}
              label={labels.crianzasVino[value]}
              defaultChecked={prefs.crianzas.includes(value)}
            />
          ))}
        </OptionGrid>
      </Fieldset>
      <CatalogOptions
        legend={labels.variedades}
        name="variedades"
        options={variedades}
        selected={prefs.variedad_uva_ids}
        empty={labels.emptyCatalog}
        error={field("variedades")}
      />
      <CatalogOptions
        legend={labels.denominaciones}
        name="denominaciones"
        options={denominaciones}
        selected={prefs.denominacion_ids}
        empty={labels.emptyCatalog}
        error={field("denominaciones")}
      />
      <Fieldset legend={labels.precio}>
        <div className="grid grid-cols-2 gap-4">
          <Input
            label={labels.precioMin}
            name="precioMin"
            inputMode="decimal"
            defaultValue={prefs.precio_min?.toString() ?? ""}
            error={field("precioMin")}
          />
          <Input
            label={labels.precioMax}
            name="precioMax"
            inputMode="decimal"
            defaultValue={prefs.precio_max?.toString() ?? ""}
            error={field("precioMax")}
          />
        </div>
      </Fieldset>
      <Button type="submit" loading={pending} className="self-start">
        {labels.save}
      </Button>
    </form>
  );
}

function CatalogOptions({
  legend,
  name,
  options,
  selected,
  empty,
  error,
}: {
  legend: string;
  name: string;
  options: Option[];
  selected: string[];
  empty: string;
  error?: string;
}) {
  return (
    <Fieldset legend={legend} error={error}>
      {options.length === 0 ? (
        <p className="text-sm text-muted">{empty}</p>
      ) : (
        <div className="max-h-64 overflow-y-auto rounded-control border border-border p-3">
          <OptionGrid>
            {options.map((o) => (
              <Checkbox
                key={o.id}
                name={name}
                value={o.id}
                label={o.nombre}
                defaultChecked={selected.includes(o.id)}
              />
            ))}
          </OptionGrid>
        </div>
      )}
    </Fieldset>
  );
}
