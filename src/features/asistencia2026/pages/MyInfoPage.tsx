/**
 * MyInfoPage - Personal schedule and information view
 * Shows detailed weekly schedule with hours, free days, early departures
 */

import { useState, useMemo } from 'react';
import { Icon } from '../../../shared/components/common/Icon';
import { useSessionStore } from '../../../shared/state/sessionStore';
import { useTerminalStore } from '../../../shared/state/terminalStore';
import {
    useStaffWithShifts,
    useMarksForWeek,
    useLicensesForWeek,
    usePermissionsForWeek,
    useVacationsForWeek,
    useOverridesForWeek,
    useShiftTypes,
} from '../hooks';
import {
    getWeekStart,
    getWeekDates,
    getPreviousWeek,
    getNextWeek,
    formatWeekRange,
    isPastDate,
    getLocalTodayStr,
} from '../utils/shiftEngine';
import {
    AttendanceMark,
    AttendanceLicense,
    AttendancePermission,
    AttendanceVacation,
    StaffShiftOverride
} from '../types';

const DAY_NAMES = ['DOM', 'LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB'];

interface DaySchedule {
    isLibre: boolean;
    hasLicense: boolean;
    hasVacation: boolean;
    hasPermission: boolean;
    startTime: string;
    endTime: string;
    earlyDeparture?: string;
    mark?: 'P' | 'A';
}

