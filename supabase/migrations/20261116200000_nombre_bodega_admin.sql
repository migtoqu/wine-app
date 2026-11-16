-- El nombre de una bodega editado en /admin no quedaba protegido: el trigger
-- registrar_edicion_admin de bodegas no vigilaba `nombre` (el de vinos sí),
-- así que el siguiente scraper volvía a escribir el de la fuente. Pasaba al
-- poner la marca comercial en vez de la razón social (p. ej. «Velvety Wines»
-- → «Dominio Lubiano»). Mismo trigger, con `nombre` en la lista.

drop trigger registrar_edicion_admin on public.bodegas;

create trigger registrar_edicion_admin
  after insert or update on public.bodegas
  for each row execute function public.registrar_edicion_admin(
    'bodega', 'nombre', 'descripcion', 'historia', 'direccion', 'codigo_postal', 'municipio',
    'provincia', 'comunidad', 'ubicacion', 'web', 'telefono', 'email', 'redes',
    'anio_fundacion', 'hectareas', 'estado', 'enoturismo_web', 'enoturismo_email',
    'enoturismo_telefono', 'nif', 'registro_embotellador');
