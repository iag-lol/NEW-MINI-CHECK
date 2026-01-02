/**
 * ShiftConfigModal - Modal for assigning shifts to staff
 * With proper error handling and success feedback
 */

import { useState, useEffect } from 'react';
import { Icon } from '../../../shared/components/common/Icon';
import { useShiftTypes, useStaffShift, useUpsertStaffShift, useSpecialTemplate, useUpsertSpecialTemplate } from '../hooks';
import { StaffWithShift, ShiftTypeCode, VariantCode, ShiftType, SpecialTemplateSettings } from '../types';

interface ShiftConfigModalProps {
    isOpen: boolean;
    onClose: () => void;
    staff: StaffWithShift | null;
    onSuccess?: () => void; // Callback to force refresh
}

const VARIANT_OPTIONS: { value: VariantCode; label: string }[] = [
    { value: 'PRINCIPAL', label: 'Turno Normal' },
    { value: 'CONTRATURNO', label: 'Contraturno' },
];

// Fallback shift types if DB doesn't have data
const FALLBACK_SHIFT_TYPES: ShiftType[] = [
    {
        id: '1',
        code: '5X2_FIJO',
        name: '5x2 Fijo',
        pattern_json: {
            type: 'fixed',
            description: 'Lunes a Viernes trabaja, Sábado y Domingo libre',
            offDays: [6, 0], // Saturday=6, Sunday=0
        },
        created_at: '',
    },
    {
        id: '2',
        code: '5X2_ROTATIVO',
        name: '5x2 Rotativo',
        pattern_json: {
            type: 'rotating',
            description: 'Semana 1: Miércoles+Domingo libre. Semana 2: Viernes+Sábado libre',
            cycle: 2,
            weeks: [
                { offDays: [3, 0] }, // Wed=3, Sun=0
                { offDays: [5, 6] }, // Fri=5, Sat=6
            ],
        },
        created_at: '',
    },
    {
        id: '3',
        code: '5X2_SUPER',
        name: '5x2 Super',
        pattern_json: {
            type: 'rotating',
            description: 'Semana 1: Miércoles+Domingo libre. Semana 2: Jueves+Viernes libre',
            cycle: 2,
            weeks: [
                { offDays: [3, 0] }, // Wed=3, Sun=0
                { offDays: [4, 5] }, // Thu=4, Fri=5
            ],
        },
        created_at: '',
    },
    {
        id: '4',
        code: 'ESPECIAL',
        name: 'Especial (Manual)',
        pattern_json: {
            type: 'manual',
            description: 'Plantilla de 28 días definida manualmente',
            cycleDays: 28,
        },
        created_at: '',
    },
];

type ConfigTab = 'OFF_DAYS' | 'SHIFT_TYPE' | 'EARLY_EXIT';

