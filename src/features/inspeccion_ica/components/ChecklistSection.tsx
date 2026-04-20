import { Icon } from '../../../shared/components/common/Icon';
import { A18_CONDICIONES, CondicionesMap, CondicionId, DetalleCondicion } from '../types';

interface Props {
    condiciones: CondicionesMap;
    onChange: (id: CondicionId, cumple: boolean, obs: string) => void;
}

export const ChecklistSection = ({ condiciones, onChange }: Props) => {
    const evaluated = A18_CONDICIONES.filter((c) => condiciones[c.id]?.cumple !== null).length;

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between px-1">
                <h3 className="text-base font-semibold text-slate-800">
                    Puntos de Control — Norma A18
                </h3>
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-blue-50 text-blue-700">
                    {evaluated}/{A18_CONDICIONES.length} evaluadas
                </span>
            </div>

            {A18_CONDICIONES.map((condicion, idx) => (
                <CondicionCard
                    key={condicion.id}
                    index={idx + 1}
                    label={condicion.label}
                    descripcion={condicion.descripcion}
                    detalle={condiciones[condicion.id]}
                    onChange={(cumple, obs) => onChange(condicion.id, cumple, obs)}
                />
            ))}
        </div>
    );
};

interface CondicionCardProps {
    index: number;
    label: string;
    descripcion: string;
    detalle: DetalleCondicion;
    onChange: (cumple: boolean, obs: string) => void;
}

const CondicionCard = ({ index, label, descripcion, detalle, onChange }: CondicionCardProps) => {
    const isCumple = detalle?.cumple === true;
    const isNoCumple = detalle?.cumple === false;

    const borderColor = isCumple
        ? 'border-l-emerald-500'
        : isNoCumple
            ? 'border-l-red-500'
            : 'border-l-slate-200';

    const bgColor = isCumple
        ? 'bg-emerald-50/40'
        : isNoCumple
            ? 'bg-red-50/40'
            : 'bg-white';

    return (
        <div
            className={`rounded-2xl border border-slate-200 border-l-4 ${borderColor} ${bgColor} shadow-sm transition-all duration-300`}
        >
            <div className="p-4 sm:p-5">
                <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                    {/* Number + Label */}
                    <div className="flex-1 flex items-start gap-3">
                        <span
                            className={`flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-full text-xs font-bold ${isCumple
                                ? 'bg-emerald-100 text-emerald-700'
                                : isNoCumple
                                    ? 'bg-red-100 text-red-700'
                                    : 'bg-slate-100 text-slate-600'
                                }`}
                        >
                            {index}
                        </span>
                        <div>
                            <p className="text-sm font-semibold text-slate-800 leading-snug">{label}</p>
                            {descripcion && (
                                <p className="text-xs text-slate-500 mt-0.5">{descripcion}</p>
                            )}
                        </div>
                    </div>

                    {/* Buttons */}
                    <div className="flex gap-2 flex-shrink-0">
                        <button
                            onClick={() => onChange(true, '')}
                            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${isCumple
                                ? 'bg-emerald-500 text-white shadow-md shadow-emerald-200 scale-105'
                                : 'bg-white border border-slate-200 text-slate-600 hover:border-emerald-300 hover:text-emerald-700 hover:bg-emerald-50'
                                }`}
                        >
                            <Icon name="check" size={14} />
                            CUMPLE
                        </button>
                        <button
                            onClick={() => onChange(false, detalle?.observacion ?? '')}
                            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${isNoCumple
                                ? 'bg-red-500 text-white shadow-md shadow-red-200 scale-105'
                                : 'bg-white border border-slate-200 text-slate-600 hover:border-red-300 hover:text-red-700 hover:bg-red-50'
                                }`}
                        >
                            <Icon name="x-circle" size={14} />
                            NO CUMPLE
                        </button>
                    </div>
                </div>

                {/* Observation textarea */}
                {isNoCumple && (
                    <div className="mt-4 pt-4 border-t border-red-100">
                        <label className="flex items-center gap-1.5 text-xs font-semibold text-red-700 mb-1.5">
                            <Icon name="alert-circle" size={12} />
                            Observación (requerida)
                        </label>
                        <textarea
                            value={detalle?.observacion ?? ''}
                            onChange={(e) => onChange(false, e.target.value)}
                            placeholder="Describa el incumplimiento detectado..."
                            rows={2}
                            className="w-full px-3 py-2 text-sm rounded-xl border border-red-200 bg-white focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400 placeholder:text-slate-400 text-slate-700 resize-none"
                        />
                    </div>
                )}
            </div>
        </div>
    );
};
