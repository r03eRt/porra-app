# Full Supabase Guide

Guía completa para montar la porra nueva sobre un proyecto Supabase separado.

## Objetivo

Separar por completo la nueva porra de la edición actual. Este proyecto nuevo debe servir para:

- crear porras nuevas cada año
- dar de alta usuarios
- configurar grupos y equipos
- definir mini-porra con preguntas y puntos
- permitir pronósticos de grupos, mini-porra y cruces
- bloquear envíos cuando la porra cierre
- mantener la lógica de cálculo fuera del Excel

## Arquitectura

La separación recomendada es:

- frontend estático en este repo
- backend ligero en Supabase
- autenticación con Supabase Auth
- permisos con RLS
- cron solo para tareas de mantenimiento o sincronización

## Paso 1. Crear el proyecto Supabase

1. Crea un proyecto nuevo en Supabase.
2. Desactiva el registro público si quieres altas manuales.
3. Ejecuta `supabase/seed-demo.sql` si quieres una demo lista para probar.
4. Crea el usuario administrador principal en `Authentication > Users` si no usas la demo.
5. Copia la `Project URL` y la `publishable key`.

## Paso 2. Ejecutar el esquema base

Abre el SQL Editor y ejecuta `supabase/setup.sql`.

Ese fichero crea:

- tablas principales
- triggers de `updated_at`
- trigger para crear perfil al registrar un usuario
- funciones helper para RLS
- políticas de lectura/escritura

## Tablas

### `profiles`

Perfil ligado a `auth.users`.

- `id`: UUID del usuario de Auth
- `email`: email del usuario
- `display_name`: nombre visible
- `is_platform_admin`: admin global del sistema
- `created_at`, `updated_at`

Uso:

- controlar administradores
- mostrar nombres en dashboards
- enlazar auth con datos propios

### `pools`

Una porra concreta.

- `slug`: identificador URL-friendly
- `name`: nombre visible
- `edition_name`: edición o torneo
- `status`: `draft`, `open`, `locked`, `archived`
- `lock_at`: fecha de cierre
- `group_exact_points`: puntos por marcador exacto
- `group_sign_points`: puntos por acierto de signo
- `created_by`

Uso:

- crear varias porras
- cerrar accesos por fecha
- separar cada edición

### `pool_members`

Usuarios inscritos en una porra.

- `pool_id`
- `user_id`
- `email`
- `display_name`
- `role`: `admin` o `player`
- `joined_at`

Uso:

- dar acceso a un usuario concreto
- distinguir admin de jugador

### `teams`

Catálogo de selecciones.

- `name`
- `short_name`
- `code`
- `flag_emoji`

Uso:

- reutilizar selecciones en grupos y cruces
- evitar duplicados

### `pool_groups`

Grupos de una porra.

- `pool_id`
- `letter`
- `name`
- `sort_order`

Uso:

- crear grupos A, B, C...
- ordenar visualmente

### `pool_group_teams`

Relación entre grupos y selecciones.

- `group_id`
- `team_id`
- `sort_order`

Uso:

- asignar países a cada grupo
- ordenar dentro de cada grupo

### `fixtures`

Partidos o cruces del torneo.

- `pool_id`
- `group_id`
- `stage`
- `slot_key`
- `home_team_id`
- `away_team_id`
- `kickoff_at`
- `status`
- `home_score`
- `away_score`
- `sort_order`

Uso:

- cargar fase de grupos
- cargar eliminatorias
- guardar resultados reales

### `mini_questions`

Preguntas de mini-porra.

- `pool_id`
- `label`
- `field_type`: `text`, `number`, `select`
- `points`
- `options`
- `sort_order`

Uso:

- definir preguntas custom por torneo
- cambiar puntuaciones sin tocar código

### `knockout_slots`

Slots configurables de la eliminatoria.

- `pool_id`
- `stage`
- `slot_key`
- `label`
- `sort_order`

Uso:

- definir estructura de cruces
- mapear campeones, finalistas y rondas

### `match_predictions`

Pronósticos de partidos por usuario.

- `pool_id`
- `user_id`
- `fixture_id`
- `home_score`
- `away_score`
- `submitted_at`
- `updated_at`

Uso:

- guardar predicciones de fase de grupos
- calcular puntos

### `mini_answers`

Respuestas de mini-porra por usuario.

- `pool_id`
- `user_id`
- `question_id`
- `answer`
- `submitted_at`
- `updated_at`

Uso:

- guardar respuestas de preguntas abiertas o cerradas

### `knockout_predictions`

