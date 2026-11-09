import type { Metadata } from "next";
import NextLink from "next/link";
import { AdminHeader, Flash } from "@/components/admin/parts";
import { Badge, Button, buttonStyles } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatDate, formatNumber } from "@/i18n/format";
import { getDictionary, getLocale } from "@/i18n/server";
import { VISTAS_ENLACES, vistaEnlaces, type VistaEnlaces } from "@/lib/admin/enlaces";
import { pageParam } from "@/lib/admin/list";
import { adminPath } from "@/lib/admin/paths";
import { cn } from "@/lib/cn";
import { createClient } from "@/lib/supabase/server";
import { accionEnlace, editarUrlEnlace } from "./actions";

export async function generateMetadata(): Promise<Metadata> {
  const { admin } = await getDictionary();
  return { title: admin.enlaces.title, robots: { index: false } };
}

const POR_PAGINA = 50;
const inputCls = "h-11 min-w-0 flex-1 rounded-control border border-border-strong bg-surface px-3 text-base";

type Supabase = Awaited<ReturnType<typeof createClient>>;
type Ficha = { nombre: string; href: string | null };

/** Nombre y enlace al admin de cada entidad (tablas polimórficas: consultas aparte por tipo). */
async function fichas(
  supabase: Supabase,
  lang: Locale,
  filas: { entidad_tipo: string; entidad_id: string }[],
): Promise<Map<string, Ficha>> {
  const ids = (tipo: string) => [...new Set(filas.filter((f) => f.entidad_tipo === tipo).map((f) => f.entidad_id))];
  const [img, srv] = [ids("imagen"), ids("servicio_bodega")];
  const [imagenes, servicios] = await Promise.all([
    img.length
      ? supabase.from("imagenes").select("id, bodega_id, vino_id, anada_id, servicio_id").in("id", img)
      : { data: [] },
    srv.length ? supabase.from("servicios_bodega").select("id, titulo, bodega_id").in("id", srv) : { data: [] },
  ]);
  const imgs = imagenes.data ?? [];
  const srvs = servicios.data ?? [];
  const idsBodega = [
    ...new Set([...ids("bodega"), ...imgs.flatMap((i) => i.bodega_id ?? []), ...srvs.map((s) => s.bodega_id)]),
  ];
  const idsVino = [...new Set([...ids("vino"), ...imgs.flatMap((i) => i.vino_id ?? [])])];
  const idsAnada = [...new Set([...ids("anada"), ...imgs.flatMap((i) => i.anada_id ?? [])])];
  const [bodegas, vinos, anadas] = await Promise.all([
    idsBodega.length ? supabase.from("bodegas").select("id, nombre").in("id", idsBodega) : { data: [] },
    idsVino.length ? supabase.from("vinos").select("id, nombre").in("id", idsVino) : { data: [] },
    idsAnada.length
      ? supabase.from("anadas").select("id, anio, vino:vinos(nombre)").in("id", idsAnada)
      : { data: [] },
  ]);

  const out = new Map<string, Ficha>();
  const bodega = new Map((bodegas.data ?? []).map((b) => [b.id, b.nombre]));
  const vino = new Map((vinos.data ?? []).map((v) => [v.id, v.nombre]));
  const anada = new Map(
    (anadas.data ?? []).map((a) => [a.id, `${a.vino?.nombre ?? ""} ${a.anio ?? "s/a"}`.trim()]),
  );
  const ficha = (tipo: "bodega" | "vino" | "anada", id: string): Ficha => {
    const nombre = (tipo === "bodega" ? bodega : tipo === "vino" ? vino : anada).get(id);
    const ruta = tipo === "bodega" ? "/bodegas" : tipo === "vino" ? "/vinos" : "/anadas";
    return { nombre: nombre ?? id, href: nombre ? adminPath(lang, `${ruta}/${id}`) : null };
  };
  for (const id of ids("bodega")) out.set(`bodega:${id}`, ficha("bodega", id));
  for (const id of ids("vino")) out.set(`vino:${id}`, ficha("vino", id));
  for (const id of ids("anada")) out.set(`anada:${id}`, ficha("anada", id));
  for (const s of srvs) {
    const b = ficha("bodega", s.bodega_id);
    out.set(`servicio_bodega:${s.id}`, { nombre: `${s.titulo} · ${b.nombre}`, href: b.href });
  }
  for (const i of imgs) {
    const padre = i.bodega_id
      ? ficha("bodega", i.bodega_id)
      : i.vino_id
        ? ficha("vino", i.vino_id)
        : i.anada_id
          ? ficha("anada", i.anada_id)
          : null;
    if (padre) out.set(`imagen:${i.id}`, padre);
  }
  return out;
}

