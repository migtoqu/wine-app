-- Consolidación de fuentes (SCOPE §6, §7.2, §7.3): contenido rico, claves de
-- emparejamiento, procedencia por campo, supresiones del admin, fusión de
-- duplicados y resúmenes propios. Ver scrapers/README.md («Consolidación»).
--
-- Idea general:
--   * Cada registro de fuente aporta valores candidatos por campo
--     (valores_fuente). Los scrapers (service_role) eligen el ganador con la
--     prioridad admin > web oficial (bodega) > consejo regulador > guía >
--     tienda, desempatando por la fecha en que la fuente empezó a dar ese
--     valor, y lo dejan en la columna y en procedencia_campos (atribución).
--   * Toda edición de un admin desde la app (rol authenticated) deja la
--     procedencia del campo como 'admin', que ninguna fuente pisa.
--   * Todo borrado de un admin (y sus hijos) deja una supresión con las claves
--     de la entidad, y la fusión deja otra que la convierte en alias del
--     superviviente: los scrapers no recrean ni vuelven a separar nada.
--   * Los textos (descripción, historia, elaboración, cata) son resúmenes
--     propios generados a partir de hechos atómicos, nunca copias.

-- =====================================================================
-- Enums
-- =====================================================================

alter type public.tipo_servicio add value if not exists 'actividad';

-- Origen del valor vigente de un campo, de más a menos prioritario.
-- 'bodega' = web oficial de la propia bodega.
create type public.origen_dato as enum (
  'admin', 'bodega', 'consejo_regulador', 'guia', 'tienda', 'otra'
);

-- =====================================================================
-- Utilidades
-- =====================================================================

-- Dominio de una web para emparejar: host en minúsculas, sin puerto ni
-- subdominios habituales (www, www2, m, es, en…), siempre que quede un
-- dominio con punto. 'https://WWW.Aalto.es/x' → 'aalto.es'.
-- Equivale a dominioWeb() en scrapers/lib/contacto.ts. Los dominios genéricos
-- (redes, constructores de webs, tiendas) los descarta el emparejador.
create or replace function public.dominio_web(url text)
returns text
language sql
immutable
parallel safe
strict
set search_path = ''
as $$
  select nullif(
    regexp_replace(
      regexp_replace(
        lower(substring(btrim(url) from '^[A-Za-z][A-Za-z0-9+.-]*://(?:[^/?#@]*@)?([^/?#:]+)')),
        '\.$', ''),
      '^(?:www[0-9]*|m|es|en|esp|eng|web)\.(?=[^.]+\.[^.]+)', ''),
    '')
$$;

revoke execute on function public.dominio_web(text) from public;
grant execute on function public.dominio_web(text) to anon, authenticated, service_role;

-- =====================================================================
-- Contenido rico y claves de emparejamiento
-- =====================================================================

-- Textos: columna = texto curado por el admin (español). Lo generado a partir
-- de hechos vive en public.resumenes (es/en); la ficha prefiere la columna.
alter table public.bodegas
  add column historia               text,
  add column enoturismo_web         text,
  add column enoturismo_email       text,
  add column enoturismo_telefono    text,
  add column nif                    text,
  add column registro_embotellador  text,
  add column dominio                text generated always as (public.dominio_web(web)) stored,
  add constraint bodegas_enoturismo_web_check check (enoturismo_web ~* '^https?://'),
  add constraint bodegas_enoturismo_email_check
    check (enoturismo_email ~* '^[^@[:space:]]+@[^@[:space:]]+$'),
  add constraint bodegas_nif_check check (nif ~ '^[A-Z0-9]{9}$');

create index bodegas_dominio_idx on public.bodegas (dominio) where dominio is not null;
create index bodegas_nif_idx on public.bodegas (nif) where nif is not null;
create index bodegas_registro_embotellador_idx on public.bodegas (registro_embotellador)
  where registro_embotellador is not null;

alter table public.vinos
  add column elaboracion text;

alter table public.anadas
  add column elaboracion  text,
  add column cata_vista   text,
  add column cata_nariz   text,
  add column cata_boca    text;

-- Servicios de enoturismo: clave estable para el upsert de los crawlers.
alter table public.servicios_bodega
  add column fuente_id  uuid references public.fuentes (id) on delete set null,
  add column clave      text generated always as (public.normalizar_busqueda(titulo)) stored,
  add constraint servicios_bodega_bodega_tipo_clave_key unique (bodega_id, tipo, clave);

create index servicios_bodega_fuente_id_idx on public.servicios_bodega (fuente_id);