export const MyInfoPage = () => {
    const session = useSessionStore((s) => s.session);
    const terminalContext = useTerminalStore((s) => s.context);

    // Week navigation
    const today = getLocalTodayStr();
    const [weekStart, setWeekStart] = useState(() => getWeekStart(today));
    const weekDates = useMemo(() => getWeekDates(weekStart), [weekStart]);

    // Get month/year from week
    const weekMiddleDate = new Date(weekDates[3] + 'T12:00:00');
    const month = weekMiddleDate.getMonth();
    const year = weekMiddleDate.getFullYear();

    // Data queries
    const { data: shiftTypes = [] } = useShiftTypes();
    const { data: allStaff = [] } = useStaffWithShifts(terminalContext, { month, year, terminal: 'ALL', turno: 'TODOS', search: '' });

    // Find current user's staff record
    const myStaffRecord = useMemo(() => {
        if (!session) return null;
        return allStaff.find(s => s.nombre.toUpperCase().includes(session.supervisorName.toUpperCase()));
    }, [allStaff, session]);

    const staffIds = useMemo(() => myStaffRecord ? [myStaffRecord.id] : [], [myStaffRecord]);

    const startDate = weekDates[0];
    const endDate = weekDates[6];

    const { data: marks = [] } = useMarksForWeek(staffIds, startDate, endDate);
    const { data: licenses = [] } = useLicensesForWeek(staffIds, startDate, endDate);
    const { data: permissions = [] } = usePermissionsForWeek(staffIds, startDate, endDate);
    const { data: vacations = [] } = useVacationsForWeek(staffIds, startDate, endDate);
    const { data: overrides = [] } = useOverridesForWeek(staffIds, startDate, endDate);

    // Check if can view next month (within 3 days of month end)
    const canViewNextMonth = () => {
        const todayDate = new Date();
        const lastDayOfMonth = new Date(todayDate.getFullYear(), todayDate.getMonth() + 1, 0);
        const daysUntilMonthEnd = Math.ceil((lastDayOfMonth.getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24));
        return daysUntilMonthEnd <= 3;
    };

    // Get day schedule details
    const getDaySchedule = (date: string): DaySchedule => {
        if (!myStaffRecord) {
            return { isLibre: false, hasLicense: false, hasVacation: false, hasPermission: false, startTime: '', endTime: '' };
        }

        const dayOfWeek = new Date(date + 'T12:00:00').getDay();

        // Check absences
        const hasLicense = licenses.some((l: AttendanceLicense) => l.staff_id === myStaffRecord.id && date >= l.start_date && date <= l.end_date);
        const hasVacation = vacations.some((v: AttendanceVacation) => v.staff_id === myStaffRecord.id && date >= v.start_date && date <= v.end_date);
        const hasPermission = permissions.some((p: AttendancePermission) => p.staff_id === myStaffRecord.id && date >= p.start_date && date <= p.end_date);

        if (hasLicense || hasVacation || hasPermission) {
            return { isLibre: false, hasLicense, hasVacation, hasPermission, startTime: '', endTime: '' };
        }

        // Check if free day
        const shiftType = myStaffRecord.shift ? shiftTypes.find(st => st.code === myStaffRecord.shift!.shift_type_code) : null;
        let isLibre = dayOfWeek === 0 || dayOfWeek === 6;

        if (shiftType?.pattern_json) {
            if (shiftType.pattern_json.type === 'fixed' && shiftType.pattern_json.offDays) {
                isLibre = shiftType.pattern_json.offDays.includes(dayOfWeek);
            }
        }

        if (isLibre) {
            return { isLibre: true, hasLicense: false, hasVacation: false, hasPermission: false, startTime: '', endTime: '' };
        }

        // Parse horario
        const horario = myStaffRecord.horario || '08:00-17:00';
        const [startTime, endTime] = horario.split('-');

        // Check for early departure
        const override = overrides.find((o: StaffShiftOverride) => o.staff_id === myStaffRecord.id && o.override_date === date);
        const earlyDeparture = override?.meta_json?.early_departure_time as string | undefined;

        // Get attendance mark
        const mark = marks.find((m: AttendanceMark) => m.staff_id === myStaffRecord.id && m.mark_date === date)?.mark as 'P' | 'A' | undefined;

        return {
            isLibre: false,
            hasLicense: false,
            hasVacation: false,
            hasPermission: false,
            startTime,
            endTime,
            earlyDeparture,
            mark
        };
    };

    // Calculate statistics
    const weekStats = useMemo(() => {
        let workDays = 0;
        let freeDays = 0;
        let earlyDepartures = 0;
        let totalHours = 0;

        weekDates.forEach(date => {
            const schedule = getDaySchedule(date);
            if (schedule.isLibre) {
                freeDays++;
            } else if (!schedule.hasLicense && !schedule.hasVacation && !schedule.hasPermission) {
                workDays++;
                if (schedule.earlyDeparture) {
                    earlyDepartures++;
                }

                // Calculate hours
                if (schedule.startTime && schedule.endTime) {
                    const [startH, startM] = schedule.startTime.split(':').map(Number);
                    const endTimeToUse = schedule.earlyDeparture || schedule.endTime;
                    const [endH, endM] = endTimeToUse.split(':').map(Number);

                    let hours = endH - startH;
                    let minutes = endM - startM;

                    if (minutes < 0) {
                        hours--;
                        minutes += 60;
                    }

                    // Subtract lunch hour if work day > 6 hours
                    if (hours > 6) {
                        hours--;
                    }

                    totalHours += hours + (minutes / 60);
                }
            }
        });

        return { workDays, freeDays, earlyDepartures, totalHours: Math.round(totalHours) };
    }, [weekDates, myStaffRecord, marks, licenses, vacations, permissions, overrides]);

    // Week navigation handlers
    const handlePrevWeek = () => {
        setWeekStart(getPreviousWeek(weekStart));
    };

    const handleNextWeek = () => {
        const nextWeekStart = getNextWeek(weekStart);
        const nextWeekDate = new Date(nextWeekStart);
        const currentMonth = new Date().getMonth();

        if (nextWeekDate.getMonth() !== currentMonth && !canViewNextMonth()) {
            alert('⚠️ Podrás ver el próximo mes cuando falten 3 días o menos para el cambio de mes');
            return;
        }

        setWeekStart(nextWeekStart);
    };

    const handleGoToToday = () => {
        setWeekStart(getWeekStart(today));
    };

    if (!session || !myStaffRecord) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="text-center">
                    <Icon name="alert-circle" size={48} className="text-slate-400 mx-auto mb-4" />
                    <p className="text-slate-600">No se encontró información del usuario</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50 p-4 space-y-6">
            {/* Header */}
            <div className="bg-gradient-to-br from-indigo-600 to-purple-700 rounded-2xl p-6 text-white shadow-xl">
                <h1 className="text-2xl font-black mb-3">{myStaffRecord.nombre}</h1>
                <div className="flex flex-wrap gap-3">
                    <span className="px-3 py-1.5 bg-white/20 backdrop-blur-sm rounded-lg text-sm font-semibold flex items-center gap-2">
                        <Icon name="user" size={16} />
                        {myStaffRecord.cargo}
                    </span>
                    <span className="px-3 py-1.5 bg-white/20 backdrop-blur-sm rounded-lg text-sm font-semibold flex items-center gap-2">
                        <Icon name="user" size={16} />
                        {myStaffRecord.terminal_code.replace(/_/g, ' ')}
                    </span>
                    <span className="px-3 py-1.5 bg-white/20 backdrop-blur-sm rounded-lg text-sm font-semibold flex items-center gap-2">
                        <Icon name="clock" size={16} />
                        {myStaffRecord.horario}
                    </span>
                </div>
            </div>

            {/* Week Navigation */}
            <div className="bg-white rounded-xl p-4 shadow-lg border-2 border-slate-200">
                <div className="flex items-center justify-between">
                    <button
                        onClick={handlePrevWeek}
                        className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                        title="Semana anterior"
                    >
                        <Icon name="chevron-left" size={24} />
                    </button>

                    <div className="text-center">
                        <div className="text-xs font-semibold text-slate-500 mb-1">
                            <Icon name="calendar" size={14} className="inline mr-1" />
                            Semana Actual
                        </div>
                        <div className="text-lg font-black text-slate-900">
                            {formatWeekRange(weekStart)}
                        </div>
                    </div>

                    <button
                        onClick={handleNextWeek}
                        className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                        title="Semana siguiente"
                    >
                        <Icon name="chevron-right" size={24} />
                    </button>
                </div>

                <button
                    onClick={handleGoToToday}
                    className="mt-3 w-full px-4 py-2 bg-indigo-100 text-indigo-700 rounded-lg font-semibold text-sm hover:bg-indigo-200 transition-colors"
                >
                    Ir a Hoy
                </button>
            </div>

            {/* Weekly Schedule Grid */}
            <div className="grid grid-cols-7 gap-2">
                {weekDates.map((date, index) => {
                    const schedule = getDaySchedule(date);
                    const isToday = date === today;
                    const dateObj = new Date(date + 'T12:00:00');

                    return (
                        <div
                            key={date}
                            className={`rounded-xl p-3 border-2 transition-all ${isToday
                                ? 'border-indigo-500 bg-indigo-50 shadow-lg scale-105'
                                : 'border-slate-200 bg-white hover:shadow-md'
                                }`}
                        >
                            {/* Day name */}
                            <div className="text-xs font-bold text-slate-500 text-center mb-1">
                                {DAY_NAMES[dateObj.getDay()]}
                            </div>

                            {/* Date */}
                            <div className={`text-2xl font-black text-center mb-2 ${isToday ? 'text-indigo-600' : 'text-slate-900'
                                }`}>
                                {dateObj.getDate()}
                            </div>

                            {/* Schedule or Status */}
                            {schedule.isLibre ? (
                                <div className="bg-emerald-100 text-emerald-700 rounded-lg py-2 text-center font-bold text-lg">
                                    L
                                </div>
                            ) : schedule.hasLicense ? (
                                <div className="bg-amber-100 text-amber-700 rounded-lg py-2 text-center font-bold text-xs">
                                    LIC
                                </div>
                            ) : schedule.hasVacation ? (
                                <div className="bg-blue-100 text-blue-700 rounded-lg py-2 text-center font-bold text-xs">
                                    VAC
                                </div>
                            ) : schedule.hasPermission ? (
                                <div className="bg-purple-100 text-purple-700 rounded-lg py-2 text-center font-bold text-xs">
                                    PER
                                </div>
                            ) : (
                                <>
                                    {/* Work hours */}
                                    <div className="text-center space-y-1">
                                        <div className="text-sm font-bold text-slate-900">
                                            {schedule.startTime}
                                        </div>
                                        <div className="text-xs text-slate-400">-</div>
                                        <div className="text-sm font-bold text-slate-900">
                                            {schedule.endTime}
                                        </div>
                                    </div>

                                    {/* Early departure */}
                                    {schedule.earlyDeparture && (
                                        <div className="mt-2 bg-orange-100 text-orange-700 rounded-lg py-1 px-1 text-xs font-bold text-center">
                                            Sale: {schedule.earlyDeparture}
                                        </div>
                                    )}
                                </>
                            )}

                            {/* Attendance mark */}
                            {isPastDate(date) && schedule.mark && (
                                <div className={`mt-2 rounded-lg py-1 text-center text-xs font-bold ${schedule.mark === 'P' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                                    }`}>
                                    {schedule.mark === 'P' ? '✓ Presente' : '✗ Ausente'}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Statistics */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-white rounded-xl p-4 border-2 border-slate-200 shadow-lg">
                    <div className="text-3xl font-black text-slate-900">{weekStats.workDays}</div>
                    <div className="text-sm text-slate-600 font-semibold">Días laborales</div>
                </div>
                <div className="bg-white rounded-xl p-4 border-2 border-emerald-200 shadow-lg">
                    <div className="text-3xl font-black text-emerald-600">{weekStats.freeDays}</div>
                    <div className="text-sm text-slate-600 font-semibold">Días libres</div>
                </div>
                <div className="bg-white rounded-xl p-4 border-2 border-orange-200 shadow-lg">
                    <div className="text-3xl font-black text-orange-600">{weekStats.earlyDepartures}</div>
                    <div className="text-sm text-slate-600 font-semibold">Salidas temprano</div>
                </div>
                <div className="bg-white rounded-xl p-4 border-2 border-blue-200 shadow-lg">
                    <div className="text-3xl font-black text-blue-600">{weekStats.totalHours}</div>
                    <div className="text-sm text-slate-600 font-semibold">Horas totales</div>
                </div>
            </div>

            {/* Legend */}
            <div className="bg-white rounded-xl p-4 border-2 border-slate-200 shadow-lg">
                <h3 className="font-bold text-slate-900 mb-3">Leyenda</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-emerald-100 text-emerald-700 rounded-lg flex items-center justify-center font-bold">L</div>
                        <span className="text-slate-600">Libre</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-amber-100 text-amber-700 rounded-lg flex items-center justify-center font-bold text-xs">LIC</div>
                        <span className="text-slate-600">Licencia</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-blue-100 text-blue-700 rounded-lg flex items-center justify-center font-bold text-xs">VAC</div>
                        <span className="text-slate-600">Vacaciones</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-purple-100 text-purple-700 rounded-lg flex items-center justify-center font-bold text-xs">PER</div>
                        <span className="text-slate-600">Permiso</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-green-100 text-green-700 rounded-lg flex items-center justify-center font-bold text-xs">✓</div>
                        <span className="text-slate-600">Presente</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-red-100 text-red-700 rounded-lg flex items-center justify-center font-bold text-xs">✗</div>
                        <span className="text-slate-600">Ausente</span>
                    </div>
                </div>
            </div>
        </div>
    );
};
