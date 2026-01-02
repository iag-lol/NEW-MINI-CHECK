import { StaffViewModel, STAFF_CARGOS } from '../types';
import { formatRut } from '../utils/rutUtils';
import { displayTerminal } from '../../../shared/utils/terminal';
import { Icon } from '../../../shared/components/common/Icon';

interface Props {
    staff: StaffViewModel[];
    onEdit: (staff: StaffViewModel) => void;
    onOffboard: (staff: StaffViewModel) => void;
    onAdmonish: (staff: StaffViewModel) => void;
    onSuspend: (staff: StaffViewModel) => void;
    onUnsuspend: (staff: StaffViewModel) => void;
}

const getCargoLabel = (cargo: string): string => {
    return STAFF_CARGOS.find((c) => c.value === cargo)?.label || cargo;
};

export const StaffTable = ({ staff, onEdit, onOffboard, onAdmonish, onSuspend, onUnsuspend }: Props) => {
    if (!staff.length) {
        return (
            <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/50 px-6 py-12 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 mb-4">
                    <Icon name="users" size={28} className="text-slate-400" />
                </div>
                <p className="text-sm font-semibold text-slate-700">No hay personal registrado</p>
                <p className="mt-1 text-xs text-slate-500 max-w-xs">
                    Comienza agregando trabajadores con el botón "Nuevo Trabajador"
                </p>
            </div>
        );
    }

    return (
        <>
            {/* Mobile View - Cards */}
            <div className="md:hidden space-y-4">
                {staff.map((row) => {
                    const isOffboarded = row.status === 'DESVINCULADO';
                    const isSuspended = row.suspended;

                    return (
                        <div key={row.id} className={`card p-5 border-l-4 ${isOffboarded ? 'border-l-danger-500' : isSuspended ? 'border-l-warning-500' : 'border-l-success-500'}`}>
                            {/* Header: Name & Status */}
                            <div className="flex justify-between items-start gap-3 mb-4">
                                <div>
                                    <h3 className={`font-bold text-lg leading-tight ${isSuspended ? 'line-through decoration-slate-400 text-slate-500' : 'text-slate-900'}`}>
                                        {row.nombre}
                                    </h3>
                                    <div className="flex items-center gap-2 mt-1">
                                        <span className="font-mono text-xs font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                                            {formatRut(row.rut)}
                                        </span>
                                        {row.admonition_count > 0 && (
                                            <span className="badge badge-warning text-[10px] px-1.5 py-0.5" title="Amonestaciones">
                                                ⚠️ {row.admonition_count}
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <span className={`badge ${isOffboarded ? 'badge-danger' : isSuspended ? 'badge-warning' : 'badge-success'} shrink-0`}>
                                    {isOffboarded ? 'DESVINCULADO' : isSuspended ? 'SUSPENDIDO' : 'ACTIVO'}
                                </span>
                            </div>

                            {/* Info Grid */}
                            <div className="grid grid-cols-2 gap-y-3 gap-x-2 text-sm text-slate-600 mb-4">
                                <div className="flex items-center gap-2">
                                    <Icon name="briefcase" size={16} className="text-slate-400 shrink-0" />
                                    <span className="font-medium">{getCargoLabel(row.cargo)}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Icon name="building" size={16} className="text-slate-400 shrink-0" />
                                    <span>{displayTerminal(row.terminal_code)}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Icon name="clock" size={16} className="text-slate-400 shrink-0" />
                                    <span>{row.horario} ({row.turno})</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Icon name="phone" size={16} className="text-slate-400 shrink-0" />
                                    <a href={`tel:${row.contacto}`} className="hover:text-brand-600 hover:underline">{row.contacto}</a>
                                </div>
                            </div>

                            {/* Actions Grid */}
                            {!isOffboarded && (
                                <div className="grid grid-cols-4 gap-2 pt-4 border-t border-slate-100">
                                    <button
                                        onClick={() => onEdit(row)}
                                        className="flex flex-col items-center justify-center gap-1 py-2 rounded-lg bg-slate-50 text-slate-600 hover:bg-brand-50 hover:text-brand-600 transition-colors"
                                    >
                                        <Icon name="clipboard" size={18} />
                                        <span className="text-[10px] font-semibold">Editar</span>
                                    </button>
                                    {!isSuspended ? (
                                        <button
                                            onClick={() => onSuspend(row)}
                                            className="flex flex-col items-center justify-center gap-1 py-2 rounded-lg bg-slate-50 text-slate-600 hover:bg-yellow-50 hover:text-yellow-600 transition-colors"
                                        >
                                            <Icon name="x-circle" size={18} />
                                            <span className="text-[10px] font-semibold">Suspender</span>
                                        </button>
                                    ) : (
                                        <button
                                            onClick={() => onUnsuspend(row)}
                                            className="flex flex-col items-center justify-center gap-1 py-2 rounded-lg bg-yellow-50 text-yellow-600 hover:bg-green-50 hover:text-green-600 transition-colors"
                                        >
                                            <Icon name="check-circle" size={18} />
                                            <span className="text-[10px] font-semibold">Reactivar</span>
                                        </button>
                                    )}
                                    <button
                                        onClick={() => onAdmonish(row)}
                                        className="flex flex-col items-center justify-center gap-1 py-2 rounded-lg bg-slate-50 text-slate-600 hover:bg-orange-50 hover:text-orange-600 transition-colors"
                                    >
                                        <Icon name="megaphone" size={18} />
                                        <span className="text-[10px] font-semibold">Alertar</span>
                                    </button>
                                    <button
                                        onClick={() => onOffboard(row)}
                                        className="flex flex-col items-center justify-center gap-1 py-2 rounded-lg bg-slate-50 text-slate-600 hover:bg-red-50 hover:text-red-600 transition-colors"
                                    >
                                        <Icon name="logout" size={18} />
                                        <span className="text-[10px] font-semibold">Baja</span>
                                    </button>
                                </div>
                            )}
                            {isOffboarded && (
                                <div className="pt-3 border-t border-slate-100 text-center">
                                    <p className="text-xs text-danger-600 italic">
                                        Desvinculado el {row.terminated_at ? new Date(row.terminated_at).toLocaleDateString('es-CL') : ''}
                                    </p>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Desktop View - Table */}
            <div className="hidden md:block table-container">
                <table className="table">
                    <thead className="table-header">
                        <tr>
                            <th scope="col" className="table-header-cell">RUT</th>
                            <th scope="col" className="table-header-cell">Nombre</th>
                            <th scope="col" className="table-header-cell">Cargo</th>
                            <th scope="col" className="table-header-cell">Terminal</th>
                            <th scope="col" className="table-header-cell">Turno</th>
                            <th scope="col" className="table-header-cell">Horario</th>
                            <th scope="col" className="table-header-cell">Contacto</th>
                            <th scope="col" className="table-header-cell">Estado</th>
                            <th scope="col" className="table-header-cell text-right">Acciones</th>
                        </tr>
                    </thead>
                    <tbody className="table-body">
                        {staff.map((row) => {
                            const isOffboarded = row.status === 'DESVINCULADO';
                            const isSuspended = row.suspended;

                            return (
                                <tr
                                    key={row.id}
                                    className={`table-row ${isOffboarded
                                        ? 'bg-danger-50 hover:bg-danger-100'
                                        : isSuspended
                                            ? 'bg-yellow-50/50 text-slate-500'
                                            : ''
                                        }`}
                                >
                                    <td className="table-cell font-mono text-sm">{formatRut(row.rut)}</td>
                                    <td className="table-cell">
                                        <div className="flex items-center gap-2">
                                            <span className={`font-medium ${isSuspended ? 'line-through decoration-slate-400 text-slate-500' : 'text-slate-900'
                                                }`}>
                                                {row.nombre}
                                            </span>
                                            {isSuspended && (
                                                <span className="badge badge-warning text-xs" title="Trabajador suspendido temporalmente">
                                                    ⏸️ Suspendido
                                                </span>
                                            )}
                                            {row.admonition_count > 0 && (
                                                <span
                                                    className="badge badge-warning text-xs"
                                                    title={`${row.admonition_count} amonestación(es)`}
                                                >
                                                    ⚠️ {row.admonition_count}
                                                </span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="table-cell">{getCargoLabel(row.cargo)}</td>
                                    <td className="table-cell">{displayTerminal(row.terminal_code)}</td>
                                    <td className="table-cell">{row.turno}</td>
                                    <td className="table-cell font-mono text-xs">{row.horario}</td>
                                    <td className="table-cell text-sm">{row.contacto}</td>
                                    <td className="table-cell">
                                        <span
                                            className={`badge ${isOffboarded ? 'badge-danger' : isSuspended ? 'badge-warning' : 'badge-success'}`}
                                        >
                                            {isOffboarded ? 'DESVINCULADO' : isSuspended ? 'SUSPENDIDO' : 'ACTIVO'}
                                        </span>
                                    </td>
                                    <td className="table-cell">
                                        <div className="flex items-center justify-end gap-1">
                                            {!isOffboarded && (
                                                <>
                                                    <button
                                                        onClick={() => onEdit(row)}
                                                        className="btn btn-ghost btn-icon text-slate-600 hover:text-brand-600"
                                                        title="Modificar"
                                                    >
                                                        <Icon name="clipboard" size={16} />
                                                    </button>
                                                    {!isSuspended ? (
                                                        <button
                                                            onClick={() => onSuspend(row)}
                                                            className="btn btn-ghost btn-icon text-slate-600 hover:text-yellow-600"
                                                            title="Suspender temporalmente"
                                                        >
                                                            <Icon name="x-circle" size={16} />
                                                        </button>
                                                    ) : (
                                                        <button
                                                            onClick={() => onUnsuspend(row)}
                                                            className="btn btn-ghost btn-icon text-yellow-600 hover:text-green-600"
                                                            title="Reactivar"
                                                        >
                                                            <Icon name="check-circle" size={16} />
                                                        </button>
                                                    )}
                                                    <button
                                                        onClick={() => onAdmonish(row)}
                                                        className="btn btn-ghost btn-icon text-slate-600 hover:text-warning-600"
                                                        title="Amonestar"
                                                    >
                                                        <Icon name="megaphone" size={16} />
                                                    </button>
                                                    <button
                                                        onClick={() => onOffboard(row)}
                                                        className="btn btn-ghost btn-icon text-slate-600 hover:text-danger-600"
                                                        title="Desvincular"
                                                    >
                                                        <Icon name="logout" size={16} />
                                                    </button>
                                                </>
                                            )}
                                            {isOffboarded && (
                                                <span className="text-xs text-danger-600">
                                                    {row.terminated_at
                                                        ? new Date(row.terminated_at).toLocaleDateString('es-CL')
                                                        : 'Desvinculado'}
                                                </span>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </>
    );
};
