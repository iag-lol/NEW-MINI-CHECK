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
    useMarksForMonth,
    useLicensesForMonth,
    usePermissionsForMonth,
    useVacationsForMonth,
    useOverridesForMonth,
    useIncidencesForMonth,
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

    // Get month/year from week for data fetching
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

    // Data queries
    const { data: shiftTypes = [], isLoading: loadingTypes } = useShiftTypes();
    const { data: staff = [], isLoading: loadingStaff } = useStaffWithShifts(terminalContext, filters);

    const staffIds = useMemo(() => staff.map((s) => s.id), [staff]);

    const { data: marks = [], isLoading: loadingMarks } = useMarksForMonth(staffIds, year, month);
    const { data: licenses = [], isLoading: loadingLicenses } = useLicensesForMonth(staffIds, year, month);
    const { data: permissions = [], isLoading: loadingPermissions } = usePermissionsForMonth(staffIds, year, month);
    const { data: vacations = [], isLoading: loadingVacations } = useVacationsForMonth(staffIds, year, month);
    const { data: overrides = [], isLoading: loadingOverrides } = useOverridesForMonth(staffIds, year, month);
    const { data: incidences, isLoading: loadingIncidences } = useIncidencesForMonth(terminalContext, year, month);
    const { data: specialTemplates = [] } = useAllSpecialTemplates(staffIds);

    const offboardingMutation = useCreateOffboardingRequest();

    const isLoading = loadingTypes || loadingStaff || loadingMarks || loadingLicenses ||
        loadingPermissions || loadingVacations || loadingOverrides || loadingIncidences;

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
    }, [staff, marks, licenses, permissions, vacations, incidences, weekDates]);

    // Week navigation
    const handlePrevWeek = () => setWeekStart(getPreviousWeek(weekStart));
    const handleNextWeek = () => setWeekStart(getNextWeek(weekStart));
    const handleGoToToday = () => setWeekStart(getWeekStart(today));

    // Terminal change
    const handleTerminalChange = (terminal: TerminalCode | 'ALL') => {
        setFilters((f) => ({ ...f, terminal }));
    };

    // Export XLSX - Professional multi-sheet export
    const handleExportXlsx = () => {
        const wb = XLSX.utils.book_new();
        const weekRange = formatWeekRange(weekStart);

        // Helper to format date for column headers (e.g., "Lun 29/12")
        const formatDateHeader = (dateStr: string) => {
            const d = new Date(dateStr + 'T12:00:00');
            const days = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
            return `${days[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`;
        };

        // Get day status for a staff member (same logic as grid)
        const getStatusText = (s: StaffWithShift, date: string): string => {
            const mark = marks.find(m => m.staff_id === s.id && m.mark_date === date);
            const hasLicense = licenses.some(l => l.staff_id === s.id && date >= l.start_date && date <= l.end_date);
            const hasVacation = vacations.some(v => v.staff_id === s.id && date >= v.start_date && date <= v.end_date);
            const hasPerm = permissions.some(p => p.staff_id === s.id && date >= p.start_date && date <= p.end_date);

            if (hasLicense) return 'LIC';
            if (hasVacation) return 'VAC';
            if (hasPerm) return 'PER';
            if (mark) return mark.mark; // P or A

            // Check if off day
            const shiftType = s.shift ? shiftTypes.find(st => st.code === s.shift!.shift_type_code) : null;
            let isOff = false;

            if (s.shift) {
                // Get pattern from DB or use fallback
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

                    // If Early Exit exists, return it
                    if (details.earlyExit) {
                        return `Salida: ${details.earlyExit}`;
                    }

                    // If Night Shift, maybe indicate it? (Optional, user asked for config)
                    // if (details.type === 'NOCHE') return 'Noche';
                }
            }

            return '-'; // Pending
        };

        // ===== SHEET 1: ASISTENCIA SEMANAL =====
        const attendanceData = staff.map(s => {
            const row: Record<string, string> = {
                'RUT': s.rut,
                'Nombre': s.nombre,
                'Cargo': s.cargo,
                'Terminal': s.terminal_code,
                'Horario': s.horario || '',
            };
            // Add each day of the week
            for (const date of weekDates) {
                row[formatDateHeader(date)] = getStatusText(s, date);
            }
            return row;
        });

        const wsAttendance = XLSX.utils.json_to_sheet(attendanceData);
        // Set column widths
        wsAttendance['!cols'] = [
            { wch: 12 }, // RUT
            { wch: 30 }, // Nombre
            { wch: 15 }, // Cargo
            { wch: 12 }, // Terminal
            { wch: 12 }, // Horario
            ...weekDates.map(() => ({ wch: 10 })), // Each day
        ];
        XLSX.utils.book_append_sheet(wb, wsAttendance, 'Asistencia Semanal');

        // ===== SHEET 2: SIN CREDENCIAL =====
        const ncData = incidences?.sinCredenciales
            ?.filter(item => weekDates.includes(item.date))
            ?.map(item => {
                const staffMember = staff.find(s => s.rut === item.rut);
                return {
                    'Fecha': item.date,
                    'RUT': item.rut,
                    'Nombre': staffMember?.nombre || 'N/A',
                    'Cargo': staffMember?.cargo || 'N/A',
                    'Terminal': staffMember?.terminal_code || 'N/A',
                };
            }) || [];
        const wsNC = XLSX.utils.json_to_sheet(ncData.length > 0 ? ncData : [{ 'Info': 'Sin registros esta semana' }]);
        XLSX.utils.book_append_sheet(wb, wsNC, 'Sin Credencial');

        // ===== SHEET 3: NO MARCACIÓN =====
        const nmData = incidences?.noMarcaciones
            ?.filter(item => weekDates.includes(item.date))
            ?.map(item => {
                const staffMember = staff.find(s => s.rut === item.rut);
                return {
                    'Fecha': item.date,
                    'RUT': item.rut,
                    'Nombre': staffMember?.nombre || 'N/A',
                    'Cargo': staffMember?.cargo || 'N/A',
                    'Terminal': staffMember?.terminal_code || 'N/A',
                };
            }) || [];
        const wsNM = XLSX.utils.json_to_sheet(nmData.length > 0 ? nmData : [{ 'Info': 'Sin registros esta semana' }]);
        XLSX.utils.book_append_sheet(wb, wsNM, 'No Marcación');

        // ===== SHEET 4: CAMBIOS DE DÍA =====
        const cdData = incidences?.cambiosDia
            ?.filter(item => weekDates.includes(item.date))
            ?.map(item => {
                const staffMember = staff.find(s => s.rut === item.rut);
                return {
                    'Fecha': item.date,
                    'RUT': item.rut,
                    'Nombre': staffMember?.nombre || 'N/A',
                    'Cargo': staffMember?.cargo || 'N/A',
                    'Terminal': staffMember?.terminal_code || 'N/A',
                };
            }) || [];
        const wsCD = XLSX.utils.json_to_sheet(cdData.length > 0 ? cdData : [{ 'Info': 'Sin registros esta semana' }]);
        XLSX.utils.book_append_sheet(wb, wsCD, 'Cambios de Día');

        // ===== SHEET 5: AUTORIZACIONES =====
        const autData = incidences?.autorizaciones
            ?.filter(item => weekDates.includes(item.date))
            ?.map(item => {
                const staffMember = staff.find(s => s.rut === item.rut);
                return {
                    'Fecha': item.date,
                    'RUT': item.rut,
                    'Nombre': staffMember?.nombre || 'N/A',
                    'Cargo': staffMember?.cargo || 'N/A',
                    'Terminal': staffMember?.terminal_code || 'N/A',
                };
            }) || [];
        const wsAut = XLSX.utils.json_to_sheet(autData.length > 0 ? autData : [{ 'Info': 'Sin registros esta semana' }]);
        XLSX.utils.book_append_sheet(wb, wsAut, 'Autorizaciones');

        // ===== SHEET 6: VACACIONES =====
        const vacData = vacations
            .filter(v => weekDates.some(d => d >= v.start_date && d <= v.end_date))
            .map(v => {
                const staffMember = staff.find(s => s.id === v.staff_id);
                return {
                    'RUT': staffMember?.rut || 'N/A',
                    'Nombre': staffMember?.nombre || 'N/A',
                    'Cargo': staffMember?.cargo || 'N/A',
                    'Terminal': staffMember?.terminal_code || 'N/A',
                    'Inicio': v.start_date,
                    'Fin': v.end_date,
                };
            });
        const wsVac = XLSX.utils.json_to_sheet(vacData.length > 0 ? vacData : [{ 'Info': 'Sin vacaciones esta semana' }]);
        XLSX.utils.book_append_sheet(wb, wsVac, 'Vacaciones');

        // ===== SHEET 7: LICENCIAS =====
        const licData = licenses
            .filter(l => weekDates.some(d => d >= l.start_date && d <= l.end_date))
            .map(l => {
                const staffMember = staff.find(s => s.id === l.staff_id);
                return {
                    'RUT': staffMember?.rut || 'N/A',
                    'Nombre': staffMember?.nombre || 'N/A',
                    'Cargo': staffMember?.cargo || 'N/A',
                    'Terminal': staffMember?.terminal_code || 'N/A',
                    'Inicio': l.start_date,
                    'Fin': l.end_date,
                    'Nota': l.note || '',
                };
            });
        const wsLic = XLSX.utils.json_to_sheet(licData.length > 0 ? licData : [{ 'Info': 'Sin licencias esta semana' }]);
        XLSX.utils.book_append_sheet(wb, wsLic, 'Licencias');

        // ===== SHEET 8: RESUMEN =====
        const presentCount = staff.reduce((acc, s) => {
            return acc + weekDates.filter(d => getStatusText(s, d) === 'P').length;
        }, 0);
        const absentCount = staff.reduce((acc, s) => {
            return acc + weekDates.filter(d => getStatusText(s, d) === 'A').length;
        }, 0);
        const pendingCount = staff.reduce((acc, s) => {
            return acc + weekDates.filter(d => getStatusText(s, d) === '-').length;
        }, 0);

        const summaryData = [
            { 'Concepto': 'Semana', 'Valor': weekRange },
            { 'Concepto': 'Total Personal', 'Valor': staff.length.toString() },
            { 'Concepto': 'Marcas Presente', 'Valor': presentCount.toString() },
            { 'Concepto': 'Marcas Ausente', 'Valor': absentCount.toString() },
            { 'Concepto': 'Marcas Pendientes', 'Valor': pendingCount.toString() },
            { 'Concepto': 'Vacaciones Activas', 'Valor': vacData.length.toString() },
            { 'Concepto': 'Licencias Activas', 'Valor': licData.length.toString() },
            { 'Concepto': 'Sin Credencial', 'Valor': ncData.length.toString() },
            { 'Concepto': 'No Marcación', 'Valor': nmData.length.toString() },
            { 'Concepto': 'Cambios de Día', 'Valor': cdData.length.toString() },
            { 'Concepto': 'Autorizaciones', 'Valor': autData.length.toString() },
        ];
        const wsSummary = XLSX.utils.json_to_sheet(summaryData);
        wsSummary['!cols'] = [{ wch: 20 }, { wch: 30 }];
        XLSX.utils.book_append_sheet(wb, wsSummary, 'Resumen');

        // Save file
        const fileName = `Asistencia_${weekRange.replace(/\s/g, '_').replace(/\//g, '-')}.xlsx`;
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