export default async function EnlacesPage({ searchParams }: PageProps<"/[lang]/admin/enlaces">) {
  const lang = await getLocale();
  const { admin } = await getDictionary();
  const t = admin.enlaces;
  const sp = (await searchParams) as Record<string, string | undefined>;
  const vista = vistaEnlaces(sp.vista ?? "");
  const pagina = pageParam(sp);

  const supabase = await createClient();
  const contar = { count: "exact", head: true } as const;
  let query = supabase
    .from("comprobaciones_enlace")
    .select(
      "id, url, entidad_tipo, entidad_id, campos, modo, oculto, fallos_consecutivos, ultimo_resultado, ultimo_estado_http, ultimo_error, ultima_comprobacion, ultimo_ok, url_final",
      { count: "exact" },
    );
  query =
    vista === "fallando"
      ? query.eq("modo", "auto").eq("oculto", false).gt("fallos_consecutivos", 0)
      : vista === "ocultos"
        ? query.eq("oculto", true)
        : query.eq("modo", "ignorado");
  const [{ data, error, count }, nFallando, nOcultos, nIgnorados] = await Promise.all([
    query
      .order("ultima_comprobacion", { ascending: false, nullsFirst: false })
      .order("id")
      .range((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA - 1),
    supabase.from("comprobaciones_enlace").select("id", contar).eq("modo", "auto").eq("oculto", false).gt("fallos_consecutivos", 0),
    supabase.from("comprobaciones_enlace").select("id", contar).eq("oculto", true),
    supabase.from("comprobaciones_enlace").select("id", contar).eq("modo", "ignorado"),
  ]);
  if (error) throw new Error(error.message);
  const nombres = await fichas(supabase, lang, data);
  const total = count ?? 0;
  const conteos: Record<VistaEnlaces, number | null> = {
    fallando: nFallando.count,
    ocultos: nOcultos.count,
    ignorados: nIgnorados.count,
  };
  const fecha = (d: string | null) => (d ? formatDate(lang, d, { dateStyle: "medium", timeStyle: "short" }) : t.never);
  const base = { lang, vista, pagina: String(pagina) };

  return (
    <>
      <AdminHeader title={t.title}>
        <p className="max-w-prose text-muted">{t.intro}</p>
      </AdminHeader>
      <Flash
        ok={sp.ok}
        error={sp.error}
        messages={{ reintentado: t.retried, actualizado: t.updated, url: t.urlSaved }}
        errors={admin.errors}
      />

      <nav aria-label={t.title} className="flex flex-wrap gap-2">
        {VISTAS_ENLACES.map((v) => (
          <NextLink
            key={v}
            href={adminPath(lang, "/enlaces", { vista: v })}
            aria-current={v === vista ? "page" : undefined}
            className={buttonStyles({ variant: v === vista ? "primary" : "secondary", size: "sm" })}
          >
            {t.tabs[v]}
            {conteos[v] != null && <span className="tabular-nums opacity-80"> ({formatNumber(lang, conteos[v])})</span>}
          </NextLink>
        ))}
      </nav>

      {data.length === 0 ? (
        <p className="text-muted">{t.empty}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {data.map((e) => {
            const ficha = nombres.get(`${e.entidad_tipo}:${e.entidad_id}`);
            const tipo = t.entidades[e.entidad_tipo as keyof typeof t.entidades] ?? e.entidad_tipo;
            const hidden = { ...base, id: e.id };
            return (
              <li key={e.id} className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <a
                    href={e.url}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="min-w-0 flex-1 font-medium break-all underline underline-offset-4"
                  >
                    {e.url}
                  </a>
                  {e.modo === "ignorado" ? (
                    <Badge>{t.ignored}</Badge>
                  ) : e.oculto ? (
                    <Badge tone="warning">{e.modo === "oculto" ? t.hiddenByAdmin : t.hiddenAuto}</Badge>
                  ) : e.fallos_consecutivos > 0 ? (
                    <Badge tone="warning">{t.failing}</Badge>
                  ) : null}
                </div>
                <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                  <Dato label={t.entity}>
                    {tipo}
                    {": "}
                    {ficha?.href ? (
                      <NextLink href={ficha.href} className="underline underline-offset-4">
                        {ficha.nombre}
                      </NextLink>
                    ) : (
                      (ficha?.nombre ?? e.entidad_id)
                    )}
                  </Dato>
                  <Dato label={t.fields}>{e.campos.length ? e.campos.join(", ") : "—"}</Dato>
                  <Dato label={t.lastCheck}>
                    {fecha(e.ultima_comprobacion)}
                    {e.ultimo_resultado && (
                      <>
                        {" · "}
                        {t.resultados[e.ultimo_resultado as keyof typeof t.resultados] ?? e.ultimo_resultado}
                        {(e.ultimo_error ?? e.ultimo_estado_http) != null && ` (${e.ultimo_error ?? e.ultimo_estado_http})`}
                      </>
                    )}
                  </Dato>
                  <Dato label={t.failures}>
                    <span className="tabular-nums">{e.fallos_consecutivos}</span>
                    {" · "}
                    {t.lastOk}: {fecha(e.ultimo_ok)}
                  </Dato>
                  {e.url_final && (
                    <Dato label={t.finalUrl} wide>
                      <span className="break-all">{e.url_final}</span>
                    </Dato>
                  )}
                </dl>
                <div className="flex flex-wrap gap-2">
                  <Accion hidden={hidden} accion="reintentar" label={t.retry} variant="secondary" />
                  {e.modo === "oculto" || e.oculto ? (
                    <Accion hidden={hidden} accion="mostrar" label={t.show} />
                  ) : (
                    e.modo !== "ignorado" && <Accion hidden={hidden} accion="ocultar" label={t.hide} />
                  )}
                  {e.modo === "ignorado" ? (
                    <Accion hidden={hidden} accion="restaurar" label={t.unignore} />
                  ) : (
                    <Accion hidden={hidden} accion="ignorar" label={t.ignore} />
                  )}
                </div>
                <details className="group">
                  <summary className="cursor-pointer text-sm font-medium text-muted hover:text-fg">{t.editUrl}</summary>
                  <form action={editarUrlEnlace} className="mt-2 flex flex-wrap gap-2">
                    {Object.entries(hidden).map(([name, value]) => (
                      <input key={name} type="hidden" name={name} value={value} />
                    ))}
                    <label htmlFor={`url-${e.id}`} className="sr-only">
                      {t.newUrl}
                    </label>
                    <input
                      id={`url-${e.id}`}
                      name="url"
                      type="url"
                      required
                      defaultValue={e.url_final ?? e.url}
                      className={inputCls}
                    />
                    <Button type="submit" size="sm" variant="secondary">
                      {t.saveUrl}
                    </Button>
                  </form>
                </details>
              </li>
            );
          })}
        </ul>
      )}

      {total > POR_PAGINA && (
        <nav className="flex justify-between gap-2" aria-label={t.title}>
          {pagina > 1 ? (
            <NextLink
              href={adminPath(lang, "/enlaces", { vista, pagina: String(pagina - 1) })}
              className={buttonStyles({ variant: "secondary", size: "sm" })}
            >
              ← {t.previous}
            </NextLink>
          ) : (
            <span />
          )}
          {pagina * POR_PAGINA < total && (
            <NextLink
              href={adminPath(lang, "/enlaces", { vista, pagina: String(pagina + 1) })}
              className={buttonStyles({ variant: "secondary", size: "sm" })}
            >
              {t.next} →
            </NextLink>
          )}
        </nav>
      )}
    </>
  );
}

function Dato({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={cn("flex min-w-0 gap-2", wide && "sm:col-span-2")}>
      <dt className="shrink-0 text-muted">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

function Accion({
  hidden,
  accion,
  label,
  variant = "ghost",
}: {
  hidden: Record<string, string>;
  accion: string;
  label: string;
  variant?: "secondary" | "ghost";
}) {
  return (
    <form action={accionEnlace}>
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <input type="hidden" name="accion" value={accion} />
      <Button type="submit" size="sm" variant={variant}>
        {label}
      </Button>
    </form>
  );
}
