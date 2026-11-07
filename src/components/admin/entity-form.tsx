"use client";

import { useActionState, useId } from "react";
import { FormAlert } from "@/components/auth/form-parts";
import { Button, Input } from "@/components/ui";
import type { AdminDictionary } from "@/i18n/dictionaries/admin/es";
import { initialAdminFormState, type AdminFormState } from "@/lib/admin/form-state";
import { MAX_FILAS_UVAS } from "@/lib/admin/validation";
import { cn } from "@/lib/cn";

// Formulario genérico del admin: la página describe los campos (con sus textos
// ya traducidos) y la Server Action valida y guarda. Funciona sin JS.

export type Option = { value: string; label: string };

type Base = { name: string; label: string; hint?: string; required?: boolean; wide?: boolean };

type TextDef = Base & {
  kind: "text" | "email" | "url" | "number" | "textarea";
  defaultValue?: string | null;
  maxLength?: number;
};

export type FieldDef =
  | TextDef
  | (Base & { kind: "select"; options: Option[]; defaultValue?: string | null; emptyLabel?: string })
  | (Base & {
      kind: "multi";
      options: Option[];
      defaultValue: string[];
      principal?: { name: string; label: string; noneLabel: string; defaultValue: string | null };
    })
  | (Base & {
      kind: "grapes";
      options: Option[];
      rows: { variedad_id: string; porcentaje: string }[];
      uvaLabel: string;
      pctLabel: string;
      emptyLabel: string;
    })
  | { kind: "heading"; name: string; label: string };

export type EntityFormLabels = {
  save: string;
  saving: string;
  saved: string;
  optional: string;
  errors: AdminDictionary["errors"];
};

type Action = (state: AdminFormState, form: FormData) => Promise<AdminFormState>;

const control =
  "w-full rounded-control border border-border-strong bg-surface px-3 text-base text-fg aria-invalid:border-danger";

export function EntityForm({
  action,
  fields,
  hidden,
  labels,
  submitLabel,
}: {
  action: Action;
  fields: FieldDef[];
  hidden: Record<string, string>;
  labels: EntityFormLabels;
  submitLabel?: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialAdminFormState);
  const values = state.status === "error" ? state.values : undefined;
  const error = (name: string) => {
    const key = state.errors?.[name];
    return key ? labels.errors[key] : undefined;
  };
  const one = (name: string, fallback: string | null | undefined) => {
    const v = values?.[name];
    if (values) return Array.isArray(v) ? (v[0] ?? "") : (v ?? "");
    return fallback ?? "";
  };
  const many = (name: string, fallback: string[]) => {
    if (!values) return fallback;
    const v = values[name];
    return v === undefined ? [] : Array.isArray(v) ? v : [v];
  };
  const firstError = state.errors ? Object.keys(state.errors).length > 0 : false;

  return (
    <form key={state.seq ?? 0} action={formAction} className="flex flex-col gap-5" noValidate>
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      {state.status === "success" && <FormAlert tone="success">{labels.saved}</FormAlert>}
      {state.message && <FormAlert>{labels.errors[state.message]}</FormAlert>}
      {!state.message && firstError && <FormAlert>{labels.errors.checkFields}</FormAlert>}

      <div className="grid gap-5 sm:grid-cols-2">
        {fields.map((f) => {
          const wide = f.kind === "heading" || f.kind === "textarea" || f.kind === "multi" || f.kind === "grapes" || ("wide" in f && f.wide);
          return (
            <div key={f.name} className={cn(wide && "sm:col-span-2")}>
              {f.kind === "heading" ? (
                <h2 className="mt-2 border-b border-border pb-2 text-lg font-semibold">{f.label}</h2>
              ) : f.kind === "select" ? (
                <SelectField f={f} value={one(f.name, f.defaultValue)} error={error(f.name)} />
              ) : f.kind === "textarea" ? (
                <TextareaField f={f} value={one(f.name, f.defaultValue)} error={error(f.name)} />
              ) : f.kind === "multi" ? (
                <MultiField
                  f={f}
                  checked={many(f.name, f.defaultValue)}
                  principal={f.principal ? one(f.principal.name, f.principal.defaultValue) : ""}
                  error={error(f.name)}
                />
              ) : f.kind === "grapes" ? (
                <GrapesField f={f} values={values} error={error(f.name)} />
              ) : (
                <Input
                  label={f.required ? f.label : `${f.label} (${labels.optional})`}
                  name={f.name}
                  type={f.kind === "number" ? "text" : f.kind}
                  inputMode={f.kind === "number" ? "decimal" : undefined}
                  autoComplete="off"
                  maxLength={f.maxLength}
                  defaultValue={one(f.name, f.defaultValue)}
                  hint={f.hint}
                  error={error(f.name)}
                />
              )}
            </div>
          );
        })}
      </div>

      <div className="sticky bottom-0 -mx-4 border-t border-border bg-bg/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0">
        <Button type="submit" loading={pending} className="w-full sm:w-auto">
          {pending ? labels.saving : (submitLabel ?? labels.save)}
        </Button>
      </div>
    </form>
  );
}

function FieldError({ id, error }: { id: string; error?: string }) {
  return error ? (
    <p id={id} className="text-sm font-medium text-danger">
      {error}
    </p>
  ) : null;
}

