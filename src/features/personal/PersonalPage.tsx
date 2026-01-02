import { useState } from 'react';
import { PageHeader } from '../../shared/components/common/PageHeader';
import { FiltersBar } from '../../shared/components/common/FiltersBar';
import { LoadingState } from '../../shared/components/common/LoadingState';
import { ErrorState } from '../../shared/components/common/ErrorState';
import { ExportMenu } from '../../shared/components/common/ExportMenu';
import { useTerminalStore } from '../../shared/state/terminalStore';
import { exportToXlsx } from '../../shared/utils/exportToXlsx';
import { displayTerminal } from '../../shared/utils/terminal';
import { formatRut } from './utils/rutUtils';
import { Icon } from '../../shared/components/common/Icon';

// Components
import { StaffCounters } from './components/StaffCounters';
import { StaffTable } from './components/StaffTable';
import { StaffForm } from './components/StaffForm';
import { OffboardModal } from './components/OffboardModal';
import { AdmonishModal } from './components/AdmonishModal';

// Hooks
import {
  useStaffList,
  useCreateStaff,
  useUpdateStaff,
  useOffboardStaff,
  useSuspendStaff,
  useUnsuspendStaff,
  useCreateAdmonition,
  useStaffRealtime,
} from './hooks';

// Types
import {
  StaffFilters,
  StaffFormValues,
  StaffViewModel,
  STAFF_CARGOS,
  STAFF_STATUS_OPTIONS,
} from './types';

type ModalState =
  | { type: 'none' }
  | { type: 'create' }
  | { type: 'edit'; staff: StaffViewModel }
  | { type: 'offboard'; staff: StaffViewModel }
  | { type: 'admonish'; staff: StaffViewModel };

