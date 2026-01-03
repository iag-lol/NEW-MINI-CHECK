import { useState, useMemo } from 'react';
import { X, AlertTriangle, ShieldAlert, Info, Filter, Users, Calendar, Activity } from 'lucide-react';
import { StaffWithShift, ShiftType, AttendanceMark, AttendanceLicense, AttendanceVacation, AttendancePermission, StaffShiftSpecialTemplate, StaffShiftOverride, AttendanceIncidences, CARGO_ORDER, DAY_NAMES_SHORT } from '../types';
import { useCoverageAlerts } from '../hooks/useCoverageAlerts';
import { formatDayOfWeek, formatDayNumber, isToday, isOffDay } from '../utils/shiftEngine';
import { displayTerminal } from '../../../shared/utils/terminal';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    // Data Props
    staff: StaffWithShift[];
    shiftTypes: ShiftType[];
    weekDates: string[];
    marks: AttendanceMark[];
    licenses: AttendanceLicense[];
    permissions: AttendancePermission[];
    vacations: { rut?: string; staff_id?: string; start_date: string; end_date: string }[];
    overrides: StaffShiftOverride[];
    incidences: AttendanceIncidences;
    specialTemplates: StaffShiftSpecialTemplate[];
}

export const AdvancedReportModal = ({
    isOpen, onClose, staff, shiftTypes, weekDates, marks, licenses, permissions, vacations, overrides, incidences, specialTemplates
}: Props) => {
    // Filters State
    const [selectedTerminal, setSelectedTerminal] = useState<string>('ALL');
    const [selectedRole, setSelectedRole] = useState<string>('ALL');

    // Real-time Intelligence Engine
    const { alerts } = useCoverageAlerts(
        staff, shiftTypes, weekDates, marks, licenses, permissions, vacations, overrides, incidences, specialTemplates
    );

    // Derived Data for Dashboard
    const filteredStaff = useMemo(() => {
        return staff.filter(s => {
            if (selectedTerminal !== 'ALL' && s.terminal_code !== selectedTerminal) return false;
            if (selectedRole !== 'ALL' && !s.cargo.toUpperCase().includes(selectedRole)) return false;
            return true;
        });
    }, [staff, selectedTerminal, selectedRole]);

    // Calculate Global Stats for the View
    const stats = useMemo(() => {
        let totalCitados = 0;
        let totalLibres = 0;
        let totalAbsences = 0;

        filteredStaff.forEach(s => {
            // Check heuristic for current day or week average? Let's show TOTAL SCHEDULED SHIFTS count for the week in the view
            weekDates.forEach(date => {
                // Duplicate Logic for Display (should match hook ideally, but simplified here for aggregate)
                let effectiveShiftType = s.shift ? shiftTypes.find(st => st.code === s.shift!.shift_type_code) : null;
                let isOff = false;
                if (s.shift) {
                    if (!effectiveShiftType?.pattern_json) effectiveShiftType = { pattern_json: [1, 1, 1, 1, 1, 0, 0] } as any; // Fallback
                    // ... (Simplified logic for speed, strictly speaking we should reuse a utility, but I'll approximate for the counter)
                    // Actually, let's just count based on Day names for speed if pattern missing, or use isOffDay utility if possible.
                    // Since we can't easily valid override here without complex logic loop, we will stick to a simpler count:
                    // Count marks? No. Count specific "L" status in detailed view.
                    // Ideally we iterate exactly like the table render.
                }
            });
        });

        // Let's count from the Data that will be rendered
        // We can do this efficiently inside the render loop or pre-calc.
        // For "More Info", let's show: Total Staff involved, and Alerts count.
        return {
            staffCount: filteredStaff.length,
            alertCount: alerts.length
        }
    }, [filteredStaff, alerts]);


    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
            <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-md transition-opacity" onClick={onClose} />

            <div className="relative w-full max-w-[95vw] h-[92vh] bg-slate-50 rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-scale-in border border-slate-700/50">

                {/* Header - Premium Dark Mode */}
                <div className="bg-slate-900 text-white p-6 flex justify-between items-center shadow-lg shrink-0 border-b border-slate-800">
                    <div>
                        <div className="flex items-center gap-3 mb-1">
                            <div className="p-2 bg-indigo-600 rounded-lg shadow-lg shadow-indigo-900/50">
                                <Activity className="w-6 h-6 text-white" />
                            </div>
                            <div>
                                <h2 className="text-2xl font-bold tracking-tight text-white">Centro de Inteligencia</h2>
                                <p className="text-indigo-200 text-xs uppercase tracking-wider font-semibold">Análisis de Cobertura & Dotación</p>
                            </div>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors text-slate-400 hover:text-white">
                        <X className="w-6 h-6" />
                    </button>
                </div>

                <div className="flex-1 overflow-hidden flex flex-col md:flex-row">

                    {/* Left Panel: Controls & Alerts */}
                    <div className="w-full md:w-80 lg:w-96 bg-white border-r border-slate-200 flex flex-col h-full overflow-hidden shadow-xl z-10">
                        <div className="p-6 border-b border-slate-100 bg-slate-50/50">
                            <div className="flex items-center gap-2 mb-6 text-slate-800 font-bold uppercase tracking-wide text-xs">
                                <Filter className="w-4 h-4 text-indigo-600" />
                                Filtros Globales
                            </div>
                            <div className="space-y-4">
                                <div>
                                    <label className="text-[10px] font-bold text-slate-400 uppercase mb-1.5 block">Terminal Operativo</label>
                                    <select
                                        className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-indigo-500 outline-none shadow-sm"
                                        value={selectedTerminal}
                                        onChange={(e) => setSelectedTerminal(e.target.value)}
                                    >
                                        <option value="ALL">Todas las operaciones</option>
                                        <option value="EL_ROBLE">El Roble</option>
                                        <option value="LA_REINA">La Reina</option>
                                        <option value="MARIA_ANGELICA">Maria Angelica</option>
                                        <option value="EL_DESCANSO">El Descanso</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold text-slate-400 uppercase mb-1.5 block">Cargo / Rol</label>
                                    <select
                                        className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-indigo-500 outline-none shadow-sm"
                                        value={selectedRole}
                                        onChange={(e) => setSelectedRole(e.target.value)}
                                    >
                                        <option value="ALL">Todos los cargos</option>
                                        <option value="SUPERVISOR">Supervisores</option>
                                        <option value="INSPECTOR">Inspectores</option>
                                        <option value="CONDUCTOR">Conductores</option>
                                        <option value="PLANILLERO">Planilleros</option>
                                        <option value="CLEANER">Aseo</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6 bg-slate-50/30">
                            <div className="flex items-center justify-between mb-5">
                                <h3 className="font-bold text-slate-800 flex items-center gap-2 text-sm">
                                    <ShieldAlert className="w-4 h-4 text-indigo-600" />
                                    Alertas Detectadas
                                </h3>
                                <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${alerts.length > 0 ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
                                    {alerts.length}
                                </span>
                            </div>

                            <div className="space-y-3">
                                {alerts.length === 0 ? (
                                    <div className="text-center p-8 bg-white rounded-2xl border border-dashed border-slate-200 shadow-sm">
                                        <div className="w-12 h-12 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-3">
                                            <Activity className="w-6 h-6 text-emerald-500" />
                                        </div>
                                        <p className="text-slate-900 font-medium text-sm">Todo en orden</p>
                                        <p className="text-slate-400 text-xs mt-1">Cobertura óptima según planificación.</p>
                                    </div>
                                ) : (
                                    alerts.map((alert) => (
                                        <div key={alert.id} className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm relative overflow-hidden group hover:shadow-md transition-shadow">
                                            <div className={`absolute left-0 top-0 bottom-0 w-1 ${alert.level === 'CRITICAL' ? 'bg-red-500' :
                                                alert.level === 'WARNING' ? 'bg-amber-500' : 'bg-blue-500'
                                                }`} />
                                            <div className="pl-3">
                                                <div className="flex justify-between items-start mb-1">
                                                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                                        {formatDayOfWeek(alert.date)} {formatDayNumber(alert.date)} • {alert.shift}
                                                    </span>
                                                    {alert.level === 'CRITICAL' && <AlertTriangle className="w-3.5 h-3.5 text-red-500" />}
                                                </div>
                                                <p className="text-slate-800 text-sm font-semibold leading-snug">
                                                    {alert.message}
                                                </p>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Right Panel: Data Grid */}
                    <div className="flex-1 flex flex-col min-w-0 bg-slate-100/50">
                        {/* Summary Headers */}
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 p-6">
                            <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
                                <p className="text-[10px] text-slate-400 uppercase tracking-bold font-bold">Dotación Visible</p>
                                <div className="flex items-baseline gap-2 mt-1">
                                    <span className="text-3xl font-bold text-slate-900">{filteredStaff.length}</span>
                                    <span className="text-xs text-slate-500 font-medium">personas</span>
                                </div>
                            </div>
                            <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
                                <p className="text-[10px] text-slate-400 uppercase tracking-bold font-bold">Ausentismo (Licencias)</p>
                                <div className="flex items-baseline gap-2 mt-1">
                                    <span className="text-3xl font-bold text-purple-600">
                                        {licenses.filter(l => Boolean(filteredStaff.find(s => s.id === l.staff_id))).length}
                                    </span>
                                    <span className="text-xs text-purple-400 font-medium">activas</span>
                                </div>
                            </div>
                            <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
                                <p className="text-[10px] text-slate-400 uppercase tracking-bold font-bold">Vacaciones</p>
                                <div className="flex items-baseline gap-2 mt-1">
                                    <span className="text-3xl font-bold text-teal-600">
                                        {vacations.filter(v => Boolean(filteredStaff.find(s => s.rut === v.rut))).length}
                                    </span>
                                    <span className="text-xs text-teal-400 font-medium">programadas</span>
                                </div>
                            </div>
                            <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
                                <p className="text-[10px] text-slate-400 uppercase tracking-bold font-bold">Alertas Activas</p>
                                <div className="flex items-baseline gap-2 mt-1">
                                    <span className={`text-3xl font-bold ${alerts.length > 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                                        {alerts.length}
                                    </span>
                                    <span className="text-xs text-slate-400 font-medium">reportes</span>
                                </div>
                            </div>
                        </div>

                        {/* Visual Roster */}
                        <div className="flex-1 overflow-auto px-6 pb-6">
                            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                                <table className="min-w-full divide-y divide-slate-100">
                                    <thead className="bg-slate-50 sticky top-0 z-10">
                                        <tr>
                                            <th className="px-5 py-4 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Colaborador</th>
                                            <th className="px-5 py-4 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider hidden sm:table-cell">Base</th>
                                            {weekDates.map(date => (
                                                <th key={date} className={`px-2 py-4 text-center w-14 ${isToday(date) ? 'bg-indigo-50/50' : ''}`}>
                                                    <div className={`text-[10px] font-bold uppercase ${isToday(date) ? 'text-indigo-600' : 'text-slate-400'}`}>{formatDayOfWeek(date)}</div>
                                                    <div className={`text-sm font-bold ${isToday(date) ? 'text-indigo-700' : 'text-slate-700'}`}>{formatDayNumber(date)}</div>
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50">
                                        {filteredStaff.map((person) => (
                                            <tr key={person.id} className="hover:bg-slate-50/80 transition-colors">
                                                <td className="px-5 py-3 whitespace-nowrap">
                                                    <div className="font-bold text-sm text-slate-800">{person.nombre}</div>
                                                    <div className="text-[10px] font-bold text-indigo-500 uppercase tracking-wide mt-0.5">{person.cargo}</div>
                                                </td>
                                                <td className="px-5 py-3 whitespace-nowrap hidden sm:table-cell">
                                                    <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded-md uppercase tracking-wide">
                                                        {displayTerminal(person.terminal_code)}
                                                    </span>
                                                </td>
                                                {weekDates.map(date => {
                                                    // Determine Status for Grid
                                                    let status = 'SCHEDULED'; // Default
                                                    let label = 'T'; // Turno
                                                    let colorClass = 'bg-blue-100 text-blue-700';

                                                    // 1. Is Off?
                                                    // (Replicate logic briefly or assume passed props? Repeating for render safety)
                                                    let effectiveShiftType = person.shift ? shiftTypes.find(st => st.code === person.shift!.shift_type_code) : null;
                                                    let isOff = false;
                                                    if (person.shift) {
                                                        if (!effectiveShiftType?.pattern_json) effectiveShiftType = { pattern_json: [1, 1, 1, 1, 1, 0, 0] } as any;
                                                        // Note: We need real isOffDay logic here. 
                                                        // Since we can't import the exact logic block easily without duplication, 
                                                        // we rely on the visual indicator matching the hook.
                                                        // For the purpose of this file, we assume standard Mon-Fri if no complex logic available,
                                                        // OR better: we check if they are "Libre" based on Day.
                                                        // Actually, we imported `isOffDay` so we CAN use it!
                                                        if (effectiveShiftType?.pattern_json) {
                                                            const specialTemplateFound = specialTemplates.find(t => t.staff_id === person.id);
                                                            const overrideFound = overrides.find(o => o.staff_id === person.id && o.override_date === date);
                                                            isOff = isOffDay(date, person.shift.shift_type_code, person.shift.variant_code, effectiveShiftType.pattern_json, specialTemplateFound, overrideFound);
                                                        } else {
                                                            const dw = new Date(date + 'T12:00:00').getDay();
                                                            isOff = dw === 0 || dw === 6;
                                                        }
                                                    } else {
                                                        const dw = new Date(date + 'T12:00:00').getDay();
                                                        isOff = dw === 0 || dw === 6;
                                                    }

                                                    if (isOff) {
                                                        status = 'FREE';
                                                        label = 'L'; // Libre
                                                        colorClass = 'bg-slate-100 text-slate-400';
                                                    } else {
                                                        // 2. Absences
                                                        const isLic = licenses.some(l => l.staff_id === person.id && date >= l.start_date && date <= l.end_date);
                                                        const isVac = vacations.some(v => v.rut === person.rut && date >= v.start_date && date <= v.end_date);
                                                        const isPerm = permissions.some(p => p.staff_id === person.id && date >= p.start_date && date <= p.end_date);

                                                        if (isLic) { status = 'ABSENT'; label = 'LIC'; colorClass = 'bg-purple-100 text-purple-700 ring-1 ring-purple-200'; }
                                                        else if (isVac) { status = 'ABSENT'; label = 'VAC'; colorClass = 'bg-teal-100 text-teal-700 ring-1 ring-teal-200'; }
                                                        else if (isPerm) { status = 'ABSENT'; label = 'PER'; colorClass = 'bg-amber-100 text-amber-700 ring-1 ring-amber-200'; }
                                                    }

                                                    return (
                                                        <td key={date} className={`border-l border-slate-50 text-center p-2 ${isToday(date) ? 'bg-indigo-50/20' : ''}`}>
                                                            <div className={`w-8 h-8 mx-auto flex items-center justify-center rounded-lg text-[10px] font-bold ${colorClass}`}>
                                                                {label}
                                                            </div>
                                                        </td>
                                                    );
                                                })}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
