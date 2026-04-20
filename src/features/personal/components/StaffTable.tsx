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

const StatusBadge = ({ isOffboarded, isSuspended }: { isOffboarded: boolean; isSuspended: boolean }) => (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
        isOffboarded
            ? 'bg-red-100 text-red-700'
            : isSuspended
            ? 'bg-amber-100 text-amber-700'
            : 'bg-green-100 text-green-700'
    }`}>
        <span className={`h-1.5 w-1.5 rounded-full ${
            isOffboarded ? 'bg-red-500' : isSuspended ? 'bg-amber-500' : 'bg-green-500'
        }`} />
        {isOffboarded ? 'Desvinculado' : isSuspended ? 'Suspendido' : 'Activo'}
    </span>
);

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
            {/* ── MOBILE / TABLET — Cards (< 1024px) ─────────────────── */}
            <div className="lg:hidden space-y-3">
                {staff.map((row) => {
                    const isOffboarded = row.status === 'DESVINCULADO';
                    const isSuspended = row.suspended;

                    return (
                        <div
                            key={row.id}
                            className={`card overflow-hidden ${
                                isOffboarded
                                    ? 'border-red-200'
                                    : isSuspended
                                    ? 'border-amber-200'
                                    : 'border-slate-200'
                            }`}
                        >
                            {/* Coloured top bar */}
                            <div className={`h-1 w-full ${
                                isOffboarded ? 'bg-red-400' : isSuspended ? 'bg-amber-400' : 'bg-green-400'
                            }`} />

                            <div className="p-4">
                                {/* Row 1: Name + Badge */}
                                <div className="flex items-start justify-between gap-3 mb-3">
                                    <div className="min-w-0">
                                        <p className={`font-bold text-base leading-snug truncate ${
                                            isSuspended ? 'line-through text-slate-400' : 'text-slate-900'
                                        }`}>
                                            {row.nombre}
                                        </p>
                                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                            <span className="font-mono text-[11px] font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                                                {formatRut(row.rut)}
                                            </span>
                                            {row.admonition_count > 0 && (
                                                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                                                    ⚠ {row.admonition_count} amones.
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <StatusBadge isOffboarded={isOffboarded} isSuspended={isSuspended} />
                                </div>

                                {/* Row 2: Info fields */}
                                <div className="grid grid-cols-2 gap-x-4 gap-y-2 mb-3">
                                    <InfoRow icon="briefcase" label="Cargo" value={getCargoLabel(row.cargo)} />
                                    <InfoRow icon="building" label="Terminal" value={displayTerminal(row.terminal_code)} />
                                    <InfoRow icon="clock" label="Horario" value={`${row.horario} · ${row.turno}`} />
                                    <InfoRow
                                        icon="phone"
                                        label="Contacto"
                                        value={
                                            <a href={`tel:${row.contacto}`} className="hover:text-brand-600 hover:underline">
                                                {row.contacto}
                                            </a>
                                        }
                                    />
                                </div>

                                {/* Row 3: Actions */}
                                {!isOffboarded ? (
                                    <div className="grid grid-cols-4 gap-2 pt-3 border-t border-slate-100">
                                        <ActionBtn
                                            icon="clipboard"
                                            label="Editar"
                                            color="brand"
                                            onClick={() => onEdit(row)}
                                        />
                                        {!isSuspended ? (
                                            <ActionBtn
                                                icon="x-circle"
                                                label="Suspender"
                                                color="amber"
                                                onClick={() => onSuspend(row)}
                                            />
                                        ) : (
                                            <ActionBtn
                                                icon="check-circle"
                                                label="Reactivar"
                                                color="green"
                                                onClick={() => onUnsuspend(row)}
                                            />
                                        )}
                                        <ActionBtn
                                            icon="megaphone"
                                            label="Alertar"
                                            color="orange"
                                            onClick={() => onAdmonish(row)}
                                        />
                                        <ActionBtn
                                            icon="logout"
                                            label="Baja"
                                            color="red"
                                            onClick={() => onOffboard(row)}
                                        />
                                    </div>
                                ) : (
                                    <div className="pt-3 border-t border-slate-100">
                                        <p className="text-xs text-red-500 font-medium text-center">
                                            Desvinculado el{' '}
                                            {row.terminated_at
                                                ? new Date(row.terminated_at).toLocaleDateString('es-CL')
                                                : '—'}
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* ── DESKTOP — Table (≥ 1024px) ──────────────────────────── */}
            <div className="hidden lg:block table-container">
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
                                    className={`table-row ${
                                        isOffboarded
                                            ? 'bg-red-50 hover:bg-red-100'
                                            : isSuspended
                                            ? 'bg-amber-50/50 text-slate-500'
                                            : ''
                                    }`}
                                >
                                    <td className="table-cell font-mono text-sm">{formatRut(row.rut)}</td>
                                    <td className="table-cell">
                                        <div className="flex items-center gap-2">
                                            <span className={`font-medium ${
                                                isSuspended ? 'line-through text-slate-400' : 'text-slate-900'
                                            }`}>
                                                {row.nombre}
                                            </span>
                                            {isSuspended && (
                                                <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                                                    ⏸ Suspendido
                                                </span>
                                            )}
                                            {row.admonition_count > 0 && (
                                                <span
                                                    className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700"
                                                    title={`${row.admonition_count} amonestación(es)`}
                                                >
                                                    ⚠ {row.admonition_count}
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
                                        <StatusBadge isOffboarded={isOffboarded} isSuspended={isSuspended} />
                                    </td>
                                    <td className="table-cell">
                                        <div className="flex items-center justify-end gap-1">
                                            {!isOffboarded && (
                                                <>
                                                    <button
                                                        onClick={() => onEdit(row)}
                                                        className="btn btn-ghost btn-icon text-slate-500 hover:text-brand-600"
                                                        title="Editar"
                                                    >
                                                        <Icon name="clipboard" size={16} />
                                                    </button>
                                                    {!isSuspended ? (
                                                        <button
                                                            onClick={() => onSuspend(row)}
                                                            className="btn btn-ghost btn-icon text-slate-500 hover:text-amber-600"
                                                            title="Suspender temporalmente"
                                                        >
                                                            <Icon name="x-circle" size={16} />
                                                        </button>
                                                    ) : (
                                                        <button
                                                            onClick={() => onUnsuspend(row)}
                                                            className="btn btn-ghost btn-icon text-amber-600 hover:text-green-600"
                                                            title="Reactivar"
                                                        >
                                                            <Icon name="check-circle" size={16} />
                                                        </button>
                                                    )}
                                                    <button
                                                        onClick={() => onAdmonish(row)}
                                                        className="btn btn-ghost btn-icon text-slate-500 hover:text-orange-600"
                                                        title="Amonestar"
                                                    >
                                                        <Icon name="megaphone" size={16} />
                                                    </button>
                                                    <button
                                                        onClick={() => onOffboard(row)}
                                                        className="btn btn-ghost btn-icon text-slate-500 hover:text-red-600"
                                                        title="Desvincular"
                                                    >
                                                        <Icon name="logout" size={16} />
                                                    </button>
                                                </>
                                            )}
                                            {isOffboarded && (
                                                <span className="text-xs text-red-500 font-medium">
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

// ── Small helpers ──────────────────────────────────────────────────────────────

interface InfoRowProps {
    icon: string;
    label: string;
    value: React.ReactNode;
}

const InfoRow = ({ icon, value }: InfoRowProps) => (
    <div className="flex items-start gap-2 min-w-0">
        <Icon name={icon as any} size={14} className="text-slate-400 shrink-0 mt-0.5" />
        <span className="text-xs text-slate-600 leading-snug truncate">{value}</span>
    </div>
);

type ActionColor = 'brand' | 'amber' | 'green' | 'orange' | 'red';

interface ActionBtnProps {
    icon: string;
    label: string;
    color: ActionColor;
    onClick: () => void;
}

const colorMap: Record<ActionColor, string> = {
    brand:  'bg-slate-50 text-slate-600 hover:bg-indigo-50 hover:text-indigo-600',
    amber:  'bg-slate-50 text-slate-600 hover:bg-amber-50 hover:text-amber-600',
    green:  'bg-amber-50 text-amber-600 hover:bg-green-50 hover:text-green-600',
    orange: 'bg-slate-50 text-slate-600 hover:bg-orange-50 hover:text-orange-600',
    red:    'bg-slate-50 text-slate-600 hover:bg-red-50 hover:text-red-600',
};

const ActionBtn = ({ icon, label, color, onClick }: ActionBtnProps) => (
    <button
        onClick={onClick}
        className={`flex flex-col items-center justify-center gap-1 rounded-xl py-2.5 transition-colors ${colorMap[color]}`}
    >
        <Icon name={icon as any} size={17} />
        <span className="text-[10px] font-semibold leading-none">{label}</span>
    </button>
);
