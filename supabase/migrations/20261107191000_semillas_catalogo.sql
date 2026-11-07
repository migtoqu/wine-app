-- Semillas del catálogo: fuentes del MVP, denominaciones de origen y variedades de uva.
-- Idempotente: `on conflict (slug) do nothing` (no pisa ediciones posteriores del admin).

-- =====================================================================
-- Fuentes (docs/SOURCES.md, auditoría del 2026-11-07)
-- =====================================================================

insert into public.fuentes (nombre, slug, tipo, url_base, frecuencia, notas_robots) values
  (
    'Consejo Regulador D.O. Ribera del Duero',
    'cr-ribera-del-duero',
    'consejo_regulador',
    'https://www.riberadelduero.es',
    'semanal',
    'robots.txt (2026-11-07): Drupal estándar; no excluye /bodegas/ ni /bodegas/resultados; sin Crawl-delay. '
    'Se recorre /bodegas/resultados?termino=&page=N (sin texto de búsqueda) y /bodegas/<slug>. '
    'Aviso legal reserva textos e imágenes: solo datos factuales de contacto, sin descripción ni fotos.'
  ),
  (
    'Vinoselección',
    'vinoseleccion',
    'tienda',
    'https://www.vinoseleccion.com',
    'semanal',
    'robots.txt (2026-11-07): Disallow: /*?* salvo Allow: /*?p=* (desde 08/2026); prohíbe /catalog/, '
    '/catalogsearch/, /search/, /checkout/, /customer/. Solo URLs limpias y paginación ?p=N. '
    'Aviso legal reserva textos, imágenes y base de datos: solo hechos; imágenes solo enlazadas.'
  )
on conflict (slug) do nothing;

