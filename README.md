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
3. Ejecuta `supabase/cron.sql` si quieres activar el bloqueo automático de porras vencidas.
4. Crea el usuario admin en `Authentication > Users`.
5. Marca ese usuario como administrador global:

```sql
update public.profiles
set is_platform_admin = true
where email = 'tu-email-admin@dominio.com';
```

6. Rellena `public/admin-next-config.js` con la `Project URL` y la `publishable key` del proyecto nuevo.
7. Sube el repo a GitHub y activa GitHub Pages desde `Settings > Pages` con `GitHub Actions`.

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
- `supabase/cron.sql`: cron de mantenimiento
- `docs/full-supabase-guide.md`: guía completa de montaje

## Publicación

El proyecto está preparado para desplegar en GitHub Pages desde la rama `main`.

1. Sube este directorio a un repositorio nuevo llamado `porra-app`.
2. En GitHub, activa `Settings > Pages` y selecciona `GitHub Actions`.
3. Cada push a `main` ejecutará el workflow de `.github/workflows/deploy.yml`.
4. La URL final será `https://<tu-usuario>.github.io/porra-app/`.

## Lectura recomendada

Si vas a montar el proyecto desde cero, sigue primero [docs/full-supabase-guide.md](./docs/full-supabase-guide.md).
