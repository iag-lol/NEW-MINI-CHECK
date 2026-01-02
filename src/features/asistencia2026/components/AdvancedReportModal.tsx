import { useState, useMemo } from 'react';
import { X, AlertTriangle, ShieldAlert, Info, Filter, Users, Calendar, Activity } from 'lucide-react';
import { StaffWithShift, ShiftType, AttendanceMark, AttendanceLicense, AttendanceVacation, AttendancePermission, StaffShiftSpecialTemplate, StaffShiftOverride, AttendanceIncidences, CARGO_ORDER, DAY_NAMES_SHORT } from '../types';
import { useCoverageAlerts } from '../hooks/useCoverageAlerts';
import { formatDayOfWeek, formatDayNumber, isToday } from '../utils/shiftEngine';
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
    vacations: AttendanceVacation[];
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
    const [selectedShift, setSelectedShift] = useState<string>('ALL'); // DIA/NOCHE

    // Real-time Intelligence Engine
    const { alerts } = useCoverageAlerts(
        staff, shiftTypes, weekDates, marks, licenses, permissions, vacations, overrides, incidences, specialTemplates
    );

    // Derived Data for Dashboard
    const filteredStaff = useMemo(() => {
        return staff.filter(s => {
            if (selectedTerminal !== 'ALL' && s.terminal_code !== selectedTerminal) return false;
            if (selectedRole !== 'ALL' && !s.cargo.toUpperCase().includes(selectedRole)) return false;
            // Shift filtering is complex (depends on day), doing heuristic on 'horario' for now or omit
            return true;
        });
    }, [staff, selectedTerminal, selectedRole]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
            {/* Backdrop with Blur */}
            <div
                className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity"
                onClick={onClose}
            />

            {/* Main Modal Container */}
            <div className="relative w-full max-w-7xl h-[90vh] bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-scale-in">

                {/* Header - Glassy & Gradient */}
                <div className="bg-gradient-to-r from-slate-900 to-slate-800 text-white p-6 flex justify-between items-center shadow-lg shrink-0">
                    <div>
                        <div className="flex items-center gap-3 mb-1">
                            <Activity className="w-6 h-6 text-brand-400" />
                            <h2 className="text-2xl font-bold tracking-tight">Reporte de Inteligencia Operativa</h2>
                        </div>
                        <p className="text-slate-400 text-sm">Análisis en tiempo real de cobertura y asistencia semanal</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-white/10 rounded-full transition-colors text-slate-300 hover:text-white"
                    >
                        <X className="w-6 h-6" />
                    </button>
                </div>

                {/* Content Layout */}
                <div className="flex-1 overflow-hidden flex flex-col md:flex-row bg-slate-50">

                    {/* Left Panel: Intelligence & Filters (Scrollable) */}
                    <div className="w-full md:w-80 lg:w-96 bg-white border-r border-slate-200 flex flex-col h-full overflow-hidden">

                        {/* Filters Section */}
                        <div className="p-5 border-b border-slate-100">
                            <div className="flex items-center gap-2 mb-4 text-slate-800 font-semibold">
                                <Filter className="w-4 h-4" />
                                <h3>Filtros de Análisis</h3>
                            </div>
                            <div className="space-y-3">
                                <div>
                                    <label className="text-xs font-medium text-slate-500 uppercase mb-1 block">Terminal</label>
                                    <select
                                        className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none"
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
                                    <label className="text-xs font-medium text-slate-500 uppercase mb-1 block">Cargo</label>
                                    <select
                                        className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none"
                                        value={selectedRole}
                                        onChange={(e) => setSelectedRole(e.target.value)}
                                    >
                                        <option value="ALL">Todo Cargo</option>
                                        <option value="SUPERVISOR">Supervisores</option>
                                        <option value="INSPECTOR">Inspectores</option>
                                        <option value="CONDUCTOR">Conductores</option>
                                        <option value="PLANILLERO">Planilleros</option>
                                        <option value="CLEANER">Aseo</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        {/* Alerts Section (Real-Time) */}
                        <div className="flex-1 overflow-y-auto p-5">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                                    <ShieldAlert className="w-4 h-4 text-amber-500" />
                                    Alertas de Cobertura
                                </h3>
                                <span className="text-xs font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                                    {alerts.length}
                                </span>
                            </div>

                            <div className="space-y-3">
                                {alerts.length === 0 ? (
                                    <div className="text-center p-6 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                                        <p className="text-slate-400 text-sm">Cobertura óptima detectada</p>
                                    </div>
                                ) : (
                                    alerts.map((alert) => (
                                        <div key={alert.id} className={`p-3 rounded-xl border flex items-start gap-3 ${alert.level === 'CRITICAL' ? 'bg-red-50 border-red-100' :
                                            alert.level === 'WARNING' ? 'bg-amber-50 border-amber-100' :
                                                'bg-blue-50 border-blue-100'
                                            }`}>
                                            <div className={`mt-0.5 shrink-0 ${alert.level === 'CRITICAL' ? 'text-red-500' :
                                                alert.level === 'WARNING' ? 'text-amber-500' :
                                                    'text-blue-500'
                                                }`}>
                                                {alert.level === 'CRITICAL' ? <AlertTriangle className="w-5 h-5" /> : <Info className="w-5 h-5" />}
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-2 mb-0.5">
                                                    <span className="text-xs font-bold uppercase tracking-wider opacity-70">
                                                        {formatDayOfWeek(alert.date)} {formatDayNumber(alert.date)}
                                                    </span>
                                                    <span className="text-[10px] font-mono bg-white/50 px-1.5 rounded uppercase">
                                                        {alert.shift}
                                                    </span>
                                                </div>
                                                <p className={`text-sm font-medium leading-snug ${alert.level === 'CRITICAL' ? 'text-red-900' :
                                                    alert.level === 'WARNING' ? 'text-amber-900' :
                                                        'text-blue-900'
                                                    }`}>
                                                    {alert.message}
                                                </p>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Right Panel: Detailed Grid (Scrollable) */}
                    <div className="flex-1 flex flex-col min-w-0 bg-slate-50/50">

                        {/* Summary Cards */}
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 p-5">
                            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
                                <p className="text-xs text-slate-500 uppercase tracking-wide font-medium">Personal Filtrado</p>
                                <p className="text-2xl font-bold text-slate-800 mt-1">{filteredStaff.length}</p>
                            </div>
                            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
                                <p className="text-xs text-slate-500 uppercase tracking-wide font-medium">Licencias Activas</p>
                                <p className="text-2xl font-bold text-purple-600 mt-1">
                                    {licenses.filter(l => Boolean(filteredStaff.find(s => s.id === l.staff_id))).length}
                                </p>
                            </div>
                            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
                                <p className="text-xs text-slate-500 uppercase tracking-wide font-medium">Vacaciones</p>
                                <p className="text-2xl font-bold text-teal-600 mt-1">
                                    {vacations.filter(v => Boolean(filteredStaff.find(s => s.rut === v.rut))).length}
                                </p>
                            </div>
                            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
                                <p className="text-xs text-slate-500 uppercase tracking-wide font-medium">Incidencias</p>
                                <p className="text-2xl font-bold text-red-600 mt-1">
                                    {(incidences.noMarcaciones.length + incidences.sinCredenciales.length)}
                                </p>
                            </div>
                        </div>

                        {/* Detail List */}
                        <div className="flex-1 overflow-auto px-5 pb-5">
                            <div className="bg-white rounded-xl shadow border border-slate-200 overflow-hidden">
                                <table className="min-w-full divide-y divide-slate-100">
                                    <thead className="bg-slate-50/80 backdrop-blur sticky top-0 z-10">
                                        <tr>
                                            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Trabajador</th>
                                            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase hidden sm:table-cell">Terminal</th>
                                            {weekDates.map(date => (
                                                <th key={date} className={`px-2 py-3 text-center text-xs font-semibold uppercase w-12 ${isToday(date) ? 'text-brand-600 bg-brand-50/50' : 'text-slate-500'}`}>
                                                    <div>{formatDayOfWeek(date)}</div>
                                                    <div className="text-[10px]">{formatDayNumber(date)}</div>
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50">
                                        {filteredStaff.map((person) => (
                                            <tr key={person.id} className="hover:bg-slate-50 transition-colors group">
                                                <td className="px-4 py-3 whitespace-nowrap">
                                                    <div className="font-medium text-sm text-slate-900">{person.nombre}</div>
                                                    <div className="text-xs text-slate-400 group-hover:text-slate-500">{person.cargo}</div>
                                                </td>
                                                <td className="px-4 py-3 whitespace-nowrap hidden sm:table-cell">
                                                    <span className="text-xs font-mono text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                                                        {displayTerminal(person.terminal_code)}
                                                    </span>
                                                </td>
                                                {weekDates.map(date => {
                                                    // Simple status check
                                                    const isAbsence = licenses.some(l => l.staff_id === person.id && date >= l.start_date && date <= l.end_date) ||
                                                        vacations.some(v => v.rut === person.rut && date >= v.start_date && date <= v.end_date);
                                                    const mark = marks.find(m => m.staff_id === person.id && m.mark_date === date);

                                                    return (
                                                        <td key={date} className={`border-l border-slate-50 text-center p-1 ${isToday(date) ? 'bg-brand-50/10' : ''}`}>
                                                            {isAbsence ? (
                                                                <div className="w-2 h-2 mx-auto rounded-full bg-red-400" title="Ausencia" />
                                                            ) : mark ? (
                                                                <div className="w-2 h-2 mx-auto rounded-full bg-emerald-400" title="Presente" />
                                                            ) : (
                                                                <div className="w-1 h-1 mx-auto rounded-full bg-slate-200" />
                                                            )}
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
