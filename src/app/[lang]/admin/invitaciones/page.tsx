import type { Metadata } from "next";
import { headers } from "next/headers";
import { CopyField } from "@/components/admin/copy-field";
import { EntityForm } from "@/components/admin/entity-form";
import { enumOptions, formLabels } from "@/components/admin/labels";
import { AdminHeader, Flash, Section } from "@/components/admin/parts";
import { Badge, Button, type BadgeTone } from "@/components/ui";
import { localePath, type Locale } from "@/i18n/config";
import { formatDate } from "@/i18n/format";
import { getDictionary, getLocale } from "@/i18n/server";
import {
  CADUCIDAD_DIAS_POR_DEFECTO,
  estadoInvitacion,
  ROLES,
  type EstadoInvitacion,
} from "@/lib/admin/validation";
import { createClient } from "@/lib/supabase/server";
import { crearInvitacion, revocarInvitacion } from "./actions";

export async function generateMetadata(): Promise<Metadata> {
  const { admin } = await getDictionary();
  return { title: admin.invitaciones.title, robots: { index: false } };
}

const TONO: Record<EstadoInvitacion, BadgeTone> = {
  pendiente: "primary",
  usada: "success",
  caducada: "warning",
};

// Origen de la petición para el enlace de registro (no hay SMTP propio: el
// admin lo copia y lo envía a mano).
async function requestOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

function registroUrl(origin: string, lang: Locale, email: string) {
  return `${origin}${localePath(lang, "/registro")}?${new URLSearchParams({ email })}`;
}

export default async function InvitacionesPage({ searchParams }: PageProps<"/[lang]/admin/invitaciones">) {
  const lang = await getLocale();
  const dict = await getDictionary();
  const { admin } = dict;
  const t = admin.invitaciones;
  const { ok, error } = (await searchParams) as { ok?: string; error?: string };

  const supabase = await createClient();
  const [{ data, error: dbError }, origin] = await Promise.all([
    supabase
      .from("invitaciones")
      .select("id, email, rol, caduca, usada_en, created_at")
      .order("created_at", { ascending: false })
      .limit(500),
    requestOrigin(),
  ]);
  if (dbError) throw new Error(dbError.message);
  const now = new Date();
  const date = (d: string) => formatDate(lang, d, { dateStyle: "medium" });

  return (
    <>
      <AdminHeader title={t.title}>
        <p className="max-w-prose text-muted">{t.intro}</p>
      </AdminHeader>
      <Flash
        ok={ok}
        error={error}
        messages={{ creada: t.created, revocada: t.revoked }}
        errors={admin.errors}
      />

      <Section title={t.newTitle} className="rounded-card border border-border bg-surface p-4 sm:p-5">
        <EntityForm
          action={crearInvitacion}
          hidden={{ lang }}
          labels={formLabels(dict)}
          submitLabel={t.create}
          fields={[
            { kind: "email", name: "email", label: admin.fields.email, required: true, wide: true },
            {
              kind: "select",
              name: "rol",
              label: admin.fields.rol,
              options: enumOptions(ROLES, admin.enums.rol),
              defaultValue: "user",
              required: true,
            },
            {
              kind: "number",
              name: "caduca_dias",
              label: admin.fields.caduca_dias,
              hint: admin.hints.caduca_dias,
              defaultValue: String(CADUCIDAD_DIAS_POR_DEFECTO),
              required: true,
            },
          ]}
        />
      </Section>

      <Section title={t.listTitle}>
        {data.length === 0 ? (
          <p className="text-muted">{t.empty}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {data.map((inv) => {
              const estado = estadoInvitacion(inv, now);
              return (
                <li key={inv.id} className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="min-w-0 flex-1 break-all font-medium">{inv.email}</span>
                    <Badge tone={TONO[estado]}>{t.estado[estado]}</Badge>
                    {inv.rol === "admin" && <Badge tone="accent">{admin.enums.rol.admin}</Badge>}
                  </div>
                  <p className="text-sm text-muted">
                    {t.creada} {date(inv.created_at)}
                    {" · "}
                    {inv.usada_en
                      ? `${t.usada} ${date(inv.usada_en)}`
                      : inv.caduca
                        ? `${estado === "caducada" ? t.caducada : t.caduca} ${date(inv.caduca)}`
                        : t.sinCaducidad}
                  </p>
                  {estado === "pendiente" && (
                    <CopyField
                      label={t.link}
                      value={registroUrl(origin, lang, inv.email)}
                      copyLabel={t.copy}
                      copiedLabel={t.copied}
                    />
                  )}
                  {estado === "caducada" && <p className="text-sm text-muted">{t.renewHint}</p>}
                  {estado !== "usada" && (
                    <form action={revocarInvitacion} className="flex flex-wrap items-center gap-3">
                      <input type="hidden" name="lang" value={lang} />
                      <input type="hidden" name="id" value={inv.id} />
                      <Button type="submit" size="sm" variant="secondary">
                        {t.revoke}
                      </Button>
                      <span className="text-xs text-muted">{t.revokeHint}</span>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Section>
    </>
  );
}
