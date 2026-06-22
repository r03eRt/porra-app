# Porra Admin Next Standalone

Proyecto independiente para montar la porra del año siguiente sin tocar la edición actual.

## Qué incluye

- workspace admin para configurar una porra nueva
- conexión con Supabase mediante `@supabase/supabase-js`
- borrador local para configuración inicial
- esquema SQL base en `supabase/setup.sql`

## Arranque

```bash
npm install
npm run dev
```

## Configuración de Supabase

Edita `public/admin-next-config.js`:

```js
window.PORRA_ADMIN_NEXT_SUPABASE = {
  url: 'https://tu-project-ref.supabase.co',
  publishableKey: 'sb_publishable_xxx'
};
```

Después ejecuta `supabase/setup.sql` en el proyecto nuevo de Supabase y crea tu usuario admin en `Authentication > Users`.

## Estructura

- `index.html`: entrada principal
- `src/app.js`: lógica del workspace admin
- `src/styles.css`: estilos
- `public/admin-next-config.js`: configuración del proyecto Supabase
- `supabase/setup.sql`: modelo de datos inicial

## Publicación

Puedes subir este directorio a un repositorio nuevo y desplegarlo donde quieras como aplicación Vite estática.
