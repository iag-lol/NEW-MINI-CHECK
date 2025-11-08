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
} from 'lucide-react'

export interface NavItem {
  label: string
  path: string
  icon: ComponentType<{ className?: string }>
  roles?: Array<'INSPECTOR' | 'SUPERVISOR'>
}

export const SIDEBAR_ITEMS: NavItem[] = [
  { label: 'Dashboard', path: '/app/dashboard', icon: LayoutDashboard },
  { label: 'Formulario', path: '/app/formulario', icon: ClipboardList },
  { label: 'Registros', path: '/app/registros', icon: Activity },
  { label: 'Cámaras', path: '/app/camaras', icon: Camera },
  { label: 'Tag', path: '/app/tag', icon: ShieldCheck },
  { label: 'Extintores', path: '/app/extintores', icon: BadgeCheck },
  { label: 'Mobileye', path: '/app/mobileye', icon: Radar },
  { label: 'Odómetro', path: '/app/odometro', icon: Gauge },
  { label: 'Publicidad', path: '/app/publicidad', icon: Megaphone },
  { label: 'Flota', path: '/app/flota', icon: Bus },
  { label: 'Reportes', path: '/app/reportes', icon: PieChart },
  { label: 'Informes', path: '/app/informes', icon: FileBarChart, roles: ['SUPERVISOR'] },
  { label: 'Comunicación', path: '/app/comunicacion', icon: MessageSquare, roles: ['SUPERVISOR'] },
  { label: 'Personal', path: '/app/personal', icon: Users2 },
  { label: 'Configuración', path: '/app/configuracion', icon: Settings, roles: ['SUPERVISOR'] },
]

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
