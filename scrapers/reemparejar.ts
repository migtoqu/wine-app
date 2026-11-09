// Reprocesa la cola de revisión con el emparejador actual.
//
//   node scrapers/reemparejar.ts                      # en seco (por defecto): solo informa
//   node scrapers/reemparejar.ts --aplicar            # enlaza las fichas de bodega que ahora se vinculan
//   node scrapers/reemparejar.ts --instantanea X.json # en seco sobre una instantánea exportada (sin BD)
//   opciones: --fuente SLUG (solo esa fuente), --out RUTA (informe JSON), --sin-auditoria
//
// Respeta las decisiones del admin y las supresiones: los registros con `decision` o
// `supresion_id` no se tocan, y las bodegas/vinos borrados o fusionados son candidatos
// (alias del superviviente o bloqueo). Con --aplicar solo enlaza fichas de bodega
// (entidad_tipo='bodega', estado 'emparejado'), y solo si siguen en revisión sin decisión;
// sus campos los consolida la próxima ejecución de la fuente. Los vinos los resuelve el
// propio scraper en su próxima ejecución (se informa de cuáles).
// Necesita SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY salvo con --instantanea.
import { readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { bodegaCatalogoDeFila, COLUMNAS_EMPAREJAR_BODEGA, type BodegaCatalogo } from "./emparejamiento/entidades.ts";
import { informeMarkdown, reemparejar, type Instantanea, type RegistroRevision, type RegistroVinculado } from "./emparejamiento/reemparejar.ts";
import { aSupresionBodega, aSupresionVino, cargarSupresiones } from "./lib/consolidacion/supresiones.ts";
import { crearClienteDb, sinError, type ClienteDb } from "./lib/db.ts";
import { cargarMarcasCR } from "./lib/marcas.ts";

async function paginar<T>(que: string, pedir: (desde: number, hasta: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let desde = 0; ; desde += 1000) {
    const filas = sinError(await pedir(desde, desde + 999), `leer ${que}`) ?? [];
    out.push(...filas);
    if (filas.length < 1000) return out;
  }
}

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

export async function cargarInstantanea(db: ClienteDb, opciones: { fuente?: string; auditoria: boolean }): Promise<Instantanea> {
  const fuentes = sinError(await db.from("fuentes").select("id, slug"), "leer fuentes");
  const slug = new Map(fuentes.map((f) => [f.id, f.slug]));
  const marcas = await cargarMarcasCR(db);

  const filasBodega = await paginar("bodegas", (d, h) => db.from("bodegas").select(`fuente_id, ${COLUMNAS_EMPAREJAR_BODEGA}`).order("id").range(d, h));
  const bodegas: BodegaCatalogo[] = filasBodega.map((b) => ({ ...bodegaCatalogoDeFila(b), marcas: marcas.get(b.id) ?? [] }));
  const fuenteDeBodega = new Map(filasBodega.map((b) => [b.id, b.fuente_id]));

  const vinos = await paginar("vinos", (d, h) => db.from("vinos").select("id, bodega_id, nombre, tipo, crianza").order("id").range(d, h));
  const eans = await paginar("EAN", (d, h) => db.from("codigos_ean").select("ean, vino_id").order("ean").range(d, h));

  // Registros de bodega ya vinculados (para excluir y para resolver el contexto de los vinos).
  const vinculadosBodega = await paginar("registros de bodega", (d, h) =>
    db.from("registros_fuente").select("id, fuente_id, id_externo, entidad_id, estado_emparejamiento, datos")
      .eq("entidad_tipo", "bodega").not("entidad_id", "is", null).order("id").range(d, h),
  );
  const bodegaPorRegistro = new Map(vinculadosBodega.map((r) => [`${r.fuente_id}|${r.id_externo}`, r.entidad_id!]));

  const enRevision = await paginar("cola de revisión", (d, h) =>
    db.from("registros_fuente").select("id, fuente_id, id_externo, datos, decision, supresion_id")
      .eq("estado_emparejamiento", "revision").order("id").range(d, h),
  );
  const registros: RegistroRevision[] = enRevision
    .filter((r) => r.decision === null && r.supresion_id === null)
    .map((r) => ({ ...r, fuente: slug.get(r.fuente_id) ?? r.fuente_id }))
    .filter((r) => !opciones.fuente || r.fuente === opciones.fuente)
    .map((r) => {
      const datos = obj(r.datos);
      const enlace = obj(datos.resolucion_bodega).idExterno;
      const bodegaId =
        (r.fuente.startsWith("web-") ? bodegaPorRegistro.get(`${r.fuente_id}|sitio`) : undefined) ??
        (typeof enlace === "string" ? bodegaPorRegistro.get(`${r.fuente_id}|${enlace}`) : undefined) ??
        null;
      return { id: r.id, fuente: r.fuente, idExterno: r.id_externo, datos, bodegaId };
    });

  // Vinculaciones entre fuentes (la bodega la creó otra fuente): candidatas a auditar.
  const auditoria: RegistroVinculado[] = opciones.auditoria
    ? vinculadosBodega
        .filter((r) => r.estado_emparejamiento === "emparejado" && fuenteDeBodega.get(r.entidad_id!) !== r.fuente_id)
        .map((r) => ({ id: r.id, fuente: slug.get(r.fuente_id) ?? r.fuente_id, idExterno: r.id_externo, bodegaId: r.entidad_id!, datos: obj(r.datos) }))
        .filter((r) => !opciones.fuente || r.fuente === opciones.fuente)
    : [];

  return {
    bodegas,
    supresionesBodega: (await cargarSupresiones(db, "bodega")).map(aSupresionBodega).filter((s) => s !== null),
    vinos: vinos.map((v) => ({ id: v.id, bodegaId: v.bodega_id, nombre: v.nombre, tipo: v.tipo, crianza: v.crianza })),
    eans: eans.map((e) => ({ ean: e.ean, vinoId: e.vino_id })),
    supresionesVino: (await cargarSupresiones(db, "vino")).map(aSupresionVino).filter((s) => s !== null),
    registros,
    vinculadas: vinculadosBodega.map((r) => ({ fuente: slug.get(r.fuente_id) ?? r.fuente_id, idExterno: r.id_externo, bodegaId: r.entidad_id! })),
    auditoria,
  };
}

/** Lo que movería separar una vinculación sospechosa (registros y valores aportados). */
async function impacto(db: ClienteDb, registroId: string) {
  const contar = async (tabla: "valores_fuente" | "procedencia_campos") => {
    const r = await db.from(tabla).select("registro_id", { count: "exact", head: true }).eq("registro_id", registroId);
    if (r.error) throw new Error(`contar ${tabla}: ${r.error.message}`);
    return r.count ?? 0;
  };
  return { valores_fuente: await contar("valores_fuente"), procedencia_campos: await contar("procedencia_campos") };
}

async function main(): Promise<number> {
  const { values } = parseArgs({
    options: {
      aplicar: { type: "boolean", default: false },
      "dry-run": { type: "boolean", default: false },
      instantanea: { type: "string" },
      fuente: { type: "string" },
      out: { type: "string" },
      "sin-auditoria": { type: "boolean", default: false },
    },
  });
  const aplicar = values.aplicar && !values["dry-run"];
  if (aplicar && values.instantanea) {
    console.error("--aplicar no admite --instantanea: aplica sobre la BD real.");
    return 2;
  }
  const db = values.instantanea ? null : crearClienteDb();
  const inst: Instantanea = values.instantanea
    ? (JSON.parse(readFileSync(values.instantanea, "utf8")) as Instantanea)
    : await cargarInstantanea(db!, { fuente: values.fuente, auditoria: !values["sin-auditoria"] });

  const informe = reemparejar(inst);
  console.log(`${aplicar ? "APLICANDO" : "En seco"}: ${inst.registros.length} registros en revisión, ${inst.bodegas.length} bodegas, ${inst.vinos.length} vinos.\n`);
  console.log(informeMarkdown(informe));

  const sospechas = db
    ? await Promise.all(informe.sospechas.map(async (s) => ({ ...s, ...(await impacto(db, s.registroId)) })))
    : informe.sospechas;

  if (aplicar && db) {
    let enlazados = 0;
    for (const r of informe.resultados.filter((x) => x.accion === "vincular_bodega" && x.destinoId)) {
      const previo = inst.registros.find((x) => x.id === r.registroId)!;
      const res = await db.from("registros_fuente")
        .update({
          entidad_tipo: "bodega", entidad_id: r.destinoId, estado_emparejamiento: "emparejado", confianza_emparejamiento: r.confianza,
          datos: { ...previo.datos, emparejamiento: { estado: "vinculada", confianza: r.confianza, candidatos: r.candidatos, reemparejado_en: new Date().toISOString() } },
        })
        .eq("id", r.registroId).eq("estado_emparejamiento", "revision").is("decision", null).is("supresion_id", null)
        .select("id");
      if (res.error) throw new Error(`enlazar ${r.registroId}: ${res.error.message}`);
      enlazados += res.data?.length ?? 0;
    }
    console.log(`\nEnlazados: ${enlazados}`);
  }
  if (values.out) writeFileSync(values.out, JSON.stringify({ ...informe, sospechas }, null, 2) + "\n");
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().then((c) => process.exit(c), (e: unknown) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
