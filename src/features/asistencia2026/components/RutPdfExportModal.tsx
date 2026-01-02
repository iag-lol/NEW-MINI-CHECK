/**
 * RutPdfExportModal - Professional PDF generator for worker monthly schedule
 * Enterprise Edition - PRINTER FRIENDLY (B&W) - SINGLE PAGE COMPACT
 * Optimized for Black & White printing, single page layout, and high information density.
 */

import { useState, useMemo } from 'react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Icon } from '../../../shared/components/common/Icon';
import {
    StaffWithShift,
    AttendanceMark,
    AttendanceLicense,
    AttendancePermission,
    ShiftType,
    AttendanceIncidences
} from '../types';
import {
    getMonthDates,
    getMonthName,
    isOffDay,
    getWeekStart,
    parseDateToUTC,
    getDayOfWeekUTC,
    getWeekInCycle,
    getSpecialShiftDetails,
} from '../utils/shiftEngine';
import { useShiftTypes, useAllSpecialTemplates } from '../hooks';

interface RutPdfExportModalProps {
    isOpen: boolean;
    onClose: () => void;
    staff: StaffWithShift[];
    marks: AttendanceMark[];
    licenses: AttendanceLicense[];
    permissions: AttendancePermission[];
    vacations: { staff_id: string; start_date: string; end_date: string }[];
    incidences: AttendanceIncidences;
    year: number;
    month: number;
}