-- EAN: un código apunta a un solo vino (y, si se conoce, a su añada).
create table public.codigos_ean (
  ean         text primary key,
  vino_id     uuid not null references public.vinos (id) on delete cascade,
  anada_id    uuid references public.anadas (id) on delete cascade,
  formato_ml  integer,
  fuente_id   uuid references public.fuentes (id) on delete set null,
  created_at  timestamptz not null default now(),
  constraint codigos_ean_ean_check check (ean ~ '^([0-9]{8}|[0-9]{12,14})$'),
  constraint codigos_ean_formato_ml_check check (formato_ml > 0)
);

create index codigos_ean_vino_id_idx on public.codigos_ean (vino_id);
create index codigos_ean_anada_id_idx on public.codigos_ean (anada_id) where anada_id is not null;
create index codigos_ean_fuente_id_idx on public.codigos_ean (fuente_id);

-- =====================================================================
-- Supresiones del admin (antes que registros_fuente.supresion_id)
-- =====================================================================

-- Lo que el admin borró o fusionó. `claves` es una instantánea de la fila
-- (más los EAN de un vino) para que los scrapers reconozcan la entidad si una
-- fuente la vuelve a traer: un borrado bloquea la recreación; una fusión es
-- un alias de `fusionada_en`.
create table public.supresiones (
  id            uuid primary key default gen_random_uuid(),
  entidad_tipo  public.entidad_catalogo not null,
  entidad_id    uuid not null,
  motivo        text not null,
  fusionada_en  uuid,
  claves        jsonb not null default '{}',
  creada_por    uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  constraint supresiones_entidad_key unique (entidad_tipo, entidad_id),
  constraint supresiones_motivo_check check (motivo in ('borrado', 'fusion')),
  constraint supresiones_fusion_check check ((motivo = 'fusion') = (fusionada_en is not null)),
  constraint supresiones_claves_check check (jsonb_typeof(claves) = 'object')
);

create index supresiones_fusionada_en_idx on public.supresiones (fusionada_en)
  where fusionada_en is not null;

-- =====================================================================
-- Registros de fuente: hechos, supresión y decisión del admin
-- =====================================================================

alter table public.registros_fuente
  -- Hechos atómicos extraídos (ver scrapers/lib/consolidacion/hechos.ts).
  add column hechos        jsonb not null default '[]',
  add column supresion_id  uuid references public.supresiones (id) on delete set null,
  -- Resolución de la cola de revisión; la aplica el scraper en la siguiente ejecución.
  add column decision      text,
  add column decision_tipo public.entidad_catalogo,
  add column decision_id   uuid,
  add column decidido_por  uuid references auth.users (id) on delete set null,
  add column decidido_en   timestamptz,
  add constraint registros_fuente_hechos_check check (jsonb_typeof(hechos) = 'array'),
  add constraint registros_fuente_decision_check
    check (decision in ('asociar', 'crear', 'descartar')),
  add constraint registros_fuente_decision_entidad_check
    check ((decision_tipo is null) = (decision_id is null)
           and (decision is distinct from 'asociar' or decision_id is not null));

create index registros_fuente_supresion_id_idx on public.registros_fuente (supresion_id)
  where supresion_id is not null;
create index registros_fuente_decision_idx on public.registros_fuente (decision_tipo, decision_id)
  where decision_id is not null;

-- =====================================================================
-- Procedencia por campo
-- =====================================================================

-- Valores candidatos: lo que cada registro de fuente dice de cada campo.
-- valor_desde = desde cuándo da la fuente ese valor (desempate estable).
create table public.valores_fuente (
  registro_id   uuid not null references public.registros_fuente (id) on delete cascade,
  entidad_tipo  public.entidad_catalogo not null,
  entidad_id    uuid not null,
  campo         text not null,
  valor         jsonb not null,
  -- Copia de la fuente del registro (evita joins al consolidar).
  fuente_id     uuid not null references public.fuentes (id) on delete cascade,
  origen        public.origen_dato not null,
  url           text,
  observado_en  timestamptz not null default now(),
  valor_desde   timestamptz not null default now(),
  primary key (registro_id, entidad_tipo, entidad_id, campo),
  constraint valores_fuente_origen_check check (origen <> 'admin')
);

create index valores_fuente_entidad_idx on public.valores_fuente (entidad_tipo, entidad_id);
create index valores_fuente_fuente_id_idx on public.valores_fuente (fuente_id);

