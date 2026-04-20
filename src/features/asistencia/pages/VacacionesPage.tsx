import { useState } from 'react';
import { PageHeader } from '../../../shared/components/common/PageHeader';
import { FiltersBar } from '../../../shared/components/common/FiltersBar';
import { LoadingState } from '../../../shared/components/common/LoadingState';
import { ErrorState } from '../../../shared/components/common/ErrorState';
import { ExportMenu } from '../../../shared/components/common/ExportMenu';
import { Icon } from '../../../shared/components/common/Icon';
import { useTerminalStore } from '../../../shared/state/terminalStore';
import { useSessionStore } from '../../../shared/state/sessionStore';
import { exportToXlsx } from '../../../shared/utils/exportToXlsx';
import { displayTerminal } from '../../../shared/utils/terminal';
import { formatRut } from '../../personal/utils/rutUtils';
import { isAuthorizer } from '../utils/authorizers';
import { AttendanceKPIs } from '../components/AttendanceKPIs';
import { AuthorizeRejectModal } from '../components/AuthorizeRejectModal';
import { VacacionesCalendar } from '../components/VacacionesCalendar';
import { VacacionesForm } from '../forms/VacacionesForm';
import { useVacaciones, useAttendanceKPIs, useCreateVacacion, useUpdateVacacion, useAuthorize, useReject, useAttendanceRealtime } from '../hooks';
import { AttendanceFilters, AUTH_STATUS_OPTIONS, Vacacion, VacacionFormValues } from '../types';

type ModalState =
    | { type: 'none' }
    | { type: 'create' }
    | { type: 'edit'; record: Vacacion }
    | { type: 'authorize'; record: Vacacion }
    | { type: 'reject'; record: Vacacion };

