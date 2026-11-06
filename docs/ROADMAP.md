# wine-app — Roadmap y checklist

> Plan por fases derivado de [SCOPE.md](./SCOPE.md). Marca cada casilla al completarla.
> Cada fase termina en algo usable; no se empieza la siguiente sin cerrar los criterios de salida.

---

## Fase 0 — Fundaciones

Objetivo: proyecto listo para construir encima, sin funcionalidad de producto todavía.

- [x] Resolver las preguntas abiertas de SCOPE.md (§12)
- [ ] Revisar `robots.txt` y términos de uso del C.R. D.O. Ribera del Duero y de Vinoselección
- [ ] Hacer público el repositorio y comprobar que no hay secretos en el historial
- [x] Crear app Next.js (App Router, TypeScript) y desplegarla en Vercel
- [ ] Configurar Supabase: extensiones `pg_trgm`, `unaccent`, `postgis`
- [ ] Flujo de migraciones con Supabase CLI y tipos TypeScript generados
- [ ] Migración inicial del esquema de catálogo (§6.1) con índices
- [ ] Políticas RLS base: catálogo de solo lectura, escritura solo para admin
- [ ] i18n con rutas `/es` y `/en`
- [ ] Sistema de diseño base: tipografía, colores, claro/oscuro, componentes
- [ ] PWA: manifest, iconos
- [ ] CI en GitHub: lint, typecheck, tests en cada PR
- [ ] Páginas legales (privacidad, cookies, aviso legal) y puerta +18

**Criterio de salida:** la app desplegada muestra una página con la puerta +18 en ambos idiomas y el esquema existe en Supabase.

## Fase 1 — MVP privado: catálogo, búsqueda y espacio personal (P0)

Objetivo: el grupo de invitados puede buscar vinos y bodegas reales y guardar favoritos y notas.

### Auth y usuarios
- [ ] Registro email + contraseña con verificación, login, logout, recuperar contraseña
- [ ] SMTP propio configurado en Supabase Auth
- [ ] Registro solo por invitación (tabla `invitaciones` + gestión en admin)
- [ ] Perfil y ajustes: idioma, tema, preferencias de email
- [ ] Preferencias de vino (tipos, uvas, D.O., rango de precio)
- [ ] Tablas de usuario (§6.5) con RLS y tests de aislamiento entre usuarios

### Catálogo y búsqueda
- [ ] Ficha de bodega: datos, contacto, imágenes, lista de sus vinos
- [ ] Ficha de vino: datos, bodega, selector de añadas, otros vinos de la bodega
- [ ] Buscador global con autocompletado, tolerante a tildes y erratas
- [ ] Filtros: tipo, crianza, D.O., uva, añada, bodega · ordenación · paginación
- [ ] Imágenes enlazadas con *placeholder* si fallan
- [ ] Atribución de fuente y fecha de actualización en cada ficha

### Espacio personal
- [ ] Favoritos de vinos y bodegas
- [ ] Notas privadas en vinos, añadas y bodegas
- [ ] Página `/yo` con favoritos y notas

### Datos
- [ ] Infra de scrapers en GitHub Actions: estructura extraer → normalizar → emparejar → guardar
- [ ] Utilidades comunes: rate limiting, robots.txt, User-Agent, reintentos, registro de ejecución
- [ ] Scraper 1: Consejo Regulador D.O. Ribera del Duero (bodegas)
- [ ] Scraper 2: Vinoselección (vinos, añadas, imagen)
- [ ] Normalización y emparejamiento básico con tests
- [ ] Carga de semillas: D.O. y variedades de uva españolas
- [ ] Comprobador de enlaces semanal con ocultación tras 2 fallos consecutivos

### Admin
- [ ] Rol admin y protección de `/admin`
- [ ] CRUD de bodegas, vinos, añadas, D.O., uvas
- [ ] Vista de ejecuciones de scrapers
- [ ] Vista de enlaces rotos con acciones

**Criterio de salida:** D.O. Ribera del Duero cubierta (~300 bodegas, ~2.000 vinos); los invitados usan la app en móvil sin errores graves.

## Fase 2 — Precios, premios y enoturismo (P1)

- [ ] Tablas de tiendas, ofertas e historial de precios (§6.2)
- [ ] Bloque "Dónde comprar" en la ficha de vino (75 cl por defecto + selector de formato)
- [ ] Gráfica de historial de precios y mínimo histórico
- [ ] Más tiendas (objetivo: 3–5) y emparejamiento por EAN
- [ ] Cola de duplicados/emparejamiento en admin
- [ ] Premios y puntuaciones: tablas (§6.3), scraper de al menos una guía y un concurso
- [ ] Reseñas externas (extracto + enlace)
- [ ] Servicios de enoturismo en la ficha de bodega
- [ ] Scraper/carga semiautomática de webs de bodegas (enoturismo, fotos)
- [ ] Geocodificación de bodegas
- [ ] Mapa de bodegas (MapLibre + OSM) con clustering
- [ ] "Cerca de mí" y ubicación de referencia del usuario
- [ ] Filtros de precio, tienda, puntuación, premios y servicios
- [ ] Páginas de D.O. y de variedad de uva

**Criterio de salida:** cada vino con oferta muestra precios de varias tiendas e historial; las bodegas tienen ubicación en el mapa y sus servicios.

## Fase 3 — Espacio personal completo y comunidad (P1)

- [ ] Rating 1–5 y media comunitaria
- [ ] Listas personalizadas (crear, ordenar, renombrar, borrar)
- [ ] Compartir lista por enlace revocable (`/lista/[token]`)
- [ ] Diario de catas con foto (Supabase Storage, privada, comprimida)
- [ ] Mi cava: inventario, ventana de consumo, descontar botella al catar
- [ ] Recomendaciones por reglas en `/yo`
- [ ] Sugerir corrección y proponer vino/bodega nuevo
- [ ] Moderación de sugerencias en admin; el usuario ve su estado
- [ ] RGPD: exportar mis datos y borrar mi cuenta

**Criterio de salida:** un usuario puede usar la app como su diario y cava de vinos de forma habitual.

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