-- Valor vigente de cada campo consolidado: de dónde sale, para atribuirlo en
-- la ficha y para que la prioridad decida. origen 'admin' ⇒ fuente_id null.
create table public.procedencia_campos (
  entidad_tipo  public.entidad_catalogo not null,
  entidad_id    uuid not null,
  campo         text not null,
  origen        public.origen_dato not null,
  fuente_id     uuid references public.fuentes (id) on delete set null,
  registro_id   uuid references public.registros_fuente (id) on delete set null,
  url           text,
  observado_en  timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  primary key (entidad_tipo, entidad_id, campo),
  constraint procedencia_campos_admin_check check (origen <> 'admin' or fuente_id is null)
);

create index procedencia_campos_fuente_id_idx on public.procedencia_campos (fuente_id);
create index procedencia_campos_registro_id_idx on public.procedencia_campos (registro_id);

create trigger set_updated_at before update on public.procedencia_campos
  for each row execute function public.set_updated_at();

-- =====================================================================
-- Resúmenes propios (generados a partir de hechos, es/en)
-- =====================================================================

create table public.resumenes (
  entidad_tipo  public.entidad_catalogo not null,
  entidad_id    uuid not null,
  campo         text not null,
  idioma        public.idioma not null,
  texto         text not null,
  -- sha256 de los hechos usados + generador + idioma: si no cambia, no se regenera.
  hash_hechos   text not null,
  generador     text not null,
  -- Fuentes de los hechos usados (para atribuir el resumen).
  fuentes       uuid[] not null default '{}',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  primary key (entidad_tipo, entidad_id, campo, idioma),
  constraint resumenes_campo_check
    check (campo in ('descripcion', 'historia', 'elaboracion', 'cata')),
  constraint resumenes_texto_check check (btrim(texto) <> '')
);

create trigger set_updated_at before update on public.resumenes
  for each row execute function public.set_updated_at();

-- =====================================================================
-- Ediciones del admin → procedencia 'admin'
-- =====================================================================

-- after insert/update. TG_ARGV[0] = tipo de entidad; el resto, columnas
-- vigiladas. Solo para el rol authenticated (admin vía app; los scrapers usan
-- service_role) y solo las columnas cuyo valor cambia de verdad: guardar un
-- formulario sin cambios no toca la procedencia. Durante una fusión no actúa
-- (la función de fusión reparte la procedencia ella misma).
create or replace function public.registrar_edicion_admin()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  tipo     public.entidad_catalogo := tg_argv[0]::public.entidad_catalogo;
  nuevo    jsonb := to_jsonb(new);
  anterior jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) end;
  col      text;
begin
  if current_user <> 'authenticated'
     or coalesce(current_setting('app.fusionando', true), '') = 'on' then
    return new;
  end if;
  for i in 1 .. tg_nargs - 1 loop
    col := tg_argv[i];
    if (tg_op = 'INSERT' and coalesce(nuevo -> col, 'null'::jsonb) <> 'null'::jsonb)
       or (tg_op = 'UPDATE' and (nuevo -> col) is distinct from (anterior -> col)) then
      insert into public.procedencia_campos
        (entidad_tipo, entidad_id, campo, origen, fuente_id, registro_id, url, observado_en)
      values (tipo, new.id, col, 'admin', null, null, null, now())
      on conflict (entidad_tipo, entidad_id, campo) do update
        set origen = 'admin', fuente_id = null, registro_id = null, url = null,
            observado_en = excluded.observado_en;
    end if;
  end loop;
  return new;
end
$$;

revoke execute on function public.registrar_edicion_admin() from public, anon, authenticated;

create trigger registrar_edicion_admin
  after insert or update on public.bodegas
  for each row execute function public.registrar_edicion_admin(
    'bodega', 'descripcion', 'historia', 'direccion', 'codigo_postal', 'municipio',
    'provincia', 'comunidad', 'ubicacion', 'web', 'telefono', 'email', 'redes',
    'anio_fundacion', 'hectareas', 'estado', 'enoturismo_web', 'enoturismo_email',
    'enoturismo_telefono', 'nif', 'registro_embotellador');

create trigger registrar_edicion_admin
  after insert or update on public.vinos
  for each row execute function public.registrar_edicion_admin(
    'vino', 'nombre', 'tipo', 'crianza', 'denominacion_id', 'descripcion', 'elaboracion');

create trigger registrar_edicion_admin
  after insert or update on public.anadas
  for each row execute function public.registrar_edicion_admin(
    'anada', 'grado', 'meses_crianza', 'notas_cata', 'maridaje', 'temp_servicio_min',
    'temp_servicio_max', 'produccion_botellas', 'elaboracion', 'cata_vista', 'cata_nariz',
    'cata_boca');