-- =====================================================================
-- Denominaciones de origen protegidas de vino (106)
-- =====================================================================
-- Fuente: MAPA, «Listado de Denominaciones de Origen Protegidas e Indicaciones Geográficas
-- Protegidas de vinos registradas en la Unión Europea», actualizado a 2 de julio de 2026
-- (https://www.mapa.gob.es/es/dam/jcr:f9643333-ef75-4a2f-8864-afd1ade63fd1/02_vinos.pdf),
-- contrastado con «Pliegos de condiciones en vigor», actualizado a 16 de octubre de 2026
-- (mismas 106 DOP). Tipo = término tradicional del listado: DOCa → doca, DO → do,
-- VP (Vino de Pago) → do_pago, VC (Vino de Calidad) → vc. Sin IGP/Vino de la Tierra.
-- Nombre: primera forma del nombre oficial; comunidad: la del listado (supraautonómicas: las de
-- su zona; Cava queda sin comunidad porque no se ha verificado su zonificación). `web` se deja
-- vacía (no verificada). Al final de cada fila, el nº de expediente UE (eAmbrosia).

insert into public.denominaciones (nombre, slug, tipo, comunidad) values
  ('Cava', 'cava', 'do', null),  -- PDO-ES-A0735 · supraautonómica: zonas no verificadas, sin comunidad
  ('Jumilla', 'jumilla', 'do', 'Región de Murcia, Castilla-La Mancha'),  -- PDO-ES-A0109
  ('Rioja', 'rioja', 'doca', 'La Rioja, País Vasco, Comunidad Foral de Navarra'),  -- PDO-ES-A0117
  ('Condado de Huelva', 'condado-de-huelva', 'do', 'Andalucía'),  -- PDO-ES-A1485
  ('Granada', 'granada', 'do', 'Andalucía'),  -- PDO-ES-A1475
  ('Jerez-Xérès-Sherry', 'jerez-xeres-sherry', 'do', 'Andalucía'),  -- PDO-ES-A1483 · nombre oficial: Jerez-Xérès-Sherry / Jerez / Xérès / Sherry
  ('Lebrija', 'lebrija', 'vc', 'Andalucía'),  -- PDO-ES-A1478
  ('Málaga', 'malaga', 'do', 'Andalucía'),  -- PDO-ES-A1481
  ('Manzanilla-Sanlúcar de Barrameda', 'manzanilla-sanlucar-de-barrameda', 'do', 'Andalucía'),  -- PDO-ES-A1482 · nombre oficial: Manzanilla-Sanlúcar de Barrameda / Manzanilla
  ('Montilla-Moriles', 'montilla-moriles', 'do', 'Andalucía'),  -- PDO-ES-A1479
  ('Sierras de Málaga', 'sierras-de-malaga', 'do', 'Andalucía'),  -- PDO-ES-A1480
  ('Aylés', 'ayles', 'do_pago', 'Aragón'),  -- PDO-ES-A1522
  ('Calatayud', 'calatayud', 'do', 'Aragón'),  -- PDO-ES-A0247
  ('Campo de Borja', 'campo-de-borja', 'do', 'Aragón'),  -- PDO-ES-A0180
  ('Cariñena', 'carinena', 'do', 'Aragón'),  -- PDO-ES-A0043
  ('Somontano', 'somontano', 'do', 'Aragón'),  -- PDO-ES-A0534
  ('Urbezo', 'urbezo', 'do', 'Aragón'),  -- PDO-ES-02585
  ('Cangas', 'cangas', 'vc', 'Principado de Asturias'),  -- PDO-ES-A0119
  ('Binissalem', 'binissalem', 'do', 'Illes Balears'),  -- PDO-ES-A1056
  ('Pla i Llevant', 'pla-i-llevant', 'do', 'Illes Balears'),  -- PDO-ES-A1038
  ('Abona', 'abona', 'do', 'Canarias'),  -- PDO-ES-A0975
  ('El Hierro', 'el-hierro', 'do', 'Canarias'),  -- PDO-ES-A1250
  ('Gran Canaria', 'gran-canaria', 'do', 'Canarias'),  -- PDO-ES-A0112
  ('Islas Canarias', 'islas-canarias', 'vc', 'Canarias'),  -- PDO-ES-A1511
  ('La Gomera', 'la-gomera', 'do', 'Canarias'),  -- PDO-ES-A0111
  ('La Palma', 'la-palma', 'do', 'Canarias'),  -- PDO-ES-A0510
  ('Lanzarote', 'lanzarote', 'do', 'Canarias'),  -- PDO-ES-A0113
  ('Tacoronte-Acentejo', 'tacoronte-acentejo', 'do', 'Canarias'),  -- PDO-ES-A0115
  ('Valle de Güímar', 'valle-de-guimar', 'do', 'Canarias'),  -- PDO-ES-A0980
  ('Valle de la Orotava', 'valle-de-la-orotava', 'do', 'Canarias'),  -- PDO-ES-A1040
  ('Ycoden-Daute-Isora', 'ycoden-daute-isora', 'do', 'Canarias'),  -- PDO-ES-A0114
  ('Abadía Retuerta', 'abadia-retuerta', 'do_pago', 'Castilla y León'),  -- PDO-ES-02481
  ('Arlanza', 'arlanza', 'do', 'Castilla y León'),  -- PDO-ES-A0613
  ('Arribes', 'arribes', 'do', 'Castilla y León'),  -- PDO-ES-A0614
  ('Bierzo', 'bierzo', 'do', 'Castilla y León'),  -- PDO-ES-A0615
  ('Cebreros', 'cebreros', 'vc', 'Castilla y León'),  -- PDO-ES-02348
  ('Cigales', 'cigales', 'do', 'Castilla y León'),  -- PDO-ES-A0622
  ('Dehesa Peñalba', 'dehesa-penalba', 'do_pago', 'Castilla y León'),  -- PDO-ES-02592
  ('León', 'leon', 'do', 'Castilla y León'),  -- PDO-ES-A0882
  ('Ribera del Duero', 'ribera-del-duero', 'do', 'Castilla y León'),  -- PDO-ES-A0626
  ('Rueda', 'rueda', 'do', 'Castilla y León'),  -- PDO-ES-A0889
  ('Sierra de Salamanca', 'sierra-de-salamanca', 'vc', 'Castilla y León'),  -- PDO-ES-A0631
  ('Tierra del Vino de Zamora', 'tierra-del-vino-de-zamora', 'do', 'Castilla y León'),  -- PDO-ES-A0634
  ('Toro', 'toro', 'do', 'Castilla y León'),  -- PDO-ES-A0886
  ('Urueña', 'uruena', 'do_pago', 'Castilla y León'),  -- PDO-ES-02485
  ('Valles de Benavente', 'valles-de-benavente', 'vc', 'Castilla y León'),  -- PDO-ES-A0646
  ('Valtiendas', 'valtiendas', 'vc', 'Castilla y León'),  -- PDO-ES-A0747
  ('Almansa', 'almansa', 'do', 'Castilla-La Mancha'),  -- PDO-ES-A0044
  ('Calzadilla', 'calzadilla', 'do_pago', 'Castilla-La Mancha'),  -- PDO-ES-A0056
  ('Campo de Calatrava', 'campo-de-calatrava', 'do', 'Castilla-La Mancha'),  -- PDO-ES-02870
  ('Campo de La Guardia', 'campo-de-la-guardia', 'do_pago', 'Castilla-La Mancha'),  -- PDO-ES-A0055
  ('Casa del Blanco', 'casa-del-blanco', 'do_pago', 'Castilla-La Mancha'),  -- PDO-ES-A0060
  ('Dehesa del Carrizal', 'dehesa-del-carrizal', 'do_pago', 'Castilla-La Mancha'),  -- PDO-ES-A0054
  ('Dominio de Valdepusa', 'dominio-de-valdepusa', 'do_pago', 'Castilla-La Mancha'),  -- PDO-ES-A0052
  ('El Vicario', 'el-vicario', 'do_pago', 'Castilla-La Mancha'),  -- PDO-ES-N1634
  ('Finca Élez', 'finca-elez', 'do_pago', 'Castilla-La Mancha'),  -- PDO-ES-A0053
  ('Guijoso', 'guijoso', 'do_pago', 'Castilla-La Mancha'),  -- PDO-ES-A0058
  ('La Jaraba', 'la-jaraba', 'do_pago', 'Castilla-La Mancha'),  -- PDO-ES-01895
  ('La Mancha', 'la-mancha', 'do', 'Castilla-La Mancha'),  -- PDO-ES-A0045
  ('Los Cerrillos', 'los-cerrillos', 'do_pago', 'Castilla-La Mancha'),  -- PDO-ES-02228
  ('Manchuela', 'manchuela', 'do', 'Castilla-La Mancha'),  -- PDO-ES-A0046
  ('Méntrida', 'mentrida', 'do', 'Castilla-La Mancha'),  -- PDO-ES-A0047
  ('Mondéjar', 'mondejar', 'do', 'Castilla-La Mancha'),  -- PDO-ES-A0048
  ('Pago Florentino', 'pago-florentino', 'do_pago', 'Castilla-La Mancha'),  -- PDO-ES-A0057
  ('Ribera del Júcar', 'ribera-del-jucar', 'do', 'Castilla-La Mancha'),  -- PDO-ES-A0049
  ('Río Negro', 'rio-negro', 'do_pago', 'Castilla-La Mancha'),  -- PDO-ES-03003
  ('Rosalejo', 'rosalejo', 'do_pago', 'Castilla-La Mancha'),  -- PDO-ES-02880
  ('Uclés', 'ucles', 'do', 'Castilla-La Mancha'),  -- PDO-ES-A0050
  ('Valdepeñas', 'valdepenas', 'do', 'Castilla-La Mancha'),  -- PDO-ES-A0051
  ('Vallegarcía', 'vallegarcia', 'do_pago', 'Castilla-La Mancha'),  -- PDO-ES-02085
  ('Alella', 'alella', 'do', 'Cataluña'),  -- PDO-ES-A1423
  ('Cataluña', 'cataluna', 'do', 'Cataluña'),  -- PDO-ES-A1549 · nombre oficial: Cataluña / Catalunya
  ('Conca de Barberà', 'conca-de-barbera', 'do', 'Cataluña'),  -- PDO-ES-A1422
  ('Costers del Segre', 'costers-del-segre', 'do', 'Cataluña'),  -- PDO-ES-A1523
  ('Empordà', 'emporda', 'do', 'Cataluña'),  -- PDO-ES-A1548
  ('Montsant', 'montsant', 'do', 'Cataluña'),  -- PDO-ES-A1550
  ('Penedès', 'penedes', 'do', 'Cataluña'),  -- PDO-ES-A1551
  ('Pla de Bages', 'pla-de-bages', 'do', 'Cataluña'),  -- PDO-ES-A1557
  ('Priorat', 'priorat', 'doca', 'Cataluña'),  -- PDO-ES-A1560 · nombre oficial: Priorat / Priorato
  ('Tarragona', 'tarragona', 'do', 'Cataluña'),  -- PDO-ES-A1555
  ('Terra Alta', 'terra-alta', 'do', 'Cataluña'),  -- PDO-ES-A1556
  ('Ribera del Guadiana', 'ribera-del-guadiana', 'do', 'Extremadura'),  -- PDO-ES-A1295
  ('Monterrei', 'monterrei', 'do', 'Galicia'),  -- PDO-ES-A1114
  ('Rías Baixas', 'rias-baixas', 'do', 'Galicia'),  -- PDO-ES-A1119
  ('Ribeira Sacra', 'ribeira-sacra', 'do', 'Galicia'),  -- PDO-ES-A1128
  ('Ribeiro', 'ribeiro', 'do', 'Galicia'),  -- PDO-ES-A1123
  ('Valdeorras', 'valdeorras', 'do', 'Galicia'),  -- PDO-ES-A1132
  ('Vinos de Madrid', 'vinos-de-madrid', 'do', 'Comunidad de Madrid'),  -- PDO-ES-A1525
  ('Bullas', 'bullas', 'do', 'Región de Murcia'),  -- PDO-ES-A0536
  ('Yecla', 'yecla', 'do', 'Región de Murcia'),  -- PDO-ES-A0606
  ('Bolandin', 'bolandin', 'do_pago', 'Comunidad Foral de Navarra'),  -- PDO-ES-N1876
  ('Navarra', 'navarra', 'do', 'Comunidad Foral de Navarra'),  -- PDO-ES-A0127
  ('Pago de Arínzano', 'pago-de-arinzano', 'do_pago', 'Comunidad Foral de Navarra'),  -- PDO-ES-A0183
  ('Pago de Otazu', 'pago-de-otazu', 'do_pago', 'Comunidad Foral de Navarra'),  -- PDO-ES-A0184
  ('Prado de Irache', 'prado-de-irache', 'do_pago', 'Comunidad Foral de Navarra'),  -- PDO-ES-A0182
  ('Arabako Txakolina', 'arabako-txakolina', 'do', 'País Vasco'),  -- PDO-ES-A0732 · nombre oficial: Arabako Txakolina / Txakolí de Álava / Chacolí de Álava
  ('Bizkaiko Txakolina', 'bizkaiko-txakolina', 'do', 'País Vasco'),  -- PDO-ES-A0746 · nombre oficial: Bizkaiko Txakolina / Chacolí de Bizkaia / Txakolí de Bizkaia
  ('Getariako Txakolina', 'getariako-txakolina', 'do', 'País Vasco'),  -- PDO-ES-A0741 · nombre oficial: Getariako Txakolina / Chacolí de Getaria / Txakolí de Getaria
  ('Alicante', 'alicante', 'do', 'Comunitat Valenciana'),  -- PDO-ES-A1526
  ('Chozas Carrascal', 'chozas-carrascal', 'do_pago', 'Comunitat Valenciana'),  -- PDO-ES-N1637
  ('El Terrerazo', 'el-terrerazo', 'do_pago', 'Comunitat Valenciana'),  -- PDO-ES-A0940
  ('Los Balagueses', 'los-balagueses', 'do_pago', 'Comunitat Valenciana'),  -- PDO-ES-A0941
  ('Tharsys', 'tharsys', 'do_pago', 'Comunitat Valenciana'),  -- PDO-ES-02086
  ('Utiel-Requena', 'utiel-requena', 'do', 'Comunitat Valenciana'),  -- PDO-ES-A0874
  ('Valencia', 'valencia', 'do', 'Comunitat Valenciana'),  -- PDO-ES-A0872
  ('Vera de Estenas', 'vera-de-estenas', 'do_pago', 'Comunitat Valenciana')  -- PDO-ES-N1665
on conflict (slug) do nothing;

-- =====================================================================
-- Variedades de uva (principales en España)
-- =====================================================================
-- Fuente: Real Decreto 1338/2018 (potencial de producción vitícola), anexo XXI
-- «Clasificación de las variedades autorizadas de vid de vinificación», texto consolidado
-- del BOE (BOE-A-2018-14803, descargado el 2026-11-07). Nombre principal y sinónimos tal
-- y como figuran en el anexo (unión de todas las comunidades); color: B → blanca, T → tinta.
-- Única adición: «Xarel·lo», grafía habitual en etiquetas de Xarello.

insert into public.variedades_uva (nombre, slug, sinonimos, color) values
  ('Tempranillo', 'tempranillo', array['Cencibel', 'Tinta de Toro', 'Tinta del País', 'Tinto Fino', 'Ull de Llebre'], 'tinta'),
  ('Garnacha Tinta', 'garnacha-tinta', array['Gironet', 'Lladoner', 'Lledoner'], 'tinta'),
  ('Garnacha Tintorera', 'garnacha-tintorera', array['Negral'], 'tinta'),
  ('Garnacha Roja', 'garnacha-roja', array['Garnacha Gris'], 'tinta'),
  ('Garnacha Peluda', 'garnacha-peluda', array['Lledoner Pelut'], 'tinta'),
  ('Mazuela', 'mazuela', array['Cariñena', 'Mazuelo', 'Samsó'], 'tinta'),
  ('Graciano', 'graciano', array['Tinta Miúda'], 'tinta'),
  ('Monastrell', 'monastrell', array['Mataró', 'Mourvedre'], 'tinta'),
  ('Bobal', 'bobal', '{}', 'tinta'),
  ('Mencía', 'mencia', '{}', 'tinta'),
  ('Prieto Picudo', 'prieto-picudo', '{}', 'tinta'),
  ('Juan García', 'juan-garcia', array['Mouratón'], 'tinta'),
  ('Merenzao', 'merenzao', array['Bastardillo Chico', 'María Ordoña', 'Maturana Tinta', 'Negro Saurí', 'Tintilla', 'Verdejo Negro'], 'tinta'),
  ('Bruñal', 'brunal', array['Albarín Tinto', 'Baboso Negro', 'Baboso Tinto'], 'tinta'),
  ('Listán Negro', 'listan-negro', array['Almuñeco'], 'tinta'),
  ('Listán Prieto', 'listan-prieto', '{}', 'tinta'),
  ('Negramoll', 'negramoll', '{}', 'tinta'),
  ('Rufete', 'rufete', '{}', 'tinta'),
  ('Moristel', 'moristel', array['Concejón', 'Juan Ibáñez'], 'tinta'),
  ('Trepat', 'trepat', '{}', 'tinta'),
  ('Manto Negro', 'manto-negro', '{}', 'tinta'),
  ('Callet', 'callet', '{}', 'tinta'),
  ('Hondarrabi Beltza', 'hondarrabi-beltza', array['Ondarrabi Beltza'], 'tinta'),
  ('Tinto Velasco', 'tinto-velasco', array['Blasco', 'Frasco'], 'tinta'),
  ('Cabernet Sauvignon', 'cabernet-sauvignon', '{}', 'tinta'),
  ('Cabernet Franc', 'cabernet-franc', '{}', 'tinta'),
  ('Merlot', 'merlot', '{}', 'tinta'),
  ('Syrah', 'syrah', '{}', 'tinta'),
  ('Malbec', 'malbec', '{}', 'tinta'),
  ('Petit Verdot', 'petit-verdot', '{}', 'tinta'),
  ('Pinot Noir', 'pinot-noir', '{}', 'tinta'),
  ('Marselan', 'marselan', array['Marselán'], 'tinta'),
  ('Touriga Nacional', 'touriga-nacional', '{}', 'tinta'),
  ('Verdejo', 'verdejo', '{}', 'blanca'),
  ('Macabeo', 'macabeo', array['Viura'], 'blanca'),
  ('Albariño', 'albarino', '{}', 'blanca'),
  ('Godello', 'godello', '{}', 'blanca'),
  ('Treixadura', 'treixadura', '{}', 'blanca'),
  ('Airén', 'airen', '{}', 'blanca'),
  ('Palomino', 'palomino', '{}', 'blanca'),
  ('Palomino Fino', 'palomino-fino', array['Listán Blanco'], 'blanca'),
  ('Pedro Ximénez', 'pedro-ximenez', '{}', 'blanca'),
  ('Xarello', 'xarello', array['Cartoixa', 'Pansa Blanca', 'Pansal', 'Xarel·lo'], 'blanca'),
  ('Parellada', 'parellada', array['Montonec', 'Montonega'], 'blanca'),
  ('Garnacha Blanca', 'garnacha-blanca', array['Lladoner Blanco', 'Lledoner Blanc'], 'blanca'),
  ('Malvasía Aromática', 'malvasia-aromatica', array['Malvasía de Banyalbufar', 'Malvasía de Sitges'], 'blanca'),
  ('Moscatel de Alejandría', 'moscatel-de-alejandria', array['Moscatel de Málaga'], 'blanca'),
  ('Moscatel de Grano Menudo', 'moscatel-de-grano-menudo', array['Moscatel Morisco'], 'blanca'),
  ('Albillo Mayor', 'albillo-mayor', array['Turruntés'], 'blanca'),
  ('Albillo Real', 'albillo-real', '{}', 'blanca'),
  ('Doña Blanca', 'dona-blanca', array['Cigüente', 'Dona Branca', 'Malvasia Castellana', 'Malvasía Castellana'], 'blanca'),
  ('Tempranillo Blanco', 'tempranillo-blanco', '{}', 'blanca'),
  ('Hondarrabi Zuri', 'hondarrabi-zuri', array['Ondarrabi Zuri'], 'blanca'),
  ('Albarín Blanco', 'albarin-blanco', array['Branco Lexítimo'], 'blanca'),
  ('Alarije', 'alarije', array['Malvasía Riojana', 'Rojal', 'Subirat Parent'], 'blanca'),
  ('Moll', 'moll', array['Pensal Blanca', 'Prensal'], 'blanca'),
  ('Merseguera', 'merseguera', array['Exquitsagos', 'Sumoll Blanco', 'Verdosilla'], 'blanca'),
  ('Vijariego Blanco', 'vijariego-blanco', array['Bigiriego', 'Diego', 'Vigiriega', 'Vigiriego'], 'blanca'),
  ('Chardonnay', 'chardonnay', '{}', 'blanca'),
  ('Sauvignon Blanc', 'sauvignon-blanc', '{}', 'blanca'),
  ('Viognier', 'viognier', '{}', 'blanca'),
  ('Riesling', 'riesling', '{}', 'blanca'),
  ('Gewürztraminer', 'gewurztraminer', '{}', 'blanca')
on conflict (slug) do nothing;
