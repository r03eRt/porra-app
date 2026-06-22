# Porra Admin Next Standalone

Proyecto independiente para montar la porra del año siguiente sin tocar la edición actual.

## Qué es

Este repo es el workspace base para la nueva porra:

- admin para crear y configurar una porra nueva
- conexión con Supabase
- modelo relacional inicial en `supabase/setup.sql`
- despliegue automático en GitHub Pages

## Arranque local

```bash
npm install
npm run dev
```

## Montaje completo

1. Crea un proyecto nuevo en Supabase.
2. Ejecuta `supabase/setup.sql` en el SQL Editor.
3. Ejecuta `supabase/cron.sql` para activar el bloqueo automático de porras vencidas y los crons heredados de la app antigua.
4. Ejecuta `supabase/seed-demo.sql` si quieres cargar una porra demo con usuarios de prueba.
5. Ejecuta `supabase/seed-current.sql` si quieres cargar el histórico actual de la porra. Ese seed limpia las tablas del entorno nuevo y deja la snapshot del año presente lista para probar.
6. Si no usas una semilla, crea el usuario admin en `Authentication > Users`.
7. Marca ese usuario como administrador global:

```sql
update public.profiles
set is_platform_admin = true
where email = 'tu-email-admin@dominio.com';
```

8. Para desarrollo local, rellena `public/admin-next-config.js` con la `Project URL` y la `publishable key`.
9. Para GitHub Pages, define `SUPABASE_URL` y `SUPABASE_PUBLISHABLE_KEY` como secrets del repo y activa `Settings > Pages` con `GitHub Actions`.
10. Sube el repo a GitHub.

Si quieres que el repositorio no guarde la URL ni la publishable key, usa estos nombres:

- Supabase Vault: `project_url` y `publishable_key`
- GitHub Secrets para Pages: `SUPABASE_URL` y `SUPABASE_PUBLISHABLE_KEY`

## Configuración del frontend

Edita `public/admin-next-config.js`:

```js
window.PORRA_ADMIN_NEXT_SUPABASE = {
  url: 'https://tu-project-ref.supabase.co',
  publishableKey: 'sb_publishable_xxx'
};
```

Ese archivo es el único punto que debe cambiar entre entornos.

## Qué crea Supabase

La base de datos se define en `supabase/setup.sql` y crea estas piezas:

- `profiles`: usuarios de Auth sincronizados con perfil propio
- `pools`: porras o competiciones
- `pool_members`: miembros inscritos en cada porra y su rol
- `teams`: selecciones disponibles
- `pool_groups`: grupos de cada porra
- `pool_group_teams`: relación entre grupos y selecciones
- `fixtures`: partidos y cruces
- `mini_questions`: preguntas de mini-porra
- `knockout_slots`: slots configurables para cruces
- `match_predictions`: pronósticos de partidos por usuario
- `mini_answers`: respuestas de mini-porra por usuario
- `knockout_predictions`: pronósticos de cruces por usuario
- `pool_submissions`: estado de envío de cada bloque

## Crons

Antes de ejecutar cron jobs, activa la extensión `pg_cron` en Supabase si no está habilitada.

El cron básico del proyecto está en `supabase/cron.sql` y sirve para tareas de mantenimiento, como cerrar porras cuyo `lock_at` ya ha pasado.

Si quieres automatizar también caches externas más adelante, lo recomendable es añadir funciones Edge aparte y llamar a esas funciones desde `pg_cron`.

## Estructura

- `index.html`: entrada principal
- `src/app.js`: lógica del workspace admin
- `src/styles.css`: estilos
- `public/admin-next-config.js`: configuración del proyecto Supabase
- `supabase/setup.sql`: esquema base completo
- `supabase/cron.sql`: crons de mantenimiento y caches heredadas
- `supabase/seed-demo.sql`: demo ligera para pruebas rápidas
- `supabase/seed-current.sql`: snapshot del histórico actual
- `docs/full-supabase-guide.md`: guía completa de montaje

## Crons heredados

`supabase/cron.sql` deja programados estos jobs en el proyecto nuevo:

- `lock-expired-pools`: cada 10 minutos
- `sync-as-rankings-every-5h`: cada 5 horas
- `sync-worldcup-results-every-2m`: cada 2 minutos
- `sync-as-live-match-every-1m`: cada 1 minuto

Los tres últimos llaman a las Edge Functions copiadas de la app antigua y escriben en:

- `as_rankings_cache`
- `worldcup_results_cache`
- `as_live_match_cache`

Esos jobs leen `project_url` y `publishable_key` desde Vault, así que no hacen falta valores hardcoded dentro del repositorio.

## Publicación

El proyecto está preparado para desplegar en GitHub Pages desde la rama `main`.

1. Sube este directorio a un repositorio nuevo llamado `porra-app`.
2. En GitHub, activa `Settings > Pages` y selecciona `GitHub Actions`.
3. Cada push a `main` ejecutará el workflow de `.github/workflows/deploy.yml`.
4. La URL final será `https://<tu-usuario>.github.io/porra-app/`.

## Lectura recomendada

Si vas a montar el proyecto desde cero, sigue primero [docs/full-supabase-guide.md](./docs/full-supabase-guide.md).
