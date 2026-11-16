-- Procedencias 'admin' falsas: la consolidación tomaba los valores por defecto `'{}'` de
-- servicios_bodega.idiomas (text[]) y bodegas.redes (jsonb) por una edición manual y los marcaba
-- como 'admin', que ninguna fuente pisa: los idiomas de las visitas y las redes no se rellenaban
-- nunca (2026-11-16: 453 servicios y 488 bodegas). El scraper ya trata `[]`/`{}` como vacío
-- (scrapers/lib/consolidacion/decidir.ts). Aquí se borran esas procedencias —solo si el valor sigue
-- vacío, así que una edición real del admin con datos no se toca— y se rellenan los idiomas con lo
-- que ya trae el registro de la web de la bodega.

delete from public.procedencia_campos pc
 using public.servicios_bodega s
 where pc.entidad_tipo = 'servicio_bodega' and pc.entidad_id = s.id and pc.campo = 'idiomas'
   and pc.origen = 'admin' and cardinality(s.idiomas) = 0;

delete from public.procedencia_campos pc
 using public.bodegas b
 where pc.entidad_tipo = 'bodega' and pc.entidad_id = b.id and pc.campo = 'redes'
   and pc.origen = 'admin' and b.redes = '{}'::jsonb;

-- Idiomas desde el registro más reciente de cada servicio (web oficial de la bodega).
with ultimo as (
  select distinct on (r.entidad_id)
         r.entidad_id, r.id as registro_id, r.fuente_id, r.url, r.visto_por_ultima_vez,
         array(select jsonb_array_elements_text(r.datos -> 'servicio' -> 'idiomas')) as idiomas
    from public.registros_fuente r
   where r.entidad_tipo = 'servicio_bodega'
     and jsonb_typeof(r.datos -> 'servicio' -> 'idiomas') = 'array'
     and jsonb_array_length(r.datos -> 'servicio' -> 'idiomas') > 0
   order by r.entidad_id, r.visto_por_ultima_vez desc
),
escritos as (
  update public.servicios_bodega s
     set idiomas = u.idiomas
    from ultimo u
   where s.id = u.entidad_id and cardinality(s.idiomas) = 0
     and not exists (select 1 from public.procedencia_campos pc
                      where pc.entidad_tipo = 'servicio_bodega' and pc.entidad_id = s.id and pc.campo = 'idiomas')
  returning s.id, u.registro_id, u.fuente_id, u.url, u.visto_por_ultima_vez
)
insert into public.procedencia_campos
  (entidad_tipo, entidad_id, campo, origen, fuente_id, registro_id, url, observado_en)
select 'servicio_bodega', e.id, 'idiomas', f.tipo::text::public.origen_dato, e.fuente_id, e.registro_id, e.url, e.visto_por_ultima_vez
  from escritos e
  join public.fuentes f on f.id = e.fuente_id
on conflict (entidad_tipo, entidad_id, campo) do nothing;
