"use client";

import NextLink from "next/link";
import { useActionState, useEffect, useRef } from "react";
import { Button, Input } from "@/components/ui";
import { localePath, type Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/es";
import { requestPasswordReset, signIn, signUp, updatePassword } from "@/lib/auth/actions";
import { initialFormState, type FormState } from "@/lib/auth/form-state";
import { PASSWORD_MIN } from "@/lib/auth/validation";
import { Checkbox, FormAlert } from "./form-parts";

type Labels = Dictionary["auth"];

// Traduce las claves de error que devuelven las Server Actions.
function useErrors(labels: Labels, state: FormState) {
  return {
    field: (name: string) => {
      const key = state.errors?.[name];
      return key ? labels.errors[key] : undefined;
    },
    message: state.message ? labels.errors[state.message] : undefined,
  };
}

function Hidden({ lang, next }: { lang: Locale; next?: string | null }) {
  return (
    <>
      <input type="hidden" name="lang" value={lang} />
      {next && <input type="hidden" name="next" value={next} />}
    </>
  );
}

function SuccessPanel({ title, text, lang, back }: { title: string; text: string; lang: Locale; back: string }) {
  return (
    <div className="flex flex-col gap-3" role="status">
      <h2 className="text-xl font-semibold">{title}</h2>
      <p className="text-muted">{text}</p>
      <NextLink href={localePath(lang)} className="text-sm font-medium text-primary underline underline-offset-4">
        {back}
      </NextLink>
    </div>
  );
}

export function LoginForm({
  lang,
  labels,
  next,
  notice,
  email,
}: {
  lang: Locale;
  labels: Labels;
  next: string | null;
  // Aviso al llegar desde /auth/confirm: enlace no válido o email ya confirmado.
  notice: "linkError" | "confirmed" | null;
  email: string | null;
}) {
  const [state, action, pending] = useActionState(signIn, initialFormState);
  const { field, message } = useErrors(labels, state);

  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      <Hidden lang={lang} next={next} />
      {message ? (
        <FormAlert>{message}</FormAlert>
      ) : notice === "confirmed" ? (
        <FormAlert tone="success">{labels.confirmedNotice}</FormAlert>
      ) : (
        notice === "linkError" && <FormAlert>{labels.linkError}</FormAlert>
      )}
      <Input
        label={labels.email}
        name="email"
        type="email"
        autoComplete="email"
        required
        defaultValue={state.values?.email ?? email ?? undefined}
        error={field("email")}
      />
      <Input
        label={labels.password}
        name="password"
        type="password"
        autoComplete="current-password"
        required
        error={field("password")}
      />
      <NextLink
        href={localePath(lang, "/recuperar")}
        className="-mt-2 self-start text-sm font-medium text-primary underline underline-offset-4"
      >
        {labels.forgot}
      </NextLink>
      <Button type="submit" loading={pending}>
        {labels.loginSubmit}
      </Button>
    </form>
  );
}

export function RegisterForm({ lang, labels }: { lang: Locale; labels: Labels }) {
  const [state, action, pending] = useActionState(signUp, initialFormState);
  const { field, message } = useErrors(labels, state);
  const emailRef = useRef<HTMLInputElement>(null);

  // El enlace que copia el admin lleva ?email=: se rellena en el cliente para
  // no hacer dinámica la página (se lee después de hidratar).
  useEffect(() => {
    const email = new URLSearchParams(window.location.search).get("email");
    if (email && emailRef.current && !emailRef.current.value) emailRef.current.value = email;
  }, []);

  if (state.status === "success") {
    return <SuccessPanel title={labels.checkEmailTitle} text={labels.registerDone} lang={lang} back={labels.backHome} />;
  }

  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      <Hidden lang={lang} />
      {message && <FormAlert>{message}</FormAlert>}
      <Input
        label={labels.email}
        name="email"
        type="email"
        autoComplete="email"
        required
        ref={emailRef}
        defaultValue={state.values?.email}
        error={field("email")}
      />
      <Input
        label={labels.nombre}
        name="nombre"
        autoComplete="given-name"
        maxLength={80}
        hint={labels.nombreHint}
        defaultValue={state.values?.nombre}
        error={field("nombre")}
      />
      <Input
        label={labels.password}
        name="password"
        type="password"
        autoComplete="new-password"
        minLength={PASSWORD_MIN}
        required
        hint={labels.passwordHint}
        error={field("password")}
      />
      <Input
        label={labels.passwordConfirm}
        name="passwordConfirm"
        type="password"
        autoComplete="new-password"
        required
        error={field("passwordConfirm")}
      />
      <Checkbox name="mayorDeEdad" label={labels.ageLabel} required error={field("mayorDeEdad")} />
      <Button type="submit" loading={pending}>
        {labels.registerSubmit}
      </Button>
    </form>
  );
}

export function RecoverForm({
  lang,
  labels,
  browserError = false,
}: {
  lang: Locale;
  labels: Labels;
  // Llega desde /auth/confirm: el enlace se abrió en otro navegador.
  browserError?: boolean;
}) {
  const [state, action, pending] = useActionState(requestPasswordReset, initialFormState);
  const { field, message } = useErrors(labels, state);

  if (state.status === "success") {
    return <SuccessPanel title={labels.checkEmailTitle} text={labels.recoverDone} lang={lang} back={labels.backHome} />;
  }

  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      <Hidden lang={lang} />
      {message ? (
        <FormAlert>{message}</FormAlert>
      ) : (
        browserError && <FormAlert>{labels.browserMismatch}</FormAlert>
      )}
      <Input
        label={labels.email}
        name="email"
        type="email"
        autoComplete="email"
        required
        defaultValue={state.values?.email}
        error={field("email")}
      />
      <Button type="submit" loading={pending}>
        {labels.recoverSubmit}
      </Button>
    </form>
  );
}

export function ResetForm({ lang, labels }: { lang: Locale; labels: Labels }) {
  const [state, action, pending] = useActionState(updatePassword, initialFormState);
  const { field, message } = useErrors(labels, state);

  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      <Hidden lang={lang} />
      {message && <FormAlert>{message}</FormAlert>}
      <Input
        label={labels.passwordNew}
        name="password"
        type="password"
        autoComplete="new-password"
        minLength={PASSWORD_MIN}
        required
        hint={labels.passwordHint}
        error={field("password")}
      />
      <Input
        label={labels.passwordConfirm}
        name="passwordConfirm"
        type="password"
        autoComplete="new-password"
        required
        error={field("passwordConfirm")}
      />
      <Button type="submit" loading={pending}>
        {labels.resetSubmit}
      </Button>
    </form>
  );
}
