import type { Metadata } from "next";
import NextLink from "next/link";
import { localePath } from "@/i18n/config";
import { formatNumber } from "@/i18n/format";
import { getDictionary, getLocale } from "@/i18n/server";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const { admin } = await getDictionary();
  return { title: admin.title, robots: { index: false } };
}

export default async function AdminPage() {
  const lang = await getLocale();
  const { admin } = await getDictionary();
  const supabase = await createClient();
  const count = { count: "exact", head: true } as const;
  const [invitaciones, usuarios, bodegas, vinos, denominaciones, uvas, revision] = await Promise.all([
    supabase
      .from("invitaciones")
      .select("id", count)
      .is("usada_en", null)
      .or(`caduca.is.null,caduca.gt.${new Date().toISOString()}`),
    supabase.from("perfiles").select("id", count),
    supabase.from("bodegas").select("id", count),
    supabase.from("vinos").select("id", count),
    supabase.from("denominaciones").select("id", count),
    supabase.from("variedades_uva").select("id", count),
    supabase.from("registros_fuente").select("id", count).eq("estado_emparejamiento", "revision"),
  ]);
  const cards = [
    { key: "invitaciones", n: invitaciones.count, suffix: admin.home.pending },
    { key: "usuarios", n: usuarios.count },
    { key: "bodegas", n: bodegas.count },
    { key: "vinos", n: vinos.count },
    { key: "denominaciones", n: denominaciones.count },
    { key: "uvas", n: uvas.count },
    { key: "revision", n: revision.count, suffix: admin.home.pending },
  ] as const;

  return (
    <>
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{admin.title}</h1>
        <p className="text-muted">{admin.home.intro}</p>
      </header>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => (
          <li key={c.key}>
            <NextLink
              href={localePath(lang, `/admin/${c.key}`)}
              className="flex h-full flex-col gap-1 rounded-card border border-border bg-surface p-4 shadow-card hover:bg-surface-2"
            >
              <span className="flex items-baseline justify-between gap-2">
                <span className="font-semibold">{admin.nav[c.key]}</span>
                <span className="text-sm text-muted tabular-nums">
                  {c.n === null ? "" : formatNumber(lang, c.n)}
                  {"suffix" in c && c.n !== null ? ` ${c.suffix}` : ""}
                </span>
              </span>
              <span className="text-sm text-muted">{admin.home.sections[c.key]}</span>
            </NextLink>
          </li>
        ))}
      </ul>
    </>
  );
}
