import { useStaffCounts } from '../hooks';
import { TerminalContext } from '../../../shared/types/terminal';
import { STAFF_CARGOS, StaffCargo } from '../types';
import { displayTerminal } from '../../../shared/utils/terminal';
import { Icon, IconName } from '../../../shared/components/common/Icon';

interface Props {
    terminalContext: TerminalContext;
}

const getCargoIcon = (cargo: StaffCargo): IconName => {
    const icons: Record<StaffCargo, IconName> = {
        conductor: 'calendar',
        inspector_patio: 'clipboard',
        cleaner: 'check-circle',
        planillero: 'layers',
        supervisor: 'users',
    };
    return icons[cargo] || 'users';
};

const getCargoLabel = (cargo: StaffCargo): string => {
    return STAFF_CARGOS.find((c) => c.value === cargo)?.label || cargo;
};

export const StaffCounters = ({ terminalContext }: Props) => {
    const { data: counts, isLoading } = useStaffCounts(terminalContext);

    if (isLoading) {
        return (
            <div className="space-y-4 mb-6">
                <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3">
                    {[...Array(5)].map((_, i) => (
                        <div key={i} className="card p-4 animate-pulse">
                            <div className="flex items-center gap-2 mb-3">
                                <div className="h-8 w-8 bg-slate-200 rounded-lg flex-shrink-0" />
                                <div className="h-3 bg-slate-200 rounded w-20" />
                            </div>
                            <div className="h-9 bg-slate-200 rounded w-16 mb-3" />
                            <div className="space-y-1.5">
                                <div className="h-3 bg-slate-100 rounded w-full" />
                                <div className="h-3 bg-slate-100 rounded w-full" />
                                <div className="h-3 bg-slate-100 rounded w-full" />
                            </div>
                            <div className="h-1.5 bg-slate-100 rounded-full mt-3" />
                        </div>
                    ))}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3">
                    {[...Array(4)].map((_, i) => (
                        <div key={i} className="card px-4 py-3 animate-pulse">
                            <div className="flex items-center gap-3">
                                <div className="h-9 w-9 bg-slate-200 rounded-xl flex-shrink-0" />
                                <div className="space-y-1.5">
                                    <div className="h-3 bg-slate-200 rounded w-20" />
                                    <div className="h-5 bg-slate-100 rounded w-10" />
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    if (!counts) return null;

    const showErLr =
        terminalContext.mode === 'ALL' ||
        (terminalContext.mode === 'TERMINAL' &&
            (terminalContext.value === 'EL_ROBLE' || terminalContext.value === 'LA_REINA'));

    return (
        <div className="w-full min-w-0 space-y-5 mb-6">
            {/* Counters by Cargo */}
            <div>
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">
                    Personal por Cargo{showErLr ? ' · ER-LR' : ''}
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3">
                    {counts.byCargo.map((item) => {
                        const effective = item.effective_count;
                        const hasQuota = !!item.max_q;
                        const isOverQ = hasQuota && effective > item.max_q!;
                        const pct = hasQuota ? Math.min((effective / item.max_q!) * 100, 100) : 0;

                        return (
                            <div
                                key={item.cargo}
                                className={`card p-4 flex flex-col gap-3 ${
                                    isOverQ
                                        ? 'border-red-200 bg-red-50/60'
                                        : hasQuota
                                        ? 'border-green-200 bg-green-50/40'
                                        : ''
                                }`}
                            >
                                {/* Icon + Label */}
                                <div className="flex items-center gap-2 min-w-0">
                                    <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg ${
                                        isOverQ ? 'bg-red-100' : 'bg-slate-100'
                                    }`}>
                                        <Icon
                                            name={getCargoIcon(item.cargo)}
                                            size={15}
                                            className={isOverQ ? 'text-red-500' : 'text-slate-500'}
                                        />
                                    </div>
                                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest leading-tight truncate">
                                        {getCargoLabel(item.cargo)}
                                    </span>
                                </div>

                                {/* Main count */}
                                <div className="flex items-baseline gap-1.5">
                                    <span className={`text-3xl font-extrabold leading-none tabular-nums ${
                                        isOverQ
                                            ? 'text-red-600'
                                            : hasQuota
                                            ? 'text-green-600'
                                            : 'text-slate-800'
                                    }`}>
                                        {effective}
                                    </span>
                                    {hasQuota && (
                                        <span className="text-sm font-semibold text-slate-400">
                                            / {item.max_q}
                                        </span>
                                    )}
                                </div>

                                {/* Breakdown — always same structure for uniform card height */}
                                <div className="flex flex-col gap-1 text-[11px]">
                                    <div className="flex justify-between text-slate-500">
                                        <span>Total</span>
                                        <span className="font-semibold text-slate-700 tabular-nums">{item.count}</span>
                                    </div>
                                    <div className="flex justify-between text-slate-500">
                                        <span>Suspendidos</span>
                                        <span className={`font-semibold tabular-nums ${
                                            item.suspended > 0 ? 'text-amber-600' : 'text-slate-700'
                                        }`}>
                                            {item.suspended}
                                        </span>
                                    </div>
                                    <div className="flex justify-between pt-1 border-t border-slate-100">
                                        <span className="font-semibold text-slate-600">Efectivo</span>
                                        <span className="font-bold text-slate-800 tabular-nums">{effective}</span>
                                    </div>
                                </div>

                                {/* Progress bar — always present */}
                                <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                    {hasQuota ? (
                                        <div
                                            className={`h-full rounded-full transition-all duration-500 ${
                                                isOverQ ? 'bg-red-500' : 'bg-green-500'
                                            }`}
                                            style={{ width: `${pct}%` }}
                                        />
                                    ) : (
                                        <div className="h-full w-full bg-slate-200 rounded-full" />
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Counters by Terminal */}
            <div>
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">
                    Personal por Terminal
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3">
                    {counts.byTerminal.map((item) => (
                        <div key={item.terminal_code} className="card px-4 py-3 flex items-center gap-3">
                            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-slate-100">
                                <Icon name="building" size={16} className="text-slate-500" />
                            </div>
                            <div className="min-w-0">
                                <p className="text-[11px] font-medium text-slate-500 truncate">
                                    {displayTerminal(item.terminal_code)}
                                </p>
                                <p className="text-xl font-bold text-slate-800 leading-tight tabular-nums">
                                    {item.count}
                                </p>
                            </div>
                        </div>
                    ))}
                    <div className="card px-4 py-3 flex items-center gap-3 bg-brand-50 border-brand-200">
                        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-brand-100">
                            <Icon name="users" size={16} className="text-brand-600" />
                        </div>
                        <div>
                            <p className="text-[11px] font-semibold text-brand-600">Total</p>
                            <p className="text-xl font-bold text-brand-700 leading-tight tabular-nums">
                                {counts.total}
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
