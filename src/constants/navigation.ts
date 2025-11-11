import type { ComponentType } from 'react'
import {
  LayoutDashboard,
  ClipboardList,
  Map,
  ShieldCheck,
  Camera,
  BadgeCheck,
  Radar,
  Gauge,
  Megaphone,
  Bus,
  PieChart,
  FileBarChart,
  MessageSquare,
  Users2,
  Settings,
  Activity,
  Layers,
  FolderKanban,
  BarChart3,
  LineChart,
  Sliders,
  Ticket,
  ClipboardCheck,
} from 'lucide-react'

export interface NavItem {
  label: string
  path: string
  icon: ComponentType<{ className?: string }>
  roles?: Array<'INSPECTOR' | 'SUPERVISOR' | 'JEFE DE TERMINAL'>
  badge?: string
}

export interface NavGroup {
  label: string
  icon: ComponentType<{ className?: string }>
  items: NavItem[]
  defaultOpen?: boolean
  roles?: Array<'INSPECTOR' | 'SUPERVISOR' | 'JEFE DE TERMINAL'>
}

// Navegación agrupada y organizada
export const SIDEBAR_GROUPS: NavGroup[] = [
  {
    label: 'Principal',
    icon: LayoutDashboard,
    defaultOpen: true,
    items: [
      { label: 'Dashboard', path: '/app/dashboard', icon: LayoutDashboard },
      { label: 'Nueva Inspección', path: '/app/formulario', icon: ClipboardList },
      { label: 'Pendientes', path: '/app/pendientes', icon: ClipboardCheck },
      { label: 'Tickets', path: '/app/tickets', icon: Ticket },
    ],
  },
  {
    label: 'Módulos de Inspección',
    icon: Layers,
    items: [
      { label: 'Cámaras', path: '/app/camaras', icon: Camera },
      { label: 'TAG', path: '/app/tag', icon: ShieldCheck },
      { label: 'Extintores', path: '/app/extintores', icon: BadgeCheck },
      { label: 'Mobileye', path: '/app/mobileye', icon: Radar },
      { label: 'Odómetro', path: '/app/odometro', icon: Gauge },
      { label: 'Publicidad', path: '/app/publicidad', icon: Megaphone },
    ],
  },
  {
    label: 'Gestión',
    icon: FolderKanban,
    items: [
      { label: 'Flota', path: '/app/flota', icon: Bus },
      { label: 'Personal', path: '/app/personal', icon: Users2 },
      { label: 'Registros', path: '/app/registros', icon: Activity },
    ],
  },
  {
    label: 'Análisis',
    icon: BarChart3,
    roles: ['SUPERVISOR', 'JEFE DE TERMINAL'],
    items: [
      { label: 'Reportes', path: '/app/reportes', icon: PieChart },
      { label: 'Reportes Avanzados', path: '/app/analytics', icon: LineChart, roles: ['SUPERVISOR', 'JEFE DE TERMINAL'] },
      { label: 'Informes', path: '/app/informes', icon: FileBarChart, roles: ['SUPERVISOR', 'JEFE DE TERMINAL'] },
    ],
  },
  {
    label: 'Sistema',
    icon: Sliders,
    roles: ['SUPERVISOR'],
    items: [
      { label: 'Comunicación', path: '/app/comunicacion', icon: MessageSquare, roles: ['SUPERVISOR'] },
      { label: 'Configuración', path: '/app/configuracion', icon: Settings, roles: ['SUPERVISOR'] },
    ],
  },
]

// Lista plana para compatibilidad (deprecated)
export const SIDEBAR_ITEMS: NavItem[] = SIDEBAR_GROUPS.flatMap(group => group.items)

export interface MobileNavItem {
  label: string
  path: string
  key: 'formulario' | 'dashboard' | 'pendientes' | 'perfil'
  icon: ComponentType<{ className?: string }>
}

export const MOBILE_ITEMS: MobileNavItem[] = [
  { label: 'Inicio', path: '/app/formulario', key: 'formulario', icon: ClipboardList },
  { label: 'Dashboard', path: '/app/dashboard', key: 'dashboard', icon: LayoutDashboard },
  { label: 'Pendientes', path: '/app/pendientes', key: 'pendientes', icon: Map },
  { label: 'Perfil', path: '/app/perfil', key: 'perfil', icon: Users2 },
]
