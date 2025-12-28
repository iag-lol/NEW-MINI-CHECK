import { HashRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { OnboardingPage } from '../../features/onboarding/OnboardingPage';
import { DashboardLayout } from '../layouts/DashboardLayout';
import { InspectorLayout } from '../layouts/InspectorLayout';
import { useSessionStore } from '../../shared/state/sessionStore';
import { LoadingState } from '../../shared/components/common/LoadingState';
import { PersonalPage } from '../../features/personal/PersonalPage';
import { ReunionesPage } from '../../features/reuniones/ReunionesPage';
import { TareasPage } from '../../features/tareas/TareasPage';
import { InformativosPage } from '../../features/informativos/InformativosPage';
import { AsistenciaPage } from '../../features/asistencia/AsistenciaPage';
/* Old aseo sections - disabled for new mobile portal
import { AseoInteriorPage } from '../../features/aseo/sections/AseoInteriorPage';
import { AseoExteriorPage } from '../../features/aseo/sections/AseoExteriorPage';
import { AseoRodilloPage } from '../../features/aseo/sections/AseoRodilloPage';
*/
import { CredencialesRespaldoPage } from '../../features/credenciales_respaldo/CredencialesRespaldoPage';
import { SolicitudesPage } from '../../features/solicitudes/SolicitudesPage';
import { MiniCheckExtintorPage } from '../../features/minicheck/sections/MiniCheckExtintorPage';
import { MiniCheckTagPage } from '../../features/minicheck/sections/MiniCheckTagPage';
import { MiniCheckMobileyePage } from '../../features/minicheck/sections/MiniCheckMobileyePage';
import { MiniCheckOdometroPage } from '../../features/minicheck/sections/MiniCheckOdometroPage';
import { MiniCheckPublicidadPage } from '../../features/minicheck/sections/MiniCheckPublicidadPage';
import { EstadoFlotaPage } from '../../features/estado-flota/EstadoFlotaPage';
import { SolicitudesInsumosPage } from '../../features/solicitudes_insumos/SolicitudesInsumosPage';
import { SrlPage } from '../../features/srl/pages/SrlPage';
import { AseoMobilePage } from '../../features/aseo/pages/AseoMobilePage';
import { AseoAdminPage } from '../../features/aseo/pages/AseoAdminPage';
import { MyInfoPage } from '../../features/asistencia2026/pages/MyInfoPage';

const RequireSession = () => {
  const session = useSessionStore((state) => state.session);
  const hydrateSession = useSessionStore((state) => state.hydrateSession);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    hydrateSession().finally(() => setLoading(false));
  }, [hydrateSession]);

  if (loading) {
    return <LoadingState label="Validando sesión" />;
  }

  if (!session) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
};

export const AppRouter = () => (
  <HashRouter>
    <Routes>
      <Route path="/" element={<OnboardingPage />} />
      <Route element={<RequireSession />}>
        <Route element={<DashboardLayout />}>
          <Route path="/personal" element={<PersonalPage />} />
          <Route path="/reuniones" element={<ReunionesPage />} />
          <Route path="/tareas" element={<TareasPage />} />
          <Route path="/informativos" element={<InformativosPage />} />
          <Route path="/asistencia" element={<AsistenciaPage />} />
          <Route path="/mi-info" element={<MyInfoPage />} />
          {/* Old aseo sections - disabled for new mobile portal
          <Route path="/aseo/interior" element={<AseoInteriorPage />} />
          <Route path="/aseo/exterior" element={<AseoExteriorPage />} />
          <Route path="/aseo/rodillo" element={<AseoRodilloPage />} />
          */}
          <Route path="/credenciales" element={<CredencialesRespaldoPage />} />
          <Route path="/solicitudes" element={<SolicitudesPage />} />
          <Route path="/minicheck/extintor" element={<MiniCheckExtintorPage />} />
          <Route path="/minicheck/tag" element={<MiniCheckTagPage />} />
          <Route path="/minicheck/mobileye" element={<MiniCheckMobileyePage />} />
          <Route path="/minicheck/odometro" element={<MiniCheckOdometroPage />} />
          <Route path="/minicheck/publicidad" element={<MiniCheckPublicidadPage />} />
          <Route path="/estado-flota" element={<EstadoFlotaPage />} />
          <Route path="/insumos" element={<SolicitudesInsumosPage />} />
          <Route path="/srl" element={<SrlPage />} />
          <Route path="/aseo/admin" element={<AseoAdminPage />} />
        </Route>
      </Route>
      {/* Isolated Aseo Mobile Portal */}
      <Route path="/aseo" element={<AseoMobilePage />} />

      {/* Inspector-Only View - SRL and Aseo Admin only */}
      <Route element={<InspectorLayout />}>
        <Route path="/inspector" element={<Navigate to="/inspector/srl" replace />} />
        <Route path="/inspector/srl" element={<SrlPage />} />
        <Route path="/inspector/aseo-admin" element={<AseoAdminPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  </HashRouter>
);