export const VacacionesPage = () => {
    const terminalContext = useTerminalStore((s) => s.context);
    const setTerminalContext = useTerminalStore((s) => s.setContext);
    const session = useSessionStore((s) => s.session);
    const supervisorName = session?.supervisorName ?? '';
    const canAuthorize = isAuthorizer(supervisorName);

    const [filters, setFilters] = useState<AttendanceFilters>({ auth_status: 'todos' });
    const [modal, setModal] = useState<ModalState>({ type: 'none' });
    const [showCalendar, setShowCalendar] = useState(false);

    const query = useVacaciones(terminalContext, filters);
    const kpis = useAttendanceKPIs('vacaciones', terminalContext);
    const createMutation = useCreateVacacion();
    const updateMutation = useUpdateVacacion();
    const authorizeMutation = useAuthorize();
    const rejectMutation = useReject();
    useAttendanceRealtime();

    const exportColumns = [
        { key: 'rut', header: 'RUT', value: (r: Vacacion) => formatRut(r.rut) },
        { key: 'nombre', header: 'Nombre', value: (r: Vacacion) => r.nombre },
        { key: 'cargo', header: 'Cargo', value: (r: Vacacion) => r.cargo },
        { key: 'terminal', header: 'Terminal', value: (r: Vacacion) => displayTerminal(r.terminal_code) },
        { key: 'turno', header: 'Turno', value: (r: Vacacion) => r.turno },
        { key: 'start_date', header: 'Fecha Inicio', value: (r: Vacacion) => r.start_date },
        { key: 'end_date', header: 'Fecha Término', value: (r: Vacacion) => r.end_date },
        { key: 'return_date', header: 'Fecha Vuelta', value: (r: Vacacion) => r.return_date },
        { key: 'calendar_days', header: 'Días Calendario', value: (r: Vacacion) => r.calendar_days.toString() },
        { key: 'business_days', header: 'Días Hábiles', value: (r: Vacacion) => r.business_days.toString() },
        { key: 'has_conflict', header: 'Conflicto', value: (r: Vacacion) => r.has_conflict ? 'Sí' : 'No' },
        { key: 'auth_status', header: 'Estado', value: (r: Vacacion) => r.auth_status },
    ];

    const handleCreate = async (values: VacacionFormValues) => {
        await createMutation.mutateAsync({ values, createdBy: supervisorName });
        setModal({ type: 'none' });
    };

    const handleUpdate = async (values: VacacionFormValues) => {
        if (modal.type !== 'edit') return;
        await updateMutation.mutateAsync({ id: modal.record.id, values });
        setModal({ type: 'none' });
    };

    const handleAuthorize = async () => {
        if (modal.type !== 'authorize') return;
        const r = modal.record;
        await authorizeMutation.mutateAsync({
            subsection: 'vacaciones',
            id: r.id,
            authorizedBy: supervisorName,
            rut: r.rut,
            nombre: r.nombre,
            terminal: r.terminal_code,
            date: r.start_date,
        });
        setModal({ type: 'none' });
    };

    const handleReject = async (reason?: string) => {
        if (modal.type !== 'reject' || !reason) return;
        const r = modal.record;
        await rejectMutation.mutateAsync({
            subsection: 'vacaciones',
            id: r.id,
            authorizedBy: supervisorName,
            reason,
            rut: r.rut,
            nombre: r.nombre,
            terminal: r.terminal_code,
            date: r.start_date,
        });
        setModal({ type: 'none' });
    };

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'AUTORIZADO': return <span className="badge badge-success">{status}</span>;
            case 'RECHAZADO': return <span className="badge badge-danger">{status}</span>;
            default: return <span className="badge badge-warning">{status}</span>;
        }
    };

    const formatDateShort = (date: string) => {
        const d = new Date(date + 'T12:00:00');
        return d.toLocaleDateString('es-CL', { day: '2-digit', month: 'short' });
    };

    return (
        <div className="space-y-4">
            <PageHeader
                title="Vacaciones"
                description="Gestión inteligente de vacaciones con detección de conflictos"
                actions={
                    <div className="flex flex-wrap items-center gap-2">
                        <button className="btn btn-secondary" onClick={() => setShowCalendar(true)}>
                            <Icon name="calendar" size={16} />
                            <span>Calendario</span>
                        </button>
                        <button className="btn btn-primary" onClick={() => setModal({ type: 'create' })}>
                            <Icon name="plus" size={16} />
                            <span>Nueva Solicitud</span>
                        </button>
                        <ExportMenu
                            onExportView={() => exportToXlsx({ filename: 'vacaciones', sheetName: 'Datos', rows: query.data || [], columns: exportColumns })}
                            onExportAll={() => exportToXlsx({ filename: 'vacaciones_all', sheetName: 'Datos', rows: query.data || [], columns: exportColumns })}
                        />
                    </div>
                }
            />

            <AttendanceKPIs data={kpis.data} isLoading={kpis.isLoading} />

            <FiltersBar terminalContext={terminalContext} onTerminalChange={setTerminalContext}>
                <div className="flex flex-col gap-1">
                    <label className="label">Estado</label>
                    <select className="input" value={filters.auth_status}
                        onChange={(e) => setFilters((prev) => ({ ...prev, auth_status: e.target.value as any }))}>
                        {AUTH_STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                </div>
                <div className="flex flex-col gap-1">
                    <label className="label">Buscar</label>
                    <input className="input" placeholder="RUT o nombre" value={filters.search ?? ''}
                        onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))} />
                </div>
            </FiltersBar>

            {query.isLoading && <LoadingState label="Cargando vacaciones..." />}
            {query.isError && <ErrorState onRetry={() => query.refetch()} />}
            {!query.isLoading && !query.isError && (

                <>
                    {/* Mobile View - Cards */}
                    <div className="md:hidden space-y-4">
                        {(query.data || []).length === 0 ? (
                            <div className="text-center text-slate-500 py-8 bg-slate-50 rounded-lg">
                                No hay solicitudes de vacaciones registradas
                            </div>
                        ) : (
                            (query.data || []).map((row) => (
                                <div key={row.id} className="bg-white rounded-xl shadow-sm border p-4 space-y-3">
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <div className="font-bold text-slate-800">{row.nombre}</div>
                                            <div className="text-xs text-slate-500 font-mono">{formatRut(row.rut)}</div>
                                            <div className="flex items-center gap-1 mt-1 text-xs text-brand-600">
                                                <span>{row.cargo}</span>
                                                <span>•</span>
                                                <span>{row.turno}</span>
                                            </div>
                                        </div>
                                        <div className="flex flex-col items-end gap-1">
                                            {getStatusBadge(row.auth_status)}
                                            <div className="text-xs text-slate-500 font-medium">
                                                {row.calendar_days} días
                                            </div>
                                        </div>
                                    </div>

                                    <div className="bg-slate-50 rounded-lg p-3 grid grid-cols-2 gap-3 text-sm">
                                        <div>
                                            <span className="text-xs text-slate-400 block mb-0.5">Desde</span>
                                            <span className="font-semibold text-slate-700">{formatDateShort(row.start_date)}</span>
                                        </div>
                                        <div>
                                            <span className="text-xs text-slate-400 block mb-0.5">Hasta</span>
                                            <span className="font-semibold text-slate-700">{formatDateShort(row.end_date)}</span>
                                        </div>
                                        <div>
                                            <span className="text-xs text-slate-400 block mb-0.5">Vuelta</span>
                                            <span className="font-semibold text-brand-700">{formatDateShort(row.return_date)}</span>
                                        </div>
                                        <div>
                                            <span className="text-xs text-slate-400 block mb-0.5">Días Hábiles</span>
                                            <span className="font-bold text-slate-800">{row.business_days}</span>
                                        </div>
                                    </div>

                                    {/* Conflict Warning */}
                                    {row.has_conflict ? (
                                        <div className={`p-2 rounded text-xs flex items-center gap-2 ${row.conflict_authorized ? 'bg-amber-50 text-amber-700 border border-amber-100' : 'bg-red-50 text-red-700 border border-red-100'}`}>
                                            <Icon name="alert-triangle" size={14} />
                                            <span className="font-medium">Conflicto de turno ({row.conflict_authorized ? 'Autorizado' : 'Sin autorizar'})</span>
                                        </div>
                                    ) : (
                                        <div className="p-2 rounded text-xs flex items-center gap-2 bg-green-50 text-green-700 border border-green-100">
                                            <Icon name="check-circle" size={14} />
                                            <span className="font-medium">Sin conflicto de turno</span>
                                        </div>
                                    )}

                                    <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                                        {row.auth_status === 'PENDIENTE' && (
                                            <button
                                                onClick={() => setModal({ type: 'edit', record: row })}
                                                className="px-3 py-1.5 bg-slate-100 text-slate-600 rounded-lg text-sm font-medium hover:bg-slate-200 transition-colors flex items-center gap-1"
                                            >
                                                <Icon name="clipboard" size={16} /> Editar
                                            </button>
                                        )}
                                        {canAuthorize && row.auth_status === 'PENDIENTE' && (
                                            <>
                                                <button
                                                    onClick={() => setModal({ type: 'authorize', record: row })}
                                                    className="px-3 py-1.5 bg-success-50 text-success-700 rounded-lg text-sm font-medium hover:bg-success-100 transition-colors flex items-center gap-1"
                                                >
                                                    <Icon name="check-circle" size={16} /> Aprobar
                                                </button>
                                                <button
                                                    onClick={() => setModal({ type: 'reject', record: row })}
                                                    className="px-3 py-1.5 bg-danger-50 text-danger-700 rounded-lg text-sm font-medium hover:bg-danger-100 transition-colors flex items-center gap-1"
                                                >
                                                    <Icon name="x" size={16} /> Rechazar
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>

                    {/* Desktop View - Table */}
                    <div className="hidden md:block table-container overflow-x-auto">
                        <table className="table">
                            <thead className="table-header">
                                <tr>
                                    <th className="table-header-cell">RUT</th>
                                    <th className="table-header-cell">Nombre</th>
                                    <th className="table-header-cell">Cargo/Turno</th>
                                    <th className="table-header-cell">Período</th>
                                    <th className="table-header-cell text-center">Días</th>
                                    <th className="table-header-cell">Conflicto</th>
                                    <th className="table-header-cell">Estado</th>
                                    <th className="table-header-cell text-right">Acciones</th>
                                </tr>
                            </thead>
                            <tbody className="table-body">
                                {(query.data || []).length === 0 ? (
                                    <tr>
                                        <td colSpan={8} className="table-cell text-center text-slate-500 py-8">
                                            No hay solicitudes de vacaciones registradas
                                        </td>
                                    </tr>
                                ) : (
                                    (query.data || []).map((row) => (
                                        <tr key={row.id} className="table-row">
                                            <td className="table-cell font-mono text-sm">{formatRut(row.rut)}</td>
                                            <td className="table-cell font-medium">{row.nombre}</td>
                                            <td className="table-cell">
                                                <div className="text-sm">{row.cargo}</div>
                                                <div className="text-xs text-slate-500">{row.turno}</div>
                                            </td>
                                            <td className="table-cell">
                                                <div className="text-sm">
                                                    {formatDateShort(row.start_date)} - {formatDateShort(row.end_date)}
                                                </div>
                                                <div className="text-xs text-slate-500">
                                                    Vuelta: {formatDateShort(row.return_date)}
                                                </div>
                                            </td>
                                            <td className="table-cell text-center">
                                                <div className="text-lg font-bold text-brand-600">{row.business_days}</div>
                                                <div className="text-xs text-slate-500">{row.calendar_days} cal</div>
                                            </td>
                                            <td className="table-cell">
                                                {row.has_conflict ? (
                                                    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${row.conflict_authorized ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
                                                        <Icon name="alert-triangle" size={12} />
                                                        {row.conflict_authorized ? 'Autorizado' : 'Sin autorizar'}
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-green-100 text-green-700">
                                                        <Icon name="check-circle" size={12} />
                                                        Sin conflicto
                                                    </span>
                                                )}
                                            </td>
                                            <td className="table-cell">{getStatusBadge(row.auth_status)}</td>
                                            <td className="table-cell">
                                                <div className="flex items-center justify-end gap-1">
                                                    {row.auth_status === 'PENDIENTE' && (
                                                        <button onClick={() => setModal({ type: 'edit', record: row })} className="btn btn-ghost btn-icon" title="Editar">
                                                            <Icon name="clipboard" size={16} />
                                                        </button>
                                                    )}
                                                    {canAuthorize && row.auth_status === 'PENDIENTE' && (
                                                        <>
                                                            <button onClick={() => setModal({ type: 'authorize', record: row })} className="btn btn-ghost btn-icon text-success-600" title="Autorizar">
                                                                <Icon name="check-circle" size={16} />
                                                            </button>
                                                            <button onClick={() => setModal({ type: 'reject', record: row })} className="btn btn-ghost btn-icon text-danger-600" title="Rechazar">
                                                                <Icon name="x" size={16} />
                                                            </button>
                                                        </>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </>
            )}

            {(modal.type === 'create' || modal.type === 'edit') && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setModal({ type: 'none' })} />
                    <div className="relative w-full max-w-3xl card p-6 max-h-[90vh] overflow-y-auto animate-scale-in">
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="text-xl font-bold">{modal.type === 'create' ? 'Nueva Solicitud de Vacaciones' : 'Editar Solicitud'}</h3>
                            <button onClick={() => setModal({ type: 'none' })} className="text-slate-400 hover:text-slate-600"><Icon name="x" size={24} /></button>
                        </div>
                        <VacacionesForm
                            initialData={modal.type === 'edit' ? modal.record : undefined}
                            onSubmit={modal.type === 'create' ? handleCreate : handleUpdate}
                            onCancel={() => setModal({ type: 'none' })}
                            isLoading={createMutation.isPending || updateMutation.isPending}
                        />
                    </div>
                </div>
            )}

            {modal.type === 'authorize' && (
                <AuthorizeRejectModal mode="authorize" itemName={modal.record.nombre}
                    onConfirm={handleAuthorize} onCancel={() => setModal({ type: 'none' })} isLoading={authorizeMutation.isPending} />
            )}

            {modal.type === 'reject' && (
                <AuthorizeRejectModal mode="reject" itemName={modal.record.nombre}
                    onConfirm={handleReject} onCancel={() => setModal({ type: 'none' })} isLoading={rejectMutation.isPending} />
            )}

            <VacacionesCalendar
                isOpen={showCalendar}
                onClose={() => setShowCalendar(false)}
                vacaciones={query.data || []}
            />
        </div>
    );
};
