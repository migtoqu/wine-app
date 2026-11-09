-- Indicaciones geográficas protegidas de vino (IGP, término tradicional «Vino de la Tierra»).
-- Idempotente: `on conflict (slug) do nothing` (no pisa ediciones posteriores del admin).
--
-- Fuente: MAPA, «Listado de Denominaciones de Origen Protegidas e Indicaciones Geográficas
-- Protegidas de vinos registradas en la Unión Europea», actualizado a 2 de julio de 2026
-- (https://www.mapa.gob.es/es/dam/jcr:f9643333-ef75-4a2f-8864-afd1ade63fd1/02_vinos.pdf),
-- el mismo listado del que salen las 106 DOP de 20261107191000_semillas_catalogo.sql:
-- 43 IGP, todas con término tradicional VT. Tipo `igp`. Nombre: primera forma del nombre
-- oficial (las bilingües llevan el nombre completo en el comentario); comunidad: la del
-- listado (Ribera del Queiles es supraautonómica: Aragón y Navarra). `web` vacía (no
-- verificada). Al final de cada fila, el nº de expediente UE (eAmbrosia).
--
-- Las usa el crawler de webs de bodegas para asignar a cada vino su denominación
-- («Vino de la Tierra de Castilla y León» → castilla-y-leon) en vez de dejarlo sin ella.

insert into public.denominaciones (nombre, slug, tipo, comunidad) values
  ('Costa de Cantabria', 'costa-de-cantabria', 'igp', 'Cantabria'),  -- PGI-ES-A0129
  ('Liébana', 'liebana', 'igp', 'Cantabria'),  -- PGI-ES-A0130
  ('Castilla y León', 'castilla-y-leon', 'igp', 'Castilla y León'),  -- PGI-ES-A0948
  ('Altiplano de Sierra Nevada', 'altiplano-de-sierra-nevada', 'igp', 'Andalucía'),  -- PGI-ES-A1402
  ('Bailén', 'bailen', 'igp', 'Andalucía'),  -- PGI-ES-A1404
  ('Cádiz', 'cadiz', 'igp', 'Andalucía'),  -- PGI-ES-A1405
  ('Córdoba', 'cordoba', 'igp', 'Andalucía'),  -- PGI-ES-A1406
  ('Cumbres del Guadalfeo', 'cumbres-del-guadalfeo', 'igp', 'Andalucía'),  -- PGI-ES-A1407
  ('Desierto de Almería', 'desierto-de-almeria', 'igp', 'Andalucía'),  -- PGI-ES-A1408
  ('Laderas del Genil', 'laderas-del-genil', 'igp', 'Andalucía'),  -- PGI-ES-A1409
  ('Laujar-Alpujarra', 'laujar-alpujarra', 'igp', 'Andalucía'),  -- PGI-ES-A1410
  ('Los Palacios', 'los-palacios', 'igp', 'Andalucía'),  -- PGI-ES-A1411
  ('Norte de Almería', 'norte-de-almeria', 'igp', 'Andalucía'),  -- PGI-ES-A1412
  ('Ribera del Andarax', 'ribera-del-andarax', 'igp', 'Andalucía'),  -- PGI-ES-A1414
  ('Sierra Norte de Sevilla', 'sierra-norte-de-sevilla', 'igp', 'Andalucía'),  -- PGI-ES-A1415
  ('Sierra Sur de Jaén', 'sierra-sur-de-jaen', 'igp', 'Andalucía'),  -- PGI-ES-A1416
  ('Sierras de Las Estancias y Los Filabres', 'sierras-de-las-estancias-y-los-filabres', 'igp', 'Andalucía'),  -- PGI-ES-A1417
  ('Torreperogil', 'torreperogil', 'igp', 'Andalucía'),  -- PGI-ES-A1418
  ('Villaviciosa de Córdoba', 'villaviciosa-de-cordoba', 'igp', 'Andalucía'),  -- PGI-ES-A1419
  ('Bajo Aragón', 'bajo-aragon', 'igp', 'Aragón'),  -- PGI-ES-A1362
  ('Ribera del Gállego - Cinco Villas', 'ribera-del-gallego-cinco-villas', 'igp', 'Aragón'),  -- PGI-ES-A0245
  ('Ribera del Jiloca', 'ribera-del-jiloca', 'igp', 'Aragón'),  -- PGI-ES-A0244
  ('Valdejalón', 'valdejalon', 'igp', 'Aragón'),  -- PGI-ES-A0246
  ('Valle del Cinca', 'valle-del-cinca', 'igp', 'Aragón'),  -- PGI-ES-A0181
  ('Formentera', 'formentera', 'igp', 'Illes Balears'),  -- PGI-ES-A0875
  ('Ibiza', 'ibiza', 'igp', 'Illes Balears'),  -- PGI-ES-A0110 · nombre oficial: Ibiza / Eivissa
  ('Illes Balears', 'illes-balears', 'igp', 'Illes Balears'),  -- PGI-ES-A0947
  ('Isla de Menorca', 'isla-de-menorca', 'igp', 'Illes Balears'),  -- PGI-ES-A0870 · nombre oficial: Isla de Menorca / Illa de Menorca
  ('Mallorca', 'mallorca', 'igp', 'Illes Balears'),  -- PGI-ES-A0960
  ('Serra de Tramuntana-Costa Nord', 'serra-de-tramuntana-costa-nord', 'igp', 'Illes Balears'),  -- PGI-ES-A0103
  ('Ribera del Queiles', 'ribera-del-queiles', 'igp', 'Aragón, Comunidad Foral de Navarra'),  -- PGI-ES-A0083
  ('Castelló', 'castello', 'igp', 'Comunitat Valenciana'),  -- PGI-ES-A1173
  ('Barbanza e Iria', 'barbanza-e-iria', 'igp', 'Galicia'),  -- PGI-ES-A1255
  ('Betanzos', 'betanzos', 'igp', 'Galicia'),  -- PGI-ES-A1257
  ('Ribeiras do Morrazo', 'ribeiras-do-morrazo', 'igp', 'Galicia'),  -- PGI-ES-02238
  ('Terras do Navia', 'terras-do-navia', 'igp', 'Galicia'),  -- PGI-ES-02787
  ('Valle del Miño-Ourense', 'valle-del-mino-ourense', 'igp', 'Galicia'),  -- PGI-ES-A1259 · nombre oficial: Valle del Miño-Ourense / Val do Miño-Ourense
  ('Valles de Sadacia', 'valles-de-sadacia', 'igp', 'La Rioja'),  -- PGI-ES-A0511
  ('Campo de Cartagena', 'campo-de-cartagena', 'igp', 'Región de Murcia'),  -- PGI-ES-A0607
  ('Murcia', 'murcia', 'igp', 'Región de Murcia'),  -- PGI-ES-A0608
  ('3 Riberas', '3-riberas', 'igp', 'Comunidad Foral de Navarra'),  -- PGI-ES-A0128
  ('Castilla', 'castilla', 'igp', 'Castilla-La Mancha'),  -- PGI-ES-A0059
  ('Extremadura', 'extremadura', 'igp', 'Extremadura')  -- PGI-ES-A1300
on conflict (slug) do nothing;
