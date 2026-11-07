import type { Metadata } from "next";
import { Suspense } from "react";
import { ProfileForm, WinePrefsForm, type SettingsLabels } from "@/components/auth/settings-forms";
import { FormFallback } from "@/components/auth/auth-shell";
import { Container } from "@/components/layout/container";
import { Card, CardBody } from "@/components/ui";
import { localePath, type Locale } from "@/i18n/config";
import { getDictionary, getLocale } from "@/i18n/server";
import { getProfile, requireUser } from "@/lib/auth/server";
import { PREFS_EMAIL, type PrefsEmail } from "@/lib/auth/validation";
import type { Json } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const { settings } = await getDictionary();
  return { title: settings.title };
}

export default async function AjustesPage() {
  const lang = await getLocale();
  const { settings, auth } = await getDictionary();
  // spaceGreeting es una función: no puede pasar a un Client Component.
  const { spaceGreeting, ...texts } = settings;
  void spaceGreeting;
  const labels: SettingsLabels = { ...texts, errors: auth.errors };

  return (
    <Container className="max-w-2xl py-12">
      <h1 className="text-3xl font-semibold tracking-tight">{settings.title}</h1>
      <Suspense
        fallback={
          <Card className="mt-6">
            <CardBody>
              <FormFallback fields={4} />
            </CardBody>
          </Card>
        }
      >
        <SettingsContent lang={lang} labels={labels} />
      </Suspense>
    </Container>
  );
}

// prefs_email es jsonb libre: se normaliza a las claves conocidas.
function toPrefsEmail(value: Json): PrefsEmail {
  const obj = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return Object.fromEntries(PREFS_EMAIL.map((k) => [k, obj[k] === true])) as PrefsEmail;
}

async function SettingsContent({ lang, labels }: { lang: Locale; labels: SettingsLabels }) {
  const user = await requireUser({ lang, next: localePath(lang, "/yo/ajustes") });
  const supabase = await createClient();
  const [profile, prefs, variedades, denominaciones] = await Promise.all([
    getProfile(),
    supabase.from("preferencias_vino").select("*").eq("usuario_id", user.id).maybeSingle(),
    supabase.from("variedades_uva").select("id, nombre").order("nombre"),
    supabase.from("denominaciones").select("id, nombre").order("nombre"),
  ]);

  return (
    <div className="mt-6 flex flex-col gap-6">
      <Card>
        <CardBody>
          <ProfileForm
            lang={lang}
            labels={labels}
            email={user.email}
            profile={{
              nombre: profile?.nombre ?? null,
              idioma: profile?.idioma ?? lang,
              tema: profile?.tema ?? "sistema",
              prefs_email: toPrefsEmail(profile?.prefs_email ?? {}),
            }}
          />
        </CardBody>
      </Card>
      <Card>
        <CardBody>
          <WinePrefsForm
            lang={lang}
            labels={labels}
            prefs={{
              tipos: prefs.data?.tipos ?? [],
              crianzas: prefs.data?.crianzas ?? [],
              variedad_uva_ids: prefs.data?.variedad_uva_ids ?? [],
              denominacion_ids: prefs.data?.denominacion_ids ?? [],
              precio_min: prefs.data?.precio_min ?? null,
              precio_max: prefs.data?.precio_max ?? null,
            }}
            variedades={variedades.data ?? []}
            denominaciones={denominaciones.data ?? []}
          />
        </CardBody>
      </Card>
    </div>
  );
}
