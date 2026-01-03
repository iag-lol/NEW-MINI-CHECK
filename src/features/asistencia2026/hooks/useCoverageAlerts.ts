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

        // Iterate through each day of the week
        weekDates.forEach((date) => {
            // Group by Terminal -> Shift -> Cargo
            // We track: citados (Scheduled), libres (Off)
            const coverage: Record<string, Record<string, Record<string, { citados: number; libres: number }>>> = {};

            staff.forEach((s) => {
                if (s.status === 'DESVINCULADO') return;

                // 1. Determine if OFF (Libre) based on Pattern/Schedule
                let effectiveShiftType = s.shift ? shiftTypes.find(st => st.code === s.shift!.shift_type_code) : null;
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
                        isOff = dayOfWeek === 0 || dayOfWeek === 6;
                    }
                } else {
                    const dayOfWeek = new Date(date + 'T12:00:00').getDay();
                    isOff = dayOfWeek === 0 || dayOfWeek === 6;
                }

                // 2. Determine Validity (Absences)
                // Even if "Scheduled" (not off), if they have License/Vacation, they count as a gap, NOT as coverage.
                let isAbsent = false;
                if (!isOff) {
                    const hasLicense = licenses.some(l => l.staff_id === s.id && date >= l.start_date && date <= l.end_date);
                    const hasVacation = vacations.some(v => v.rut === s.rut && date >= v.start_date && date <= v.end_date);
                    const hasPerm = permissions.some(p => p.staff_id === s.id && date >= p.start_date && date <= p.end_date);

                    if (hasLicense || hasVacation || hasPerm) isAbsent = true;
                }

                // "Evaluated Status" for planning
                // Citado = !isOff && !isAbsent
                const isCitado = !isOff && !isAbsent;

                // 3. Determine Shift (DIA/NOCHE) 
                let shift: 'DIA' | 'NOCHE' = getTurnoFromHorario(s.horario);
                if (s.shift?.shift_type_code === 'ESPECIAL') {
                    const specialTemplateFound = specialTemplates.find(t => t.staff_id === s.id);
                    if (specialTemplateFound) {
                        const details = getSpecialShiftDetails(date, specialTemplateFound);
                        shift = details.type;
                    }
                }

                // 4. Accumulate
                const term = s.terminal_code;
                const cargo = s.cargo.toUpperCase();

                if (!coverage[term]) coverage[term] = { DIA: {}, NOCHE: {} };
                if (!coverage[term][shift][cargo]) coverage[term][shift][cargo] = { citados: 0, libres: 0 };

                if (isCitado) coverage[term][shift][cargo].citados++;
                if (isOff) coverage[term][shift][cargo].libres++;
            });

            // Analyze Coverage & Generate Alerts
            Object.entries(coverage).forEach(([term, shifts]) => {
                (['DIA', 'NOCHE'] as const).forEach((shift) => {
                    const cargos = shifts[shift];

                    // Check Supervisor Coverage
                    // Find all keys containing 'SUPERVISOR'
                    const supervisorCounts = Object.keys(cargos)
                        .filter(k => k.includes('SUPERVISOR'))
                        .map(k => cargos[k].citados)
                        .reduce((a, b) => a + b, 0);

                    if (supervisorCounts < MIN_STAFFING['SUPERVISOR']) {
                        alerts.push({
                            id: `${date}-${term}-${shift}-NOSUP`,
                            date,
                            terminal: term,
                            role: 'SUPERVISOR',
                            shift,
                            level: 'CRITICAL',
                            message: `Sin Supervisor asignado en turno ${shift} (${term}). Requeridos: ${MIN_STAFFING['SUPERVISOR']}, Citados: ${supervisorCounts}`
                        });
                    }

                    // Check Other Roles
                    Object.keys(MIN_STAFFING).forEach((roleKeyword) => {
                        if (roleKeyword === 'SUPERVISOR') return;

                        const citadosCount = Object.keys(cargos)
                            .filter(k => k.includes(roleKeyword))
                            .reduce((acc, k) => acc + cargos[k].citados, 0);

                        const required = MIN_STAFFING[roleKeyword];

                        if (citadosCount < required) {
                            const deficit = required - citadosCount;
                            const level = citadosCount === 0 ? 'CRITICAL' : 'WARNING';
                            alerts.push({
                                id: `${date}-${term}-${shift}-${roleKeyword}`,
                                date,
                                terminal: term,
                                role: roleKeyword,
                                shift,
                                level,
                                message: `Faltan ${deficit} ${roleKeyword}(s) en turno ${shift}. (Citados: ${citadosCount}/${required})`
                            });
                        }
                    });
                });
            });
        });

        const sortedAlerts = alerts.sort((a, b) => {
            const levelScore = { CRITICAL: 0, WARNING: 1, INFO: 2 };
            if (levelScore[a.level] !== levelScore[b.level]) return levelScore[a.level] - levelScore[b.level];
            return a.date.localeCompare(b.date);
        });

        return { alerts: sortedAlerts };
    }, [staff, shiftTypes, weekDates, marks, licenses, permissions, vacations, overrides, incidences, specialTemplates]);
};
