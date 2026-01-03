import { useMemo } from 'react';
import { StaffWithShift, ShiftType, AttendanceMark, AttendanceLicense, AttendanceVacation, AttendancePermission, StaffShiftSpecialTemplate, StaffShiftOverride, AttendanceIncidences } from '../types';
import { getFallbackShiftType, isOffDay, getSpecialShiftDetails, getTurnoFromHorario, formatDayOfWeek, isPastDate, determineDailyShift } from '../utils/shiftEngine';

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
const DEFAULT_MIN_STAFFING: Record<string, number> = {
    'SUPERVISOR': 1,
    'INSPECTOR': 1,
    'CONDUCTOR': 2,
    'PLANILLERO': 1,
    'CLEANER': 1,
};

// Terminal-specific exceptions (overrides default)
const TERMINAL_EXCEPTIONS: Record<string, Record<string, number>> = {
    'EL DESCANSO': {
        'CLEANER': 1,
        'SUPERVISOR': 0,
        'INSPECTOR': 0,
        'CONDUCTOR': 0,
        'PLANILLERO': 0
    },
    'MARIA': {
        'SUPERVISOR': 0
    },
    // Add more exceptions here if needed (e.g., specific codes like 'T-MARIA')
};

const getRequiredStaff = (terminal: string, role: string): number => {
    // 1. Try Specific Exception for Terminal
    const termConfig = Object.entries(TERMINAL_EXCEPTIONS).find(([key]) => terminal.toUpperCase().includes(key));
    if (termConfig && termConfig[1][role] !== undefined) {
        return termConfig[1][role];
    }

    // 2. Default Global Requirement
    return DEFAULT_MIN_STAFFING[role] || 0;
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
            // We track: citados (Scheduled), libres (Off), ausentes (Absent), total (Total Staff)
            const coverage: Record<string, Record<string, Record<string, { citados: number; libres: number; ausentes: number; total: number }>>> = {};

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

                // 3. Determine Shift (DIA/NOCHE) - Consolidated Logic
                const shift: 'DIA' | 'NOCHE' = determineDailyShift(
                    s.horario,
                    s.shift,
                    date,
                    specialTemplates,
                    s.id,
                    shiftTypes
                );

                // 4. Accumulate
                const term = s.terminal_code;
                const cargo = s.cargo.toUpperCase();

                if (!coverage[term]) coverage[term] = { DIA: {}, NOCHE: {} };
                if (!coverage[term][shift][cargo]) coverage[term][shift][cargo] = { citados: 0, libres: 0, ausentes: 0, total: 0 };

                coverage[term][shift][cargo].total++;
                if (isCitado) coverage[term][shift][cargo].citados++;
                if (isOff) coverage[term][shift][cargo].libres++;
                if (isAbsent && !isOff) coverage[term][shift][cargo].ausentes++; // Only count absence if they were supposed to work (not off)
            });

            // Analyze Coverage & Generate Alerts
            Object.entries(coverage).forEach(([term, shifts]) => {
                (['DIA', 'NOCHE'] as const).forEach((shift) => {
                    const cargos = shifts[shift];

                    // Check Supervisor Coverage
                    const requiredSup = getRequiredStaff(term, 'SUPERVISOR');
                    if (requiredSup > 0) {
                        // Find all keys containing 'SUPERVISOR'
                        const supStats = Object.keys(cargos)
                            .filter(k => k.includes('SUPERVISOR'))
                            .reduce((acc, k) => ({
                                citados: acc.citados + cargos[k].citados,
                                libres: acc.libres + cargos[k].libres,
                                ausentes: acc.ausentes + cargos[k].ausentes,
                                total: acc.total + cargos[k].total
                            }), { citados: 0, libres: 0, ausentes: 0, total: 0 });

                        if (supStats.citados < requiredSup) {
                            alerts.push({
                                id: `${date}-${term}-${shift}-NOSUP`,
                                date,
                                terminal: term,
                                role: 'SUPERVISOR',
                                shift,
                                level: 'CRITICAL',
                                message: `Sin Supervisor asignado en turno ${shift} (${term}). Requeridos: ${requiredSup} | Actual: ${supStats.citados} (Total: ${supStats.total}, Libres: ${supStats.libres}, Ausentes: ${supStats.ausentes})`
                            });
                        }
                    }

                    // Check Other Roles
                    Object.keys(DEFAULT_MIN_STAFFING).forEach((roleKeyword) => {
                        if (roleKeyword === 'SUPERVISOR') return;

                        const required = getRequiredStaff(term, roleKeyword);
                        if (required === 0) return; // Skip if not needed for this terminal

                        const stats = Object.keys(cargos)
                            .filter(k => k.includes(roleKeyword))
                            .reduce((acc, k) => ({
                                citados: acc.citados + cargos[k].citados,
                                libres: acc.libres + cargos[k].libres,
                                ausentes: acc.ausentes + cargos[k].ausentes,
                                total: acc.total + cargos[k].total
                            }), { citados: 0, libres: 0, ausentes: 0, total: 0 });

                        if (stats.citados < required) {
                            const deficit = required - stats.citados;
                            const level = stats.citados === 0 ? 'CRITICAL' : 'WARNING';
                            alerts.push({
                                id: `${date}-${term}-${shift}-${roleKeyword}`,
                                date,
                                terminal: term,
                                role: roleKeyword,
                                shift,
                                level,
                                message: `Faltan ${deficit} ${roleKeyword}(s) en turno ${shift}. (Citados: ${stats.citados}/${required} | Dotación: ${stats.total}, Libres: ${stats.libres}, Ausentes: ${stats.ausentes})`
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
