import NextLink from "next/link";
import { Suspense } from "react";
import { buttonStyles } from "@/components/ui";
import { localePath, type Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/server";
import { loginPathWithNext } from "@/lib/auth/routes";
import { getBodegaPersonal, getCavaDeVino, getVinoPersonal } from "@/lib/personal/queries";
import { NoteEditor, UserActions, UserActionsFallback } from "./user-actions";

// Server Components que leen el estado del usuario (favorito y notas). Las
// fichas están cacheadas y son iguales para todos, así que esto va siempre en
// un <Suspense> propio: es lo único que depende de la sesión.

type Props = { lang: Locale; dict: Dictionary };

export function VinoActions({
  lang,
  dict,
  vinoId,
  slug,
  anadaIds,
}: Props & { vinoId: string; slug: string; anadaIds: string[] }) {
  const labels = dict.catalog.userActions;
  return (
    <Suspense fallback={<UserActionsFallback labels={labels} />}>
      <VinoActionsInner
        lang={lang}
        labels={labels}
        cava={dict.cava}
        vinoId={vinoId}
        slug={slug}
        anadaIds={anadaIds}
      />
    </Suspense>
  );
}

async function VinoActionsInner({
  lang,
  labels,
  cava,
  vinoId,
  slug,
  anadaIds,
}: {
  lang: Locale;
  labels: Dictionary["catalog"]["userActions"];
  cava: Dictionary["cava"];
  vinoId: string;
  slug: string;
  anadaIds: string[];
}) {
  const [state, enCava] = await Promise.all([getVinoPersonal(vinoId, anadaIds), getCavaDeVino(vinoId)]);
  return (
    <UserActions
      tipo="vino"
      id={vinoId}
      favorite={state.favorite}
      note={state.note}
      lang={lang}
      signedIn={state.signedIn}
      loginHref={loginPathWithNext(lang, localePath(lang, `/vino/${slug}`))}
      labels={labels}
    >
      {state.signedIn && (
        <NextLink
          href={`${localePath(lang, "/yo/cava/nueva")}?vino=${encodeURIComponent(slug)}`}
          className={buttonStyles({ variant: "secondary", size: "sm" })}
          title={enCava ? cava.inCava(enCava) : undefined}
        >
          {cava.addToCava}
          {enCava ? ` (${enCava})` : ""}
        </NextLink>
      )}
    </UserActions>
  );
}

export function BodegaActions({
  lang,
  dict,
  bodegaId,
  slug,
}: Props & { bodegaId: string; slug: string }) {
  const labels = dict.catalog.userActions;
  return (
    <Suspense fallback={<UserActionsFallback labels={labels} />}>
      <BodegaActionsInner lang={lang} labels={labels} bodegaId={bodegaId} slug={slug} />
    </Suspense>
  );
}

async function BodegaActionsInner({
  lang,
  labels,
  bodegaId,
  slug,
}: {
  lang: Locale;
  labels: Dictionary["catalog"]["userActions"];
  bodegaId: string;
  slug: string;
}) {
  const state = await getBodegaPersonal(bodegaId);
  return (
    <UserActions
      tipo="bodega"
      id={bodegaId}
      favorite={state.favorite}
      note={state.note}
      lang={lang}
      signedIn={state.signedIn}
      loginHref={loginPathWithNext(lang, localePath(lang, `/bodega/${slug}`))}
      labels={labels}
    />
  );
}

// Nota de la añada seleccionada, bajo su ficha.
export function AnadaNote({
  lang,
  dict,
  vinoId,
  slug,
  anadaId,
  anadaIds,
  anio,
}: Props & { vinoId: string; slug: string; anadaId: string; anadaIds: string[]; anio: number | null }) {
  const labels = dict.catalog.userActions;
  return (
    <Suspense fallback={null}>
      <AnadaNoteInner
        lang={lang}
        labels={labels}
        vinoId={vinoId}
        slug={slug}
        anadaId={anadaId}
        anadaIds={anadaIds}
        subject={anio === null ? dict.catalog.wine.noVintage : String(anio)}
      />
    </Suspense>
  );
}

async function AnadaNoteInner({
  lang,
  labels,
  vinoId,
  slug,
  anadaId,
  anadaIds,
  subject,
}: {
  lang: Locale;
  labels: Dictionary["catalog"]["userActions"];
  vinoId: string;
  slug: string;
  anadaId: string;
  anadaIds: string[];
  subject: string;
}) {
  const state = await getVinoPersonal(vinoId, anadaIds);
  return (
    <NoteEditor
      // Una instancia por añada: al cambiar de añada se reinicia el panel.
      key={anadaId}
      tipo="anada"
      id={anadaId}
      initial={state.anadaNotes[anadaId] ?? null}
      lang={lang}
      signedIn={state.signedIn}
      loginHref={loginPathWithNext(lang, localePath(lang, `/vino/${slug}`))}
      labels={labels}
      subject={subject}
      buttonLabel={labels.vintageNote}
    />
  );
}
