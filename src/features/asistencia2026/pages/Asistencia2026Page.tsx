/**
 * Asistencia2026Page - Main page for 2026 attendance management
 * Weekly view with navigation, mass attendance, and shift configuration
 */

import { useState, useMemo } from 'react';
import { Icon } from '../../../shared/components/common/Icon';
import { useTerminalStore } from '../../../shared/state/terminalStore';
import { useSessionStore } from '../../../shared/state/sessionStore';
import { TerminalCode } from '../../../shared/types/terminal';
import { emailService } from '../../../shared/services/emailService';
import {
    useShiftTypes,
    useStaffWithShifts,
    useMarksForWeek,
    useLicensesForWeek,
    usePermissionsForWeek,
    useVacationsForWeek,
    useOverridesForWeek,
    useIncidencesForWeek,
    useAdmonitionsForWeek, // Added
    useAllSpecialTemplates,
    useCreateOffboardingRequest,
    useAsistencia2026Realtime,
} from '../hooks';
import { AttendanceGrid } from '../components/AttendanceGrid';
import { KpiBar } from '../components/KpiBar';
import { ShiftLegend } from '../components/ShiftLegend';
import { RutPdfExportModal } from '../components/RutPdfExportModal';
import { OffboardingRequestModal } from '../components/OffboardingRequestModal';
import { ShiftConfigModal } from '../components/ShiftConfigModal';
import { TERMINAL_COLORS, BUTTON_VARIANTS } from '../utils/colors';
import {
    getWeekStart,
    getWeekDates,
    getPreviousWeek,
    getNextWeek,
    formatWeekRange,
    getTurnoFromHorario,
    isPastDate,
    getLocalTodayStr,
    isOffDay,
    getReducedHourDays,
    getFallbackShiftType,
    getSpecialShiftDetails,
} from '../utils/shiftEngine';
import { GridFilters, StaffWithShift, Asistencia2026KPIs } from '../types';
import * as XLSX from 'xlsx';

const TERMINALS: { value: TerminalCode | 'ALL'; label: string }[] = [
    { value: 'ALL', label: 'Todos' },
    { value: 'EL_ROBLE', label: 'El Roble' },
    { value: 'LA_REINA', label: 'La Reina' },
    { value: 'MARIA_ANGELICA', label: 'María Angélica' },
    { value: 'EL_DESCANSO', label: 'El Descanso' },
];

const TURNO_OPTIONS = [
    { value: 'TODOS', label: 'Todos' },
    { value: 'DIA', label: 'Día' },
    { value: 'NOCHE', label: 'Noche' },
] as const;