export const RutPdfExportModal = ({
    isOpen,
    onClose,
    staff,
    marks,
    licenses,
    permissions,
    vacations,
    incidences,
    year,
    month,
}: RutPdfExportModalProps) => {
    const [selectedRut, setSelectedRut] = useState<string>('');
    const [selectedMonth, setSelectedMonth] = useState(month);
    const [selectedYear, setSelectedYear] = useState(year);
    const [isGenerating, setIsGenerating] = useState(false);

    const { data: shiftTypes = [] } = useShiftTypes();

    // Get special templates for staff with ESPECIAL shifts
    const staffIds = useMemo(() => staff.map(s => s.id), [staff]);
    const { data: specialTemplates = [] } = useAllSpecialTemplates(staffIds);

    const shiftTypesMap = useMemo(() => {
        const map = new Map<string, ShiftType>();
        for (const st of shiftTypes) {
            map.set(st.code, st);
        }
        return map;
    }, [shiftTypes]);

    const specialTemplatesMap = useMemo(() => {
        const map = new Map<string, any>();
        for (const template of specialTemplates) {
            map.set(template.staff_id, template);
        }
        return map;
    }, [specialTemplates]);

    const selectedStaff = staff.find((s) => s.rut === selectedRut);

    const months = [
        'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
        'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
    ];

    if (!isOpen) return null;

    const generatePdf = async () => {
        if (!selectedStaff) return;

        setIsGenerating(true);

        try {
            const doc = new jsPDF({
                orientation: 'landscape',
                unit: 'mm',
                format: 'letter', // 279.4 x 215.9 mm
            });

            const pageWidth = doc.internal.pageSize.getWidth();
            const pageHeight = doc.internal.pageSize.getHeight();
            const margin = 10; // Tighter margin

            // B&W Palette - High Contrast
            const colors = {
                headerBg: [240, 240, 240] as [number, number, number],
                textMain: [0, 0, 0] as [number, number, number],
                textLight: [80, 80, 80] as [number, number, number],
                border: [0, 0, 0] as [number, number, number],

                // Status Backgrounds
                bgOff: [235, 235, 235] as [number, number, number],    // Light Gray
                bgAlert: [50, 50, 50] as [number, number, number],     // Dark (for white text)
                bgWarning: [200, 200, 200] as [number, number, number],// Medium Gray
                bgWhite: [255, 255, 255] as [number, number, number],
            };

            // --- HEADER (Compact) ---
            doc.setFillColor(0, 0, 0);
            doc.rect(0, 0, pageWidth, 18, 'F'); // Reduced height

            doc.setTextColor(255, 255, 255);
            doc.setFontSize(14); // Smaller title
            doc.setFont('helvetica', 'bold');
            doc.text('ASISTENCIA MENSUAL', margin, 10);

            doc.setFontSize(8);
            doc.setFont('helvetica', 'normal');
            doc.text('REPORTE OFICIAL', margin, 15);

            doc.setFontSize(11);
            doc.text(`${getMonthName(selectedMonth).toUpperCase()} ${selectedYear}`, pageWidth - margin, 10, { align: 'right' });
            doc.setFontSize(7);
            doc.text('Ley 40 Horas', pageWidth - margin, 15, { align: 'right' });


            // --- INFO CARD (Compact) ---
            const infoY = 22;
            doc.setDrawColor(...colors.border);
            doc.setLineWidth(0.2);
            doc.rect(margin, infoY, pageWidth - 2 * margin, 18, 'S');

            // Line 1: Name and RUT
            doc.setTextColor(...colors.textMain);
            doc.setFontSize(10);
            doc.setFont('helvetica', 'bold');
            doc.text(selectedStaff.nombre.toUpperCase(), margin + 4, infoY + 6);

            doc.setFontSize(8);
            doc.setFont('helvetica', 'normal');
            doc.text(`RUT: ${selectedStaff.rut}`, margin + 120, infoY + 6);

            // Line 2: Details
            doc.setFontSize(8);
            doc.text('CARGO:', margin + 4, infoY + 12);
            doc.setFont('helvetica', 'bold');
            doc.text(selectedStaff.cargo.substring(0, 25), margin + 18, infoY + 12);
            doc.setFont('helvetica', 'normal');

            doc.text('TERMINAL:', margin + 70, infoY + 12);
            doc.setFont('helvetica', 'bold');
            doc.text(selectedStaff.terminal_code, margin + 88, infoY + 12);
            doc.setFont('helvetica', 'normal');

            // Shift info
            const shiftType = selectedStaff.shift ? shiftTypesMap.get(selectedStaff.shift.shift_type_code) : null;
            doc.text('TURNO:', margin + 120, infoY + 12);
            doc.setFont('helvetica', 'bold');
            doc.text(shiftType?.name || 'Base', margin + 135, infoY + 12);
            doc.setFont('helvetica', 'normal');

            doc.text('HORARIO:', margin + 180, infoY + 12);
            doc.setFont('helvetica', 'bold');
            doc.text(selectedStaff.horario || 'N/A', margin + 198, infoY + 12);


            // --- DATA PREP ---
            const monthDates = getMonthDates(selectedYear, selectedMonth);
            const weeks: string[][] = [];
            let currentWeek: string[] = [];
            const firstDate = new Date(monthDates[0] + 'T12:00:00');
            const firstDayOfWeek = firstDate.getDay();
            const mondayFirst = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1;

            for (let i = 0; i < mondayFirst; i++) currentWeek.push('');
            for (const date of monthDates) {
                currentWeek.push(date);
                if (currentWeek.length === 7) { weeks.push(currentWeek); currentWeek = []; }
            }
            if (currentWeek.length > 0) {
                while (currentWeek.length < 7) currentWeek.push('');
                weeks.push(currentWeek);
            }

            const incidentsMap = {
                noMark: new Set(incidences.noMarcaciones.filter(i => i.rut === selectedStaff.rut).map(i => i.date)),
                noCred: new Set(incidences.sinCredenciales.filter(i => i.rut === selectedStaff.rut).map(i => i.date)),
                dayChange: new Map(incidences.cambiosDia.filter(i => i.rut === selectedStaff.rut).map(i => [i.date, i])),
                auth: new Set(incidences.autorizaciones.filter(i => i.rut === selectedStaff.rut).map(i => i.date)),
            };

            const tableBody: string[][] = [];

            for (const week of weeks) {
                const row: string[] = [];
                const weekStart = week.find(d => d !== '') || '';
                const weekStartFormatted = weekStart ? getWeekStart(weekStart) : '';

                for (const dateStr of week) {
                    if (!dateStr) {
                        row.push('');
                        continue;
                    }

                    const date = new Date(dateStr + 'T12:00:00');
                    const dayNum = date.getDate();
                    let cellText = `${dayNum}`;
                    let statusText = '';
                    let isSpecial = false;

                    // 1. Core Shift Logic (Always calc shift first)
                    let isOff = false;
                    let displayHorario = '';
                    const shiftPattern = shiftType?.pattern_json; // Define at this level for reuse

                    if (selectedStaff.shift) {
                        if (shiftPattern) {
                            const specialTemplate = specialTemplatesMap.get(selectedStaff.id);
                            isOff = isOffDay(
                                dateStr,
                                selectedStaff.shift.shift_type_code,
                                selectedStaff.shift.variant_code,
                                shiftPattern,
                                specialTemplate
                            );
                        }
                    } else {
                        const dayOfWeek = date.getDay();
                        isOff = dayOfWeek === 0 || dayOfWeek === 6;
                    }

                    if (!isOff) {
                        displayHorario = (selectedStaff.horario || '10:00-20:00').replace('-', '-');

                        // [NEW] Apply Early Exit in PDF
                        if (selectedStaff.shift?.shift_type_code === 'ESPECIAL') {
                            const specialTemplate = specialTemplatesMap.get(selectedStaff.id);
                            if (specialTemplate) {
                                const details = getSpecialShiftDetails(dateStr, specialTemplate);
                                if (details.earlyExit) {
                                    const match = selectedStaff.horario?.match(/^(\d{1,2}:\d{2})/);
                                    const startTime = match ? match[1] : '08:00';
                                    displayHorario = `${startTime}-${details.earlyExit}`;
                                }
                            }
                        }
                    }


                    // 2. Incident/Status Overrides
                    const dayChange = incidentsMap.dayChange.get(dateStr);
                    const hasLicense = licenses.some(l => l.staff_id === selectedStaff.id && dateStr >= l.start_date && dateStr <= l.end_date);
                    const hasVacation = vacations.some(v => v.staff_id === selectedStaff.id && dateStr >= v.start_date && dateStr <= v.end_date);
                    const hasPerm = permissions.some(p => p.staff_id === selectedStaff.id && dateStr >= p.start_date && dateStr <= p.end_date);
                    const hasNoMark = incidentsMap.noMark.has(dateStr);
                    const hasNoCred = incidentsMap.noCred.has(dateStr);
                    const hasAuth = incidentsMap.auth.has(dateStr);
                    const mark = marks.find(m => m.staff_id === selectedStaff.id && m.mark_date === dateStr);

                    // Build display stack
                    if (dayChange) {
                        // Show the target date info for the change
                        const targetInfo = dayChange.target_date ? ` →  ${new Date(dayChange.target_date).toLocaleDateString('es-CL', { weekday: 'short' })}` : '';
                        statusText = `CAMBIO DÍA${targetInfo}`;
                        // Use original day's horario if day change doesn't override
                    } else if (hasLicense) {
                        statusText = 'LICENCIA';
                    } else if (hasVacation) {
                        statusText = 'VACACIONES';
                    } else if (hasPerm) {
                        statusText = 'PERMISO';
                    } else if (hasNoMark) {
                        statusText = 'NO MARCACIÓN';
                    } else if (hasNoCred) {
                        statusText = 'SIN CREDENCIAL';
                    } else if (isOff) {
                        statusText = 'LIBRE';
                    } else {
                        // Regular day - check attendance
                        if (mark) {
                            if (mark.mark === 'P') statusText = 'PRESENTE';
                            else if (mark.mark === 'A') statusText = 'AUSENTE';
                        } else {
                            // No mark, past date?
                            const today = new Date().toISOString().split('T')[0];
                            if (dateStr < today) statusText = 'AUSENTE'; // Infer absence if pending
                        }
                    }

                    // Append Auth if exists and space permits
                    if (hasAuth) statusText += '\n(AUTORIZADO)';

                    // Combine:
                    // [Day]
                    // [Time] (if not off)
                    // [Status]

                    if (!isOff && displayHorario && !['LICENCIA', 'VACACIONES'].includes(statusText)) {
                        cellText += `\n${displayHorario}`;
                    }
                    if (statusText) {
                        cellText += `\n${statusText}`;
                    }

                    row.push(cellText);
                }
                tableBody.push(row);
            }


            // --- TABLE RENDER ---
            autoTable(doc, {
                startY: 45, // Moved up
                head: [['LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB', 'DOM']],
                body: tableBody,
                theme: 'grid',
                headStyles: {
                    fillColor: [0, 0, 0],
                    textColor: [255, 255, 255],
                    fontSize: 8,
                    fontStyle: 'bold',
                    halign: 'center',
                    cellPadding: 2,
                    lineWidth: 0.1,
                },
                styles: {
                    fontSize: 7, // Smaller font for density
                    cellPadding: 2,
                    halign: 'center',
                    valign: 'middle',
                    minCellHeight: 16, // Reduced height to fit page
                    lineColor: [0, 0, 0],
                    lineWidth: 0.1,
                    textColor: [0, 0, 0],
                    overflow: 'linebreak',
                },
                columnStyles: {
                    // evenly distributed
                },
                didParseCell: (data) => {
                    const text = data.cell.text.join('\n').toUpperCase();
                    data.cell.styles.fillColor = [255, 255, 255];

                    if (text.includes('LIBRE')) {
                        data.cell.styles.fillColor = colors.bgOff;
                    } else if (text.includes('NO MARCACIÓN') || text.includes('AUSENTE')) {
                        data.cell.styles.fillColor = colors.bgAlert;
                        data.cell.styles.textColor = [255, 255, 255];
                        data.cell.styles.fontStyle = 'bold';
                    } else if (text.includes('SIN CREDENCIAL')) {
                        data.cell.styles.fillColor = colors.bgWarning;
                        data.cell.styles.fontStyle = 'bold';
                    } else if (text.includes('LICENCIA') || text.includes('VACACIONES')) {
                        data.cell.styles.fontStyle = 'bold';
                    } else if (text.includes('PRESENTE')) {
                        // Maybe bold?
                        data.cell.styles.textColor = [0, 0, 0];
                    }
                },
                margin: { left: margin, right: margin, bottom: 20 },
            });


            // --- LEGEND (Footer) ---
            const finalY = pageHeight - 15; // Force to bottom

            doc.setDrawColor(0, 0, 0);
            doc.setLineWidth(0.5);
            doc.line(margin, finalY - 5, pageWidth - margin, finalY - 5);

            doc.setFontSize(7);
            doc.setFont('helvetica', 'normal');

            // Legend Row
            const lY = finalY;
            const gap = 35;
            let currentX = margin;

            // Helper
            const leg = (name: string, fill: [number, number, number] | null, textCol: [number, number, number]) => {
                if (fill) {
                    doc.setFillColor(...fill);
                    doc.rect(currentX, lY - 2, 3, 3, 'F');
                    doc.rect(currentX, lY - 2, 3, 3, 'S'); // border
                } else {
                    doc.rect(currentX, lY - 2, 3, 3, 'S');
                }
                doc.setTextColor(...textCol);
                doc.text(name, currentX + 5, lY);
                currentX += gap;
            };

            // Items
            leg('Día Libre', colors.bgOff, colors.textMain);
            leg('No Marca/Ausente', colors.bgAlert, colors.textMain);
            leg('Sin Credencial', colors.bgWarning, colors.textMain);
            leg('Asistencia OK', colors.bgWhite, colors.textMain); // Just plain white

            doc.setTextColor(80, 80, 80);
            doc.text(`Generado: ${new Date().toLocaleString('es-CL')}`, pageWidth - margin, lY, { align: 'right' });


            // Save
            const fileName = `Asistencia_${selectedStaff.rut.replace(/\./g, '')}_${months[selectedMonth]}_${selectedYear}.pdf`;
            doc.save(fileName);

        } catch (error) {
            console.error('Error generating PDF:', error);
            alert('Error al generar el PDF');
        } finally {
            setIsGenerating(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b bg-slate-50">
                    <div>
                        <h2 className="text-xl font-bold text-slate-800">Exportar PDF Mensual</h2>
                        <p className="text-sm text-slate-500">Reporte Compacto (1 Hoja)</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-lg transition-colors text-slate-500">
                        <Icon name="x" size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 space-y-6">
                    {/* Staff selector */}
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">
                            Trabajador
                        </label>
                        <select
                            value={selectedRut}
                            onChange={(e) => setSelectedRut(e.target.value)}
                            className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-shadow"
                        >
                            <option value="">-- Seleccionar Trabajador --</option>
                            {staff.map((s) => (
                                <option key={s.rut} value={s.rut}>
                                    {s.nombre}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Month/Year selectors */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-2">Mes</label>
                            <select
                                value={selectedMonth}
                                onChange={(e) => setSelectedMonth(Number(e.target.value))}
                                className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                            >
                                {months.map((m, i) => (
                                    <option key={i} value={i}>{m}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-2">Año</label>
                            <select
                                value={selectedYear}
                                onChange={(e) => setSelectedYear(Number(e.target.value))}
                                className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                            >
                                <option value={2025}>2025</option>
                                <option value={2026}>2026</option>
                                <option value={2027}>2027</option>
                            </select>
                        </div>
                    </div>

                    {/* Preview info card */}
                    {selectedStaff && (
                        <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl">
                            <div className="text-sm font-medium text-center text-gray-600 mb-2">
                                Vista Previa de Datos
                            </div>
                            <div className="grid grid-cols-2 gap-y-2 text-xs">
                                <div><span className="font-bold">Incidencias:</span> {incidences.noMarcaciones.filter(i => i.rut === selectedStaff.rut).length}</div>
                                <div><span className="font-bold">Licencias:</span> {licenses.filter(l => l.staff_id === selectedStaff.id).length}</div>
                                <div><span className="font-bold">Marcas:</span> {marks.filter(m => m.staff_id === selectedStaff.id).length}</div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex justify-end gap-3 p-6 border-t bg-slate-50">
                    <button
                        onClick={onClose}
                        className="px-5 py-2.5 text-sm font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-200 rounded-lg transition-colors"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={generatePdf}
                        disabled={!selectedRut || isGenerating}
                        className="px-5 py-2.5 text-sm font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed shadow-lg transition-all flex items-center gap-2"
                    >
                        {isGenerating ? (
                            <>
                                <Icon name="loader" size={18} className="animate-spin" />
                                Generando...
                            </>
                        ) : (
                            <>
                                <Icon name="download" size={18} />
                                Generar PDF
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};