export const ShiftConfigModal = ({ isOpen, onClose, staff, onSuccess }: ShiftConfigModalProps) => {
    const { data: dbShiftTypes = [] } = useShiftTypes();
    const { data: currentShift } = useStaffShift(staff?.id ?? null);
    const { data: currentTemplate } = useSpecialTemplate(staff?.id ?? null);

    // Use DB types if available, otherwise fallback
    const shiftTypes = dbShiftTypes.length > 0 ? dbShiftTypes : FALLBACK_SHIFT_TYPES;

    const upsertShiftMutation = useUpsertStaffShift();
    const upsertTemplateMutation = useUpsertSpecialTemplate();

    const [selectedType, setSelectedType] = useState<ShiftTypeCode>('5X2_FIJO');
    const [selectedVariant, setSelectedVariant] = useState<VariantCode>('PRINCIPAL');
    const [specialOffDays, setSpecialOffDays] = useState<number[]>([]);
    const [dailyShifts, setDailyShifts] = useState<Record<number, 'DIA' | 'NOCHE'>>({});
    const [earlyExitEnabled, setEarlyExitEnabled] = useState(false);
    const [earlyExitDays, setEarlyExitDays] = useState<number[]>([]); // Array for multiple days
    const [earlyExitTime, setEarlyExitTime] = useState<string>('14:00');

    const [activeTab, setActiveTab] = useState<ConfigTab>('OFF_DAYS');

    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    // Initialize from current shift
    useEffect(() => {
        if (currentShift) {
            setSelectedType(currentShift.shift_type_code);
            setSelectedVariant(currentShift.variant_code);
        } else {
            setSelectedType('5X2_FIJO');
            setSelectedVariant('PRINCIPAL');
        }

        if (currentTemplate) {
            setSpecialOffDays(currentTemplate.off_days_json);

            // Load settings
            const settings = currentTemplate.settings_json;
            if (settings) {
                setDailyShifts(settings.daily_shifts || {});
                if (settings.early_exit) {
                    setEarlyExitEnabled(settings.early_exit.enabled);

                    // Handle new array format or legacy single value
                    if (settings.early_exit.days) {
                        setEarlyExitDays(settings.early_exit.days);
                    } else if (typeof settings.early_exit.day_of_week === 'number') {
                        setEarlyExitDays([settings.early_exit.day_of_week]);
                    } else {
                        setEarlyExitDays([5]); // Default Fri
                    }

                    setEarlyExitTime(settings.early_exit.time);
                } else {
                    setEarlyExitEnabled(false);
                    setEarlyExitDays([5]);
                }
            } else {
                setDailyShifts({});
                setEarlyExitEnabled(false);
                setEarlyExitDays([5]);
            }
        } else {
            setSpecialOffDays([]);
            setDailyShifts({});
            setEarlyExitEnabled(false);
            setEarlyExitDays([5]);
            setEarlyExitTime('14:00');
        }

        setError(null);
        setSuccess(false);
        setActiveTab('OFF_DAYS');
    }, [currentShift, currentTemplate, staff?.id]);

    if (!isOpen || !staff) return null;

    const handleSave = async () => {
        setError(null);
        setSuccess(false);

        try {
            console.log('Saving shift:', {
                staff_id: staff.id,
                shift_type_code: selectedType,
                variant_code: selectedVariant,
            });

            await upsertShiftMutation.mutateAsync({
                staff_id: staff.id,
                shift_type_code: selectedType,
                variant_code: selectedVariant,
                start_date: '2026-01-01',
            });

            // If ESPECIAL, also save the template with settings
            if (selectedType === 'ESPECIAL') {
                const settings: SpecialTemplateSettings = {
                    daily_shifts: dailyShifts,
                    early_exit: {
                        enabled: earlyExitEnabled,
                        days: earlyExitDays, // Save array
                        time: earlyExitTime
                    }
                };

                await upsertTemplateMutation.mutateAsync({
                    staffId: staff.id,
                    offDays: specialOffDays,
                    settings: settings
                });
            }

            setSuccess(true);

            // Call onSuccess callback to force parent refresh
            if (onSuccess) {
                onSuccess();
            }

            // Close after brief success display
            setTimeout(() => {
                onClose();
            }, 1000);

        } catch (err) {
            console.error('Error saving shift:', err);
            const message = err instanceof Error ? err.message : 'Error desconocido al guardar';
            setError(message);
        }
    };

    const toggleDayInTemplate = (day: number) => {
        setSpecialOffDays((prev) =>
            prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
        );
    };

    const toggleDailyShift = (day: number) => {
        setDailyShifts(prev => ({
            ...prev,
            [day]: prev[day] === 'NOCHE' ? 'DIA' : 'NOCHE'
        }));
    };

    const toggleEarlyExitDay = (day: number) => {
        setEarlyExitDays(prev =>
            prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
        );
    };

    const isLoading = upsertShiftMutation.isPending || upsertTemplateMutation.isPending;
    const selectedShiftType = shiftTypes.find((t) => t.code === selectedType);

    const getDaysDescription = () => {
        if (earlyExitDays.length === 0) return 'ningún día';
        const dayNames = ['Domingos', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábados'];
        const selectedNames = earlyExitDays.sort().map(d => dayNames[d]);
        if (selectedNames.length === 1) return selectedNames[0];
        const last = selectedNames.pop();
        return `${selectedNames.join(', ')} y ${last}`;
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
            <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b bg-gradient-to-r from-brand-600 to-brand-500 text-white rounded-t-xl shrink-0">
                    <div>
                        <h2 className="text-lg font-semibold">Configurar Turno</h2>
                        <p className="text-sm text-brand-100">{staff.nombre}</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-lg transition-colors">
                        <Icon name="x" size={20} />
                    </button>
                </div>

                {/* Error/Success messages */}
                {error && (
                    <div className="mx-4 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2 shrink-0">
                        <Icon name="alert-circle" size={18} className="text-red-600 mt-0.5" />
                        <div className="text-sm text-red-700">{error}</div>
                    </div>
                )}
                {success && (
                    <div className="mx-4 mt-4 p-3 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-2 shrink-0">
                        <Icon name="check-circle" size={18} className="text-emerald-600" />
                        <div className="text-sm text-emerald-700 font-medium">¡Turno guardado correctamente!</div>
                    </div>
                )}

                {/* Content */}
                <div className="p-4 space-y-6 overflow-y-auto">
                    {/* Current assignment info */}
                    {currentShift && (
                        <div className="p-3 bg-slate-50 rounded-lg border">
                            <div className="text-xs text-slate-500 mb-1">Turno actual asignado:</div>
                            <div className="font-medium text-slate-800">
                                {shiftTypes.find((t) => t.code === currentShift.shift_type_code)?.name || currentShift.shift_type_code}
                                {' - '}{currentShift.variant_code}
                            </div>
                        </div>
                    )}

                    {/* Shift Type Selection */}
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">
                            Tipo de Turno
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                            {shiftTypes.map((type) => (
                                <button
                                    key={type.code}
                                    onClick={() => setSelectedType(type.code)}
                                    className={`p-3 rounded-lg border text-left transition-all ${selectedType === type.code
                                        ? 'border-brand-500 bg-brand-50 text-brand-700 ring-2 ring-brand-500/30'
                                        : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                                        }`}
                                >
                                    <div className="font-medium text-sm">{type.name}</div>
                                    <div className="text-xs text-slate-500 mt-1">
                                        {type.pattern_json?.description || ''}
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Variant (for rotating types) */}
                    {(selectedType === '5X2_ROTATIVO' || selectedType === '5X2_SUPER') && (
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-2">
                                Variante (Semana de inicio)
                            </label>
                            <div className="flex gap-2">
                                {VARIANT_OPTIONS.map((opt) => (
                                    <button
                                        key={opt.value}
                                        onClick={() => setSelectedVariant(opt.value)}
                                        className={`flex-1 px-4 py-2 rounded-lg border text-sm font-medium transition-all ${selectedVariant === opt.value
                                            ? 'border-brand-500 bg-brand-50 text-brand-700 ring-2 ring-brand-500/30'
                                            : 'border-slate-200 hover:border-slate-300'
                                            }`}
                                    >
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Preview off days for standard types */}
                    {selectedShiftType && selectedType !== 'ESPECIAL' && (
                        <div className="p-3 bg-amber-50 rounded-lg border border-amber-200">
                            <div className="flex items-start gap-2">
                                <Icon name="calendar" size={16} className="text-amber-600 mt-0.5" />
                                <div>
                                    <div className="text-sm font-medium text-amber-800">Días Libres</div>
                                    <div className="text-xs text-amber-700">
                                        {getOffDaysDescription(selectedShiftType, selectedVariant)}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* MANUAL/ESPECIAL Advanced Config */}
                    {selectedType === 'ESPECIAL' && (
                        <div className="border rounded-xl overflow-hidden bg-slate-50">
                            {/* Tabs */}
                            <div className="flex text-sm border-b bg-white">
                                <button
                                    onClick={() => setActiveTab('OFF_DAYS')}
                                    className={`flex-1 py-3 px-4 font-medium transition-colors ${activeTab === 'OFF_DAYS'
                                        ? 'text-brand-600 border-b-2 border-brand-500 bg-brand-50/50'
                                        : 'text-slate-500 hover:bg-slate-50'
                                        }`}
                                >
                                    Días Libres
                                </button>
                                <button
                                    onClick={() => setActiveTab('SHIFT_TYPE')}
                                    className={`flex-1 py-3 px-4 font-medium transition-colors ${activeTab === 'SHIFT_TYPE'
                                        ? 'text-brand-600 border-b-2 border-brand-500 bg-brand-50/50'
                                        : 'text-slate-500 hover:bg-slate-50'
                                        }`}
                                >
                                    Turno D/N
                                </button>
                                <button
                                    onClick={() => setActiveTab('EARLY_EXIT')}
                                    className={`flex-1 py-3 px-4 font-medium transition-colors ${activeTab === 'EARLY_EXIT'
                                        ? 'text-brand-600 border-b-2 border-brand-500 bg-brand-50/50'
                                        : 'text-slate-500 hover:bg-slate-50'
                                        }`}
                                >
                                    Salida Temp.
                                </button>
                            </div>

                            <div className="p-4">
                                {/* TAB: OFF DAYS */}
                                {activeTab === 'OFF_DAYS' && (
                                    <div className="space-y-3">
                                        <p className="text-sm text-slate-600">
                                            Selecciona los días <strong>libres</strong> del ciclo de 28 días:
                                        </p>
                                        <div className="space-y-2 bg-white rounded-lg p-3 border shadow-sm">
                                            {[0, 1, 2, 3].map((week) => (
                                                <div key={week} className="flex items-center gap-2">
                                                    <span className="text-xs text-slate-500 w-12 font-medium">Sem {week + 1}</span>
                                                    <div className="flex gap-1 flex-1">
                                                        {[0, 1, 2, 3, 4, 5, 6].map((day) => {
                                                            const dayIndex = week * 7 + day;
                                                            const isOff = specialOffDays.includes(dayIndex);
                                                            const dayLabel = ['L', 'M', 'X', 'J', 'V', 'S', 'D'][day];

                                                            return (
                                                                <button
                                                                    key={dayIndex}
                                                                    onClick={() => toggleDayInTemplate(dayIndex)}
                                                                    className={`w-8 h-8 rounded-md text-xs font-bold transition-all ${isOff
                                                                        ? 'bg-slate-800 text-white shadow-sm ring-1 ring-slate-900'
                                                                        : 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                                                                        }`}
                                                                >
                                                                    {dayLabel}
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                        <div className="flex items-center gap-2 text-xs text-slate-500 justify-end">
                                            <span className="flex items-center gap-1"><span className="w-3 h-3 bg-emerald-100 rounded"></span> Trabajo</span>
                                            <span className="flex items-center gap-1"><span className="w-3 h-3 bg-slate-800 rounded"></span> Libre</span>
                                        </div>
                                    </div>
                                )}

                                {/* TAB: SHIFT D/N */}
                                {activeTab === 'SHIFT_TYPE' && (
                                    <div className="space-y-3">
                                        <p className="text-sm text-slate-600">
                                            Configura si es <strong>Día</strong> o <strong>Noche</strong> (solo días de trabajo):
                                        </p>
                                        <div className="space-y-2 bg-white rounded-lg p-3 border shadow-sm">
                                            {[0, 1, 2, 3].map((week) => (
                                                <div key={week} className="flex items-center gap-2">
                                                    <span className="text-xs text-slate-500 w-12 font-medium">Sem {week + 1}</span>
                                                    <div className="flex gap-1 flex-1">
                                                        {[0, 1, 2, 3, 4, 5, 6].map((day) => {
                                                            const dayIndex = week * 7 + day;
                                                            const isOff = specialOffDays.includes(dayIndex);
                                                            const type = dailyShifts[dayIndex] || 'DIA';
                                                            const dayLabel = ['L', 'M', 'X', 'J', 'V', 'S', 'D'][day];

                                                            if (isOff) {
                                                                return (
                                                                    <div key={dayIndex} className="w-8 h-8 flex items-center justify-center bg-slate-100 rounded-md text-slate-300 text-xs">
                                                                        -
                                                                    </div>
                                                                );
                                                            }

                                                            return (
                                                                <button
                                                                    key={dayIndex}
                                                                    onClick={() => toggleDailyShift(dayIndex)}
                                                                    className={`w-8 h-8 rounded-md text-xs font-bold flex items-center justify-center transition-all ${type === 'NOCHE'
                                                                        ? 'bg-indigo-600 text-white shadow-sm'
                                                                        : 'bg-amber-100 text-amber-800 hover:bg-amber-200 border border-amber-200'
                                                                        }`}
                                                                    title={type === 'NOCHE' ? 'Noche' : 'Día'}
                                                                >
                                                                    {type === 'NOCHE' ? <Icon name="moon" size={14} /> : 'D'}
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                        <div className="flex items-center gap-3 text-xs text-slate-500 justify-end">
                                            <span className="flex items-center gap-1"><span className="w-4 h-4 bg-amber-100 border border-amber-200 text-amber-800 rounded flex items-center justify-center font-bold text-[10px]">D</span> Día</span>
                                            <span className="flex items-center gap-1"><span className="w-4 h-4 bg-indigo-600 text-white rounded flex items-center justify-center"><Icon name="moon" size={10} /></span> Noche</span>
                                        </div>
                                    </div>
                                )}

                                {/* TAB: EARLY EXIT */}
                                {activeTab === 'EARLY_EXIT' && (
                                    <div className="space-y-4">
                                        <div className="flex items-center justify-between">
                                            <label className="text-sm font-medium text-slate-700">Habilitar Salida Temprana</label>
                                            <div
                                                onClick={() => setEarlyExitEnabled(!earlyExitEnabled)}
                                                className={`w-12 h-6 rounded-full p-1 cursor-pointer transition-colors ${earlyExitEnabled ? 'bg-brand-600' : 'bg-slate-300'}`}
                                            >
                                                <div className={`space-y-0 w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${earlyExitEnabled ? 'translate-x-6' : ''}`} />
                                            </div>
                                        </div>

                                        {earlyExitEnabled && (
                                            <div className="bg-white p-4 rounded-lg border space-y-4 animate-in fade-in slide-in-from-top-1">
                                                <div>
                                                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                                                        Días de la semana
                                                    </label>
                                                    <div className="flex gap-2 overflow-x-auto pb-1">
                                                        {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map((d, idx) => {
                                                            const dayVal = idx + 1 === 7 ? 0 : idx + 1; // 1=Mon... 6=Sat, 0=Sun
                                                            const isSelected = earlyExitDays.includes(dayVal);
                                                            return (
                                                                <button
                                                                    key={d}
                                                                    onClick={() => toggleEarlyExitDay(dayVal)}
                                                                    className={`flex-1 min-w-[3rem] py-2 rounded-lg text-sm font-medium border transition-all ${isSelected
                                                                        ? 'bg-brand-50 border-brand-500 text-brand-700 ring-1 ring-brand-500'
                                                                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                                                                        }`}
                                                                >
                                                                    {d}
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                </div>

                                                <div>
                                                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                                                        Hora de Salida
                                                    </label>
                                                    <input
                                                        type="time"
                                                        value={earlyExitTime}
                                                        onChange={(e) => setEarlyExitTime(e.target.value)}
                                                        className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none"
                                                    />
                                                    <p className="text-xs text-slate-500 mt-2">
                                                        Se aplicará para todos los <strong>{getDaysDescription()}</strong> del año.
                                                    </p>
                                                </div>
                                            </div>
                                        )}

                                        {!earlyExitEnabled && (
                                            <div className="p-4 bg-slate-100 rounded-lg text-center text-slate-500 text-sm italic">
                                                Configura una salida anticipada recurrente (ej: Viernes a las 14:00)
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex justify-between items-center gap-3 p-4 border-t bg-slate-50 rounded-b-xl shrink-0">
                    <div className="text-xs text-slate-500">
                        Los cambios aplican para todo el año 2026
                    </div>
                    <div className="flex gap-3">
                        <button
                            onClick={onClose}
                            disabled={isLoading}
                            className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={isLoading || success}
                            className="px-5 py-2 text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 rounded-lg disabled:opacity-50 flex items-center gap-2 transition-colors shadow-sm"
                        >
                            {isLoading && <Icon name="loader" size={16} className="animate-spin" />}
                            {success ? '¡Guardado!' : 'Guardar Turno'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

/**
 * Get description of off days for a shift type
 */
function getOffDaysDescription(shiftType: ShiftType, variant: VariantCode): string {
    const pattern = shiftType.pattern_json;
    if (!pattern) return '';

    const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

    if (pattern.type === 'fixed' && pattern.offDays) {
        const offDayNames = pattern.offDays.map((d) => dayNames[d]).join(' y ');
        return `Libre: ${offDayNames} (todas las semanas)`;
    }

    if (pattern.type === 'rotating' && pattern.weeks) {
        const lines: string[] = [];
        pattern.weeks.forEach((week, i) => {
            const adjustedIndex = variant === 'CONTRATURNO' ? (i + 1) % pattern.weeks!.length : i;
            const offDayNames = week.offDays.map((d) => dayNames[d]).join(' + ');
            lines.push(`Semana ${adjustedIndex + 1}: ${offDayNames}`);
        });
        return lines.join(' | ');
    }

    return pattern.description || '';
}
