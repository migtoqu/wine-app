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
