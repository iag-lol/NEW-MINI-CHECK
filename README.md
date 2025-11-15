# 🚌 New Mini-Check

Sistema web profesional para la **revisión integral de flota de buses**, con autenticación segura por RUT, workflow de inspección paso a paso, dashboard en tiempo real, notificaciones instantáneas y exportaciones listas para auditorías.

**Última actualización:** 2025-11-15 - Filtro de semana global persistente implementado

## ✨ Características Principales

- ✅ **Autenticación segura** por RUT con hash bcrypt
- 📋 **Formulario de inspección** paso a paso con validaciones inteligentes
- 📊 **Dashboard en tiempo real** con gráficos profesionales y mapas interactivos
- 🔔 **Notificaciones push** con Web Notifications API y sonido
- 📱 **Totalmente responsivo** - Mobile first design
- 🌓 **Modo oscuro/claro** automático según preferencia del sistema
- 📥 **Exportación** a XLSX y PDF con diseño profesional
- 🎯 **Sistema de tickets** automático según hallazgos
- 🗺️ **Geolocalización** automática con detección de terminales
- ⚡ **Sin pantallas de carga** - Skeleton loaders para mejor UX

## 🛠️ Stack Tecnológico

### Frontend
- **React 19** - Framework UI
- **Vite** - Build tool ultrarrápido
- **TypeScript** - Type safety
- **TailwindCSS** - Utility-first CSS
- **Shadcn/UI** - Componentes UI profesionales
- **Framer Motion** - Animaciones fluidas

### Estado y Datos
- **Zustand** - State management
- **React Query** - Server state management
- **React Hook Form** + **Zod** - Forms y validación

### Backend y Datos
- **Supabase** - Backend as a Service
  - PostgreSQL database
  - Row Level Security (RLS)
  - Realtime subscriptions
  - Storage para archivos

### Mapas y Visualización
- **Leaflet** / **Mapbox GL** - Mapas interactivos
- **Recharts** - Gráficos profesionales

### Exportación
- **ExcelJS** - Generación de archivos Excel
- **jsPDF** - Generación de PDFs

## 📋 Requisitos

- **Node.js** 20 o superior
- **npm** o **yarn**
- Cuenta de **Supabase** (plan gratuito disponible)
- Token de **Mapbox** (opcional, usa OpenStreetMap por defecto)

## 🚀 Instalación

### 1. Clonar el repositorio

```bash
git clone <repository-url>
cd nueva-mini-check
```

### 2. Instalar dependencias

```bash
npm install
```

### 3. Configurar variables de entorno

Copia el archivo `.env.example` a `.env`:

```bash
cp .env.example .env
```

Edita `.env` con tus credenciales:

```env
VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
VITE_SUPABASE_ANON_KEY=tu-anon-key
VITE_MAPBOX_TOKEN=pk.tu-token-mapbox (opcional)
```

### 4. Configurar Supabase

1. Crea un nuevo proyecto en [Supabase](https://supabase.com)
2. Ve al **SQL Editor** en tu proyecto
3. Ejecuta el contenido completo del archivo `supabase-schema.sql`
4. Esto creará todas las tablas, índices, políticas RLS y datos de ejemplo

### 5. Iniciar servidor de desarrollo

```bash
npm run dev
```

La aplicación estará disponible en `http://localhost:5173`

## 👤 Usuarios de Prueba

El script SQL incluye usuarios de ejemplo:

| RUT | Contraseña | Cargo | Terminal |
|-----|-----------|-------|----------|
| `12.345.678-9` | `admin123` | SUPERVISOR | El Roble |
| `98.765.432-1` | `admin123` | INSPECTOR | La Reina |

## 📁 Estructura del Proyecto

```
nueva-mini-check/
├── src/
│   ├── components/       # Componentes reutilizables
│   │   ├── ui/          # Componentes UI base
│   │   └── layout/      # Componentes de layout
│   ├── features/        # Features por módulo
│   │   ├── auth/        # Autenticación
│   │   ├── dashboard/   # Dashboard
│   │   ├── inspection/  # Formulario de inspección
│   │   ├── tickets/     # Sistema de tickets
│   │   └── ...
│   ├── store/           # Zustand stores
│   ├── lib/             # Utilidades y helpers
│   ├── types/           # TypeScript types
│   └── constants/       # Constantes (geocercas, etc)
├── supabase-schema.sql  # Schema completo de base de datos
└── README.md
```

## 🎯 Módulos del Sistema

### 1. **Dashboard**
- Vista consolidada en tiempo real
- Gráficos de actividad semanal
- Mapa con ubicaciones GPS
- Estadísticas de operatividad
- Exportación a XLSX/PDF

### 2. **Formulario de Inspección**
Módulos de revisión:
- ✅ TAG (con serie persistente)
- 📹 Cámaras (monitor + 4 cámaras)
- 🧯 Extintores (vencimiento, certificación, estado)
- 🚗 Mobileye (solo buses Volvo)
- 📏 Odómetro (lectura obligatoria)
- 🎨 Publicidad (3 laterales)

### 3. **Sistema de Tickets**
- Generación automática según hallazgos
- Filtros avanzados (estado, prioridad, módulo)
- Búsqueda en tiempo real
- Gestión de estados (Pendiente → En Proceso → Resuelto)

### 4. **Gestión de Flota**
- Catálogo completo de buses
- Historial de revisiones por bus
- Filtros por terminal, marca, modelo

### 5. **Reportes e Informes**
- Análisis semanal/mensual
- Exportación personalizada
- Métricas por terminal
- Tendencias de fallas

### 6. **Personal y Comunicación**
- Gestión de inspectores
- Sistema de comunicación para supervisores

## 🔐 Seguridad

- **Autenticación** con hash bcrypt (10 rounds)
- **Row Level Security (RLS)** en Supabase
- **Validación** de formularios con Zod
- **Sanitización** de entradas de usuario
- **HTTPS** requerido en producción

## 📦 Scripts Disponibles

```bash
npm run dev       # Servidor de desarrollo
npm run build     # Build de producción
npm run preview   # Preview del build
npm run lint      # Linter ESLint
```

## 🌐 Despliegue

### Vercel (Recomendado)

```bash
npm install -g vercel
vercel
```

### Netlify

```bash
npm run build
# Arrastra la carpeta dist/ a Netlify
```

### Render (Static Site)

1. Conecta tu repositorio
2. Configura:
   - **Build Command:** `npm install && npm run build`
   - **Publish Directory:** `dist`
3. Agrega variables de entorno

## 📱 Progressive Web App (PWA)

La aplicación está optimizada para funcionar como PWA:
- ✅ Notificaciones push
- ✅ Funcionamiento offline básico
- ✅ Instalable en dispositivos móviles

## 🐛 Troubleshooting

### Error: "Supabase environment variables are missing"
Verifica que tu archivo `.env` esté correctamente configurado con las variables de Supabase.

### Notificaciones no funcionan
1. Verifica que el navegador soporte notificaciones
2. Otorga permisos de notificación cuando se soliciten
3. Las notificaciones solo funcionan en HTTPS (o localhost)

### Mapa no carga
1. Verifica tu token de Mapbox en `.env`
2. Si no tienes token, la app usará OpenStreetMap automáticamente

## 📄 Licencia

Este proyecto es privado y está protegido por derechos de autor.

## 🤝 Soporte

Para soporte o preguntas, contacta al equipo de desarrollo.

---

**Desarrollado con ❤️ para gestión profesional de flotas**
