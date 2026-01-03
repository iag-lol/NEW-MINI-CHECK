import jsPDF from 'jspdf';
import { AmonestacionFormData } from '../types';

export const generateAmonestacionPDF = (data: AmonestacionFormData) => {
    const doc = new jsPDF();

    // Constants for layout
    const PAGE_WIDTH = doc.internal.pageSize.getWidth(); // 210mm approx
    const MARGIN = 15;
    const CONTENT_WIDTH = PAGE_WIDTH - (MARGIN * 2);

    // Helper to draw boxed text field
    const drawField = (label: string, value: string, x: number, y: number, w: number, h: number = 7) => {
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.text(label, x, y - 2);

        doc.setDrawColor(0);
        doc.setLineWidth(0.5);
        doc.rect(x, y, w, h);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        // Clean value to avoid undefined
        const safeValue = value || '';
        doc.text(safeValue, x + 2, y + 5);
    };

    // --- HEADER ---
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('ACTA DE CONSTATACION DE HECHOS', PAGE_WIDTH / 2, 20, { align: 'center' });

    // Decorative lines
    doc.setLineWidth(0.5);
    doc.setDrawColor(0, 0, 150); // Blueish
    doc.line(MARGIN, 25, PAGE_WIDTH - MARGIN, 25);
    doc.circle(PAGE_WIDTH / 2, 25, 1, 'F'); // Little decoration dot logic from image
    doc.line(MARGIN, 27, PAGE_WIDTH - MARGIN, 27); // Double line effect

    // Logo Placeholder (Top Right)
    doc.setTextColor(200, 0, 0);
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bolditalic');
    doc.text('RBU', PAGE_WIDTH - 35, 20);
    doc.setFontSize(10);
    doc.text('Buses', PAGE_WIDTH - 35, 24);
    doc.setTextColor(0); // Reset black

    let currentY = 35;

    // --- DATE & TIME ---
    drawField('FECHA', data.date, MARGIN, currentY, 50);
    drawField('HORA', data.time, PAGE_WIDTH - MARGIN - 50, currentY, 50);

    currentY += 15;

    // --- I. ANTECEDENTES PERSONALES ---
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('I. Antecedentes Personales del infractor', MARGIN, currentY);
    currentY += 3;
    drawField('Nombre', data.worker_name, MARGIN, currentY, CONTENT_WIDTH);
    currentY += 9;
    drawField('Rut', data.worker_rut, MARGIN, currentY, CONTENT_WIDTH);
    currentY += 9;
    drawField('Cargo', data.worker_cargo, MARGIN, currentY, CONTENT_WIDTH);

    currentY += 15;

    // --- II. ANTECEDENTES DE LA FALTA ---
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('II. Antecedentes de la falta', MARGIN, currentY);
    currentY += 3;

    // Draw grid of checkboxes
    // Row 1
    const col1 = MARGIN;
    const col2 = MARGIN + 65;
    const col3 = MARGIN + 125;

    // Helper for checkbox
    const drawCheck = (label: string, checked: boolean, x: number, y: number) => {
        doc.rect(x, y, 5, 5);
        if (checked) {
            doc.setFontSize(10);
            doc.text('X', x + 1, y + 4);
        }
        doc.setFontSize(7);
        doc.text(label, x + 7, y + 4);
    };

    // We can't map all codes perfectly to checkboxes without a huge map, 
    // so we will tick "Otros" if it's not a standard one, or try to guess.
    // For now, let's leave checkboxes empty mostly unless specific.
    // Or just putting the code in the "CODIGO" box is the most important part.

    drawCheck('Abandono de trabajo', data.sanction_code_id === 50, col1, currentY);
    drawCheck('Agresión verbal', data.sanction_code_id === 32, col2, currentY);
    drawCheck('Dia falta', false, col3, currentY); // Logic needed?

    currentY += 7;
    drawCheck('Negativa a trabajar', data.sanction_code_id === 51, col1, currentY);
    drawCheck('Agresión física', data.sanction_code_id === 47, col2, currentY);
    drawCheck('Atrasos', [4, 18].includes(data.sanction_code_id), col3, currentY);

    currentY += 7;
    drawCheck('Desobedecer Instrucción', [8, 29].includes(data.sanction_code_id), col1, currentY);
    drawCheck('Incumplimiento', true, col2, currentY); // Generic check usually

    // CODIGO BOX
    doc.rect(col3, currentY - 2, 40, 8);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(`CODIGO ${data.sanction_code_id}`, col3 + 5, currentY + 4);

    currentY += 15;

    // --- III. ANTECEDENTES DEL LUGAR ---
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('III. Antecedentes del lugar de la falta o incidente', MARGIN, currentY);
    currentY += 3;

    drawField('cabezal o terminal', data.place_terminal, MARGIN + 40, currentY, CONTENT_WIDTH - 40);
    doc.setFontSize(8); doc.text('cabezal o terminal', MARGIN, currentY + 5);
    currentY += 9;

    drawField('via publica', data.place_public_way, MARGIN + 40, currentY, CONTENT_WIDTH - 40);
    doc.setFontSize(8); doc.text('via publica', MARGIN, currentY + 5);
    currentY += 9;

    // Split row for Vehicle / PPU
    drawField('vehiculo', data.place_vehicle, MARGIN + 40, currentY, 30);
    drawField('PPU', data.place_ppu, MARGIN + 80, currentY, CONTENT_WIDTH - 80);
    doc.setFontSize(8); doc.text('vehiculo / PPU', MARGIN, currentY + 5);
    currentY += 9;

    drawField('detalle del lugar', data.place_detail, MARGIN + 40, currentY, CONTENT_WIDTH - 40);
    doc.setFontSize(8); doc.text('detalle del lugar', MARGIN, currentY + 5);

    currentY += 15;

    // --- IV. INVOLUCRADOS ---
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('IV. Antecedentes de los involucrados en el incidente', MARGIN, currentY);
    currentY += 3;

    drawField('Jefatura', data.involved_jefatura, MARGIN + 40, currentY, CONTENT_WIDTH - 40);
    doc.setFontSize(8); doc.text('Jefatura', MARGIN, currentY + 5);
    currentY += 9;

    drawField('Compañeros', data.involved_companeros, MARGIN + 40, currentY, CONTENT_WIDTH - 40);
    doc.setFontSize(8); doc.text('Compañeros', MARGIN, currentY + 5);
    currentY += 9;

    drawField('Otro (esp)', data.involved_other, MARGIN + 40, currentY, CONTENT_WIDTH - 40);
    doc.setFontSize(8); doc.text('Otro (esp)', MARGIN, currentY + 5);

    currentY += 15;

    // --- V. DESCRIPTION ---
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('V. Descripcion detallada de los hechos', MARGIN, currentY);
    currentY += 3;

    // Large Box
    const boxHeight = 60;
    doc.rect(MARGIN, currentY, CONTENT_WIDTH, boxHeight);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    // Split text to fit
    const splitText = doc.splitTextToSize(data.description.toUpperCase(), CONTENT_WIDTH - 4);
    doc.text(splitText, MARGIN + 2, currentY + 5);

    currentY += boxHeight + 10;

    // --- VI. TESTIGOS ---
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('VI. Testigos Presenciales', MARGIN, currentY);

    const wHalf = CONTENT_WIDTH / 2 - 2;

    // Witness 1 Box
    const w1Y = currentY + 3;
    doc.rect(MARGIN, w1Y, wHalf, 25);
    doc.setFontSize(8);
    doc.text(`Nombre: ${data.witness1_name}`, MARGIN + 2, w1Y + 5);
    doc.text(`Rut: ${data.witness1_rut}`, MARGIN + 2, w1Y + 10);
    doc.text(`Cargo: ${data.witness1_cargo}`, MARGIN + 2, w1Y + 15);
    doc.text('Firma:', MARGIN + 2, w1Y + 22);

    // Witness 2 Box
    doc.rect(MARGIN + wHalf + 4, w1Y, wHalf, 25);
    doc.text(`Nombre: ${data.witness2_name}`, MARGIN + wHalf + 6, w1Y + 5);
    doc.text(`Rut: ${data.witness2_rut}`, MARGIN + wHalf + 6, w1Y + 10);
    doc.text(`Cargo: ${data.witness2_cargo}`, MARGIN + wHalf + 6, w1Y + 15);
    doc.text('Firma:', MARGIN + wHalf + 6, w1Y + 22);

    currentY = w1Y + 30;

    // --- VII. RESPONSABLE ---
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('VII. Responsable de la constatación', MARGIN, currentY);
    currentY += 3;

    doc.rect(MARGIN, currentY, CONTENT_WIDTH, 15);
    doc.setFontSize(8);
    doc.text(`Nombre: ${data.responsible_name}`, MARGIN + 2, currentY + 5);
    doc.text(`Cargo: ${data.responsible_cargo}`, MARGIN + 2, currentY + 12);

    // FINAL SIGNATURE LINE
    currentY += 30;
    doc.line(PAGE_WIDTH - 80, currentY, PAGE_WIDTH - 20, currentY);
    doc.text('FIRMA', PAGE_WIDTH - 60, currentY + 5, { align: 'center' });

    doc.save(`Amonestacion_${data.worker_rut}_${data.date}.pdf`);
};
