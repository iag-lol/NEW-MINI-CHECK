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
import { CambiosDeDiaForm } from '../forms/CambiosDeDiaForm';
import { useCambiosDia, useAttendanceKPIs, useCreateCambioDia, useUpdateCambioDia, useAuthorize, useReject, useAttendanceRealtime } from '../hooks';
import { getDocumentUrl } from '../api';
import { AttendanceFilters, AUTH_STATUS_OPTIONS, CambioDia, CambioDiaFormValues } from '../types';

type ModalState =
    | { type: 'none' }
    | { type: 'create' }
    | { type: 'edit'; record: CambioDia }
    | { type: 'authorize'; record: CambioDia }
    | { type: 'reject'; record: CambioDia };

export const CambiosDeDiaPage = () => {
    const terminalContext = useTerminalStore((s) => s.context);
    const setTerminalContext = useTerminalStore((s) => s.setContext);
    const session = useSessionStore((s) => s.session);
    const supervisorName = session?.supervisorName ?? '';
    const canAuthorize = isAuthorizer(supervisorName);

    const [filters, setFilters] = useState<AttendanceFilters>({ auth_status: 'todos' });
    const [modal, setModal] = useState<ModalState>({ type: 'none' });

    const query = useCambiosDia(terminalContext, filters);
    const kpis = useAttendanceKPIs('cambios-dia', terminalContext);
    const createMutation = useCreateCambioDia();
    const updateMutation = useUpdateCambioDia();
    const authorizeMutation = useAuthorize();
    const rejectMutation = useReject();
    useAttendanceRealtime();

    const exportColumns = [
        { key: 'rut', header: 'RUT', value: (r: CambioDia) => formatRut(r.rut) },
        { key: 'nombre', header: 'Nombre', value: (r: CambioDia) => r.nombre },
        { key: 'terminal', header: 'Terminal', value: (r: CambioDia) => displayTerminal(r.terminal_code) },
        { key: 'cabezal', header: 'Cabezal', value: (r: CambioDia) => r.cabezal },
        { key: 'date', header: 'Fecha', value: (r: CambioDia) => r.date },
        { key: 'prog_start', header: 'Prog. Inicio', value: (r: CambioDia) => r.prog_start },
        { key: 'prog_end', header: 'Prog. Fin', value: (r: CambioDia) => r.prog_end },
        { key: 'reprogram_start', header: 'Reprog. Inicio', value: (r: CambioDia) => r.reprogram_start },
        { key: 'reprogram_end', header: 'Reprog. Fin', value: (r: CambioDia) => r.reprogram_end },
        { key: 'auth_status', header: 'Autorización', value: (r: CambioDia) => r.auth_status },
    ];

    const handleCreate = async (values: CambioDiaFormValues) => {
        await createMutation.mutateAsync({ values, createdBy: supervisorName });
        setModal({ type: 'none' });
    };

    const handleUpdate = async (values: CambioDiaFormValues) => {
        if (modal.type !== 'edit') return;
        await updateMutation.mutateAsync({ id: modal.record.id, values });
        setModal({ type: 'none' });
    };

    const handleAuthorize = async () => {
        if (modal.type !== 'authorize') return;
        const r = modal.record;
        await authorizeMutation.mutateAsync({
            subsection: 'cambios-dia',
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
            subsection: 'cambios-dia',
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

    const handleViewDocument = async (path: string) => {
        try {
            const url = await getDocumentUrl(path);
            window.open(url, '_blank');
        } catch (err) {
            console.error('Error getting document URL:', err);
        }
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
                title="Cambios de Día"
                description="Reprogramaciones de jornada laboral"
                actions={
                    <div className="flex gap-2">
                        <button className="btn btn-primary" onClick={() => setModal({ type: 'create' })}>
                            <Icon name="calendar" size={18} /> Nuevo Registro
                        </button>
                        <ExportMenu
                            onExportView={() => exportToXlsx({ filename: 'cambios_dia', sheetName: 'Datos', rows: query.data || [], columns: exportColumns })}
                            onExportAll={() => exportToXlsx({ filename: 'cambios_dia_all', sheetName: 'Datos', rows: query.data || [], columns: exportColumns })}
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
                                        <span className="text-xs text-slate-400 block">Documento</span>
                                        {row.document_path ? (
                                            <button onClick={() => handleViewDocument(row.document_path!)} className="text-brand-600 font-medium hover:underline flex items-center gap-1">
                                                <Icon name="image" size={14} /> Ver Doc
                                            </button>
                                        ) : <span className="text-slate-500">-</span>}
                                    </div>
                                    <div>
                                        <span className="text-xs text-slate-400 block">Programado</span>
                                        <span className="font-medium text-slate-700">{row.prog_start} - {row.prog_end}</span>
                                    </div>
                                    <div>
                                        <span className="text-xs text-slate-400 block text-brand-600">Reprogramado</span>
                                        <span className="font-bold text-brand-700">{row.reprogram_start} - {row.reprogram_end}</span>
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
                                    <th className="table-header-cell">Jornada Prog.</th>
                                    <th className="table-header-cell">Jornada Reprog.</th>
                                    <th className="table-header-cell">Doc</th>
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
                                        <td className="table-cell text-xs">{row.prog_start} - {row.prog_end}</td>
                                        <td className="table-cell text-xs">{row.reprogram_start} - {row.reprogram_end}</td>
                                        <td className="table-cell">
                                            {row.document_path ? (
                                                <button onClick={() => handleViewDocument(row.document_path!)} className="text-brand-600 hover:underline">
                                                    <Icon name="image" size={16} />
                                                </button>
                                            ) : '-'}
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
                                ))}
                            </tbody>
                        </table>
                    </div>
                </>
            )}

            {(modal.type === 'create' || modal.type === 'edit') && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setModal({ type: 'none' })} />
                    <div className="relative w-full max-w-4xl card p-6 max-h-[90vh] overflow-y-auto animate-scale-in">
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="text-xl font-bold">{modal.type === 'create' ? 'Nuevo Registro' : 'Editar Registro'}</h3>
                            <button onClick={() => setModal({ type: 'none' })} className="text-slate-400 hover:text-slate-600"><Icon name="x" size={24} /></button>
                        </div>
                        <CambiosDeDiaForm
                            initialData={modal.type === 'edit' ? { ...modal.record, cabezal: modal.record.cabezal ?? '', prog_start: modal.record.prog_start ?? '', prog_end: modal.record.prog_end ?? '', reprogram_start: modal.record.reprogram_start ?? '', reprogram_end: modal.record.reprogram_end ?? '', day_off_date: modal.record.day_off_date ?? '', day_off_start: modal.record.day_off_start ?? '', day_off_end: modal.record.day_off_end ?? '', day_on_date: modal.record.day_on_date ?? '', day_on_start: modal.record.day_on_start ?? '', day_on_end: modal.record.day_on_end ?? '', document: null } : undefined}
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