function Hint({ id, hint }: { id: string; hint?: string }) {
  return hint ? (
    <p id={id} className="text-sm text-muted">
      {hint}
    </p>
  ) : null;
}

function SelectField({
  f,
  value,
  error,
}: {
  f: Extract<FieldDef, { kind: "select" }>;
  value: string;
  error?: string;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {f.label}
      </label>
      <select
        id={id}
        name={f.name}
        defaultValue={value}
        aria-invalid={error ? true : undefined}
        aria-describedby={cn(f.hint && `${id}-hint`, error && `${id}-error`) || undefined}
        className={cn(control, "h-11")}
      >
        {f.emptyLabel !== undefined && <option value="">{f.emptyLabel}</option>}
        {f.options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <Hint id={`${id}-hint`} hint={f.hint} />
      <FieldError id={`${id}-error`} error={error} />
    </div>
  );
}

function TextareaField({
  f,
  value,
  error,
}: {
  f: TextDef;
  value: string;
  error?: string;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {f.label}
      </label>
      <textarea
        id={id}
        name={f.name}
        rows={5}
        maxLength={f.maxLength}
        defaultValue={value}
        aria-invalid={error ? true : undefined}
        aria-describedby={cn(f.hint && `${id}-hint`, error && `${id}-error`) || undefined}
        className={cn(control, "py-2")}
      />
      <Hint id={`${id}-hint`} hint={f.hint} />
      <FieldError id={`${id}-error`} error={error} />
    </div>
  );
}

function MultiField({
  f,
  checked,
  principal,
  error,
}: {
  f: Extract<FieldDef, { kind: "multi" }>;
  checked: string[];
  principal: string;
  error?: string;
}) {
  const id = useId();
  return (
    <fieldset className="flex flex-col gap-2" aria-describedby={error ? `${id}-error` : undefined}>
      <legend className="mb-1 text-sm font-medium">{f.label}</legend>
      <Hint id={`${id}-hint`} hint={f.hint} />
      <ul className="max-h-80 divide-y divide-border overflow-y-auto rounded-control border border-border">
        {f.options.map((o) => (
          <li key={o.value} className="flex items-center justify-between gap-3 px-3 py-2">
            <label className="flex min-h-9 flex-1 cursor-pointer items-center gap-3 text-sm">
              <input
                type="checkbox"
                name={f.name}
                value={o.value}
                defaultChecked={checked.includes(o.value)}
                className="size-5 shrink-0 accent-primary"
              />
              {o.label}
            </label>
            {f.principal && (
              <label className="flex cursor-pointer items-center gap-2 text-xs text-muted">
                <input
                  type="radio"
                  name={f.principal.name}
                  value={o.value}
                  defaultChecked={principal === o.value}
                  className="size-4 accent-primary"
                />
                {f.principal.label}
              </label>
            )}
          </li>
        ))}
      </ul>
      {f.principal && (
        <label className="flex cursor-pointer items-center gap-2 text-sm text-muted">
          <input
            type="radio"
            name={f.principal.name}
            value=""
            defaultChecked={principal === ""}
            className="size-4 accent-primary"
          />
          {f.principal.noneLabel}
        </label>
      )}
      <FieldError id={`${id}-error`} error={error} />
    </fieldset>
  );
}

function GrapesField({
  f,
  values,
  error,
}: {
  f: Extract<FieldDef, { kind: "grapes" }>;
  values?: Record<string, string | string[]>;
  error?: string;
}) {
  const id = useId();
  const count = Math.min(Math.max(f.rows.length + 3, 4), MAX_FILAS_UVAS);
  const value = (key: string, fallback: string) => {
    if (!values) return fallback;
    const v = values[key];
    return typeof v === "string" ? v : "";
  };
  return (
    <fieldset className="flex flex-col gap-2" aria-describedby={error ? `${id}-error` : undefined}>
      <legend className="mb-1 text-sm font-medium">{f.label}</legend>
      <Hint id={`${id}-hint`} hint={f.hint} />
      <ul className="flex flex-col gap-2">
        {Array.from({ length: count }, (_, i) => {
          const row = f.rows[i];
          return (
            <li key={i} className="flex gap-2">
              <label className="sr-only" htmlFor={`${id}-uva-${i}`}>
                {`${f.uvaLabel} ${i + 1}`}
              </label>
              <select
                id={`${id}-uva-${i}`}
                name={`uva_${i}`}
                defaultValue={value(`uva_${i}`, row?.variedad_id ?? "")}
                className={cn(control, "h-11 min-w-0 flex-1")}
              >
                <option value="">{f.emptyLabel}</option>
                {f.options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <label className="sr-only" htmlFor={`${id}-pct-${i}`}>
                {`${f.pctLabel} ${i + 1}`}
              </label>
              <div className="flex items-center gap-1">
                <input
                  id={`${id}-pct-${i}`}
                  name={`pct_${i}`}
                  inputMode="decimal"
                  autoComplete="off"
                  defaultValue={value(`pct_${i}`, row?.porcentaje ?? "")}
                  className={cn(control, "h-11 w-20 text-right")}
                />
                <span aria-hidden className="text-sm text-muted">
                  %
                </span>
              </div>
            </li>
          );
        })}
      </ul>
      <FieldError id={`${id}-error`} error={error} />
    </fieldset>
  );
}
