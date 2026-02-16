import { Navigate, createBrowserRouter } from 'react-router-dom'
import { LoginPage } from '@/features/auth/login-page'
import { DashboardPage } from '@/features/dashboard/dashboard-page'
import { InspectionFormPage } from '@/features/inspection/inspection-form-page'
import { RecordsPage } from '@/features/records/records-page'
import { TagModulePage } from '@/features/modules/tag-page'
import { CamarasModulePage } from '@/features/modules/camaras-page'
import { ExtintoresModulePage } from '@/features/modules/extintores-page'
import { MobileyeModulePage } from '@/features/modules/mobileye-page'
import { OdometroModulePage } from '@/features/modules/odometro-page'
import { WifiModulePage } from '@/features/modules/wifi-page'
import { PublicidadModulePage } from '@/features/modules/publicidad-page'
import { FlotaPage } from '@/features/flota/flota-page'
import { ReportesPage } from '@/features/reportes/reportes-page'
import { ReportsPage } from '@/features/reports/reports-page'
import { InformesPage } from '@/features/informes/informes-page'
import { ComunicacionPage } from '@/features/comunicacion/comunicacion-page'
import { ChatPage } from '@/features/chat/chat-page'
import { PersonalPage } from '@/features/personal/personal-page'
import { ConfiguracionPage } from '@/features/configuracion/configuracion-page'
import { PendientesPage } from '@/features/pendientes/pendientes-page'
import { TicketsPage } from '@/features/tickets/tickets-page'
import { ProfilePage } from '@/features/profile/profile-page'
import { ProtectedRoute } from '@/routes/protected-route'
import { RootRedirect } from '@/routes/root-redirect'
import { NotFoundPage } from '@/routes/not-found'

export const router = createBrowserRouter([
  { path: '/', element: <RootRedirect /> },
  { path: '/login', element: <LoginPage /> },
  {
    path: '/app',
    element: <ProtectedRoute />,
    children: [
      { index: true, element: <Navigate to="/app/formulario" replace /> },
      { path: 'dashboard', element: <DashboardPage /> },
      { path: 'formulario', element: <InspectionFormPage /> },
      { path: 'registros', element: <RecordsPage /> },
      { path: 'tag', element: <TagModulePage /> },
      { path: 'camaras', element: <CamarasModulePage /> },
      { path: 'extintores', element: <ExtintoresModulePage /> },
      { path: 'mobileye', element: <MobileyeModulePage /> },
      { path: 'odometro', element: <OdometroModulePage /> },
      { path: 'wifi', element: <WifiModulePage /> },
      { path: 'publicidad', element: <PublicidadModulePage /> },
      { path: 'flota', element: <FlotaPage /> },
      { path: 'reportes', element: <ReportesPage /> },
      { path: 'analytics', element: <ReportsPage /> },
      { path: 'informes', element: <InformesPage /> },
      { path: 'comunicacion', element: <ComunicacionPage /> },
      { path: 'chat', element: <ChatPage /> },
      { path: 'personal', element: <PersonalPage /> },
      { path: 'configuracion', element: <ConfiguracionPage /> },
      { path: 'pendientes', element: <PendientesPage /> },
      { path: 'tickets', element: <TicketsPage /> },
      { path: 'perfil', element: <ProfilePage /> },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
])