create trigger registrar_edicion_admin
  after insert or update on public.servicios_bodega
  for each row execute function public.registrar_edicion_admin(
    'servicio_bodega', 'tipo', 'titulo', 'descripcion', 'precio_desde', 'duracion_minutos',
    'idiomas', 'horario', 'url_reserva', 'activo');

-- =====================================================================
-- Borrados del admin → supresiones
-- =====================================================================

-- Registra una supresión (idempotente) y desvincula los registros de fuente
-- que apuntaban a la entidad, que quedan descartados y marcados.
create or replace function public._registrar_supresion(
  p_tipo   public.entidad_catalogo,
  p_id     uuid,
  p_claves jsonb
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  sid uuid;
begin
  insert into public.supresiones (entidad_tipo, entidad_id, motivo, claves, creada_por)
  values (p_tipo, p_id, 'borrado', p_claves - 'ubicacion', (select auth.uid()))
  on conflict (entidad_tipo, entidad_id) do nothing
  returning id into sid;
  if sid is null then
    select id into sid from public.supresiones where entidad_tipo = p_tipo and entidad_id = p_id;
  end if;
  update public.registros_fuente
  set supresion_id = sid, estado_emparejamiento = 'descartado',
      entidad_tipo = null, entidad_id = null
  where entidad_tipo = p_tipo and entidad_id = p_id;
end
$$;

revoke execute on function public._registrar_supresion(public.entidad_catalogo, uuid, jsonb)
  from public, anon;
grant execute on function public._registrar_supresion(public.entidad_catalogo, uuid, jsonb)
  to authenticated;

-- before delete. Los hijos que se borran en cascada (añadas, imágenes,
-- servicios…) se suprimen aquí de forma explícita: las acciones referenciales
-- se ejecutan como dueño de la tabla, no como authenticated, y sus triggers no
-- sabrían que el borrado lo inició un admin.
create or replace function public.registrar_supresion()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  tipo public.entidad_catalogo := tg_argv[0]::public.entidad_catalogo;
  claves jsonb := to_jsonb(old);
  h record;
begin
  if current_user <> 'authenticated'
     or coalesce(current_setting('app.fusionando', true), '') = 'on' then
    return old;
  end if;

  if tipo = 'bodega' then
    for h in select * from public.vinos where bodega_id = old.id loop
      perform public._registrar_supresion('vino', h.id, to_jsonb(h) || jsonb_build_object(
        'eans', coalesce((select jsonb_agg(e.ean) from public.codigos_ean e where e.vino_id = h.id), '[]')));
    end loop;
    for h in select a.* from public.anadas a join public.vinos v on v.id = a.vino_id
             where v.bodega_id = old.id loop
      perform public._registrar_supresion('anada', h.id, to_jsonb(h));
    end loop;
    for h in select * from public.servicios_bodega where bodega_id = old.id loop
      perform public._registrar_supresion('servicio_bodega', h.id, to_jsonb(h));
    end loop;
    for h in select i.* from public.imagenes i
             where i.bodega_id = old.id
                or i.servicio_id in (select id from public.servicios_bodega where bodega_id = old.id)
                or i.vino_id in (select id from public.vinos where bodega_id = old.id)
                or i.anada_id in (select a.id from public.anadas a join public.vinos v on v.id = a.vino_id
                                  where v.bodega_id = old.id) loop
      perform public._registrar_supresion('imagen', h.id, to_jsonb(h));
    end loop;
  elsif tipo = 'vino' then
    claves := claves || jsonb_build_object(
      'eans', coalesce((select jsonb_agg(e.ean) from public.codigos_ean e where e.vino_id = old.id), '[]'));
    for h in select * from public.anadas where vino_id = old.id loop
      perform public._registrar_supresion('anada', h.id, to_jsonb(h));
    end loop;
    for h in select i.* from public.imagenes i
             where i.vino_id = old.id
                or i.anada_id in (select id from public.anadas where vino_id = old.id) loop
      perform public._registrar_supresion('imagen', h.id, to_jsonb(h));
    end loop;
  elsif tipo = 'anada' then
    for h in select * from public.imagenes where anada_id = old.id loop
      perform public._registrar_supresion('imagen', h.id, to_jsonb(h));
    end loop;
  elsif tipo = 'servicio_bodega' then
    for h in select * from public.imagenes where servicio_id = old.id loop
      perform public._registrar_supresion('imagen', h.id, to_jsonb(h));
    end loop;
  end if;

  perform public._registrar_supresion(tipo, old.id, claves);
  return old;
end
$$;

revoke execute on function public.registrar_supresion() from public, anon, authenticated;

create trigger registrar_supresion before delete on public.bodegas
  for each row execute function public.registrar_supresion('bodega');
create trigger registrar_supresion before delete on public.vinos
  for each row execute function public.registrar_supresion('vino');
create trigger registrar_supresion before delete on public.anadas
  for each row execute function public.registrar_supresion('anada');
create trigger registrar_supresion before delete on public.servicios_bodega
  for each row execute function public.registrar_supresion('servicio_bodega');
create trigger registrar_supresion before delete on public.imagenes
  for each row execute function public.registrar_supresion('imagen');

-- =====================================================================
-- Fusión de duplicados
-- =====================================================================

-- Las notas fusionadas concatenan dos textos de hasta 5.000 caracteres: el
-- límite de la base sube para no perder texto (la app sigue limitando cada
-- edición a 5.000, NOTA_MAX).
alter table public.notas drop constraint notas_texto_check;
alter table public.notas add constraint notas_texto_check
  check (btrim(texto) <> '' and char_length(texto) <= 20000);

-- Favoritos y notas tienen RLS de solo-propietario: un admin con security
-- invoker no los ve. Esta función (security definer, excepción acordada) solo
-- traspasa los de origen a destino. Si el usuario ya tiene favorito en el
-- destino se conserva ese; si ya tiene nota, se conserva la del destino con
-- el texto del origen añadido tras un separador.
create or replace function public._fusion_mover_personales(
  p_tipo     text,  -- 'bodega' | 'vino' | 'anada'
  p_origen   uuid,
  p_destino  uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  col text;
begin
  if not public.is_admin() then
    raise exception 'solo_admin: hace falta el rol admin' using errcode = '42501';
  end if;
  if p_tipo not in ('bodega', 'vino', 'anada') then
    raise exception 'tipo_invalido: %', p_tipo using errcode = '22023';
  end if;
  if p_origen is null or p_destino is null or p_origen = p_destino then
    raise exception 'misma_entidad: origen y destino deben ser distintos' using errcode = '22023';
  end if;
  col := p_tipo || '_id';

  if p_tipo <> 'anada' then
    execute format(
      'delete from public.favoritos f where f.%1$I = $1
         and exists (select 1 from public.favoritos x where x.usuario_id = f.usuario_id and x.%1$I = $2)',
      col) using p_origen, p_destino;
    execute format('update public.favoritos set %1$I = $2 where %1$I = $1', col)
      using p_origen, p_destino;
  end if;

  execute format(
    'update public.notas n set texto = n.texto || E''\n\n———\n\n'' || o.texto
       from public.notas o
      where n.%1$I = $2 and o.%1$I = $1 and o.usuario_id = n.usuario_id',
    col) using p_origen, p_destino;
  execute format(
    'delete from public.notas o where o.%1$I = $1
       and exists (select 1 from public.notas n where n.usuario_id = o.usuario_id and n.%1$I = $2)',
    col) using p_origen, p_destino;
  execute format('update public.notas set %1$I = $2 where %1$I = $1', col)
    using p_origen, p_destino;
end
$$;

revoke execute on function public._fusion_mover_personales(text, uuid, uuid) from public, anon;
grant execute on function public._fusion_mover_personales(text, uuid, uuid) to authenticated;

-- Parte común de fundir origen en destino (misma tabla): rellena los huecos
-- del destino con los valores del origen (con su procedencia, salvo campos que
-- el admin dejó vacíos a propósito), reapunta registros, valores candidatos,
-- EAN y supresiones previas, y deja la supresión 'fusion'. No borra el origen.
create or replace function public._fusion_comun(
  p_tabla    text,
  p_tipo     public.entidad_catalogo,
  p_origen   uuid,
  p_destino  uuid,
  p_columnas text[]
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  o jsonb;
  d jsonb;
  col text;
begin
  if not public.is_admin() then
    raise exception 'solo_admin: hace falta el rol admin' using errcode = '42501';
  end if;
  execute format('select to_jsonb(t) from public.%I t where id = $1', p_tabla) into o using p_origen;
  execute format('select to_jsonb(t) from public.%I t where id = $1', p_tabla) into d using p_destino;

  foreach col in array p_columnas loop
    if coalesce(d -> col, 'null'::jsonb) = 'null'::jsonb
       and coalesce(o -> col, 'null'::jsonb) <> 'null'::jsonb
       and not exists (
         select 1 from public.procedencia_campos
         where entidad_tipo = p_tipo and entidad_id = p_destino and campo = col and origen = 'admin'
       ) then
      execute format(
        'update public.%1$I set %2$I = (select %2$I from public.%1$I where id = $1) where id = $2',
        p_tabla, col) using p_origen, p_destino;
      delete from public.procedencia_campos
      where entidad_tipo = p_tipo and entidad_id = p_destino and campo = col;
      update public.procedencia_campos set entidad_id = p_destino
      where entidad_tipo = p_tipo and entidad_id = p_origen and campo = col;
    end if;
  end loop;
  delete from public.procedencia_campos where entidad_tipo = p_tipo and entidad_id = p_origen;

  delete from public.valores_fuente v
  where v.entidad_tipo = p_tipo and v.entidad_id = p_origen
    and exists (select 1 from public.valores_fuente x
                where x.registro_id = v.registro_id and x.entidad_tipo = p_tipo
                  and x.entidad_id = p_destino and x.campo = v.campo);
  update public.valores_fuente set entidad_id = p_destino
  where entidad_tipo = p_tipo and entidad_id = p_origen;

  update public.registros_fuente set entidad_id = p_destino
  where entidad_tipo = p_tipo and entidad_id = p_origen;
  update public.registros_fuente set decision_id = p_destino
  where decision_tipo = p_tipo and decision_id = p_origen;

  delete from public.resumenes where entidad_tipo = p_tipo and entidad_id = p_origen;

  -- Las fusiones previas en el origen pasan a apuntar al destino.
  update public.supresiones set fusionada_en = p_destino
  where entidad_tipo = p_tipo and fusionada_en = p_origen;
  insert into public.supresiones (entidad_tipo, entidad_id, motivo, fusionada_en, claves, creada_por)
  values (p_tipo, p_origen, 'fusion', p_destino, o - 'ubicacion', (select auth.uid()))
  on conflict (entidad_tipo, entidad_id) do update
    set motivo = 'fusion', fusionada_en = excluded.fusionada_en, claves = excluded.claves;
end
$$;

revoke execute on function
  public._fusion_comun(text, public.entidad_catalogo, uuid, uuid, text[]) from public, anon;
grant execute on function
  public._fusion_comun(text, public.entidad_catalogo, uuid, uuid, text[]) to authenticated;

-- Funde dos bodegas o dos vinos: el origen desaparece y todo lo suyo pasa al
-- destino (vinos, añadas, D.O., servicios, imágenes, favoritos, notas,
-- registros, EAN). security invoker: se aplica la RLS de escritura de admin.
create or replace function public.admin_fusionar(
  p_tipo     text,  -- 'bodega' | 'vino'
  p_origen   uuid,
  p_destino  uuid
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  a   record;
  da  uuid;
begin
  if not public.is_admin() then
    raise exception 'solo_admin: hace falta el rol admin' using errcode = '42501';
  end if;
  if p_tipo not in ('bodega', 'vino') then
    raise exception 'tipo_invalido: %', p_tipo using errcode = '22023';
  end if;
  if p_origen is null or p_destino is null or p_origen = p_destino then
    raise exception 'misma_entidad: origen y destino deben ser distintos' using errcode = '22023';
  end if;

  perform set_config('app.fusionando', 'on', true);

  if p_tipo = 'bodega' then
    perform 1 from public.bodegas where id in (p_origen, p_destino) for update;
    if (select count(*) from public.bodegas where id in (p_origen, p_destino)) <> 2 then
      raise exception 'no_encontrada: bodega inexistente' using errcode = 'P0002';
    end if;

    perform public._fusion_comun('bodegas', 'bodega', p_origen, p_destino, array[
      'descripcion', 'historia', 'direccion', 'codigo_postal', 'municipio', 'provincia',
      'comunidad', 'ubicacion', 'web', 'telefono', 'email', 'anio_fundacion', 'hectareas',
      'enoturismo_web', 'enoturismo_email', 'enoturismo_telefono', 'nif',
      'registro_embotellador', 'fuente_id']);
    update public.bodegas d set redes = o.redes || d.redes
    from public.bodegas o where d.id = p_destino and o.id = p_origen;

    update public.vinos set bodega_id = p_destino where bodega_id = p_origen;

    insert into public.bodega_denominaciones (bodega_id, denominacion_id, principal)
    select p_destino, bd.denominacion_id,
           bd.principal and not exists (
             select 1 from public.bodega_denominaciones x where x.bodega_id = p_destino and x.principal)
    from public.bodega_denominaciones bd
    where bd.bodega_id = p_origen
    on conflict (bodega_id, denominacion_id) do nothing;

    -- Servicios: el del destino gana si es el mismo (tipo + título).
    update public.imagenes i set servicio_id = d.id, principal = false
    from public.servicios_bodega o
    join public.servicios_bodega d on d.bodega_id = p_destino and d.tipo = o.tipo and d.clave = o.clave
    where o.bodega_id = p_origen and i.servicio_id = o.id;
    delete from public.servicios_bodega o
    where o.bodega_id = p_origen
      and exists (select 1 from public.servicios_bodega d
                  where d.bodega_id = p_destino and d.tipo = o.tipo and d.clave = o.clave);
    update public.servicios_bodega set bodega_id = p_destino where bodega_id = p_origen;

    update public.imagenes set
      bodega_id = p_destino,
      principal = principal and not exists (
        select 1 from public.imagenes x where x.bodega_id = p_destino and x.principal)
    where bodega_id = p_origen;

    perform public._fusion_mover_personales('bodega', p_origen, p_destino);
    delete from public.bodegas where id = p_origen;

  else
    perform 1 from public.vinos where id in (p_origen, p_destino) for update;
    if (select count(*) from public.vinos where id in (p_origen, p_destino)) <> 2 then
      raise exception 'no_encontrado: vino inexistente' using errcode = 'P0002';
    end if;

    perform public._fusion_comun('vinos', 'vino', p_origen, p_destino, array[
      'crianza', 'denominacion_id', 'descripcion', 'elaboracion', 'fuente_id']);

    for a in select * from public.anadas where vino_id = p_origen loop
      select id into da from public.anadas
      where vino_id = p_destino and anio is not distinct from a.anio;
      if da is null then
        update public.anadas set vino_id = p_destino where id = a.id;
      else
        perform public._fusion_comun('anadas', 'anada', a.id, da, array[
          'grado', 'meses_crianza', 'notas_cata', 'maridaje', 'temp_servicio_min',
          'temp_servicio_max', 'produccion_botellas', 'elaboracion', 'cata_vista',
          'cata_nariz', 'cata_boca']);
        insert into public.anada_variedades (anada_id, variedad_id, porcentaje)
        select da, av.variedad_id, av.porcentaje
        from public.anada_variedades av
        where av.anada_id = a.id
          and not exists (select 1 from public.anada_variedades x where x.anada_id = da)
        on conflict (anada_id, variedad_id) do nothing;
        update public.imagenes set
          anada_id = da,
          principal = principal and not exists (
            select 1 from public.imagenes x where x.anada_id = da and x.principal)
        where anada_id = a.id;
        update public.codigos_ean set anada_id = da where anada_id = a.id;
        perform public._fusion_mover_personales('anada', a.id, da);
        delete from public.anadas where id = a.id;
      end if;
    end loop;

    update public.codigos_ean set vino_id = p_destino where vino_id = p_origen;
    update public.imagenes set
      vino_id = p_destino,
      principal = principal and not exists (
        select 1 from public.imagenes x where x.vino_id = p_destino and x.principal)
    where vino_id = p_origen;

    perform public._fusion_mover_personales('vino', p_origen, p_destino);
    delete from public.vinos where id = p_origen;
  end if;

  perform set_config('app.fusionando', '', true);
end
$$;

revoke execute on function public.admin_fusionar(text, uuid, uuid) from public, anon;
grant execute on function public.admin_fusionar(text, uuid, uuid) to authenticated;

-- =====================================================================
-- Relleno de la procedencia de lo ya cargado (idempotente)
-- =====================================================================
-- Cada campo que una fuente escribió (datos.campos de Ribera, datos.anada de
-- Vinoselección) pasa a tener procedencia: de la fuente si la columna sigue
-- igual, 'admin' si difiere (el admin lo corrigió). Registros sin esos datos
-- (primera carga de Ribera) se ignoran. La ubicación no se compara (EWKT
-- frente a geography): se atribuye a la fuente.

insert into public.procedencia_campos
  (entidad_tipo, entidad_id, campo, origen, fuente_id, registro_id, url, observado_en)
select
  'bodega', b.id, c.key,
  case when c.key = 'ubicacion' or coalesce(to_jsonb(b) -> c.key, 'null'::jsonb) = c.value
       then f.tipo::text::public.origen_dato else 'admin' end,
  case when c.key = 'ubicacion' or coalesce(to_jsonb(b) -> c.key, 'null'::jsonb) = c.value
       then f.id end,
  case when c.key = 'ubicacion' or coalesce(to_jsonb(b) -> c.key, 'null'::jsonb) = c.value
       then r.id end,
  case when c.key = 'ubicacion' or coalesce(to_jsonb(b) -> c.key, 'null'::jsonb) = c.value
       then r.url end,
  r.visto_por_ultima_vez
from public.registros_fuente r
join public.fuentes f on f.id = r.fuente_id
join public.bodegas b on r.entidad_tipo = 'bodega' and b.id = r.entidad_id
cross join lateral jsonb_each(
  case when jsonb_typeof(r.datos -> 'campos') = 'object' then r.datos -> 'campos' else '{}'::jsonb end
) c
where c.key in ('nombre', 'direccion', 'codigo_postal', 'municipio', 'provincia', 'comunidad',
                'ubicacion', 'web', 'telefono', 'email')
  and (c.value <> 'null'::jsonb or coalesce(to_jsonb(b) -> c.key, 'null'::jsonb) <> 'null'::jsonb)
on conflict (entidad_tipo, entidad_id, campo) do nothing;

insert into public.procedencia_campos
  (entidad_tipo, entidad_id, campo, origen, fuente_id, registro_id, url, observado_en)
select
  'anada', a.id, c.key,
  case when coalesce(to_jsonb(a) -> c.key, 'null'::jsonb) = c.value
       then f.tipo::text::public.origen_dato else 'admin' end,
  case when coalesce(to_jsonb(a) -> c.key, 'null'::jsonb) = c.value then f.id end,
  case when coalesce(to_jsonb(a) -> c.key, 'null'::jsonb) = c.value then r.id end,
  case when coalesce(to_jsonb(a) -> c.key, 'null'::jsonb) = c.value then r.url end,
  r.visto_por_ultima_vez
from public.registros_fuente r
join public.fuentes f on f.id = r.fuente_id
join public.anadas a on r.entidad_tipo = 'anada' and a.id = r.entidad_id
cross join lateral jsonb_each(
  case when jsonb_typeof(r.datos -> 'anada') = 'object' then r.datos -> 'anada' else '{}'::jsonb end
) c
where c.key in ('temp_servicio_min', 'temp_servicio_max', 'meses_crianza', 'grado')
  and (c.value <> 'null'::jsonb or coalesce(to_jsonb(a) -> c.key, 'null'::jsonb) <> 'null'::jsonb)
on conflict (entidad_tipo, entidad_id, campo) do nothing;

-- =====================================================================
-- Permisos y RLS
-- =====================================================================

alter table public.codigos_ean         enable row level security;
alter table public.supresiones         enable row level security;
alter table public.valores_fuente      enable row level security;
alter table public.procedencia_campos  enable row level security;
alter table public.resumenes           enable row level security;

revoke all on
  public.codigos_ean, public.supresiones, public.valores_fuente,
  public.procedencia_campos, public.resumenes
from anon, authenticated;

grant select, insert, update, delete on
  public.codigos_ean, public.supresiones, public.valores_fuente,
  public.procedencia_campos, public.resumenes
to service_role;

-- Lectura pública (atribución en las fichas), escritura admin.
grant select on public.codigos_ean, public.procedencia_campos, public.resumenes
  to anon, authenticated;
grant insert, update, delete on public.codigos_ean, public.procedencia_campos, public.resumenes
  to authenticated;

-- Solo admin.
grant select, insert, update, delete on public.supresiones, public.valores_fuente
  to authenticated;

do $$
declare
  t text;
begin
  foreach t in array array['codigos_ean', 'procedencia_campos', 'resumenes'] loop
    execute format(
      'create policy "lectura publica" on public.%I for select to anon, authenticated using (true)', t);
  end loop;
  foreach t in array array['supresiones', 'valores_fuente'] loop
    execute format(
      'create policy "admin lee" on public.%I for select to authenticated using ((select public.is_admin()))', t);
  end loop;
  foreach t in array array['codigos_ean', 'procedencia_campos', 'resumenes', 'supresiones', 'valores_fuente'] loop
    execute format(
      'create policy "admin inserta" on public.%I for insert to authenticated with check ((select public.is_admin()))', t);
    execute format(
      'create policy "admin actualiza" on public.%I for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()))', t);
    execute format(
      'create policy "admin borra" on public.%I for delete to authenticated using ((select public.is_admin()))', t);
  end loop;
end
$$;
