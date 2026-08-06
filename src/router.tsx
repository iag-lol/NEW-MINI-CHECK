import { Navigate, createBrowserRouter } from 'react-router-dom'
import { lazy, Suspense, type ReactNode } from 'react'
import { ProtectedRoute } from '@/routes/protected-route'
import { RequireRole } from '@/routes/require-role'
import { RootRedirect } from '@/routes/root-redirect'
import { NotFoundPage } from '@/routes/not-found'
import { RouteErrorPage } from '@/routes/route-error'
import { RouteLoadingPage } from '@/routes/route-loading'

const LoginPage = lazy(() => import('@/features/auth/login-page').then((module) => ({ default: module.LoginPage })))
const DashboardPage = lazy(() => import('@/features/dashboard/dashboard-page').then((module) => ({ default: module.DashboardPage })))
const InspectionFormPage = lazy(() => import('@/features/inspection/inspection-form-page').then((module) => ({ default: module.InspectionFormPage })))
const RecordsPage = lazy(() => import('@/features/records/records-page').then((module) => ({ default: module.RecordsPage })))
const TagModulePage = lazy(() => import('@/features/modules/tag-page').then((module) => ({ default: module.TagModulePage })))
const CamarasModulePage = lazy(() => import('@/features/modules/camaras-page').then((module) => ({ default: module.CamarasModulePage })))
const ExtintoresModulePage = lazy(() => import('@/features/modules/extintores-page').then((module) => ({ default: module.ExtintoresModulePage })))
const MobileyeModulePage = lazy(() => import('@/features/modules/mobileye-page').then((module) => ({ default: module.MobileyeModulePage })))
const OdometroModulePage = lazy(() => import('@/features/modules/odometro-page').then((module) => ({ default: module.OdometroModulePage })))
const RackModulePage = lazy(() => import('@/features/modules/rack-page').then((module) => ({ default: module.RackModulePage })))
const WifiModulePage = lazy(() => import('@/features/modules/wifi-page').then((module) => ({ default: module.WifiModulePage })))
const PublicidadModulePage = lazy(() => import('@/features/modules/publicidad-page').then((module) => ({ default: module.PublicidadModulePage })))
const FlotaPage = lazy(() => import('@/features/flota/flota-page').then((module) => ({ default: module.FlotaPage })))
const ReportesPage = lazy(() => import('@/features/reportes/reportes-page').then((module) => ({ default: module.ReportesPage })))
const ReportsPage = lazy(() => import('@/features/reports/reports-page').then((module) => ({ default: module.ReportsPage })))
const InformesPage = lazy(() => import('@/features/informes/informes-page').then((module) => ({ default: module.InformesPage })))
const ComunicacionPage = lazy(() => import('@/features/comunicacion/comunicacion-page').then((module) => ({ default: module.ComunicacionPage })))
const PersonalPage = lazy(() => import('@/features/personal/personal-page').then((module) => ({ default: module.PersonalPage })))
const ConfiguracionPage = lazy(() => import('@/features/configuracion/configuracion-page').then((module) => ({ default: module.ConfiguracionPage })))
const Mas15ModulePage = lazy(() => import('@/features/modules/mas15-page').then((module) => ({ default: module.Mas15ModulePage })))
const NormaGraficaModulePage = lazy(() => import('@/features/modules/norma-grafica-page').then((module) => ({ default: module.NormaGraficaModulePage })))
const PendientesPage = lazy(() => import('@/features/pendientes/pendientes-page').then((module) => ({ default: module.PendientesPage })))
const TicketsPage = lazy(() => import('@/features/tickets/tickets-page').then((module) => ({ default: module.TicketsPage })))
const ProfilePage = lazy(() => import('@/features/profile/profile-page').then((module) => ({ default: module.ProfilePage })))

const loadPage = (page: ReactNode) => (
  <Suspense fallback={<RouteLoadingPage />}>{page}</Suspense>
)

const supervisorOnly = (page: ReactNode) => (
  <RequireRole roles={['SUPERVISOR', 'JEFE DE TERMINAL']}>
    {loadPage(page)}
  </RequireRole>
)

export const router = createBrowserRouter([
  { path: '/', element: <RootRedirect />, errorElement: <RouteErrorPage /> },
  { path: '/login', element: loadPage(<LoginPage />), errorElement: <RouteErrorPage /> },
  {
    path: '/app',
    element: <ProtectedRoute />,
    errorElement: <RouteErrorPage />,
    children: [
      { index: true, element: <Navigate to="/app/formulario" replace /> },
      {
        path: 'dashboard',
        element: supervisorOnly(<DashboardPage />),
      },
      { path: 'formulario', element: loadPage(<InspectionFormPage />) },
      { path: 'registros', element: loadPage(<RecordsPage />) },
      { path: 'tag', element: supervisorOnly(<TagModulePage />) },
      { path: 'camaras', element: supervisorOnly(<CamarasModulePage />) },
      { path: 'extintores', element: supervisorOnly(<ExtintoresModulePage />) },
      { path: 'mobileye', element: supervisorOnly(<MobileyeModulePage />) },
      { path: 'odometro', element: supervisorOnly(<OdometroModulePage />) },
      { path: 'rack', element: supervisorOnly(<RackModulePage />) },
      { path: 'mas15', element: supervisorOnly(<Mas15ModulePage />) },
      { path: 'norma-grafica', element: supervisorOnly(<NormaGraficaModulePage />) },
      { path: 'wifi', element: supervisorOnly(<WifiModulePage />) },
      { path: 'publicidad', element: supervisorOnly(<PublicidadModulePage />) },
      { path: 'flota', element: supervisorOnly(<FlotaPage />) },
      { path: 'reportes', element: supervisorOnly(<ReportesPage />) },
      { path: 'analytics', element: supervisorOnly(<ReportsPage />) },
      { path: 'informes', element: supervisorOnly(<InformesPage />) },
      { path: 'comunicacion', element: loadPage(<ComunicacionPage />) },
      // 'chat' se retiró: Comunicación cubre el mismo caso de uso
      { path: 'chat', element: <Navigate to="/app/comunicacion" replace /> },
      { path: 'personal', element: supervisorOnly(<PersonalPage />) },
      { path: 'configuracion', element: supervisorOnly(<ConfiguracionPage />) },
      { path: 'pendientes', element: loadPage(<PendientesPage />) },
      { path: 'tickets', element: supervisorOnly(<TicketsPage />) },
      { path: 'perfil', element: loadPage(<ProfilePage />) },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
])
