import jsPDF from 'jspdf';
import { AmonestacionFormData } from '../types';

export const generateAmonestacionPDF = (data: AmonestacionFormData) => {
    // A4 Size: 210mm x 297mm
    const doc = new jsPDF();

    // --- CONFIG & STYLES ---
    const BLUE_COLOR = [0, 74, 153] as [number, number, number]; // #004a99
    const PAGE_W = 210;
    const PAGE_H = 297;
    const MARGIN_X = 15;
    const CONTENT_W = PAGE_W - (MARGIN_X * 2);

    let y = 10; // Current Y Cursor

    // --- UTILS ---
    const drawSectionTitle = (title: string, yPos: number) => {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(0, 0, 0);
        doc.text(title, MARGIN_X, yPos);
        return 6; // height consumed
    };

    const drawBoxedField = (label: string, value: string, x: number, yPos: number, w: number, labelWidth: number = 0) => {
        // Label
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.text(label, x, yPos + 4);

        // Box
        const boxX = x + labelWidth;
        const boxW = w - labelWidth;
        const boxH = 6;

        doc.setDrawColor(0);
        doc.setLineWidth(0.2);
        doc.rect(boxX, yPos, boxW, boxH);

        // Value
        if (value) {
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9);
            // Center text in box vertically? or just padding
            doc.text(value.toUpperCase(), boxX + 2, yPos + 4.5);
        }
    };

    const drawLineInput = (label: string, value: string, x: number, yPos: number, w: number, labelWidth: number = 0) => {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.text(label, x, yPos + 4);

        const lineX = x + labelWidth;
        const lineW = w - labelWidth;
        // Draw line bottom
        doc.line(lineX, yPos + 6, lineX + lineW, yPos + 6);

        if (value) {
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9);
            doc.text(value.toUpperCase(), lineX + 2, yPos + 4.5);
        }
    };

    const drawCheckbox = (label: string, checked: boolean, x: number, yPos: number, w: number) => {
        // Box
        const boxSize = 5;
        doc.setDrawColor(0);
        doc.setFillColor(255, 255, 255);
        doc.rect(x, yPos, 20, boxSize); // Wide box as per design? Or square? Design shows wide rectangle

        // Design has specific "box-check" usually square, but the screenshot/css shows `width: 100px` for the box? 
        // "box-check { width: 100px; height: 18px }" -> Replicating the wide box style
        const checkW = 20;
        doc.rect(x, yPos, checkW, 5);

        if (checked) {
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(10);
            doc.text('X', x + (checkW / 2) - 1, yPos + 4);
        }

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.text(label, x + checkW + 2, yPos + 4);
    };


    // --- HEADER ---
    y += 15;
    // Blue decorations
    doc.setDrawColor(...BLUE_COLOR);
    doc.setLineWidth(1);
    const lineY = y + 2;
    // Line full width? The CSS matches header text width effectively.
    // Let's draw across margins
    doc.line(MARGIN_X, lineY, PAGE_W - MARGIN_X, lineY);

    // Circles
    doc.setFillColor(255, 255, 255);
    doc.setLineWidth(1); // Border 4px in css is thick
    doc.circle(MARGIN_X, lineY, 2, 'FD');
    doc.circle(PAGE_W - MARGIN_X, lineY, 2, 'FD');

    // Title box (Center, white bg to mask line)
    const title = "ACTA DE CONSTATACIÓN DE HECHOS";
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    const titleW = doc.getTextWidth(title);

    // White rect behind title
    doc.setFillColor(255, 255, 255);
    doc.rect((PAGE_W / 2) - (titleW / 2) - 5, y - 4, titleW + 10, 10, 'F');

    // Text
    doc.setTextColor(0, 0, 0);
    doc.text(title, PAGE_W / 2, y + 4, { align: 'center' });

    // Logo (Simulated)
    const logoX = PAGE_W - MARGIN_X - 30;
    doc.setFontSize(12);
    doc.setTextColor(...BLUE_COLOR);
    doc.setFont('helvetica', 'bolditalic');
    doc.text('ASISS', logoX, y - 2);
    doc.setFontSize(6);
    doc.setTextColor(100);
    doc.text('OPERACIONES', logoX, y + 2);

    y += 15;

    // --- FECHA / HORA ---
    // Row 1
    const halfW = CONTENT_W / 2;
    drawBoxedField('FECHA', data.date, MARGIN_X, y, 60, 15);
    drawBoxedField('HORA', data.time, PAGE_W / 2, y, 60, 15);
    y += 12;

    // --- I. ANTECEDENTES PERSONALES ---
    y += drawSectionTitle('I. Antecedentes Personales del infractor', y);

    drawBoxedField('Nombre', data.worker_name, MARGIN_X, y, CONTENT_W, 20);
    y += 8;
    drawBoxedField('Rut', data.worker_rut, MARGIN_X, y, 80, 20); // Short box
    y += 8;
    drawBoxedField('Cargo', data.worker_cargo, MARGIN_X, y, CONTENT_W, 20);
    y += 12;

    // --- II. ANTECEDENTES FALTA (Grid) ---
    y += drawSectionTitle('II. Antecedentes de la falta', y);

    // Map Codes to Checkboxes
    // 9: Abandono, 8: Desobediencia/Negativa, 1: Agresión?
    const c = parseInt(data.sanction_code_id.toString());
    const isAbandono = c === 9;
    const isNegativa = c === 8; // Or Desobedecer
    const isDesobedecer = c === 8;
    const isAgresionV = c === 1;
    const isAgresionF = false;
    const isIncumplimiento = c === 10 || c === 2 || c === 5; // Generic
    const isDia = false;
    const isAtraso = false;
    const isOtro = ![9, 8, 1, 10, 2, 5].includes(c);

    // Col 1
    let cy = y;
    drawCheckbox('', isAbandono, MARGIN_X, cy, 60);
    doc.text('Abandono de trabajo', MARGIN_X + 25, cy + 4); cy += 6;

    drawCheckbox('', isNegativa, MARGIN_X, cy, 60);
    doc.text('Negativa a trabajar', MARGIN_X + 25, cy + 4); cy += 6;

    drawCheckbox('', isDesobedecer, MARGIN_X, cy, 60);
    doc.text('Desobedecer Instrucción', MARGIN_X + 25, cy + 4); cy += 6;

    // Col 2
    cy = y;
    const col2X = MARGIN_X + 65;
    drawCheckbox('', isAgresionV, col2X, cy, 60);
    doc.text('Agresión verbal', col2X + 25, cy + 4); cy += 6;

    drawCheckbox('', isAgresionF, col2X, cy, 60);
    doc.text('Agresión física', col2X + 25, cy + 4); cy += 6;

    drawCheckbox('', isIncumplimiento, col2X, cy, 60);
    doc.text('Incumplimiento', col2X + 25, cy + 4); cy += 6;

    // Col 3
    cy = y;
    const col3X = MARGIN_X + 130;
    drawCheckbox('', isDia, col3X, cy, 60);
    doc.text('Día falta', col3X + 25, cy + 4); cy += 6;

    drawCheckbox('', isAtraso, col3X, cy, 60);
    doc.text('Atrasos', col3X + 25, cy + 4); cy += 6;

    // Other
    drawCheckbox('', isOtro, col3X, cy, 60);
    doc.text('Otro', col3X + 25, cy + 4); cy += 6;

    y = cy + 4;

    // --- III. LUGAR ---
    y += drawSectionTitle('III. Antecedentes del lugar de la falta o incidente', y);

    drawBoxedField('cabezal o terminal', data.place_terminal?.toUpperCase(), MARGIN_X, y, CONTENT_W, 35);
    y += 8;
    drawBoxedField('vía publica', '', MARGIN_X, y, CONTENT_W, 35); // Blank unless we have data
    y += 8;

    // Vehicle Row
    drawBoxedField('vehículo', '', MARGIN_X, y, 80, 35);
    // PPU Box right aligned
    doc.rect(PAGE_W - MARGIN_X - 50, y, 50, 6);
    doc.setFont('helvetica', 'bold');
    doc.text('PPU', PAGE_W - MARGIN_X - 50 + 2, y + 4.5);
    doc.line(PAGE_W - MARGIN_X - 40, y, PAGE_W - MARGIN_X - 40, y + 6); // Divider
    // PPU Value if relevant (not in standard form data but maybe in narrative?)

    y += 8;
    drawBoxedField('detalle del lugar', '', MARGIN_X, y, CONTENT_W, 35);
    y += 12;

    // --- IV. INVOLUCRADOS ---
    y += drawSectionTitle('IV. Antecedentes de los involucrados en el incidente', y);
    // Grid
    drawCheckbox('', true, MARGIN_X, y, 50); doc.text('Jefatura', MARGIN_X + 25, y + 4); y += 6;
    drawCheckbox('', false, MARGIN_X, y, 50); doc.text('Compañeros', MARGIN_X + 25, y + 4); y += 6;
    drawCheckbox('', false, MARGIN_X, y, 50); doc.text('Otro (esp)', MARGIN_X + 25, y + 4);
    doc.line(MARGIN_X + 50, y + 6, CONTENT_W + MARGIN_X, y + 6); // Line for other
    y += 10;

    // --- V. DESCRIPTION ---
    y += drawSectionTitle('V. Descripción detallada de los hechos', y);

    const descH = 50;
    doc.rect(MARGIN_X, y, CONTENT_W, descH);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8); // Smaller font for narrative to fit
    const splitDesc = doc.splitTextToSize(data.description.toUpperCase(), CONTENT_W - 4);
    doc.text(splitDesc, MARGIN_X + 2, y + 4);

    y += descH + 8;

    // --- VI. TESTIGOS ---
    if (y + 40 > PAGE_H) { doc.addPage(); y = 20; }

    y += drawSectionTitle('VI. Testigos Presenciales', y);

    const wColW = (CONTENT_W - 10) / 2;

    // Witness 1
    const w1X = MARGIN_X;
    doc.rect(w1X, y, wColW, 45);
    let wy = y + 5;
    drawLineInput('Nombre:', data.witness1_name, w1X + 2, wy, wColW - 4, 15); wy += 8;
    drawBoxedField('Rut:', data.witness1_rut, w1X + 2, wy, wColW - 4, 15); wy += 8; // Box style for rut as per design
    drawLineInput('Cargo:', data.witness1_cargo, w1X + 2, wy, wColW - 4, 15); wy += 15;
    doc.setFontSize(7);
    doc.text('Firma', w1X + 2, wy);

    // Witness 2
    const w2X = MARGIN_X + wColW + 10;
    doc.rect(w2X, y, wColW, 45);
    wy = y + 5;
    drawLineInput('Nombre:', data.witness2_name, w2X + 2, wy, wColW - 4, 15); wy += 8;
    drawBoxedField('Rut:', data.witness2_rut, w2X + 2, wy, wColW - 4, 15); wy += 8;
    drawLineInput('Cargo:', data.witness2_cargo, w2X + 2, wy, wColW - 4, 15); wy += 15;
    doc.setFontSize(7);
    doc.text('Firma', w2X + 2, wy);

    y += 55;

    // --- VII. RESPONSABLE ---
    if (y + 30 > PAGE_H) { doc.addPage(); y = 20; }
    y += drawSectionTitle('VII. Responsable de la constatación', y);

    doc.rect(MARGIN_X, y, CONTENT_W, 20); // Container
    // Content inside
    drawBoxedField('Nombre:', data.responsible_name.toUpperCase(), MARGIN_X + 5, y + 3, CONTENT_W - 10, 20);
    drawLineInput('Cargo:', data.responsible_cargo.toUpperCase(), MARGIN_X + 5, y + 11, CONTENT_W - 10, 20);

    y += 40;

    // --- FOOTER ---
    doc.line(PAGE_W - 80, y, PAGE_W - 20, y);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('FIRMA', PAGE_W - 50, y + 5, { align: 'center' });

    doc.save(`Amonestacion_Acta_${data.worker_rut}.pdf`);
};
