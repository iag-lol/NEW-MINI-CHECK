/**
 * AttendanceGrid - Weekly calendar grid component
 * Shows staff rows with horarios and calculates off days based on shift patterns
 * Implements Ley 40 horas (43 hrs in 2026 = 2 reduced days per week)
 */

import React, { useMemo, useState } from 'react';
import { DayCell } from './DayCell';
import { DayActionPanel } from './DayActionPanel';
import { CARGO_COLORS } from '../utils/colors';
import {
    StaffWithShift,
    AttendanceMark,
    AttendanceLicense,
    AttendancePermission,
    ShiftType,
    ShiftTypeCode,
    StaffShiftOverride,
    StaffShiftSpecialTemplate,
    IncidenceCode,
    CARGO_ORDER,
} from '../types';
import {
    formatDayNumber,
    formatDayOfWeek,
    isToday,
    isOffDay,
    isDateInRange,
    getTurnoFromHorario,
    getReducedHourDays,
} from '../utils/shiftEngine';
import { useSessionStore } from '../../../shared/state/sessionStore';
import {
    useCreateOrUpdateMark,
    useCreateLicense,
    useCreatePermission,
    useBulkMarkPresent,
} from '../hooks';
import { Icon } from '../../../shared/components/common/Icon';

/**
 * Fallback shift patterns when DB doesn't have shift_types data
 */
function getFallbackShiftType(code: ShiftTypeCode): ShiftType | undefined {
    const fallbacks: Record<ShiftTypeCode, ShiftType> = {
        '5X2_FIJO': {
            id: '1',
            code: '5X2_FIJO',
            name: '5x2 Fijo',
            pattern_json: { type: 'fixed', description: 'Lun-Vie trabaja', offDays: [6, 0] },
            created_at: '',
        },
        '5X2_ROTATIVO': {
            id: '2',
            code: '5X2_ROTATIVO',
            name: '5x2 Rotativo',
            pattern_json: {
                type: 'rotating',
                description: 'Rotativo 2 semanas',
                cycle: 2,
                weeks: [{ offDays: [3, 0] }, { offDays: [5, 6] }],
            },
            created_at: '',
        },
        '5X2_SUPER': {
            id: '3',
            code: '5X2_SUPER',
            name: '5x2 Super',
            pattern_json: {
                type: 'rotating',
                description: 'Super 2 semanas',
                cycle: 2,
                weeks: [{ offDays: [3, 0] }, { offDays: [4, 5] }],
            },
            created_at: '',
        },
        'ESPECIAL': {
            id: '4',
            code: 'ESPECIAL',
            name: 'Especial',
            pattern_json: { type: 'manual', description: 'Manual 28 dias', cycleDays: 28 },
            created_at: '',
        },
        'SUPERVISOR_RELEVO': {
            id: '5',
            code: 'SUPERVISOR_RELEVO',
            name: 'Supervisor Relevo',
            pattern_json: {
                type: 'rotating',
                description: 'Sem1: Mié+Dom (2 libres), Sem2: Mié+Vie+Sáb (3 libres)',
                cycle: 2,
                weeks: [{ offDays: [3, 0] }, { offDays: [3, 5, 6] }],
            },
            created_at: '',
        },
    };
    return fallbacks[code];
}

interface IncidenceMap {
    noMarcaciones: { rut: string; date: string }[];
    sinCredenciales: { rut: string; date: string }[];
    cambiosDia: { rut: string; date: string }[];
    autorizaciones: { rut: string; date: string }[];
}

interface AttendanceGridProps {
    staff: StaffWithShift[];
    shiftTypes: ShiftType[];
    marks: AttendanceMark[];
    licenses: AttendanceLicense[];
    permissions: AttendancePermission[];
    vacations: { staff_id: string; start_date: string; end_date: string }[];
    overrides: StaffShiftOverride[];
    incidences: IncidenceMap;
    specialTemplates: StaffShiftSpecialTemplate[];
    weekDates: string[];
    isLoading?: boolean;
    onRequestOffboarding?: (staff: StaffWithShift) => void;
    onOpenShiftConfig?: (staff: StaffWithShift) => void;
}

