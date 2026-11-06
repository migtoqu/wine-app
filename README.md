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