export const PersonalPage = () => {
  const terminalContext = useTerminalStore((state) => state.context);
  const setTerminalContext = useTerminalStore((state) => state.setContext);
  const [filters, setFilters] = useState<StaffFilters>({ status: 'todos', cargo: 'todos' });
  const [modalState, setModalState] = useState<ModalState>({ type: 'none' });

  // Queries
  const staffQuery = useStaffList(terminalContext, filters);

  // Mutations
  const createMutation = useCreateStaff();
  const updateMutation = useUpdateStaff();
  const offboardMutation = useOffboardStaff();
  const suspendMutation = useSuspendStaff();
  const unsuspendMutation = useUnsuspendStaff();
  const admonitionMutation = useCreateAdmonition();

  // Realtime subscription
  useStaffRealtime(terminalContext);

  // Export columns - COMPLETE export with all fields
  const exportColumns = [
    { key: 'rut', header: 'RUT', value: (row: StaffViewModel) => formatRut(row.rut) },
    { key: 'nombre', header: 'NOMBRE', value: (row: StaffViewModel) => row.nombre },
    { key: 'cargo', header: 'CARGO', value: (row: StaffViewModel) => row.cargo },
    { key: 'terminal_code', header: 'TERMINAL', value: (row: StaffViewModel) => displayTerminal(row.terminal_code) },
    { key: 'turno', header: 'TURNO', value: (row: StaffViewModel) => row.turno },
    { key: 'horario', header: 'HORARIO', value: (row: StaffViewModel) => row.horario },
    { key: 'contacto', header: 'CONTACTO', value: (row: StaffViewModel) => row.contacto },
    { key: 'email', header: 'CORREO', value: (row: StaffViewModel) => row.email || '' },
    { key: 'talla_polera', header: 'TALLA_POLERA', value: (row: StaffViewModel) => row.talla_polera || '' },
    { key: 'talla_chaqueta', header: 'TALLA_CHAQUETA', value: (row: StaffViewModel) => row.talla_chaqueta || '' },
    { key: 'talla_pantalon', header: 'TALLA_PANTALON', value: (row: StaffViewModel) => row.talla_pantalon || '' },
    { key: 'talla_zapato_seguridad', header: 'TALLA_ZAPATO_SEGURIDAD', value: (row: StaffViewModel) => row.talla_zapato_seguridad || '' },
    { key: 'talla_chaleco_reflectante', header: 'TALLA_CHALECO_REFLECTANTE', value: (row: StaffViewModel) => row.talla_chaleco_reflectante || '' },
    { key: 'status', header: 'ESTADO', value: (row: StaffViewModel) => row.status },
    { key: 'terminated_at', header: 'FECHA_DESVINCULACION', value: (row: StaffViewModel) => row.terminated_at ? new Date(row.terminated_at).toLocaleDateString('es-CL') : '' },
    { key: 'termination_comment', header: 'COMENTARIO_DESVINCULACION', value: (row: StaffViewModel) => row.termination_comment || '' },
  ];

  const handleExportView = () => {
    if (!staffQuery.data) return;
    exportToXlsx({
      filename: 'personal_vista',
      sheetName: 'Personal',
      rows: staffQuery.data,
      columns: exportColumns,
    });
  };

  const handleExportAll = () => {
    if (!staffQuery.data) return;
    exportToXlsx({
      filename: 'personal_completo',
      sheetName: 'Personal',
      rows: staffQuery.data,
      columns: exportColumns,
    });
  };

  const handleCreate = async (values: StaffFormValues) => {
    try {
      await createMutation.mutateAsync(values);
      setModalState({ type: 'none' });
    } catch (error) {
      console.error('Error creating staff:', error);
      alert(error instanceof Error ? error.message : 'Error al crear trabajador');
    }
  };

  const handleUpdate = async (values: StaffFormValues) => {
    if (modalState.type !== 'edit') return;
    try {
      await updateMutation.mutateAsync({ id: modalState.staff.id, values });
      setModalState({ type: 'none' });
    } catch (error) {
      console.error('Error updating staff:', error);
      alert(error instanceof Error ? error.message : 'Error al actualizar trabajador');
    }
  };

  const handleOffboard = async (comment: string) => {
    if (modalState.type !== 'offboard') return;
    try {
      await offboardMutation.mutateAsync({ id: modalState.staff.id, comment });
      setModalState({ type: 'none' });
    } catch (error) {
      console.error('Error offboarding staff:', error);
      alert(error instanceof Error ? error.message : 'Error al desvincular trabajador');
    }
  };

  const handleAdmonish = async (reason: string, date: string, file: File) => {
    if (modalState.type !== 'admonish') return;
    try {
      await admonitionMutation.mutateAsync({
        staffId: modalState.staff.id,
        reason,
        admonitionDate: date,
        file,
      });
      setModalState({ type: 'none' });
    } catch (error) {
      console.error('Error creating admonition:', error);
      alert(error instanceof Error ? error.message : 'Error al registrar amonestación');
    }
  };

  const handleSuspend = async (staff: StaffViewModel) => {
    if (!confirm(`¿Suspender temporalmente a ${staff.nombre}?`)) return;
    try {
      await suspendMutation.mutateAsync(staff.id);
    } catch (error) {
      console.error('Error suspending staff:', error);
      alert(error instanceof Error ? error.message : 'Error al suspender trabajador');
    }
  };

  const handleUnsuspend = async (staff: StaffViewModel) => {
    try {
      await unsuspendMutation.mutateAsync(staff.id);
    } catch (error) {
      console.error('Error unsuspending staff:', error);
      alert(error instanceof Error ? error.message : 'Error al reactivar trabajador');
    }
  };

  const closeModal = () => setModalState({ type: 'none' });

  return (
    <div className="space-y-4">
      <PageHeader
        title="Personal"
        description="Gestión del equipo operativo por terminal."
        actions={
          <div className="flex gap-2">
            <button
              className="btn btn-primary"
              onClick={() => setModalState({ type: 'create' })}
            >
              <Icon name="users" size={18} />
              Nuevo Trabajador
            </button>
            <ExportMenu onExportView={handleExportView} onExportAll={handleExportAll} />
          </div>
        }
      />

      {/* Counters Dashboard */}
      <StaffCounters terminalContext={terminalContext} />

      {/* Filters */}
      <FiltersBar terminalContext={terminalContext} onTerminalChange={setTerminalContext}>
        <div className="w-full sm:w-auto flex flex-col gap-1">
          <label className="label">Estado</label>
          <select
            className="input w-full"
            value={filters.status}
            onChange={(e) =>
              setFilters((prev) => ({
                ...prev,
                status: e.target.value as StaffFilters['status'],
              }))
            }
          >
            {STAFF_STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <div className="w-full sm:w-auto flex flex-col gap-1">
          <label className="label">Cargo</label>
          <select
            className="input w-full"
            value={filters.cargo || 'todos'}
            onChange={(e) =>
              setFilters((prev) => ({
                ...prev,
                cargo: e.target.value as StaffFilters['cargo'],
              }))
            }
          >
            <option value="todos">Todos</option>
            {STAFF_CARGOS.map((cargo) => (
              <option key={cargo.value} value={cargo.value}>
                {cargo.label}
              </option>
            ))}
          </select>
        </div>
        <div className="w-full sm:w-auto flex flex-col gap-1 flex-grow">
          <label className="label">Buscar</label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
              <Icon name="search" size={16} />
            </div>
            <input
              className="input pl-10 w-full"
              placeholder="RUT o nombre..."
              value={filters.search ?? ''}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, search: e.target.value }))
              }
            />
          </div>
        </div>
      </FiltersBar>

      {/* Data Table */}
      {staffQuery.isLoading && <LoadingState label="Cargando personal..." />}
      {staffQuery.isError && <ErrorState onRetry={() => staffQuery.refetch()} />}
      {!staffQuery.isLoading && !staffQuery.isError && (
        <StaffTable
          staff={staffQuery.data || []}
          onEdit={(staff) => setModalState({ type: 'edit', staff })}
          onOffboard={(staff) => setModalState({ type: 'offboard', staff })}
          onAdmonish={(staff) => setModalState({ type: 'admonish', staff })}
          onSuspend={handleSuspend}
          onUnsuspend={handleUnsuspend}
        />
      )}

      {/* Modals */}
      {(modalState.type === 'create' || modalState.type === 'edit') && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={closeModal}
          />
          <div className="relative w-full max-w-2xl card p-6 animate-scale-in max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-slate-900">
                {modalState.type === 'create' ? 'Nuevo Trabajador' : 'Editar Trabajador'}
              </h3>
              <button onClick={closeModal} className="text-slate-400 hover:text-slate-600">
                <Icon name="x" size={24} />
              </button>
            </div>
            <StaffForm
              initialData={modalState.type === 'edit' ? modalState.staff : null}
              onSubmit={modalState.type === 'create' ? handleCreate : handleUpdate}
              onCancel={closeModal}
              isLoading={createMutation.isPending || updateMutation.isPending}
            />
          </div>
        </div>
      )}

      {modalState.type === 'offboard' && (
        <OffboardModal
          staffName={modalState.staff.nombre}
          onConfirm={handleOffboard}
          onCancel={closeModal}
          isLoading={offboardMutation.isPending}
        />
      )}

      {modalState.type === 'admonish' && (
        <AdmonishModal
          staffName={modalState.staff.nombre}
          onConfirm={handleAdmonish}
          onCancel={closeModal}
          isLoading={admonitionMutation.isPending}
        />
      )}
    </div>
  );
};
