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
import { NoMarcacionesForm } from '../forms/NoMarcacionesForm';
import { useNoMarcaciones, useAttendanceKPIs, useCreateNoMarcacion, useUpdateNoMarcacion, useAuthorize, useReject, useAttendanceRealtime } from '../hooks';
import { AttendanceFilters, AUTH_STATUS_OPTIONS, NoMarcacion, NoMarcacionFormValues } from '../types';

type ModalState =
    | { type: 'none' }
    | { type: 'create' }
    | { type: 'edit'; record: NoMarcacion }
    | { type: 'authorize'; record: NoMarcacion }
    | { type: 'reject'; record: NoMarcacion };

export const NoMarcacionesPage = () => {
    const terminalContext = useTerminalStore((s) => s.context);
    const setTerminalContext = useTerminalStore((s) => s.setContext);
    const session = useSessionStore((s) => s.session);
    const supervisorName = session?.supervisorName ?? '';
    const canAuthorize = isAuthorizer(supervisorName);

    const [filters, setFilters] = useState<AttendanceFilters>({ auth_status: 'todos' });
    const [modal, setModal] = useState<ModalState>({ type: 'none' });

    const query = useNoMarcaciones(terminalContext, filters);
    const kpis = useAttendanceKPIs('no-marcaciones', terminalContext);
    const createMutation = useCreateNoMarcacion();
    const updateMutation = useUpdateNoMarcacion();
    const authorizeMutation = useAuthorize();
    const rejectMutation = useReject();
    useAttendanceRealtime();

    const exportColumns = [
        { key: 'rut', header: 'RUT', value: (r: NoMarcacion) => formatRut(r.rut) },
        { key: 'nombre', header: 'Nombre', value: (r: NoMarcacion) => r.nombre },
        { key: 'area', header: 'Área', value: (r: NoMarcacion) => r.area },
        { key: 'cargo', header: 'Cargo', value: (r: NoMarcacion) => r.cargo },
        { key: 'jefe_terminal', header: 'Jefe Terminal', value: (r: NoMarcacion) => r.jefe_terminal },
        { key: 'terminal', header: 'Terminal', value: (r: NoMarcacion) => displayTerminal(r.terminal_code) },
        { key: 'cabezal', header: 'Cabezal', value: (r: NoMarcacion) => r.cabezal },
        { key: 'incident_state', header: 'Estado', value: (r: NoMarcacion) => r.incident_state },
        { key: 'date', header: 'Fecha', value: (r: NoMarcacion) => r.date },
        { key: 'auth_status', header: 'Autorización', value: (r: NoMarcacion) => r.auth_status },
    ];

    const handleCreate = async (values: NoMarcacionFormValues) => {
        await createMutation.mutateAsync({ values, createdBy: supervisorName });
        setModal({ type: 'none' });
    };

    const handleUpdate = async (values: NoMarcacionFormValues) => {
        if (modal.type !== 'edit') return;
        await updateMutation.mutateAsync({ id: modal.record.id, values });
        setModal({ type: 'none' });
    };

    const handleAuthorize = async () => {
        if (modal.type !== 'authorize') return;
        const r = modal.record;
        await authorizeMutation.mutateAsync({
            subsection: 'no-marcaciones',
            id: r.id,
            authorizedBy: supervisorName,
            rut: r.rut,
            nombre: r.nombre,
            terminal: r.terminal_code,
            date: r.date,
        });
        setModal({ type: 'none' });
    };

    const handleReject = async (reason?: string) => {
        if (modal.type !== 'reject' || !reason) return;
        const r = modal.record;
        await rejectMutation.mutateAsync({
            subsection: 'no-marcaciones',
            id: r.id,
            authorizedBy: supervisorName,
            reason,
            rut: r.rut,
            nombre: r.nombre,
            terminal: r.terminal_code,
            date: r.date,
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

    return (
        <div className="space-y-4">
            <PageHeader
                title="No Marcaciones"
                description="Registros de no marcación de personal"
                actions={
                    <div className="flex gap-2">
                        <button className="btn btn-primary" onClick={() => setModal({ type: 'create' })}>
                            <Icon name="clipboard" size={18} /> Nuevo Registro
                        </button>
                        <ExportMenu
                            onExportView={() => exportToXlsx({ filename: 'no_marcaciones', sheetName: 'Datos', rows: query.data || [], columns: exportColumns })}
                            onExportAll={() => exportToXlsx({ filename: 'no_marcaciones_all', sheetName: 'Datos', rows: query.data || [], columns: exportColumns })}
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

            {query.isLoading && <LoadingState label="Cargando registros..." />}
            {query.isError && <ErrorState onRetry={() => query.refetch()} />}
            {!query.isLoading && !query.isError && (

                <>
                    {/* Mobile View - Cards */}
                    <div className="md:hidden space-y-4">
                        {(query.data || []).map((row) => (
                            <div key={row.id} className="bg-white rounded-xl shadow-sm border p-4 space-y-3">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <div className="font-bold text-slate-800">{row.nombre}</div>
                                        <div className="text-xs text-slate-500 font-mono">{formatRut(row.rut)}</div>
                                        <div className="text-xs text-brand-600 mt-1">{displayTerminal(row.terminal_code)}</div>
                                    </div>
                                    {getStatusBadge(row.auth_status)}
                                </div>

                                <div className="grid grid-cols-2 gap-2 text-sm border-t border-b border-slate-100 py-3">
                                    <div>
                                        <span className="text-xs text-slate-400 block">Fecha</span>
                                        <span className="font-medium text-slate-700">{row.date}</span>
                                    </div>
                                    <div>
                                        <span className="text-xs text-slate-400 block">Estado</span>
                                        <span className="font-medium text-slate-700">{row.incident_state || '-'}</span>
                                    </div>
                                    <div className="col-span-2">
                                        <span className="text-xs text-slate-400 block">Cabezal</span>
                                        <span className="font-medium text-slate-700">{row.cabezal || '-'}</span>
                                    </div>
                                </div>

                                <div className="flex justify-end gap-2">
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
                        ))}
                    </div>

                    {/* Desktop View - Table */}
                    <div className="hidden md:block table-container overflow-x-auto">
                        <table className="table">
                            <thead className="table-header">
                                <tr>
                                    <th className="table-header-cell">RUT</th>
                                    <th className="table-header-cell">Nombre</th>
                                    <th className="table-header-cell">Terminal</th>
                                    <th className="table-header-cell">Fecha</th>
                                    <th className="table-header-cell">Estado</th>
                                    <th className="table-header-cell">Autorización</th>
                                    <th className="table-header-cell text-right">Acciones</th>
                                </tr>
                            </thead>
                            <tbody className="table-body">
                                {(query.data || []).map((row) => (
                                    <tr key={row.id} className="table-row">
                                        <td className="table-cell font-mono text-sm">{formatRut(row.rut)}</td>
                                        <td className="table-cell font-medium">{row.nombre}</td>
                                        <td className="table-cell">{displayTerminal(row.terminal_code)}</td>
                                        <td className="table-cell">{row.date}</td>
                                        <td className="table-cell">{row.incident_state || '-'}</td>
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
                                ))}
                            </tbody>
                        </table>
                    </div>
                </>
            )}

            {/* Modals */}
            {(modal.type === 'create' || modal.type === 'edit') && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setModal({ type: 'none' })} />
                    <div className="relative w-full max-w-3xl card p-6 max-h-[90vh] overflow-y-auto animate-scale-in">
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="text-xl font-bold">{modal.type === 'create' ? 'Nuevo Registro' : 'Editar Registro'}</h3>
                            <button onClick={() => setModal({ type: 'none' })} className="text-slate-400 hover:text-slate-600"><Icon name="x" size={24} /></button>
                        </div>
                        <NoMarcacionesForm
                            initialData={modal.type === 'edit' ? { ...modal.record, area: modal.record.area ?? 'Logística', cargo: modal.record.cargo ?? '', jefe_terminal: modal.record.jefe_terminal ?? '', cabezal: modal.record.cabezal ?? '', incident_state: modal.record.incident_state ?? '', schedule_in_out: modal.record.schedule_in_out ?? '', time_range: modal.record.time_range ?? '', observations: modal.record.observations ?? '', informed_by: modal.record.informed_by ?? supervisorName } : undefined}
                            supervisorName={supervisorName}
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
        </div>
    );
};