Pronósticos de cruces por usuario.

- `pool_id`
- `user_id`
- `slot_id`
- `team_id`
- `submitted_at`
- `updated_at`

Uso:

- guardar el cuadro de eliminatorias

### `pool_submissions`

Estado de cada bloque enviado por usuario.

- `pool_id`
- `user_id`
- `section`: `groups`, `mini`, `knockout`
- `status`: `draft`, `submitted`, `locked`
- `submitted_at`
- `updated_at`

Uso:

- saber qué ha rellenado cada usuario
- bloquear edición cuando cierre la porra

## Paso 3. Seguridad

El modelo usa RLS y helpers:

- `is_platform_admin()`
- `is_pool_admin(pool_id)`
- `is_pool_member(pool_id)`
- `pool_is_open(pool_id)`

Regla práctica:

- el admin global puede todo
- el admin de una porra puede gestionar esa porra
- el jugador solo puede editar sus propios datos mientras la porra esté abierta

## Paso 4. Marcar el admin global

Cuando el usuario admin esté creado en Auth, ejecuta:

```sql
update public.profiles
set is_platform_admin = true
where email = 'tu-email-admin@dominio.com';
```

## Paso 5. Configurar el frontend

Edita `public/admin-next-config.js`:

```js
window.PORRA_ADMIN_NEXT_SUPABASE = {
  url: 'https://tu-project-ref.supabase.co',
  publishableKey: 'sb_publishable_xxx'
};
```

## Paso 6. Cron de mantenimiento

Antes de usarlo, activa la extensión `pg_cron` en el proyecto Supabase si no está habilitada.

El fichero `supabase/cron.sql` crea un cron de ejemplo para cerrar porras vencidas.

### Qué hace

- revisa `pools.lock_at`
- cambia `status` a `locked` si ya ha pasado la fecha

### Cuándo ejecutarlo

- cada 10 minutos o cada 15 minutos

### Por qué sirve

- evita que una porra siga editable después de la hora de cierre
- te permite cerrar la porra aunque nadie entre en la web

## Paso 7. Flujo recomendado de creación de porra

1. Crear la porra en `pools`.
2. Crear los usuarios en Auth.
3. Crear `profiles` y marcarlos como miembros en `pool_members`.
4. Crear grupos en `pool_groups`.
5. Crear selecciones en `teams`.
6. Relacionar selecciones y grupos en `pool_group_teams`.
7. Crear partidos en `fixtures`.
8. Crear preguntas mini en `mini_questions`.
9. Crear slots de cruces en `knockout_slots`.
10. Abrir la porra cambiando `pools.status` a `open`.

## Paso 8. Flujo de usuario

1. El usuario entra con Supabase Auth.
2. La app carga su `profile`.
3. La app carga la porra abierta en la que es miembro.
4. El usuario rellena grupos, mini-porra y cruces.
5. La app guarda en `match_predictions`, `mini_answers` y `knockout_predictions`.
6. Cuando pulsa enviar, la app actualiza `pool_submissions`.
7. Cuando llega `lock_at`, la porra pasa a `locked`.

## Paso 9. Ranking

El ranking no debe depender de Excel. Debe calcularse desde la base de datos:

- comparar predicciones con resultados de `fixtures`
- sumar puntos según reglas de `pools`
- resolver mini-porra con `mini_questions.points`
- resolver cruces con `knockout_slots`

## Paso 10. Crons futuros opcionales

Si más adelante quieres automatizar caches externas, la idea es:

- crear una Edge Function por fuente
- exponerla con `verify_jwt = false` si la llama `pg_cron`
- usar `net.http_post` o un scheduler equivalente
- guardar resultados en tablas cache separadas

Ejemplo de patrón:

```sql
select cron.schedule(
  'lock-expired-pools',
  '*/10 * * * *',
  $$
  select public.lock_expired_pools();
  $$
);
```

## Paso 11. Publicación

Este frontend ya está preparado para GitHub Pages con el repo `porra-app`.

1. Sube el contenido a GitHub.
2. Mantén el workflow de `.github/workflows/deploy.yml`.
3. Asegúrate de que `vite.config.js` tenga `base: '/porra-app/'`.

## Paso 12. Orden recomendado de trabajo

1. Montar el proyecto Supabase nuevo.
2. Cargar esquema y cron.
3. Hacer login y comprobar RLS.
4. Persistir el borrador local de `src/app.js` en Supabase.
5. Construir dashboard de jugador.
6. Construir ranking.
7. Añadir automatismos de resultados si hacen falta.
