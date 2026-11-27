# wine-app — Roadmap y checklist

> Plan por fases derivado de [SCOPE.md](./SCOPE.md). Marca cada casilla al completarla.
> Cada fase termina en algo usable; no se empieza la siguiente sin cerrar los criterios de salida.

---

## Fase 0 — Fundaciones

Objetivo: proyecto listo para construir encima, sin funcionalidad de producto todavía.

- [x] Resolver las preguntas abiertas de SCOPE.md (§12)
- [x] Revisar `robots.txt` y términos de uso del C.R. D.O. Ribera del Duero y de Vinoselección
- [x] Hacer público el repositorio y comprobar que no hay secretos en el historial (público desde el 2026-11-26, #51: Actions gratis y sin límite de minutos; los emails personales siguen en el historial, no en el código)
- [x] Crear app Next.js (App Router, TypeScript) y desplegarla en Vercel
- [x] Configurar Supabase: extensiones `pg_trgm`, `unaccent`, `postgis`
- [x] Flujo de migraciones con Supabase CLI y tipos TypeScript generados
- [x] Migración inicial del esquema de catálogo (§6.1) con índices
- [x] Políticas RLS base: catálogo de solo lectura, escritura solo para admin
- [x] i18n con rutas `/es` y `/en`
- [x] Sistema de diseño base: tipografía, colores, claro/oscuro, componentes
- [x] PWA: manifest, iconos
- [x] CI en GitHub: lint, typecheck, tests en cada PR
- [x] Páginas legales (privacidad, cookies, aviso legal) y puerta +18

**Criterio de salida:** la app desplegada muestra una página con la puerta +18 en ambos idiomas y el esquema existe en Supabase.

## Fase 1 — MVP privado: catálogo, búsqueda y espacio personal (P0)

Objetivo: el grupo de invitados puede buscar vinos y bodegas reales y guardar favoritos y notas.

### Auth y usuarios
- [x] Registro email + contraseña con verificación, login, logout, recuperar contraseña
- [ ] SMTP propio configurado en Supabase Auth (aplazado: sin él, los emails usan las plantillas por defecto de Supabase)
- [x] Registro solo por invitación (tabla `invitaciones` + gestión en admin)
- [x] Perfil y ajustes: idioma, tema, preferencias de email
- [x] Preferencias de vino (tipos, uvas, D.O., rango de precio)
- [x] Tablas de usuario (§6.5) con RLS y tests de aislamiento entre usuarios

### Catálogo y búsqueda
- [x] Ficha de bodega: datos, contacto, imágenes, lista de sus vinos
- [x] Ficha de vino: datos, bodega, selector de añadas, otros vinos de la bodega
- [x] Buscador global con autocompletado, tolerante a tildes y erratas
- [x] Filtros: tipo, crianza, D.O., uva, añada, bodega · ordenación · paginación
- [x] Imágenes enlazadas con *placeholder* si fallan
- [x] Atribución de fuente y fecha de actualización en cada ficha

### Espacio personal
- [x] Favoritos de vinos y bodegas
- [x] Notas privadas en vinos, añadas y bodegas
- [x] Página `/yo` con favoritos y notas

### Datos
- [x] Infra de scrapers en GitHub Actions: estructura extraer → normalizar → emparejar → guardar
- [x] Utilidades comunes: rate limiting, robots.txt, User-Agent, reintentos, registro de ejecución
- [x] Scraper 1: Consejo Regulador D.O. Ribera del Duero (bodegas)
- [x] Scraper 2: Vinoselección (vinos, añadas, imagen)
- [x] Normalización y emparejamiento básico con tests
- [x] Consolidación entre fuentes: prioridad por campo, procedencia, supresiones, fusión en admin y resúmenes propios (es/en) con enlace
- [x] Scraper 3: C.R. DOCa Rioja (bodegas, vinos, experiencias)
- [x] Scraper 4: webs oficiales de bodegas (historia, vinos, enoturismo), con puerta legal por sitio
- [x] Scraper 5: Ruta del Vino Ribera del Duero (inactiva hasta tener permiso escrito)
- [x] Scraper 6: Vinopremier (EAN) — cron reactivado el 2026-11-12 tras el bloqueo de IP del 08-11 (10–14 s, tope 450)
- [x] Scrapers 7–12: consejos de Toro, Cigales, Bierzo, Priorat, Rueda y Navarra
- [x] Carga de semillas: D.O. y variedades de uva españolas
- [x] Comprobador de enlaces semanal con ocultación tras 2 fallos consecutivos

### Admin
- [x] Rol admin y protección de `/admin`
- [x] CRUD de bodegas, vinos, añadas, D.O., uvas
- [x] Vista de ejecuciones de scrapers (`/admin/ejecuciones`)
- [x] Vista de enlaces rotos con acciones (`/admin/enlaces`)

**Criterio de salida:** D.O. Ribera del Duero cubierta (~300 bodegas, ~2.000 vinos); los invitados usan la app en móvil sin errores graves.

> Estado (2026-11-12): 864 bodegas, 3.948 vinos / 4.453 añadas, 2.173 servicios de enoturismo y 3.589 imágenes enlazadas. Comparador: 2.033 ofertas de 199 tiendas (Vinoselección, Vinatis y tiendas online de bodegas) sobre 1.783 vinos. Fuentes: 7 consejos reguladores, Vinoselección, Vinopremier, Vinatis, Vinorea (en revisión: listados vacíos desde Actions) y webs oficiales (crawler genérico + adaptadores por bodega en curso). Ruta del Vino inactiva hasta tener permiso escrito.
>
> App privada para el usuario y amigos. Antes de una fase pública (no prevista): avisar a los consejos reguladores y a Vinoselección, permiso escrito de la Ruta del Vino (info@riberate.com) y activar la protección de contraseñas filtradas.

## Fase 2 — Precios, premios y enoturismo (P1)

- [x] Tablas de tiendas, ofertas e historial de precios (§6.2)
- [x] Bloque "Dónde comprar" en la ficha de vino (75 cl por defecto + selector de formato)
- [x] Gráfica de historial de precios y mínimo histórico
- [x] Más tiendas (objetivo: 3–5) y emparejamiento por EAN — Vinoselección, Vinopremier, Vinatis, Vinorea + ~200 tiendas de bodega; descartadas por bloqueo o términos: ver SOURCES
- [x] Cola de duplicados/emparejamiento en admin (`/admin/revision`)
- [ ] Premios y puntuaciones: tablas (§6.3), scraper de al menos una guía y un concurso
- [ ] Reseñas externas (extracto + enlace)
- [x] Servicios de enoturismo en la ficha de bodega
- [x] Scraper de webs de bodegas (enoturismo; fotos pendientes)
- [x] Geocodificación de bodegas (OpenStreetMap: Nominatim + Overpass, mensual; precisión marcada)
- [x] Mapa de bodegas (MapLibre + OSM) con clustering (`/mapa`)
- [ ] "Cerca de mí" y ubicación de referencia del usuario («cerca de mí» hecho en `/mapa`, en el navegador; falta la ubicación de referencia guardada)
- [ ] Filtros de precio, tienda, puntuación, premios y servicios (precio hecho: filtro y orden en el listado)
- [ ] Páginas de D.O. y de variedad de uva

**Criterio de salida:** cada vino con oferta muestra precios de varias tiendas e historial; las bodegas tienen ubicación en el mapa y sus servicios.

## Fase 3 — Espacio personal completo y comunidad (P1)

- [ ] Rating 1–5 y media comunitaria
- [ ] Listas personalizadas (crear, ordenar, renombrar, borrar)
- [ ] Compartir lista por enlace revocable (`/lista/[token]`)
- [ ] Diario de catas con foto (Supabase Storage, privada, comprimida)
- [x] Mi cava: inventario (`/yo/cava`): cantidad, formato, compra, tienda, ubicación, ventana de consumo, «Abrir una»; vinos del catálogo o fuera de él. Falta descontar al registrar una cata (llegará con el diario)
- [ ] Recomendaciones por reglas en `/yo`
- [ ] Sugerir corrección y proponer vino/bodega nuevo
- [ ] Moderación de sugerencias en admin; el usuario ve su estado
- [ ] RGPD: exportar mis datos y borrar mi cuenta

**Criterio de salida:** un usuario puede usar la app como su diario y cava de vinos de forma habitual.

### Feedback de uso (2026-11-16)

- [x] Botón Atrás en la cabecera (la PWA instalada no tiene barra del navegador)
- [x] La portada pedía «Iniciar sesión» aunque ya hubiera sesión (es el `start_url` de la PWA); la cabecera mostraba «Entrar» mientras leía la sesión
- [x] Lentitud: búsquedas con índices trigram (#41, #44), esqueletos al navegar a fichas, funciones en cdg1 junto a Supabase
- [ ] Lentitud restante: arranques en frío de Vercel (~1 s la primera visita) y de Supabase Free; medir en móvil con sesión
- [ ] Bodegas que no aparecen por su marca: el catálogo usa la razón social del consejo (p. ej. «Velvety Wines» = Dominio Lubiano, ya renombrada). Renombrar en `/admin` (desde #47 el nombre del admin ya no lo pisan los scrapers) y valorar nombres alternativos en el buscador
- [ ] Cobertura de D.O.: hoy 14 (Ribera, Rioja, Priorat, Rueda, Bierzo, Toro, Navarra, Cigales, Penedès, Jerez, Ribeiro, Cava, La Mancha, Jumilla); faltan Rías Baixas (403 a nuestro UA), Somontano, Valdepeñas y Utiel-Requena (sin directorio útil)…

## Fase 4 — Apertura pública

- [ ] Decidir el nombre y la marca de la app
- [ ] Quitar el registro por invitación (o abrir lista de espera)
- [ ] Catálogo navegable sin login
- [ ] SEO: metadatos, datos estructurados schema.org, sitemap, slugs estables
- [ ] Auditoría de rendimiento (Core Web Vitals) y accesibilidad (WCAG AA)
- [ ] Rate limiting en login, registro y sugerencias; protección anti-bots en registro
- [ ] Monitorización de errores y alertas de scrapers
- [ ] Revisión de límites del plan Free (BD, Storage, MAU) y decisión de upgrade
- [ ] Revisión legal final (privacidad, cookies, alcohol, uso de datos de terceros)

**Criterio de salida:** web pública estable, indexada y dentro de los límites de coste.

## Fase 5 — Futuro (P2, sin compromiso)

- [ ] Búsqueda en lenguaje natural y recomendaciones con IA (embeddings)
- [ ] Alertas de precio por email
- [ ] Traducción del contenido al inglés
- [ ] Enlaces de afiliado con tiendas
- [ ] Modo offline del espacio personal
- [ ] Escaneo de etiqueta con la cámara para encontrar un vino
- [ ] App nativa
