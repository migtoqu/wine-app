# wine-app — Definición de producto (scope)

> Estado: borrador v1 · Fecha: 2026-11-06
> Documento vivo. Las decisiones tomadas están marcadas como **Decidido**; las respuestas a las preguntas abiertas iniciales están en [§12](#12-decisiones-cerradas-antes-preguntas-abiertas).
> El plan de ejecución por fases está en [ROADMAP.md](./ROADMAP.md).

---

## 1. Visión

Una aplicación web para **descubrir vinos y bodegas españolas**: buscarlos, saber **dónde se venden y a qué precio**, **dónde están las bodegas y qué experiencias ofrecen** (catas, visitas, actividades), y consultar su **información, premios y reseñas**. Cada usuario tiene su espacio personal para guardar favoritos, notas, listas, su diario de catas y su cava.

La relación **bodega ⇄ vino ⇄ añada** es el eje del producto: desde cualquier vino se llega a su bodega y desde cualquier bodega a todos sus vinos, tanto en la interfaz como en la base de datos.

### Propuesta de valor

- **Un único sitio** que reúne lo que hoy está repartido entre tiendas, webs de bodegas, consejos reguladores y guías.
- **Datos actualizados de forma automática** mediante scraping semanal y comprobación de enlaces.
- **Herramienta personal**: favoritos, notas privadas, diario de catas y cava en casa.

## 2. Audiencia y alcance

| Aspecto | Decisión |
| --- | --- |
| Audiencia | **Decidido:** empieza **privada** (grupo cerrado por invitación) y después se abre al **público**. El diseño debe soportar la apertura sin rehacer nada (SEO, rendimiento, moderación). |
| Geografía | **Decidido:** **solo España**. D.O. españolas, tiendas que venden en España, precios en €. |
| Idioma | **Decidido:** interfaz en **español e inglés** (i18n desde el inicio). El contenido scrapeado se muestra en su idioma original (normalmente español); no se traduce por ahora. |
| Plataforma | **Decidido:** **web responsive instalable como PWA** (pensada para móvil). No hay app nativa en el alcance actual. |
| Monetización | **Abierta.** No condiciona el diseño, pero el modelo de datos deja hueco para enlaces de afiliado sin migraciones dolorosas. |

### Fuera de alcance (por ahora)

- Reservas o pagos dentro de la app (el enoturismo es informativo + enlace a la bodega).
- Venta de vino propia o carrito de compra.
- Vinos o bodegas de fuera de España.
- App nativa iOS/Android.
- Reseñas públicas escritas por usuarios (solo rating numérico público).
- Alertas de precio (solo historial en v1).
- Perfiles públicos, seguidores y feed social.

## 3. Stack e infraestructura

| Pieza | Elección | Notas |
| --- | --- | --- |
| Frontend + API | **Next.js** en **Vercel** (Hobby) | SSR/ISR para fichas (SEO en la fase pública). PWA. |
| Base de datos | **Supabase Postgres** (Free, `eu-west-3`) | Extensiones: `pg_trgm`, `unaccent`, `postgis`. |
| Auth | **Supabase Auth** | Email + contraseña. |
| Storage | **Supabase Storage** | Solo para fotos subidas por usuarios (diario de catas). Las imágenes de catálogo **no** se guardan: se enlazan. |
| Scraping y tareas programadas | **GitHub Actions** (cron) | Workers que escriben en Supabase con la *service role key* (secreto en GitHub). Sin el límite de 10 s de Vercel. |
| Mapa | **MapLibre + OpenStreetMap** | Geocoding con Nominatim (respetando su política de uso) o geocodificación offline en el scraper. |
| Email | SMTP propio en Supabase Auth (p. ej. Resend) | El SMTP por defecto de Supabase tiene un límite de envíos muy bajo. |

### Límites del plan gratuito a vigilar

- Supabase Free: **500 MB de base de datos**, 1 GB de storage, y **el proyecto se pausa tras 7 días sin actividad** (el cron semanal de GitHub Actions ayuda a mantenerlo activo).
- Vercel Hobby: uso no comercial; duración de funciones limitada; cron limitados (por eso el scraping va en GitHub Actions).
- GitHub Actions: el repositorio es **público**, así que los minutos son ilimitados; a cambio, ningún secreto puede estar en el código.
- El historial de precios es lo que más crecerá: se guarda **indefinidamente**, pero solo una fila por **cambio de precio** (no una por scraping).

## 4. Roles de usuario

| Rol | Qué puede hacer |
| --- | --- |
| **Visitante** (sin login) | Durante la fase privada: solo landing y login. En la fase pública: buscar y ver fichas. |
| **Usuario registrado** | Todo lo anterior + favoritos, notas, rating, listas, diario de catas, cava, preferencias, sugerir correcciones. |
| **Admin** | Editar cualquier dato, moderar sugerencias, revisar duplicados y enlaces rotos, ver estado de los scrapers, gestionar invitaciones y usuarios. |

## 5. Funcionalidades

Prioridades: **P0** = MVP (fase privada), **P1** = necesario antes de abrir al público, **P2** = posterior.

### 5.1 Cuenta y autenticación

- [P0] Registro con **email + contraseña**, verificación por email.
- [P0] Login, logout, recuperación de contraseña.
- [P0] **Registro solo por invitación** durante la fase privada (lista de emails permitidos o códigos de invitación).
- [P0] **Verificación de mayoría de edad (+18)**: puerta "¿eres mayor de 18?" al entrar en la web y casilla obligatoria al registrarse (sin pedir fecha de nacimiento).
- [P0] Sesiones concurrentes: muchos usuarios a la vez, cada uno solo ve sus datos privados (Row Level Security).
- [P1] RGPD: **exportar mis datos** (JSON) y **borrar mi cuenta** (con borrado en cascada de todos sus datos).
- [P1] Banner de cookies (si solo se usan cookies técnicas, basta con un aviso informativo).

### 5.2 Preferencias de usuario

- [P0] **Ajustes de la app**: idioma (es/en), tema claro/oscuro/sistema, preferencias de email.
- [P0] **Gustos de vino**: tipos, variedades de uva, D.O. y rango de precio preferidos. Se usan como filtros por defecto (desactivables) y para recomendaciones.
- [P1] **Ubicación de referencia**: ciudad/provincia o "usar mi ubicación" para "bodegas cerca de mí".

### 5.3 Búsqueda y descubrimiento

- [P0] **Buscador global** único (vinos y bodegas a la vez) con resultados agrupados, tolerante a tildes y erratas (`unaccent` + `pg_trgm`) y autocompletado.
- [P0] **Filtros de vinos**: tipo (tinto, blanco, rosado, espumoso, generoso, dulce, naranja), crianza (joven, roble, crianza, reserva, gran reserva…), D.O., variedad de uva, añada, bodega.
- [P1] **Filtros de precio y tienda**: rango de precio, tienda, solo disponibles.
- [P1] **Filtros de calidad**: puntuación en guías, con premios/medallas, rating de la comunidad.
- [P1] **Filtros de bodegas**: D.O., provincia/comunidad, servicios de enoturismo (catas, visitas, restaurante, alojamiento, eventos…), distancia.
- [P0] Ordenación: relevancia, precio, puntuación, nombre, novedad.
- [P1] **Vista de mapa** de bodegas con clustering, sincronizada con los filtros.
- [P1] "**Cerca de mí**": bodegas en un radio a partir de la ubicación del usuario (PostGIS).
- [P1] Páginas de exploración: por D.O., por variedad de uva, por comunidad autónoma.
- [P2] Búsqueda en lenguaje natural con IA ("un tinto para cordero por menos de 20 €").

### 5.4 Ficha de vino

- [P0] Nombre, bodega (enlace), tipo, crianza, D.O., variedades (con % si se conoce), descripción, imagen de la botella.
- [P0] **Añadas**: selector de añada; cada añada tiene sus propios datos (grado, crianza en meses, notas de cata oficiales, maridaje, temperatura de servicio, producción).
- [P0] **Otros vinos de la misma bodega**.
- [P1] **Dónde comprar**: tabla de ofertas por tienda (precio, formato, disponibilidad, fecha de última comprobación, enlace). Ordenada por precio, en **75 cl por defecto**, con selector para otros formatos.
- [P1] **Historial de precios**: gráfica por tienda y precio mínimo histórico.
- [P1] **Premios y puntuaciones** por añada (guía/concurso, año, medalla o puntos, enlace a la fuente).
- [P1] **Reseñas externas**: fuente, autor, puntuación, extracto breve y enlace (sin copiar el texto completo).
- [P1] **Rating comunitario** (media y número de valoraciones).
- [P0] Acciones del usuario: ★ favorito, nota privada, añadir a lista; [P1] valorar, registrar cata, añadir a mi cava.
- [P1] Botón "**sugerir corrección**".
- [P0] Atribución de fuentes y fecha de última actualización.

### 5.5 Ficha de bodega

- [P0] Nombre, descripción, D.O., dirección, provincia/comunidad, contacto (web, teléfono, email, redes sociales), año de fundación, hectáreas de viñedo, imágenes.
- [P0] **Todos sus vinos** (con filtros de tipo/crianza).
- [P1] **Mapa** con su ubicación y enlace a "cómo llegar".
- [P1] **Enoturismo / servicios**: cada servicio con tipo (cata, visita, restaurante, alojamiento, evento, tienda, otra actividad), descripción, precio orientativo, duración, idiomas, horario/temporada y **enlace para reservar en la web de la bodega**.
- [P1] Premios destacados de sus vinos.
- [P0] Acciones del usuario: ★ favorito, nota privada, añadir a lista.

### 5.6 Espacio personal del usuario

- [P0] **Favoritos** de vinos y bodegas (con filtros y orden).
- [P0] **Notas privadas** en cualquier vino, añada o bodega (texto libre, editable, con fecha).
- [P1] **Rating** de 1 a 5 por vino (alimenta la media pública; la identidad del que vota no es visible).
- [P1] **Listas personalizadas** ("Para regalar", "Probar en Navidad"…): crear, renombrar, ordenar, borrar.
- [P1] **Compartir lista por enlace** (solo lectura, enlace revocable).
- [P1] **Diario de catas**: vino/añada, fecha, lugar, compañía, valoración, notas (vista, nariz, boca), foto propia, maridaje.
- [P1] **Mi cava**: botellas que tengo en casa (añada, cantidad, formato, precio y fecha de compra, ubicación física, ventana de consumo "beber entre/hasta"). Al registrar una cata se puede descontar una botella.
- [P1] **Recomendaciones por reglas**: "porque te gustan X" según favoritos, preferencias, diario y ratings (similitud por uva, D.O., tipo, crianza y precio).
- [P2] Recomendaciones con IA (embeddings).
- [P2] Alertas de precio por email.

### 5.7 Contribución de usuarios

- [P1] **Sugerir corrección** en cualquier ficha (campo, valor propuesto, comentario).
- [P1] **Proponer un vino o bodega nuevo**.
- [P1] El usuario ve el estado de sus sugerencias (pendiente, aceptada, rechazada).

### 5.8 Panel de administración

- [P0] CRUD de vinos, añadas, bodegas, servicios, tiendas, D.O., uvas.
- [P0] **Estado de los scrapers**: últimas ejecuciones, duración, registros nuevos/actualizados/errores por fuente.
- [P0] **Enlaces rotos**: listado de URLs ocultas tras fallos repetidos, con acciones (corregir URL, reactivar, eliminar).
- [P1] **Cola de duplicados / emparejamiento**: productos scrapeados que no se han podido asociar con seguridad a un vino existente → fusionar, crear nuevo o descartar.
- [P1] **Moderación de sugerencias** de usuarios.
- [P0] Gestión de invitaciones y usuarios (asignar rol admin).

## 6. Modelo de datos

Entidades principales (nombres orientativos; las tablas finales se definirán en la migración inicial).

### 6.1 Catálogo

```
denominaciones        (D.O.: nombre, tipo [DOCa, DO, DO Pago, VC, IGP/VT], comunidad, web)
variedades_uva        (nombre, sinónimos, color)
bodegas               (nombre, slug, descripción, dirección, municipio, provincia, comunidad,
                       ubicación geográfica [PostGIS point], web, teléfono, email, redes,
                       año_fundación, hectáreas, estado)
bodega_denominaciones (bodega ⇄ D.O., N:M: una bodega puede elaborar en varias D.O.)
servicios_bodega      (bodega, tipo, título, descripción, precio_desde, duración, idiomas,
                       horario/temporada, url_reserva)
vinos                 (bodega [FK obligatoria], nombre, slug, tipo, crianza, D.O., descripción)
añadas                (vino [FK], año [nulo = sin añada], grado, meses_crianza, notas_cata,
                       maridaje, temp_servicio, producción_botellas)
añada_variedades      (añada ⇄ uva con porcentaje; la composición puede variar por año)
```

La relación bodega → vino → añada es jerárquica y con claves foráneas obligatorias, así se navega en ambos sentidos con un solo *join* y se puede indexar.

### 6.2 Precios y comercio

```
tiendas         (nombre, web, tipo [online, supermercado, especializada], logo_url,
                 info_envío, campos de afiliación nullable)
ofertas         (añada [o vino si la tienda no indica añada], tienda, url, precio,
                 formato_ml, disponible, ean, visto_por_última_vez, estado_enlace)
historial_precios (oferta, precio, desde, hasta)   ← solo cuando el precio cambia
```

### 6.3 Reconocimientos

```
certámenes      (nombre [Guía Peñín, Decanter WWA, Bacchus…], tipo [guía, concurso], escala)
premios         (añada, certamen, edición/año, medalla o puntos, url_fuente)
reseñas_externas (vino o añada, fuente, autor, puntuación, escala, extracto corto, url, fecha)
```

### 6.4 Medios y fuentes

```
imágenes        (entidad [vino/añada/bodega/servicio], url externa, fuente, atribución,
                 tipo [botella, etiqueta, bodega, viñedo], principal, estado_enlace)
fuentes         (nombre, tipo [tienda, bodega, consejo regulador, guía], url_base,
                 frecuencia, activa, notas_robots)
ejecuciones_scraper (fuente, inicio, fin, estado, nuevos, actualizados, errores, log)
registros_fuente (fuente, id_externo, url, datos crudos jsonb, entidad asociada,
                  confianza_emparejamiento, visto_por_última_vez)
comprobaciones_enlace (url, entidad, último_estado_http, última_comprobación,
                       fallos_consecutivos, oculto)
```

`registros_fuente` guarda lo que se ha leído de cada fuente separado del catálogo "limpio", para poder reprocesar, auditar y deduplicar sin perder datos.

### 6.5 Datos de usuario (todos protegidos con RLS: cada usuario solo ve los suyos)

```
perfiles        (usuario, nombre, mayor_de_edad_confirmado, idioma, tema,
                 ubicación_referencia, prefs_email, rol)
preferencias_vino (usuario, tipos[], uvas[], denominaciones[], precio_min, precio_max)
favoritos       (usuario, entidad [vino/bodega], creado)
notas           (usuario, entidad [vino/añada/bodega], texto, creado, editado)
valoraciones    (usuario, vino, puntuación 1–5)          ← la media es pública
listas          (usuario, nombre, descripción, token_compartir nullable, orden)
lista_elementos (lista, entidad [vino/añada/bodega], orden, comentario)
catas           (usuario, añada, fecha, lugar, compañía, valoración, vista, nariz, boca,
                 maridaje, foto [Storage])
cava            (usuario, añada, cantidad, formato, precio_compra, fecha_compra,
                 ubicación_física, beber_desde, beber_hasta)
sugerencias     (usuario, entidad, campo, valor_propuesto, comentario, estado, revisado_por)
invitaciones    (email o código, creada_por, usada_por, caduca)
```

## 7. Sistema de scraping

### 7.1 Fuentes

**Decidido para el MVP:** Consejo Regulador **D.O. Ribera del Duero** + tienda **Vinoselección** (sujeto a revisar su `robots.txt` y términos). El resto de la tabla son candidatos para fases posteriores.

| Tipo | Qué aporta | Ejemplos candidatos |
| --- | --- | --- |
| Consejos Reguladores D.O. | Listado oficial de bodegas por D.O., datos de contacto | Rioja, Ribera del Duero, Rías Baixas, Priorat, Jerez… |
| Webs de bodegas | Fichas de vino, enoturismo, fotos, descripciones | Web oficial de cada bodega |
| Tiendas online | Precio, disponibilidad, formato, EAN, imagen | Vinoselección, Bodeboca, Lavinia, Decántalo, El Corte Inglés, supermercados |
| Guías y premios | Puntuaciones, medallas, reseñas | Guía Peñín, Decanter, Concurso Bacchus, Premios Zarcillo |

### 7.2 Funcionamiento

- **Frecuencia (Decidido):** todo **semanal**, incluido el comprobador de enlaces. Cada fuente se programa en una franja distinta para repartir la carga.
- **Ejecución:** un *workflow* de GitHub Actions por fuente (o una matriz), con *timeout* y reintentos. Se puede lanzar a mano (`workflow_dispatch`) desde GitHub o desde el panel de admin.
- **Arquitectura por fuente:** `extraer` (HTML/JSON, con navegador headless solo si hace falta) → `normalizar` (nombres, tipos, crianzas, formatos, precios) → `emparejar` con entidades existentes → `guardar` (*upsert*) + historial de precios + registro de ejecución.
- **Emparejamiento y deduplicación** (el reto principal): normalizar nombres (bodega + vino + añada + formato), usar EAN cuando exista, similitud por trigramas y umbral de confianza. Por debajo del umbral, el registro va a la cola de revisión del admin en lugar de crear un duplicado.
- **Prioridad de fuentes** para campos en conflicto: dato editado por admin > web oficial de la bodega > consejo regulador > tienda.
- **Idempotencia:** volver a ejecutar un scraper no duplica nada.
- **Observabilidad:** cada ejecución deja registro en `ejecuciones_scraper`; si una fuente falla dos semanas seguidas o devuelve un volumen anómalo (p. ej. −50 %), se avisa al admin.

### 7.3 Scraping ético y legal (**Decidido**)

- Respetar `robots.txt` y términos de uso; no scrapear zonas con login.
- *Rate limiting* por dominio (p. ej. 1 petición cada pocos segundos) y *User-Agent* identificable con contacto.
- Preferir APIs, feeds o sitemaps oficiales cuando existan.
- Guardar solo datos factuales y **extractos breves** de reseñas con enlace a la fuente; citar siempre la fuente en la ficha.
- Las imágenes se **enlazan** desde su origen (no se copian), con atribución.

## 8. Comprobación de enlaces

- **Semanal**, en GitHub Actions. Cubre URLs de ofertas, webs de bodegas, URLs de reserva, imágenes, fuentes de premios y reseñas.
- Petición `HEAD` (con `GET` de respaldo), siguiendo redirecciones; una redirección permanente actualiza la URL guardada.
- Se registra estado HTTP, fecha y **fallos consecutivos**.
- **Decidido:** tras **2 fallos consecutivos** (≈ 2 semanas) el enlace u oferta se **oculta** de la interfaz y aparece en el **panel de admin** para revisión. Si vuelve a responder, se reactiva solo.
- Las imágenes rotas muestran un *placeholder* en el frontend en cuanto fallan en el navegador, sin esperar al checker.

## 9. Imágenes

- **Decidido:** se guarda solo la **URL original** y se enlaza; el checker comprueba que sigue viva.
- Se mostrará siempre que haya imagen disponible (botella para vinos, bodega/viñedo para bodegas); si no hay, *placeholder* ilustrado por tipo de vino.
- Riesgo: hotlinking bloqueado o imágenes que cambian. **Decidido:** no se guardan copias; si una imagen no carga se muestra el *placeholder*.
- Las **fotos subidas por usuarios** (diario de catas) sí van a Supabase Storage, privadas, con compresión en cliente y límite de tamaño.

## 10. Requisitos no funcionales

| Área | Requisito |
| --- | --- |
| Concurrencia | Varios usuarios simultáneos. Datos de catálogo de solo lectura para usuarios; escrituras de usuario aisladas por RLS. |
| Seguridad | RLS en todas las tablas; la *service role key* solo en GitHub Secrets y servidor, nunca en el cliente ni en el repo (es público). Validación de entrada en servidor. Rate limiting en login y sugerencias. |
| Rendimiento | Fichas con ISR/caché; búsqueda < 300 ms en p95 con índices de texto y trigramas; paginación en todos los listados. |
| Accesibilidad | WCAG 2.1 AA: contraste, navegación por teclado, textos alternativos. |
| Responsive / PWA | Diseño *mobile-first*, instalable, con iconos y *manifest*; funciona sin conexión al menos para el espacio personal ya cargado (P2). |
| i18n | Rutas `/es` y `/en`, textos de interfaz traducidos, formatos de fecha/moneda por idioma. |
| SEO (fase pública) | URLs limpias con slug, metadatos, datos estructurados (schema.org `Product`, `Winery`/`LocalBusiness`), sitemap. |
| Privacidad / RGPD | Política de privacidad, aviso legal, cookies, exportación y borrado de cuenta, datos alojados en la UE. |
| Legal alcohol | Puerta +18 y mensaje de consumo responsable. |
| Calidad | Tests de normalización y emparejamiento de scrapers; tests E2E de los flujos de usuario principales; CI en cada PR. |
| Observabilidad | Registro de ejecuciones de scrapers y checker; errores del frontend monitorizados (p. ej. Vercel o Sentry). |

## 11. Pantallas (mapa del sitio)

```
/                         Landing (privada: login/invitación · pública: buscador + destacados)
/buscar                   Resultados con filtros (vinos | bodegas | mapa)
/vino/[slug]              Ficha de vino (selector de añada)
/bodega/[slug]            Ficha de bodega (vinos, enoturismo, mapa)
/do/[slug]                Página de D.O.
/uva/[slug]               Página de variedad
/mapa                     Mapa de bodegas
/lista/[token]            Lista compartida (pública, solo lectura)
/yo                       Mi espacio: favoritos, notas, listas, diario, cava, recomendaciones
/yo/ajustes               Cuenta, preferencias, idioma, privacidad (exportar/borrar)
/login, /registro, /recuperar
/admin                    Panel: contenido, scrapers, enlaces rotos, duplicados, sugerencias, usuarios
/legal/*                  Privacidad, cookies, aviso legal
```

## 12. Decisiones cerradas (antes preguntas abiertas)

| # | Tema | Decisión |
| --- | --- | --- |
| 1 | Fuentes del MVP | **Consejo Regulador D.O. Ribera del Duero** (base de bodegas) + **Vinoselección** (vinos, añadas, precios, imágenes). Webs de bodegas, carga manual/semiautomática. Antes de programar se revisan `robots.txt` y términos de uso de ambas; si alguna no lo permite, se sustituye por otra equivalente. |
| 2 | Volumen MVP | **~300 bodegas / ~2.000 vinos** (la D.O. Ribera del Duero bien cubierta). Cabe holgadamente en el plan Free. |
| 3 | Contenido en inglés | **Solo la interfaz** es bilingüe. Las descripciones se muestran en su idioma original (normalmente español). Traducción del contenido → Fase 5. |
| 4 | Enlaces rotos | Se ocultan tras **2 fallos consecutivos** (≈ 2 semanas con chequeo semanal). |
| 5 | Historial de precios | **Indefinido**, guardando una fila **solo cuando el precio cambia**. |
| 6 | Repositorio | **Público** (minutos de GitHub Actions ilimitados). Implica: ningún secreto en el código; claves solo en GitHub Secrets / Vercel; los workflows que usan secretos no se ejecutan en PRs de forks. |
| 7 | Mayoría de edad | **Puerta "¿eres mayor de 18?"** al entrar + **casilla obligatoria** en el registro. No se pide fecha de nacimiento. |
| 8 | Nombre | Sin decidir. Nombre de trabajo **wine-app**; se decide antes de la Fase 4 (apertura pública). |
| 9 | Imágenes | **Solo enlaces**, sin plan B de copia. Si una imagen falla → *placeholder*. |
| 10 | Formatos | **75 cl por defecto** en precios y ordenación; otros formatos (magnum, 37,5 cl…) visibles con un selector en la ficha. |

### Preguntas abiertas

_Ninguna por ahora._ Las nuevas dudas que surjan se añaden aquí.
