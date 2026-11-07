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
- `src/proxy.ts`: refresca la sesión de Supabase en cada petición.

Cada push a `main` se despliega en producción en Vercel; el resto de ramas genera previews.

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
