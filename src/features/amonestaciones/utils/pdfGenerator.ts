import jsPDF from 'jspdf';
import { AmonestacionFormData } from '../types';

// Helper to load image
const loadImage = (src: string): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.src = src;
        img.onload = () => resolve(img);
        img.onerror = reject;
    });
};

export const generateAmonestacionPDF = async (data: AmonestacionFormData) => {
    // Letter Size: 215.9mm x 279.4mm
    const doc = new jsPDF({
        format: 'letter',
        unit: 'mm'
    });

    // --- CONFIG & STYLES ---
    const BLUE_COLOR = [0, 74, 153] as [number, number, number]; // #004a99
    const PAGE_W = 215.9;
    const PAGE_H = 279.4;
    const MARGIN_X = 15;
    const CONTENT_W = PAGE_W - (MARGIN_X * 2);

    let y = 10;

    // --- IMAGES ---
    // Load logos
    let rbuLogo: HTMLImageElement | null = null;
    let asissLogo: HTMLImageElement | null = null;

    try {
        [rbuLogo, asissLogo] = await Promise.all([
            loadImage('/logo_rbu.png'),
            loadImage('/logo_asiss_header.png')
        ]);
    } catch (e) {
        console.error("Error loading logos", e);
    }

    // --- UTILS ---
    const drawSectionTitle = (title: string, yPos: number) => {
        doc.setFillColor(240, 240, 240);
        doc.rect(MARGIN_X, yPos, CONTENT_W, 5, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(0, 0, 0);
        doc.text(title.toUpperCase(), MARGIN_X + 2, yPos + 3.5);
        return 6; // height consumed
    };

    const drawBoxedField = (label: string, value: string, x: number, yPos: number, w: number, labelWidth: number = 0) => {
        // Label
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(50);
        doc.text(label, x, yPos + 3.5);

        // Box
        const boxX = x + labelWidth;
        const boxW = w - labelWidth;
        const boxH = 5;

        doc.setDrawColor(180);
        doc.setLineWidth(0.1);
        doc.rect(boxX, yPos, boxW, boxH);

        // Value
        if (value) {
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(8);
            doc.setTextColor(0);
            const valStr = value ? value.toUpperCase() : '';
            doc.text(valStr, boxX + 2, yPos + 3.5);
        }
    };

    const drawCheckbox = (label: string, checked: boolean, x: number, yPos: number, w: number) => {
        doc.setDrawColor(0);
        doc.setFillColor(255, 255, 255);
        doc.rect(x, yPos, 4, 4);

        if (checked) {
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(8);
            doc.text('X', x + 1, yPos + 3);
        }

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.text(label, x + 6, yPos + 3);
    };


    // --- HEADER ---
    y += 5;

    // Header Layout: Left Logo - Line - Right Logo
    const logoY = y - 4;
    const logoH = 10;

    // Left Logo (Asiss)
    const leftLogoW = 25;
    if (asissLogo) {
        doc.addImage(asissLogo, 'PNG', MARGIN_X - 2, logoY, leftLogoW, logoH, undefined, 'FAST');
    }

    // Right Logo (RBU)
    const rbuLogoW = 30;
    const rbuX = PAGE_W - MARGIN_X - rbuLogoW + 2;
    if (rbuLogo) {
        doc.addImage(rbuLogo, 'PNG', rbuX, logoY, rbuLogoW, logoH, undefined, 'FAST');
    }

    // Centered Title
    const title = "ACTA DE CONSTATACIÓN DE HECHOS";
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    const titleW = doc.getTextWidth(title);

    // Draw Line (Start after Asiss logo, End before RBU logo)
    const lineStart = MARGIN_X + leftLogoW;
    const lineEnd = rbuX;

    const lineY = y + 2;
    doc.setDrawColor(...BLUE_COLOR);
    doc.setLineWidth(0.8);
    doc.line(lineStart, lineY, lineEnd, lineY);

    // Circle decorations at line ends
    doc.setFillColor(255, 255, 255);
    doc.setLineWidth(0.5);
    doc.circle(lineStart, lineY, 1.5, 'FD');
    doc.circle(lineEnd, lineY, 1.5, 'FD');

    // Title centered on page, with white bg to mask middle of line
    doc.setFillColor(255, 255, 255);
    doc.rect((PAGE_W / 2) - (titleW / 2) - 4, y - 3, titleW + 8, 8, 'F');

    doc.setTextColor(0, 0, 0);
    doc.text(title, PAGE_W / 2, y + 4, { align: 'center' });


    y += 12;

    // --- FECHA / HORA / LUGAR (Combined Row) ---
    const thirdW = CONTENT_W / 3;
    drawBoxedField('FECHA', data.date, MARGIN_X, y, thirdW - 2, 12);
    drawBoxedField('HORA', data.time, MARGIN_X + thirdW, y, thirdW - 2, 12);
    drawBoxedField('TURNO', data.shift_schedule || '', MARGIN_X + (thirdW * 2), y, thirdW, 12);
    y += 8;

    // --- I. ANTECEDENTES PERSONALES ---
    y += drawSectionTitle('I. Antecedentes Personales del Infractor', y);

    // Row 1: Nombre (Full)
    drawBoxedField('NOMBRE', data.worker_name, MARGIN_X, y, CONTENT_W, 15);
    y += 6;

    // Row 2: Rut | Cargo (Split)
    const halfW = CONTENT_W / 2;
    drawBoxedField('RUT', data.worker_rut, MARGIN_X, y, halfW - 2, 15);
    drawBoxedField('CARGO', data.worker_cargo, MARGIN_X + halfW, y, halfW, 15);
    y += 10;

    // --- II. FALTA (Grid Compacted) ---
    y += drawSectionTitle('II. Antecedentes de la Falta', y);

    const c = parseInt(data.sanction_code_id.toString());

    const isAbandono = c === 9;
    const isNegativa = c === 8;
    const isDesobedecer = c === 8;
    const isAgresionV = c === 1;
    const isIncumplimiento = (c === 10 || c === 2 || c === 5);

    // Explicit isOtro: True ONLY if c is NOT one of the known ones that have boxes
    const knownCodes = [9, 8, 1, 10, 2, 5];
    const isOtro = !knownCodes.includes(c);

    // Grid 3 Cols
    const colW = CONTENT_W / 3;
    let cy = y;

    // Row 1
    drawCheckbox('Abandono de trabajo', isAbandono, MARGIN_X, cy, colW);
    drawCheckbox('Agresión verbal', isAgresionV, MARGIN_X + colW, cy, colW);
    drawCheckbox('Ausencia injustif.', false, MARGIN_X + (colW * 2), cy, colW);
    cy += 5;

    // Row 2
    drawCheckbox('Negativa a trabajar', isNegativa, MARGIN_X, cy, colW);
    drawCheckbox('Agresión física', false, MARGIN_X + colW, cy, colW);
    drawCheckbox('Atrasos reiterados', false, MARGIN_X + (colW * 2), cy, colW);
    cy += 5;

    // Row 3
    drawCheckbox('Desobedecer Instr.', isDesobedecer, MARGIN_X, cy, colW);
    drawCheckbox('Incumplimiento', isIncumplimiento, MARGIN_X + colW, cy, colW);
    drawCheckbox('Otro hecho grave', isOtro, MARGIN_X + (colW * 2), cy, colW);

    y = cy + 8;

    // --- III. LUGAR ---
    y += drawSectionTitle('III. Lugar de la Falta', y);

    // Row 1: Terminal | Via Publica
    drawBoxedField('TERMINAL', data.place_terminal?.toUpperCase() || '', MARGIN_X, y, halfW - 2, 20);
    drawBoxedField('VÍA PÚBLICA', data.place_public_way?.toUpperCase() || '', MARGIN_X + halfW, y, halfW, 20);
    y += 6;

    // Row 2: Vehiculo | PPU
    drawBoxedField('VEHÍCULO', data.place_vehicle || '', MARGIN_X, y, halfW - 2, 20);
    drawBoxedField('PPU', data.place_ppu || '', MARGIN_X + halfW, y, halfW / 2, 10);
    y += 6;

    // Row 3: Detalle
    drawBoxedField('DETALLE', '', MARGIN_X, y, CONTENT_W, 20);
    y += 10;

    // --- IV. INVOLUCRADOS (Horizontal) ---
    y += drawSectionTitle('IV. Involucrados', y);
    // Horizontal Layout
    drawCheckbox('Jefatura Directa', true, MARGIN_X, y, colW);
    drawCheckbox('Compañeros de Trabajo', false, MARGIN_X + colW, y, colW);
    doc.setFontSize(7);
    doc.text('Otros: _______________________', MARGIN_X + (colW * 2), y + 3);
    y += 8;

    // --- V. DESCRIPTION ---
    y += drawSectionTitle('V. Descripción Detallada de los Hechos', y);

    const descH = 45; // Fixed height compact
    doc.rect(MARGIN_X, y, CONTENT_W, descH);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    const textW = CONTENT_W - 8;
    const splitDesc = doc.splitTextToSize(data.description.toUpperCase(), textW);
    doc.text(splitDesc, MARGIN_X + 4, y + 4);

    y += descH + 6;

    // --- VI. TESTIGOS (Compact side-by-side) ---
    y += drawSectionTitle('VI. Testigos Presenciales', y);

    const wBoxW = (CONTENT_W - 5) / 2;
    const wBoxH = 30; // Reduced height

    // Witness 1
    const w1X = MARGIN_X;
    doc.rect(w1X, y, wBoxW, wBoxH);
    let wy = y + 4;
    drawBoxedField('NOMBRE', data.witness1_name, w1X + 2, wy, wBoxW - 4, 15); wy += 6;
    drawBoxedField('RUT', data.witness1_rut, w1X + 2, wy, wBoxW - 4, 15); wy += 6;
    drawBoxedField('CARGO', data.witness1_cargo, w1X + 2, wy, wBoxW - 4, 15);

    // W1 Signature Line
    doc.line(w1X + 10, y + wBoxH - 8, w1X + wBoxW - 10, y + wBoxH - 8);
    doc.setFontSize(6);
    doc.text('FIRMA TESTIGO 1', w1X + (wBoxW / 2), y + wBoxH - 4, { align: 'center' });


    // Witness 2
    const w2X = MARGIN_X + wBoxW + 5;
    doc.rect(w2X, y, wBoxW, wBoxH);
    wy = y + 4;
    drawBoxedField('NOMBRE', data.witness2_name, w2X + 2, wy, wBoxW - 4, 15); wy += 6;
    drawBoxedField('RUT', data.witness2_rut, w2X + 2, wy, wBoxW - 4, 15); wy += 6;
    drawBoxedField('CARGO', data.witness2_cargo, w2X + 2, wy, wBoxW - 4, 15);

    // W2 Signature Line
    doc.line(w2X + 10, y + wBoxH - 8, w2X + wBoxW - 10, y + wBoxH - 8);
    doc.setFontSize(6);
    doc.text('FIRMA TESTIGO 2', w2X + (wBoxW / 2), y + wBoxH - 4, { align: 'center' });

    y += wBoxH + 8;

    // --- VII. RESPONSABLE ---
    y += drawSectionTitle('VII. Responsable (Jefe de Terminal)', y);

    const rBoxH = 25;
    doc.rect(MARGIN_X, y, CONTENT_W, rBoxH);

    // Left side info
    drawBoxedField('NOMBRE', data.responsible_name.toUpperCase(), MARGIN_X + 4, y + 4, CONTENT_W / 2, 15);
    drawBoxedField('CARGO', data.responsible_cargo.toUpperCase(), MARGIN_X + 4, y + 10, CONTENT_W / 2, 15);

    // Right side Signature
    const sigX = MARGIN_X + (CONTENT_W / 2) + 10;
    doc.line(sigX, y + rBoxH - 8, PAGE_W - MARGIN_X - 10, y + rBoxH - 8);
    doc.setFontSize(7);
    doc.text('FIRMA Y TIMBRE', sigX + ((PAGE_W - MARGIN_X - 10 - sigX) / 2), y + rBoxH - 4, { align: 'center' });

    doc.save(`Amonestacion_Acta_${data.worker_rut}.pdf`);
};
