import { useMemo } from 'react';
import { StaffWithShift, ShiftType, AttendanceMark, AttendanceLicense, AttendanceVacation, AttendancePermission, StaffShiftSpecialTemplate, StaffShiftOverride, AttendanceIncidences } from '../types';
import { getFallbackShiftType, isOffDay, getSpecialShiftDetails, getTurnoFromHorario, formatDayOfWeek, isPastDate } from '../utils/shiftEngine';

interface CoverageAlert {
    id: string;
    date: string;
    terminal: string;
    role: string;
    shift: 'DIA' | 'NOCHE';
    level: 'CRITICAL' | 'WARNING' | 'INFO';
    message: string;
}

interface CoverageStats {
    activeStaff: number;
    absentStaff: number;
}

// Minimum staffing requirements (Heuristic)
const MIN_STAFFING: Record<string, number> = {
    'SUPERVISOR': 1,
    'INSPECTOR': 1,
    'CONDUCTOR': 2,
    'PLANILLERO': 1,
    'CLEANER': 1,
};

export const useCoverageAlerts = (
    staff: StaffWithShift[],
    shiftTypes: ShiftType[],
    weekDates: string[],
    marks: AttendanceMark[],
    licenses: AttendanceLicense[],
    permissions: AttendancePermission[],
    vacations: { rut?: string; staff_id?: string; start_date: string; end_date: string }[],
    overrides: StaffShiftOverride[],
    incidences: AttendanceIncidences,
    specialTemplates: StaffShiftSpecialTemplate[]
) => {
    return useMemo(() => {
        const alerts: CoverageAlert[] = [];
        const stats: Record<string, CoverageStats> = {};

        // Iterate through each day of the week
        weekDates.forEach((date) => {
            const dayName = formatDayOfWeek(date);
            const isTodayOrFuture = !isPastDate(date); // Alerts are most relevant for present/future planning

            // Group by Terminal -> Shift -> Cargo
            const coverage: Record<string, Record<string, Record<string, number>>> = {};

            staff.forEach((s) => {
                if (s.status === 'DESVINCULADO') return;

                // 1. Check if OFF or ABSENT
                let isWorking = true;
                let effectiveShiftType = s.shift ? shiftTypes.find(st => st.code === s.shift!.shift_type_code) : null;

                // Determine if OFF based on Pattern
                let isOff = false;
                if (s.shift) {
                    if (!effectiveShiftType?.pattern_json) {
                        effectiveShiftType = getFallbackShiftType(s.shift.shift_type_code);
                    }
                    if (effectiveShiftType?.pattern_json) {
                        const specialTemplateFound = specialTemplates.find(t => t.staff_id === s.id);
                        const overrideFound = overrides.find(o => o.staff_id === s.id && o.override_date === date);
                        isOff = isOffDay(
                            date,
                            s.shift.shift_type_code,
                            s.shift.variant_code,
                            effectiveShiftType.pattern_json,
                            specialTemplateFound,
                            overrideFound
                        );
                    } else {
                        const dayOfWeek = new Date(date + 'T12:00:00').getDay();
                        isOff = dayOfWeek === 0 || dayOfWeek === 6; // Default Mon-Fri
                    }
                } else {
                    const dayOfWeek = new Date(date + 'T12:00:00').getDay();
                    isOff = dayOfWeek === 0 || dayOfWeek === 6;
                }

                if (isOff) isWorking = false;

                // Check Absences
                if (isWorking) {
                    const hasLicense = licenses.some(l => l.staff_id === s.id && date >= l.start_date && date <= l.end_date);
                    const hasVacation = vacations.some(v => v.rut === s.rut && date >= v.start_date && date <= v.end_date);
                    const hasPerm = permissions.some(p => p.staff_id === s.id && date >= p.start_date && date <= p.end_date);
                    const hasMark = marks.some(m => m.staff_id === s.id && m.mark_date === date); // If past, confirmed present?

                    if (hasLicense || hasVacation || hasPerm) isWorking = false;
                }

                if (!isWorking) return;

                // 2. Determine Shift (DIA/NOCHE) - Handle Special Templates
                let shift: 'DIA' | 'NOCHE' = getTurnoFromHorario(s.horario);

                if (s.shift?.shift_type_code === 'ESPECIAL') {
                    const specialTemplateFound = specialTemplates.find(t => t.staff_id === s.id);
                    if (specialTemplateFound) {
                        const details = getSpecialShiftDetails(date, specialTemplateFound);
                        shift = details.type;
                    }
                }

                // 3. Count
                const term = s.terminal_code;
                const cargo = s.cargo.toUpperCase(); // Normalize

                // Initialize structure
                if (!coverage[term]) coverage[term] = { DIA: {}, NOCHE: {} };
                if (!coverage[term][shift][cargo]) coverage[term][shift][cargo] = 0;

                coverage[term][shift][cargo]++;
            });

            // Analyze Coverage & Generate Alerts
            Object.entries(coverage).forEach(([term, shifts]) => {
                (['DIA', 'NOCHE'] as const).forEach((shift) => {
                    const cargos = shifts[shift];

                    // Check Supervisor Coverage
                    const supCount = Object.keys(cargos).filter(k => k.includes('SUPERVISOR')).reduce((acc, k) => acc + cargos[k], 0);
                    if (supCount < MIN_STAFFING['SUPERVISOR']) {
                        alerts.push({
                            id: `${date}-${term}-${shift}-NOSUP`,
                            date,
                            terminal: term,
                            role: 'SUPERVISOR',
                            shift,
                            level: 'CRITICAL',
                            message: `Sin Supervisor asignado en turno ${shift} (${term})`
                        });
                    }

                    // Check Generic Roles
                    Object.keys(MIN_STAFFING).forEach((roleKeyword) => {
                        if (roleKeyword === 'SUPERVISOR') return; // Handled above

                        // Sum counts for roles matching keyword (e.g. CONDUCTOR A, CONDUCTOR B -> CONDUCTOR)
                        const count = Object.keys(cargos)
                            .filter(k => k.includes(roleKeyword))
                            .reduce((acc, k) => acc + cargos[k], 0);

                        if (count < MIN_STAFFING[roleKeyword] && count > 0) { // Warning if low but not zero (context dependent)
                            alerts.push({
                                id: `${date}-${term}-${shift}-${roleKeyword}`,
                                date,
                                terminal: term,
                                role: roleKeyword,
                                shift,
                                level: 'WARNING',
                                message: `Baja dotación de ${roleKeyword}s (${count}/${MIN_STAFFING[roleKeyword]}) en turno ${shift}`
                            });
                        } else if (count === 0 && roleKeyword === 'CONDUCTOR' && term !== 'LA_REINA') {
                            // Specific rule example: No drivers is critical unless typically none there
                            alerts.push({
                                id: `${date}-${term}-${shift}-${roleKeyword}-ZERO`,
                                date,
                                terminal: term,
                                role: roleKeyword,
                                shift,
                                level: 'INFO',
                                message: `No hay ${roleKeyword}s programados`
                            });
                        }
                    });
                });
            });
        });

        // Filter and Sort Alerts
        // Prioritize: Critical -> Warning -> Info
        // Sort by Date
        const sortedAlerts = alerts.sort((a, b) => {
            const levelScore = { CRITICAL: 0, WARNING: 1, INFO: 2 };
            if (levelScore[a.level] !== levelScore[b.level]) return levelScore[a.level] - levelScore[b.level];
            return a.date.localeCompare(b.date);
        });

        return { alerts: sortedAlerts };
    }, [staff, shiftTypes, weekDates, marks, licenses, permissions, vacations, overrides, incidences, specialTemplates]);
};