export const AttendanceGrid = ({
    staff,
    shiftTypes,
    marks,
    licenses,
    permissions,
    vacations,
    overrides,
    incidences,
    specialTemplates,
    weekDates,
    isLoading = false,
    onRequestOffboarding,
    onOpenShiftConfig,
}: AttendanceGridProps) => {
    const session = useSessionStore((s) => s.session);
    const [selectedCell, setSelectedCell] = useState<{
        staff: StaffWithShift;
        date: string;
    } | null>(null);

    const createMarkMutation = useCreateOrUpdateMark();
    const createLicenseMutation = useCreateLicense();
    const createPermissionMutation = useCreatePermission();
    const bulkMarkMutation = useBulkMarkPresent();

    // Group staff by cargo
    const groupedStaff = useMemo(() => {
        const groups: Record<string, StaffWithShift[]> = {};
        for (const cargo of CARGO_ORDER) {
            groups[cargo] = [];
        }

        for (const s of staff) {
            const cargoUpper = s.cargo.toUpperCase();
            let group = 'CLEANER';
            if (cargoUpper.includes('SUPERVISOR')) group = 'SUPERVISOR';
            else if (cargoUpper.includes('INSPECTOR')) group = 'INSPECTOR';
            else if (cargoUpper.includes('CONDUCTOR')) group = 'CONDUCTOR';
            else if (cargoUpper.includes('PLANILLERO')) group = 'PLANILLERO';

            if (groups[group]) {
                groups[group].push(s);
            }
        }

        return groups;
    }, [staff]);

    // Build lookup maps
    const marksMap = useMemo(() => {
        const map = new Map<string, AttendanceMark>();
        for (const m of marks) {
            map.set(`${m.staff_id}-${m.mark_date}`, m);
        }
        return map;
    }, [marks]);

    const shiftTypesMap = useMemo(() => {
        const map = new Map<string, ShiftType>();
        for (const st of shiftTypes) {
            map.set(st.code, st);
        }
        return map;
    }, [shiftTypes]);

    // Build special templates map for ESPECIAL (manual) shift types
    const specialTemplatesMap = useMemo(() => {
        const map = new Map<string, StaffShiftSpecialTemplate>();
        for (const t of specialTemplates) {
            map.set(t.staff_id, t);
        }
        return map;
    }, [specialTemplates]);

    const overridesMap = useMemo(() => {
        const map = new Map<string, StaffShiftOverride>();
        for (const o of overrides) {
            map.set(`${o.staff_id}-${o.override_date}`, o);
        }
        return map;
    }, [overrides]);

    // Helpers
    const getLicenseForDate = (staffId: string, date: string) => {
        return licenses.find(
            (l) => l.staff_id === staffId && isDateInRange(date, l.start_date, l.end_date)
        );
    };

    const getVacationForDate = (staffId: string, date: string) => {
        return vacations.find(
            (v) => v.staff_id === staffId && isDateInRange(date, v.start_date, v.end_date)
        );
    };

    const getPermissionForDate = (staffId: string, date: string) => {
        return permissions.find(
            (p) => p.staff_id === staffId && isDateInRange(date, p.start_date, p.end_date)
        );
    };

    const getIncidencesForDate = (rut: string, date: string): IncidenceCode[] => {
        const codes: IncidenceCode[] = [];
        if (incidences.noMarcaciones.some((i) => i.rut === rut && i.date === date)) codes.push('NM');
        if (incidences.sinCredenciales.some((i) => i.rut === rut && i.date === date)) codes.push('NC');
        if (incidences.cambiosDia.some((i) => i.rut === rut && i.date === date)) {
            codes.push('CD');
            console.log('🔄 CAMBIO DÍA detectado:', rut, date);
        }
        if (incidences.autorizaciones.some((i) => i.rut === rut && i.date === date)) codes.push('AUT');
        return codes;
    };

    /**
     * Get day status for a staff member on a given date
     * Calculates off days based on shift pattern (5x2, etc.)
     */
    const getDayStatus = (s: StaffWithShift, date: string) => {
        const mark = marksMap.get(`${s.id}-${date}`);
        const license = getLicenseForDate(s.id, date);
        const vacation = getVacationForDate(s.id, date);
        const permission = getPermissionForDate(s.id, date);
        const override = overridesMap.get(`${s.id}-${date}`);
        const inc = getIncidencesForDate(s.rut, date);

        // Calculate off day based on shift pattern
        let isOff = false;
        const horario = s.horario;
        const turno = getTurnoFromHorario(s.horario);
        const dayOfWeek = new Date(date + 'T12:00:00').getDay();

        if (s.shift) {
            // Get pattern from DB or use fallback
            let shiftType = shiftTypesMap.get(s.shift.shift_type_code);

            // Fallback patterns if DB doesn't have data
            if (!shiftType?.pattern_json) {
                shiftType = getFallbackShiftType(s.shift.shift_type_code);
            }

            if (shiftType?.pattern_json) {
                // Get special template for manual (ESPECIAL) shift types
                const specialTemplate = specialTemplatesMap.get(s.id);
                isOff = isOffDay(date, s.shift.shift_type_code, s.shift.variant_code, shiftType.pattern_json, specialTemplate, override);

                // Debug log for first date only (to avoid spam)
                if (date === weekDates[0]) {
                    console.log('getDayStatus -', s.nombre, 'shift:', s.shift.shift_type_code, 'variant:', s.shift.variant_code, 'pattern:', shiftType.pattern_json.type, 'isOff:', isOff);
                }
            } else {
                // Last resort fallback: Sat/Sun off
                isOff = dayOfWeek === 0 || dayOfWeek === 6;
                if (date === weekDates[0]) {
                    console.log('getDayStatus -', s.nombre, 'NO PATTERN FOUND, using default Sat/Sun');
                }
            }
        } else {
            // No shift assigned - use default 5x2 (Sat/Sun off)
            isOff = dayOfWeek === 0 || dayOfWeek === 6; // Sunday or Saturday
        }

        // Check if this is a reduced hour day (Ley 40 hrs)
        const reducedDays = getReducedHourDays(weekDates[0]);
        const isReducido = reducedDays.includes(date) && !isOff;

        return {
            mark,
            license,
            vacation,
            permission,
            isOff,
            horario,
            turno,
            reducido: isReducido,
            incidencies: inc,
        };
    };

    // Mass mark all present for today (Local Time)
    const handleMassMarkPresent = () => {
        if (!session) return;

        // Get generic local date YYYY-MM-DD
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const todayStr = `${year}-${month}-${day}`;

        const staffToMark = staff.filter((s) => {
            if (s.status === 'DESVINCULADO') return false;
            const status = getDayStatus(s, todayStr);
            if (status.isOff || status.license || status.vacation || status.permission) return false;
            // Only mark if no mark exists (prevent overwriting 'A' or 'P')
            if (status.mark) return false;
            return true;
        });

        if (staffToMark.length === 0) {
            alert(`No hay personal pendiente de marcar para hoy (${todayStr})`);
            return;
        }

        const uniqueTerminals = Array.from(new Set(staffToMark.map(s => s.terminal_code)));
        const termLabel = uniqueTerminals.length === 1 ? uniqueTerminals[0] : `${uniqueTerminals.length} Terminales`;

        if (confirm(`¿Marcar ${staffToMark.length} personas de ${termLabel} como PRESENTE para la fecha ${todayStr}?`)) {
            bulkMarkMutation.mutate({
                staffIds: staffToMark.map((s) => s.id),
                date: todayStr,
                createdBy: session.supervisorName,
            });
        }
    };

    // Action handlers
    const handleMarkPresent = () => {
        if (!selectedCell || !session) return;
        createMarkMutation.mutate({
            values: {
                staff_id: selectedCell.staff.id,
                mark_date: selectedCell.date,
                mark: 'P',
            },
            createdBy: session.supervisorName,
        });
        setSelectedCell(null);
    };

    const handleMarkAbsent = (note: string) => {
        if (!selectedCell || !session) return;
        createMarkMutation.mutate({
            values: {
                staff_id: selectedCell.staff.id,
                mark_date: selectedCell.date,
                mark: 'A',
                note,
            },
            createdBy: session.supervisorName,
        });
        setSelectedCell(null);
    };

    const handleRegisterLicense = (startDate: string, endDate: string, note?: string) => {
        if (!selectedCell || !session) return;
        createLicenseMutation.mutate({
            values: {
                staff_id: selectedCell.staff.id,
                start_date: startDate,
                end_date: endDate,
                note,
            },
            createdBy: session.supervisorName,
        });
        setSelectedCell(null);
    };

    const handleRegisterPermission = (startDate: string, endDate: string, type: string, note?: string) => {
        if (!selectedCell || !session) return;
        createPermissionMutation.mutate({
            values: {
                staff_id: selectedCell.staff.id,
                start_date: startDate,
                end_date: endDate,
                permission_type: type,
                note,
            },
            createdBy: session.supervisorName,
        });
        setSelectedCell(null);
    };

    const isManager = session && ['Isaac', 'Claudio', 'Cristian'].some(
        (n) => session.supervisorName?.includes(n)
    );

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Icon name="loader" size={24} className="animate-spin text-brand-600" />
                <span className="ml-2 text-slate-600">Cargando...</span>
            </div>
        );
    }

    return (
        <>
            <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
                {/* Mass mark button */}
                <div className="flex items-center justify-between p-3 bg-slate-50 border-b">
                    <span className="text-sm text-slate-600">
                        {staff.length} trabajadores
                    </span>
                    <button
                        onClick={handleMassMarkPresent}
                        disabled={bulkMarkMutation.isPending}
                        className="px-4 py-2 bg-emerald-600 text-white rounded-lg font-medium text-sm hover:bg-emerald-700 transition-colors flex items-center gap-2 disabled:opacity-50"
                    >
                        <Icon name="check" size={16} />
                        {bulkMarkMutation.isPending ? 'Marcando...' : 'Marcar Todos Presente Hoy'}
                    </button>
                </div>

                {/* Grid table */}
                <div className="overflow-x-auto">
                    <table className="w-full border-collapse">
                        {/* Header with day names and dates */}
                        <thead className="bg-slate-50">
                            <tr>
                                <th className="sticky left-0 z-10 bg-slate-100 border-b border-r px-3 py-2 text-left min-w-[220px]">
                                    <span className="text-slate-700 font-semibold text-sm">Personal</span>
                                </th>
                                {weekDates.map((date) => {
                                    const dayName = formatDayOfWeek(date);
                                    const dayNum = formatDayNumber(date);
                                    const isTodayDate = isToday(date);

                                    return (
                                        <th
                                            key={date}
                                            className={`border-b px-1 py-2 text-center min-w-[70px] ${isTodayDate ? 'bg-brand-50' : 'bg-slate-50'
                                                }`}
                                        >
                                            <div className="text-xs font-medium text-slate-500">{dayName}</div>
                                            <div className={`text-lg font-bold ${isTodayDate ? 'text-brand-600' : 'text-slate-700'}`}>
                                                {dayNum}
                                            </div>
                                        </th>
                                    );
                                })}
                            </tr>
                        </thead>

                        <tbody>
                            {CARGO_ORDER.map((cargo) => {
                                const staffInGroup = groupedStaff[cargo] || [];
                                if (staffInGroup.length === 0) return null;

                                return (
                                    <React.Fragment key={cargo}>
                                        {/* Cargo header */}
                                        <tr className={CARGO_COLORS[cargo]}>
                                            <td
                                                colSpan={weekDates.length + 1}
                                                className="sticky left-0 px-3 py-2 font-semibold text-sm text-slate-700 border-b"
                                            >
                                                {cargo} ({staffInGroup.length})
                                            </td>
                                        </tr>

                                        {/* Staff rows */}
                                        {staffInGroup.map((s) => {
                                            const isDesvinculado = s.status === 'DESVINCULADO';
                                            const shiftType = s.shift ? shiftTypesMap.get(s.shift.shift_type_code) : null;

                                            return (
                                                <tr
                                                    key={s.id}
                                                    className={`hover:bg-slate-50/50 transition-colors ${isDesvinculado ? 'bg-slate-50 opacity-60' : ''
                                                        }`}
                                                >
                                                    {/* Staff info cell */}
                                                    <td className="sticky left-0 z-10 bg-white border-b border-r px-3 py-2">
                                                        <div className="flex items-center gap-2">
                                                            <div className="flex-1 min-w-0">
                                                                <div className={`font-medium text-sm text-slate-800 truncate ${isDesvinculado ? 'line-through' : ''}`}>
                                                                    {s.nombre}
                                                                </div>
                                                                <div className="text-xs text-slate-500 truncate">
                                                                    {s.rut} | {s.horario || 'Sin horario'}
                                                                    {shiftType && <span className="ml-1 text-brand-600">({shiftType.name})</span>}
                                                                </div>
                                                            </div>
                                                            {onOpenShiftConfig && (
                                                                <button
                                                                    onClick={() => onOpenShiftConfig(s)}
                                                                    className="p-1.5 hover:bg-slate-100 rounded text-slate-400 hover:text-brand-600 transition-colors"
                                                                    title="Configurar turno y días libres"
                                                                >
                                                                    <Icon name="settings" size={16} />
                                                                </button>
                                                            )}
                                                            {s.admonitionCount && s.admonitionCount > 0 && (
                                                                <span className="px-1.5 py-0.5 text-xs font-medium bg-red-100 text-red-700 rounded">
                                                                    {s.admonitionCount}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </td>

                                                    {/* Day cells */}
                                                    {weekDates.map((date) => {
                                                        const status = getDayStatus(s, date);

                                                        return (
                                                            <td key={date} className="border-b p-0.5">
                                                                <DayCell
                                                                    date={date}
                                                                    isOff={status.isOff}
                                                                    horario={status.isOff ? undefined : status.horario}
                                                                    reducido={status.reducido}
                                                                    turno={status.turno}
                                                                    mark={status.mark}
                                                                    incidencies={status.incidencies}
                                                                    isToday={isToday(date)}
                                                                    isDisabled={isDesvinculado}
                                                                    licenseCode={status.license ? 'LIC' : undefined}
                                                                    vacationCode={status.vacation ? 'VAC' : undefined}
                                                                    permissionCode={status.permission ? 'PER' : undefined}
                                                                    onClick={() => setSelectedCell({ staff: s, date })}
                                                                />
                                                            </td>
                                                        );
                                                    })}
                                                </tr>
                                            );
                                        })}
                                    </React.Fragment>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Action panel */}
            <DayActionPanel
                isOpen={selectedCell !== null}
                onClose={() => setSelectedCell(null)}
                staff={selectedCell?.staff ?? null}
                date={selectedCell?.date ?? ''}
                currentMark={selectedCell ? marksMap.get(`${selectedCell.staff.id}-${selectedCell.date}`)?.mark : undefined}
                currentNote={selectedCell ? marksMap.get(`${selectedCell.staff.id}-${selectedCell.date}`)?.note ?? undefined : undefined}
                incidencies={selectedCell ? getIncidencesForDate(selectedCell.staff.rut, selectedCell.date) : []}
                onMarkPresent={handleMarkPresent}
                onMarkAbsent={handleMarkAbsent}
                onRegisterLicense={handleRegisterLicense}
                onRegisterPermission={handleRegisterPermission}
                onRegisterVacation={() => { }}
                onRequestOffboarding={
                    isManager && onRequestOffboarding && selectedCell
                        ? () => onRequestOffboarding(selectedCell.staff)
                        : undefined
                }
                isManager={isManager ?? false}
            />
        </>
    );
};
