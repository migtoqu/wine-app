# wine-app

Aplicación web (en desarrollo) para descubrir vinos y bodegas españolas: dónde comprarlos, a qué precio, enoturismo, premios y un espacio personal con favoritos, notas, diario de catas y cava.

## Documentación

- [Definición de producto (scope)](docs/SCOPE.md)
- [Roadmap y checklist por fases](docs/ROADMAP.md)

## Infraestructura

| Servicio | Uso | Plan |
| --- | --- | --- |
| [Supabase](https://supabase.com/dashboard/project/mvatmmdifnmqnxikgatp) | Base de datos (Postgres), auth y storage | Free |
| [Vercel](https://vercel.com) — proyecto `wine-app` | Despliegue | Hobby |

- Supabase: proyecto `mvatmmdifnmqnxikgatp` en `eu-west-3` (París), organización Mito Tech.
- Las variables de entorno viven en Vercel. Para tenerlas en local:

```bash
vercel env pull .env.local
```

Ver `.env.example` para la lista de variables.

## Desarrollo

Next.js 16 (App Router, TypeScript, Tailwind CSS 4) con `@supabase/ssr`.

```bash
npm install
vercel env pull .env.local
npm run dev
```

- `src/lib/supabase/client.ts`: cliente para Client Components.
- `src/lib/supabase/server.ts`: cliente para Server Components, Server Actions y Route Handlers.
- `src/proxy.ts`: redirige las rutas sin idioma a `/es` o `/en` y, en el resto, refresca la sesión de Supabase.

## Interfaz: idiomas, diseño y componentes

### Idiomas (i18n)

Todas las páginas cuelgan de `src/app/[lang]/` (`/es` por defecto, `/en`). Sin librerías: solución nativa de Next 16 con `next/root-params`.

- Rutas internas: construye siempre el href con `localePath(lang, "/ruta")` de `@/i18n/config` (`localePath("en", "/legal/cookies")` → `/en/legal/cookies`). Los slugs son los mismos en ambos idiomas.
- En Server Components: `const lang = await getLocale()` y `const dict = await getDictionary()` de `@/i18n/server` (sin pasar `lang` por props).
- En Client Components: no pueden leer el diccionario; recibe por props solo el trozo que uses (`labels={dict.theme}`).
- Fechas, precios y números: `formatDate`, `formatPrice`, `formatNumber` de `@/i18n/format` (zona horaria fija `Europe/Madrid`, sin desajustes de hidratación).

Para añadir textos:

1. Añade la clave en `src/i18n/dictionaries/es.ts` (es la referencia; para variables usa funciones, `` hola: (n: string) => `Hola, ${n}` ``).
2. Añade la misma clave en `en.ts`. Si falta o sobra alguna, `npm run typecheck` falla.
3. Úsala con `dict.seccion.clave`.

Los textos legales largos viven en `src/content/legal/` (con `TODO` en los datos del titular).

### Diseño

- Tokens en `src/app/globals.css`: usa los nombres semánticos (`bg-bg`, `bg-surface`, `text-fg`, `text-muted`, `border-border`, `bg-primary`, `text-primary-fg`…) y no colores de paleta (`zinc-500`), así el modo oscuro funciona solo. Títulos con `font-display` (Fraunces) automáticamente en `h1–h3`.
- Tema claro/oscuro/sistema: cookie `theme` aplicada antes del primer pintado por `ThemeScript` (atributo `data-theme` en `<html>`). La variante `dark:` existe pero rara vez hace falta.
- Componentes base en `src/components/ui` (`Button`, `buttonStyles` para enlaces con aspecto de botón, `Link`, `Input`, `Card`, `Badge`, `Skeleton`, `EmptyState`, `Prose`) y de estructura en `src/components/layout` (cabecera, pie, `Container`, puerta +18).
- Cookies técnicas (`theme`, `age_ok`, `NEXT_LOCALE`, sesión de Supabase): si añades otra, documéntala en `/legal/cookies`.
- Iconos de la PWA: tras cambiar el logo, `node scripts/generate-icons.mjs`.

### Checks

```bash
npm run lint         # ESLint
npm run typecheck    # genera los tipos de rutas de Next y ejecuta tsc
npm test             # tests unitarios (Vitest, una pasada)
npm run test:watch   # Vitest en modo watch
npm run build        # build de producción (no necesita variables de entorno)
```

La versión de Node recomendada está en `.nvmrc` (24). El workflow `.github/workflows/ci.yml` ejecuta estos cinco checks en cada pull request y en cada push a `main`. Los tests viven junto al código (`src/**/*.test.ts`).

Cada push a `main` se despliega en producción en Vercel; el resto de ramas genera previews.

## Autenticación

Supabase Auth con email y contraseña. **Registro solo por invitación** (fase privada): sin una fila válida en `invitaciones` (no usada, no caducada) el alta se rechaza en la BD; el perfil recibe el `rol` de la invitación.

- Páginas: `/[lang]/login`, `registro`, `recuperar`, `restablecer`; ajustes en `/[lang]/yo/ajustes`. Los enlaces de los emails van a `/auth/confirm`, que admite `?code=` (PKCE, plantillas por defecto de Supabase: hay que abrir el enlace en el mismo navegador) y `?token_hash=&type=` (plantillas propias de `supabase/templates/`, que requieren SMTP propio; en el plan Free con el email por defecto no se pueden cambiar).
- Rutas públicas sin sesión: landing, `login`, `registro`, `recuperar`, `restablecer`, `legal/*` y `/auth/*`. El resto redirige a login con `?next=` (lo hace `src/proxy.ts` con la lógica de `src/lib/auth/routes.ts`).
- En servidor: `getCurrentUser()`, `getProfile()`, `requireUser()` y `requireAdmin()` de `@/lib/auth/server`. Las Server Actions vuelven a comprobar la sesión; `/[lang]/admin/**` exige admin (si no, 404).
- Las Server Actions no pueden usar `next/root-params`: el idioma llega en un campo oculto `lang`.
- Validación de formularios en `src/lib/auth/validation.ts` (pura, con tests); los errores son claves de `dict.auth.errors`.

## Base de datos y migraciones

El esquema se gestiona con [Supabase CLI](https://supabase.com/docs/guides/cli) (incluida como dependencia de desarrollo). No se usa base de datos local: las migraciones se aplican directamente al proyecto remoto.

- `supabase/migrations/`: migraciones SQL, en orden. **Nunca cambies el esquema desde el dashboard**; todo cambio va en una migración.
- `src/lib/supabase/database.types.ts`: tipos generados del esquema. No se editan a mano. Los clientes de `src/lib/supabase/` ya están tipados con ellos.
- Extensiones activas (esquema `extensions`): `pg_trgm`, `unaccent`, `postgis`. Para índices de búsqueda sin tildes, usa `public.f_unaccent(texto)`, que sí es `IMMUTABLE`.

Configuración inicial (una vez por máquina):

```bash
npm run db:login   # abre el navegador para autenticar la CLI
npm run db:link    # enlaza con el proyecto; pide la contraseña de la base de datos
```

Flujo para cada cambio de esquema:

```bash
npm run db:new -- nombre_del_cambio   # crea supabase/migrations/<fecha>_nombre_del_cambio.sql
# escribe el SQL en ese archivo
npm run db:push                        # aplica las migraciones pendientes al proyecto
npm run db:types                       # regenera los tipos TypeScript
npm run typecheck
```

`npm run db:status` compara las migraciones locales con las aplicadas en remoto.

### Convenciones del esquema

- Nombres en español, snake_case, sin tildes ni ñ (`ñ → n`: `anadas`, `vinedo`); `año` se escribe `anio`.
- Tablas en plural; tablas puente `<a>_<b>` (`bodega_denominaciones`). PK `id uuid`, FKs `<entidad>_id`.
- `created_at` / `updated_at` en cada tabla; `updated_at` lo mantiene el trigger `public.set_updated_at()`.
- RLS activada en **todas** las tablas. El catálogo es de lectura pública y solo lo escriben los admin (`public.is_admin()`); scrapers y comprobador de enlaces usan la *service role key*.
- `supabase/tests/rls_check.sql` y `supabase/tests/auth_check.sql` comprueban las políticas como anon, usuario y admin (y el registro por invitación) dentro de una transacción que se deshace (`begin … rollback`).
