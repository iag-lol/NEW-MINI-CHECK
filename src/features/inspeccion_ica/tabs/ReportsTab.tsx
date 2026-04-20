import { Icon } from '../../../shared/components/common/Icon';
import { IconName } from '../../../shared/components/common/Icon';
import { A18_CONDICIONES, CondicionId } from '../types';
import { useInspecciones } from '../hooks';

const daysAgo = (n: number) => {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d.toISOString().slice(0, 10);
};

export const ReportsTab = () => {
    const { data = [], isLoading } = useInspecciones({ fechaDesde: daysAgo(30) });

    const total = data.length;
    const cumple = data.filter((r) => r.resultado === 'CUMPLE').length;
    const noCumple = total - cumple;
    const pct = total > 0 ? Math.round((cumple / total) * 100) : 0;

    const condicionStats = A18_CONDICIONES.map((c) => {
        const fails = data.filter((r) => r.condiciones?.[c.id as CondicionId]?.cumple === false).length;
        return {
            id: c.id,
            label: c.label,
            fails,
            pct: total > 0 ? Math.round((fails / total) * 100) : 0,
        };
    });

    if (isLoading) {
        return (
            <div className="flex justify-center py-20">
                <Icon name="loader" size={28} className="animate-spin text-blue-600" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* KPI row */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <KpiCard
                    label="Inspecciones (30d)"
                    value={String(total)}
                    icon="clipboard"
                    iconBg="bg-blue-50"
                    iconColor="text-blue-600"
                />
                <KpiCard
                    label="Cumplimiento"
                    value={`${pct}%`}
                    icon="check-circle"
                    iconBg="bg-emerald-50"
                    iconColor="text-emerald-600"
                />
                <KpiCard
                    label="CUMPLE"
                    value={String(cumple)}
                    icon="check"
                    iconBg="bg-emerald-50"
                    iconColor="text-emerald-600"
                />
                <KpiCard
                    label="NO CUMPLE"
                    value={String(noCumple)}
                    icon="x-circle"
                    iconBg="bg-red-50"
                    iconColor="text-red-600"
                />
            </div>

            {/* Condition breakdown */}
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/60">
                    <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                        <Icon name="bar-chart" size={15} className="text-blue-600" />
                        Incumplimientos por Condición (últimos 30 días)
                    </h3>
                </div>
                <div className="p-6 space-y-5">
                    {condicionStats.map((c, idx) => (
                        <div key={c.id} className="space-y-1.5">
                            <div className="flex justify-between items-start gap-4">
                                <span className="text-sm text-slate-700 flex-1 leading-tight">
                                    <span className="font-bold text-slate-400 mr-2">#{idx + 1}</span>
                                    {c.label}
                                </span>
                                <span className="text-sm font-bold text-slate-700 flex-shrink-0">
                                    {c.fails} falla{c.fails !== 1 ? 's' : ''} ({c.pct}%)
                                </span>
                            </div>
                            <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-red-400 rounded-full transition-all duration-700"
                                    style={{ width: `${c.pct}%` }}
                                />
                            </div>
                        </div>
                    ))}
                    {total === 0 && (
                        <div className="py-8 text-center">
                            <Icon name="bar-chart" size={32} className="text-slate-200 mx-auto mb-2" />
                            <p className="text-sm text-slate-500">Sin datos en los últimos 30 días.</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Cumplimiento summary */}
            {total > 0 && (
                <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6">
                    <h3 className="text-sm font-semibold text-slate-800 mb-4">
                        Resultado Global
                    </h3>
                    <div className="flex items-center gap-4">
                        <div className="flex-1 h-4 bg-slate-100 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-emerald-500 rounded-full transition-all duration-700"
                                style={{ width: `${pct}%` }}
                            />
                        </div>
                        <div className="flex gap-4 text-sm flex-shrink-0">
                            <span className="flex items-center gap-1.5 font-semibold text-emerald-700">
                                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
                                CUMPLE {pct}%
                            </span>
                            <span className="flex items-center gap-1.5 font-semibold text-red-600">
                                <span className="w-2.5 h-2.5 rounded-full bg-red-400 inline-block" />
                                NO CUMPLE {100 - pct}%
                            </span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

interface KpiCardProps {
    label: string;
    value: string;
    icon: IconName;
    iconBg: string;
    iconColor: string;
}

const KpiCard = ({ label, value, icon, iconBg, iconColor }: KpiCardProps) => (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-3 ${iconBg}`}>
            <Icon name={icon} size={18} className={iconColor} />
        </div>
        <div className="text-2xl font-bold text-slate-900">{value}</div>
        <div className="text-xs text-slate-500 mt-0.5">{label}</div>
    </div>
);