export const Asistencia2026Page = () => {
    const terminalContext = useTerminalStore((s) => s.context);
    const session = useSessionStore((s) => s.session);

    // Week navigation - start with current week
    const today = getLocalTodayStr();
    const [weekStart, setWeekStart] = useState(() => getWeekStart(today));
    const weekDates = useMemo(() => getWeekDates(weekStart), [weekStart]);

    // Derived dates for API fetching (RANGE BASED)
    const startDate = weekDates[0];
    const endDate = weekDates[6];

    // Get month/year only for PDF modal or legacy logic NOT for main grid anymore
    const weekMiddleDate = new Date(weekDates[3] + 'T12:00:00');
    const month = weekMiddleDate.getMonth();
    const year = weekMiddleDate.getFullYear();

    // Filters
    const [filters, setFilters] = useState<GridFilters>({
        month,
        year,
        terminal: 'ALL',
        turno: 'TODOS',
        search: '',
    });

    // Modals
    const [isPdfModalOpen, setIsPdfModalOpen] = useState(false);
    const [offboardingStaff, setOffboardingStaff] = useState<StaffWithShift | null>(null);
    const [shiftConfigStaff, setShiftConfigStaff] = useState<StaffWithShift | null>(null);

    // Realtime
    useAsistencia2026Realtime();

    // Data queries (Updated to use RANGE)
    const { data: shiftTypes = [], isLoading: loadingTypes } = useShiftTypes();
    const { data: staff = [], isLoading: loadingStaff } = useStaffWithShifts(terminalContext, filters);

    const staffIds = useMemo(() => staff.map((s) => s.id), [staff]);

    const { data: marks = [], isLoading: loadingMarks } = useMarksForWeek(staffIds, startDate, endDate);
    const { data: licenses = [], isLoading: loadingLicenses } = useLicensesForWeek(staffIds, startDate, endDate);
    const { data: permissions = [], isLoading: loadingPermissions } = usePermissionsForWeek(staffIds, startDate, endDate);
    const { data: vacations = [], isLoading: loadingVacations } = useVacationsForWeek(staffIds, startDate, endDate);
    const { data: overrides = [], isLoading: loadingOverrides } = useOverridesForWeek(staffIds, startDate, endDate);
    const { data: incidences, isLoading: loadingIncidences } = useIncidencesForWeek(terminalContext, startDate, endDate);
    const { data: admonitions = [], isLoading: loadingAdmonitions } = useAdmonitionsForWeek(terminalContext, startDate, endDate); // Added
    const { data: specialTemplates = [] } = useAllSpecialTemplates(staffIds);

    const offboardingMutation = useCreateOffboardingRequest();

    const isLoading = loadingTypes || loadingStaff || loadingMarks || loadingLicenses ||
        loadingPermissions || loadingVacations || loadingOverrides || loadingIncidences || loadingAdmonitions;

    // KPIs
    const kpis = useMemo<Asistencia2026KPIs>(() => {
        const byPosition = { SUPERVISOR: 0, INSPECTOR: 0, CONDUCTOR: 0, PLANILLERO: 0, CLEANER: 0 };
        let programmmedDay = 0, programmedNight = 0;
        let onLicense = 0, onVacation = 0, onPermission = 0, withIncidencies = 0, pendingMarks = 0;

        const todayStr = getLocalTodayStr();
        const activeIncidenceRuts = new Set<string>();

        if (incidences) {
            incidences.noMarcaciones.forEach((i) => activeIncidenceRuts.add(i.rut));
            incidences.sinCredenciales.forEach((i) => activeIncidenceRuts.add(i.rut));
            incidences.cambiosDia.forEach((i) => activeIncidenceRuts.add(i.rut));
            incidences.autorizaciones.forEach((i) => activeIncidenceRuts.add(i.rut));
        }
        admonitions.forEach(a => {
            const s = staff.find(st => st.id === a.staff_id);
            if (s) activeIncidenceRuts.add(s.rut);
        });

        for (const s of staff) {
            const cargoUpper = s.cargo.toUpperCase();
            if (cargoUpper.includes('SUPERVISOR')) byPosition.SUPERVISOR++;
            else if (cargoUpper.includes('INSPECTOR')) byPosition.INSPECTOR++;
            else if (cargoUpper.includes('CONDUCTOR')) byPosition.CONDUCTOR++;
            else if (cargoUpper.includes('PLANILLERO')) byPosition.PLANILLERO++;
            else byPosition.CLEANER++;

            const turno = getTurnoFromHorario(s.horario);
            if (turno === 'DIA') programmmedDay++;
            else programmedNight++;

            const hasLicenseToday = licenses.some((l) => l.staff_id === s.id && todayStr >= l.start_date && todayStr <= l.end_date);
            const hasVacationToday = vacations.some((v) => v.staff_id === s.id && todayStr >= v.start_date && todayStr <= v.end_date);
            const hasPermissionToday = permissions.some((p) => p.staff_id === s.id && todayStr >= p.start_date && todayStr <= p.end_date);

            if (hasLicenseToday) onLicense++;
            if (hasVacationToday) onVacation++;
            if (hasPermissionToday) onPermission++;
            if (activeIncidenceRuts.has(s.rut)) withIncidencies++;

            // Pending marks check
            const staffMarks = marks.filter((m) => m.staff_id === s.id);
            for (const date of weekDates) {
                if (!isPastDate(date)) continue;
                const hasMark = staffMarks.some((m) => m.mark_date === date);
                const hasAbsence = licenses.some((l) => l.staff_id === s.id && date >= l.start_date && date <= l.end_date) ||
                    vacations.some((v) => v.staff_id === s.id && date >= v.start_date && date <= v.end_date) ||
                    permissions.some((p) => p.staff_id === s.id && date >= p.start_date && date <= p.end_date);
                if (!hasMark && !hasAbsence) { pendingMarks++; break; }
            }
        }

        return { byPosition, programmmedDay, programmedNight, onLicense, onVacation, onPermission, withIncidencies, pendingMarks };
    }, [staff, marks, licenses, permissions, vacations, incidences, admonitions, weekDates]);

    // Week navigation
    const handlePrevWeek = () => setWeekStart(getPreviousWeek(weekStart));
    const handleNextWeek = () => setWeekStart(getNextWeek(weekStart));
    const handleGoToToday = () => setWeekStart(getWeekStart(today));

    // Terminal change
    const handleTerminalChange = (terminal: TerminalCode | 'ALL') => {
        setFilters((f) => ({ ...f, terminal }));
    };

    // Export XLSX - Professional Dashboard & Report
    const handleExportXlsx = () => {
        const wb = XLSX.utils.book_new();
        const weekRange = formatWeekRange(weekStart);

        // Helper to format date for column headers
        const formatDateHeader = (dateStr: string) => {
            const d = new Date(dateStr + 'T12:00:00');
            const days = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
            return `${days[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`;
        };

        const getStatusText = (s: StaffWithShift, date: string): string => {
            const mark = marks.find(m => m.staff_id === s.id && m.mark_date === date);
            const hasLicense = licenses.some(l => l.staff_id === s.id && date >= l.start_date && date <= l.end_date);
            const hasVacation = vacations.some(v => v.staff_id === s.id && date >= v.start_date && date <= v.end_date);
            const hasPerm = permissions.some(p => p.staff_id === s.id && date >= p.start_date && date <= p.end_date);

            if (hasLicense) return 'LIC';
            if (hasVacation) return 'VAC';
            if (hasPerm) return 'PER';
            if (mark) return mark.mark;

            const shiftType = s.shift ? shiftTypes.find(st => st.code === s.shift!.shift_type_code) : null;
            let isOff = false;

            if (s.shift) {
                let effectiveShiftType = shiftType;
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

            if (isOff) return 'L';

            // Check for Special Details (D/N, Early Exit)
            if (s.shift && s.shift.shift_type_code === 'ESPECIAL') {
                const specialTemplateFound = specialTemplates.find(t => t.staff_id === s.id);
                if (specialTemplateFound) {
                    const details = getSpecialShiftDetails(date, specialTemplateFound);
                    if (details.earlyExit) return `Salida: ${details.earlyExit}`;
                }
            }

            return '-';
        };

        // ===== SHEET 1: DASHBOARD / GENERAL =====
        const totalMarks = marks.length;
        const totalLicenses = licenses.filter(l => l.start_date <= endDate && l.end_date >= startDate).length;
        const totalVacations = vacations.filter(v => v.start_date <= endDate && v.end_date >= startDate).length;
        const totalIncidences = (incidences?.noMarcaciones.length || 0) + (incidences?.sinCredenciales.length || 0) + (incidences?.cambiosDia.length || 0) + (incidences?.autorizaciones.length || 0);

        const dashboardData = [
            { Concepto: 'REPORTE SEMANAL ASISTENCIA 2026', Valor: '' },
            { Concepto: 'Semana', Valor: weekRange },
            { Concepto: 'Fecha y Hora Generación', Valor: new Date().toLocaleString('es-CL') },
            { Concepto: 'Generado Por', Valor: session?.supervisorName || 'Sistema' },
            { Concepto: '', Valor: '' },
            { Concepto: 'RESUMEN ESTADÍSTICO', Valor: '' },
            { Concepto: 'Total Personal Activo', Valor: staff.length },
            { Concepto: 'Total Marcas Recibidas', Valor: totalMarks },
            { Concepto: 'Licencias Médicas Activas', Valor: totalLicenses },
            { Concepto: 'Vacaciones en Curso', Valor: totalVacations },
            { Concepto: 'Incidencias Totales', Valor: totalIncidences },
            { Concepto: 'Amonestaciones/Informes', Valor: admonitions.length },
        ];
        const wsDashboard = XLSX.utils.json_to_sheet(dashboardData, { skipHeader: true });
        wsDashboard['!cols'] = [{ wch: 30 }, { wch: 40 }];
        // Add minimal title styling mock by merging
        wsDashboard['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 1 } }];
        XLSX.utils.book_append_sheet(wb, wsDashboard, 'Resumen Gerencial');


        // ===== SHEET 2: ASISTENCIA DETALLADA =====
        const attendanceData = staff.map(s => {
            const row: Record<string, string> = {
                'RUT': s.rut,
                'NOMBRE COMPLETO': s.nombre,
                'CARGO': s.cargo,
                'TERMINAL': s.terminal_code,
                'TURNO': s.horario || '',
            };
            for (const date of weekDates) {
                row[formatDateHeader(date)] = getStatusText(s, date);
            }
            return row;
        });

        const wsAttendance = XLSX.utils.json_to_sheet(attendanceData);
        wsAttendance['!cols'] = [
            { wch: 12 }, { wch: 35 }, { wch: 20 }, { wch: 12 }, { wch: 15 },
            ...weekDates.map(() => ({ wch: 12 })),
        ];
        XLSX.utils.book_append_sheet(wb, wsAttendance, 'Asistencia Detallada');


        // ===== SHEET 3: NO MARCACIONES =====
        const nmData = incidences?.noMarcaciones
            ?.filter(item => item.date >= startDate && item.date <= endDate)
            ?.map(item => {
                const s = staff.find(st => st.rut === item.rut);
                return {
                    'FECHA': item.date,
                    'RUT': item.rut,
                    'NOMBRE': s?.nombre || 'N/A',
                    'CARGO': s?.cargo || 'N/A',
                    'TERMINAL': s?.terminal_code || 'N/A',
                };
            }) || [];
        const wsNM = XLSX.utils.json_to_sheet(nmData.length > 0 ? nmData : [{ 'Status': 'Sin Registros' }]);
        wsNM['!cols'] = [{ wch: 12 }, { wch: 12 }, { wch: 30 }, { wch: 15 }, { wch: 12 }];
        XLSX.utils.book_append_sheet(wb, wsNM, 'No Marcacion');


        // ===== SHEET 4: SIN CREDENCIAL =====
        const scData = incidences?.sinCredenciales
            ?.filter(item => item.date >= startDate && item.date <= endDate)
            ?.map(item => {
                const s = staff.find(st => st.rut === item.rut);
                return {
                    'FECHA': item.date,
                    'RUT': item.rut,
                    'NOMBRE': s?.nombre || 'N/A',
                    'CARGO': s?.cargo || 'N/A',
                    'TERMINAL': s?.terminal_code || 'N/A',
                };
            }) || [];
        const wsSC = XLSX.utils.json_to_sheet(scData.length > 0 ? scData : [{ 'Status': 'Sin Registros' }]);
        wsSC['!cols'] = [{ wch: 12 }, { wch: 12 }, { wch: 30 }, { wch: 15 }, { wch: 12 }];
        XLSX.utils.book_append_sheet(wb, wsSC, 'Sin Credencial');


        // ===== SHEET 5: CAMBIOS DE DÍA =====
        const cdData = incidences?.cambiosDia
            ?.filter(item => item.date >= startDate && item.date <= endDate)
            ?.map(item => {
                const s = staff.find(st => st.rut === item.rut);
                return {
                    'FECHA ORIGINAL': item.date,
                    'FECHA CAMBIO': item.target_date,
                    'RUT': item.rut,
                    'NOMBRE': s?.nombre || 'N/A',
                    'CARGO': s?.cargo || 'N/A',
                };
            }) || [];
        const wsCD = XLSX.utils.json_to_sheet(cdData.length > 0 ? cdData : [{ 'Status': 'Sin Registros' }]);
        wsCD['!cols'] = [{ wch: 15 }, { wch: 15 }, { wch: 12 }, { wch: 30 }, { wch: 15 }];
        XLSX.utils.book_append_sheet(wb, wsCD, 'Cambios de Dia');


        // ===== SHEET 6: AUTORIZACIONES =====
        const autData = incidences?.autorizaciones
            ?.filter(item => item.date >= startDate && item.date <= endDate)
            ?.map(item => {
                const s = staff.find(st => st.rut === item.rut);
                return {
                    'FECHA': item.date,
                    'RUT': item.rut,
                    'NOMBRE': s?.nombre || 'N/A',
                    'CARGO': s?.cargo || 'N/A',
                };
            }) || [];
        const wsAut = XLSX.utils.json_to_sheet(autData.length > 0 ? autData : [{ 'Status': 'Sin Registros' }]);
        wsAut['!cols'] = [{ wch: 12 }, { wch: 12 }, { wch: 30 }, { wch: 15 }];
        XLSX.utils.book_append_sheet(wb, wsAut, 'Autorizaciones');


        // ===== SHEET 7: VACACIONES =====
        const vacData = vacations
            .filter(v => v.end_date >= startDate && v.start_date <= endDate)
            .map(v => {
                const s = staff.find(st => st.id === v.staff_id);
                return {
                    'RUT': s?.rut || 'N/A',
                    'NOMBRE': s?.nombre || 'N/A',
                    'CARGO': s?.cargo || 'N/A',
                    'INICIO': v.start_date,
                    'TERMINO': v.end_date,
                };
            });
        const wsVac = XLSX.utils.json_to_sheet(vacData.length > 0 ? vacData : [{ 'Status': 'Sin Registros' }]);
        wsVac['!cols'] = [{ wch: 12 }, { wch: 30 }, { wch: 15 }, { wch: 12 }, { wch: 12 }];
        XLSX.utils.book_append_sheet(wb, wsVac, 'Vacaciones');


        // ===== SHEET 8: LICENCIAS =====
        const licData = licenses
            .filter(l => l.end_date >= startDate && l.start_date <= endDate)
            .map(l => {
                const s = staff.find(st => st.id === l.staff_id);
                return {
                    'RUT': s?.rut || 'N/A',
                    'NOMBRE': s?.nombre || 'N/A',
                    'CARGO': s?.cargo || 'N/A',
                    'INICIO': l.start_date,
                    'TERMINO': l.end_date,
                    'NOTA': l.note || '',
                };
            });
        const wsLic = XLSX.utils.json_to_sheet(licData.length > 0 ? licData : [{ 'Status': 'Sin Registros' }]);
        wsLic['!cols'] = [{ wch: 12 }, { wch: 30 }, { wch: 15 }, { wch: 12 }, { wch: 12 }, { wch: 30 }];
        XLSX.utils.book_append_sheet(wb, wsLic, 'Licencias');


        // ===== SHEET 9: INFORMES (ADMONITIONS) =====
        const informData = admonitions
            .filter(a => a.date >= startDate && a.date <= endDate)
            .map(a => {
                const s = staff.find(st => st.id === a.staff_id);
                return {
                    'FECHA': a.date,
                    'RUT': s?.rut || 'N/A',
                    'NOMBRE': s?.nombre || 'N/A',
                    'CARGO': s?.cargo || 'N/A',
                    'MOTIVO': a.reason,
                };
            });
        const wsInf = XLSX.utils.json_to_sheet(informData.length > 0 ? informData : [{ 'Status': 'Sin Registros' }]);
        wsInf['!cols'] = [{ wch: 12 }, { wch: 12 }, { wch: 30 }, { wch: 15 }, { wch: 50 }];
        XLSX.utils.book_append_sheet(wb, wsInf, 'Informes');

        // Save
        const fileName = `Reporte_Asistencia_${weekRange.replace(/\s/g, '_').replace(/\//g, '-')}.xlsx`;
        XLSX.writeFile(wb, fileName);
    };

    // Offboarding
    const handleOffboardingRequest = async (reason: string) => {
        if (!offboardingStaff || !session) return;

        try {
            await offboardingMutation.mutateAsync({
                values: {
                    staff_id: offboardingStaff.id,
                    staff_rut: offboardingStaff.rut,
                    staff_name: offboardingStaff.nombre,
                    terminal_code: offboardingStaff.terminal_code,
                    reason,
                },
                requestedBy: session.supervisorName,
            });

            await emailService.sendEmail({
                audience: 'manual',
                manualRecipients: ['rrhh@empresa.cl'],
                subject: `Solicitud de Desvinculación - ${offboardingStaff.nombre}`,
                body: `Se ha solicitado la desvinculación del trabajador:\n\nNombre: ${offboardingStaff.nombre}\nRUT: ${offboardingStaff.rut}\nCargo: ${offboardingStaff.cargo}\nTerminal: ${offboardingStaff.terminal_code}\n\nMotivo:\n${reason}\n\nSolicitado por: ${session.supervisorName}\nFecha: ${new Date().toLocaleString('es-CL')}`,
                module: 'asistencia',
            });

            setOffboardingStaff(null);
        } catch (error) {
            console.error('Error creating offboarding request:', error);
        }
    };

    return (
        <div className="space-y-4">
            {/* Header bar */}
            <div className="bg-white rounded-lg border p-4 space-y-4">
                {/* Row 1: Week navigator + Terminal buttons */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    {/* Week navigator */}
                    <div className="flex items-center gap-2">
                        <button
                            onClick={handlePrevWeek}
                            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                            title="Semana anterior"
                        >
                            <Icon name="chevron-left" size={20} />
                        </button>
                        <div className="text-center min-w-[180px]">
                            <div className="font-semibold text-slate-800">
                                {formatWeekRange(weekStart)}
                            </div>
                        </div>
                        <button
                            onClick={handleNextWeek}
                            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                            title="Semana siguiente"
                        >
                            <Icon name="chevron-right" size={20} />
                        </button>
                        <button
                            onClick={handleGoToToday}
                            className="px-3 py-1.5 text-xs font-medium bg-brand-100 text-brand-700 rounded-lg hover:bg-brand-200"
                        >
                            Hoy
                        </button>
                    </div>

                    {/* Terminal buttons */}
                    <div className="flex flex-wrap gap-2">
                        {TERMINALS.map((t) => (
                            <button
                                key={t.value}
                                onClick={() => handleTerminalChange(t.value)}
                                className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors ${filters.terminal === t.value
                                    ? TERMINAL_COLORS[t.value]
                                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                    }`}
                            >
                                {t.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Row 2: Turno filter + Search + Export buttons */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                    {/* Turno filter */}
                    <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
                        {TURNO_OPTIONS.map((opt) => (
                            <button
                                key={opt.value}
                                onClick={() => setFilters((f) => ({ ...f, turno: opt.value }))}
                                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${filters.turno === opt.value
                                    ? 'bg-white text-slate-800 shadow-sm'
                                    : 'text-slate-600 hover:text-slate-800'
                                    }`}
                            >
                                {opt.label}
                            </button>
                        ))}
                    </div>

                    {/* Search */}
                    <div className="relative flex-1 max-w-xs">
                        <Icon name="search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                            type="text"
                            value={filters.search}
                            onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
                            placeholder="Buscar RUT o nombre..."
                            className="w-full pl-9 pr-4 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                        />
                    </div>

                    {/* Export buttons */}
                    <div className="flex gap-2 ml-auto">
                        <button
                            onClick={() => setIsPdfModalOpen(true)}
                            className={`px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-1 ${BUTTON_VARIANTS.secondary}`}
                        >
                            <Icon name="file-text" size={16} />
                            <span className="hidden sm:inline">PDF por RUT</span>
                        </button>
                        <button
                            onClick={handleExportXlsx}
                            className={`px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-1 ${BUTTON_VARIANTS.secondary}`}
                        >
                            <Icon name="download" size={16} />
                            <span className="hidden sm:inline">Exportar XLSX</span>
                        </button>
                    </div>
                </div>

                {/* Row 3: KPIs */}
                <KpiBar kpis={kpis} isLoading={isLoading} />
            </div>

            {/* Legend */}
            <div className="bg-white rounded-lg border p-3">
                <ShiftLegend />
            </div>

            {/* Grid */}
            <AttendanceGrid
                staff={staff}
                shiftTypes={shiftTypes}
                marks={marks}
                licenses={licenses}
                permissions={permissions}
                vacations={vacations}
                overrides={overrides}
                incidences={incidences || { noMarcaciones: [], sinCredenciales: [], cambiosDia: [], autorizaciones: [] }}
                specialTemplates={specialTemplates}
                weekDates={weekDates}
                isLoading={isLoading}
                onRequestOffboarding={(s) => setOffboardingStaff(s)}
                onOpenShiftConfig={(s) => setShiftConfigStaff(s)}
            />

            {/* PDF Export Modal */}
            <RutPdfExportModal
                isOpen={isPdfModalOpen}
                onClose={() => setIsPdfModalOpen(false)}
                staff={staff}
                marks={marks}
                licenses={licenses}
                permissions={permissions}
                vacations={vacations}
                incidences={incidences || { noMarcaciones: [], sinCredenciales: [], cambiosDia: [], autorizaciones: [] }}
                year={year}
                month={month}
            />

            {/* Offboarding Modal */}
            <OffboardingRequestModal
                isOpen={offboardingStaff !== null}
                onClose={() => setOffboardingStaff(null)}
                staff={offboardingStaff}
                onSubmit={handleOffboardingRequest}
                isSubmitting={offboardingMutation.isPending}
            />

            {/* Shift Config Modal */}
            <ShiftConfigModal
                isOpen={shiftConfigStaff !== null}
                onClose={() => setShiftConfigStaff(null)}
                staff={shiftConfigStaff}
            />
        </div>
    );
};
