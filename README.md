# New Mini-Check

Sistema web para la revisión integral de flota de buses, con autenticación por RUT, workflow de inspección paso a paso, tablero supervisor, notificaciones en tiempo real (Supabase Realtime) y exportaciones XLSX/PDF listas para auditorías.

## Tecnologías principales

- React 19 + Vite + TypeScript
- TailwindCSS + Shadcn/UI + Framer Motion
- Zustand y React Query para estado y datos
- Supabase (Auth, Postgres, Storage, Realtime)
- Leaflet con capas satelitales de Mapbox
- ExcelJS y jsPDF para exportaciones

## Requisitos

- Node.js 20+
- Cuenta de Supabase
- Token público de Mapbox

## Variables de entorno

Crea `.env` tomando como referencia `.env.example`:

```bash
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
VITE_MAPBOX_TOKEN=pk....
```

## Scripts básicos

```bash
npm install       # instala dependencias
npm run dev       # entorno local con HMR
npm run build     # compila a producción (dist/)
npm run preview   # sirve el build de dist/
```

## Despliegue en Render (Static Site)

- **Branch:** `main`
- **Build command:** `npm install && npm run build`
- **Publish directory:** `dist`
- Configura las variables de entorno anteriores en Render → Environment.

## Supabase

1. Ejecuta el contenido de `supabase/schema.sql` en el SQL Editor de tu proyecto. Crea tablas, relaciones y políticas básicas.
2. El script inserta un supervisor listo para ingresar:

| Rol         | RUT            | Contraseña        |
|-------------|----------------|-------------------|
| Supervisor  | `12.345.678-5` | `Supervisor#2025` |

> El password se cifra automáticamente con `crypt(...)` al ejecutar el script.

3. Completa las tablas `flota`, `personal`, etc., con tus datos reales (todas las vistas consumen Supabase directamente, no hay datos mockeados).

## Estructura relevante

- `src/features/*`: Páginas y módulos (dashboard, formulario, reportes, etc.).
- `src/store/*`: Zustand stores (auth, UI, notificaciones).
- `src/lib/*`: utilidades (Supabase client, geocercas, RUT helpers, exports).
- `supabase/schema.sql`: definición completa de la base y datos semilla.

## Notas

- El formulario de inspección aplica todas las reglas descritas (bloqueos por estado, validaciones condicionales, tickets automáticos).
- Las notificaciones push dependen de los permisos del navegador; en móviles se complementan con sonido generado vía Web Audio API.
- Si deseas usuarios adicionales, reutiliza el bloque `insert into public.usuarios` del script, ajustando `rut`, `cargo`, `terminal` y contraseña.
