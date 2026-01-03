import { SanctionCode } from './types';

// Template for Code 8 (based on user example)
const CODE_8_TEMPLATE = `[NOMBRE_TRABAJADOR], RUT: [RUT_TRABAJADOR], [CARGO_TRABAJADOR] DEL TERMINAL [BASE_TRABAJADOR], CON FECHA [FECHA], INCURRIÓ EN INCUMPLIMIENTO DE INSTRUCCIONES VERBALES IMPARTIDAS POR JEFATURA DIRECTA.

ESTA CONDUCTA CONSTITUYE UN INCUMPLIMIENTO DIRECTO A LAS INSTRUCCIONES VERBALES DE SUS JEFES DIRECTOS, GENERANDO UN RIESGO PARA LA OPERACIÓN Y EL ORDEN INTERNO.
CAYENDO EN FALTA (COD. 8).`;

// Catalog of codes provided by user
export const SANCTION_CODES: SanctionCode[] = [
    { code: 7, severity: 'Menos Grave', description: 'Ingresar a sus labores con una presentación personal desaseada.', evidence_required: 'Acta de constatación.' },
    { code: 8, severity: 'Grave', description: 'No cumplir instrucciones verbales de jefes directos.', evidence_required: 'Acta de constatación.', template: CODE_8_TEMPLATE },
    { code: 10, severity: 'Menos Grave', description: 'No usar uniforme asignado por la empresa (Incluye: Cleaners, Planilleros, Conductores, Inspectores).', evidence_required: 'Acta de constatación.' },
    { code: 12, severity: 'Menos Grave', description: 'Faltas a la moral y buenas costumbres (ej. orinar en los patios o buses, botar basura, etc.).', evidence_required: 'Acta de constatación.' },
    { code: 16, severity: 'Gravísima', description: 'Hacer mal uso de los documentos de identificación para simular ingresos/salidas del turno.', evidence_required: 'Acta de constatación.' },
    { code: 22, severity: 'Gravísima', description: 'No estar disponible para realizar las labores encomendadas dentro de la jornada y/o no realizar alguna función deliberadamente.', evidence_required: 'Acta de constatación.' },
    { code: 24, severity: 'Grave', description: 'Faltar sin aviso.', evidence_required: 'Acta de constatación - Informe de pistola o copia libro asistencia.' },
    { code: 29, severity: 'Grave', description: 'No cumplir las instrucciones estipuladas en su contrato de trabajo.', evidence_required: 'Acta de constatación.' },
    { code: 32, severity: 'Gravísima', description: 'Agresión verbal a pasajeros, fiscalizadores y funcionarios de la empresa.', evidence_required: 'Acta de constatación - Reclamo usuario o autoridad.' },
    { code: 36, severity: 'Grave', description: 'No asistir o retirarse sin justificación de los cursos de capacitación citados por la empresa.', evidence_required: 'Acta de constatación - Registro Asistencia Capacitación.' },
    { code: 47, severity: 'Gravísima', description: 'Maltrato físico a cualquier usuario, jefatura y/o compañero de trabajo.', evidence_required: 'Causal de Desvinculación (Evaluación jefaturas).' },
    { code: 48, severity: 'Gravísima', description: 'Presentarse en estado de ebriedad o consumir alcohol en instalaciones/vehículos de la empresa.', evidence_required: 'Causal de Desvinculación (Evaluación jefaturas).' },
    { code: 49, severity: 'Gravísima', description: 'Ser sorprendido robando, hurtando o sustrayendo elementos de la empresa o de terceros.', evidence_required: 'Causal de Desvinculación (Evaluación jefaturas).' },
    { code: 50, severity: 'Gravísima', description: 'Abandonar el trabajo sin causa justificada.', evidence_required: 'Adjuntar horarios.' },
    { code: 51, severity: 'Gravísima', description: 'Negarse a trabajar sin causa justificada.', evidence_required: 'Causal de Desvinculación (Evaluación jefaturas).' },
    { code: 55, severity: 'Gravísima', description: 'Entregar, transmitir o traspasar información comercial o de cualquier tipo perteneciente a la Empresa.', evidence_required: 'Causal de Desvinculación (Evaluación jefaturas).' },
    { code: 86, severity: 'Menos Grave', description: 'Fumar en áreas no permitidas.', evidence_required: 'Acta de constatación.' },
    { code: 90, severity: 'Grave', description: 'No respetar la velocidad máxima en terminales y cabezales.', evidence_required: 'Acta de Constatación + Informe de COF.' },
    { code: 94, severity: 'Grave', description: 'Ejecutar funciones que no son propias de su cargo, que afectan el cumplimiento del Plan Operacional.', evidence_required: 'Acta de Constatación.' },

    // Additional codes from second list
    { code: 69, severity: 'Gravísima', description: 'No revisar planilla de carga de combustible con resultado de panne.', evidence_required: 'Acta de constatación.' },
    { code: 70, severity: 'Gravísima', description: 'No seguir protocolo de descarga de capturadores con pérdida de datos.', evidence_required: 'Acta de constatación.' },
    { code: 71, severity: 'Grave', description: 'No revisar documentos de bus resultando en multas por falta de documentación.', evidence_required: 'Acta de constatación.' },
    { code: 72, severity: 'Grave', description: 'No realizar reporte de normas gráficas con resultado de multas por MTT.', evidence_required: 'Acta de constatación.' },
    { code: 73, severity: 'Grave', description: 'No coordinar retiro de buses con programación de OS (resultado: "pendiente cliente").', evidence_required: 'Acta de constatación.' },
    { code: 74, severity: 'Gravísima', description: 'No coordinar acercamientos según turno (resultado: OB sin acercamientos).', evidence_required: 'Acta de constatación.' },
    { code: 75, severity: 'Grave', description: 'No mantener documentación administrativa ordenada según protocolo.', evidence_required: 'Acta de constatación.' },
    { code: 76, severity: 'Grave', description: 'No mantener planillas electrónicas actualizadas según protocolo (Averías, Km, Recepción, etc.).', evidence_required: 'Acta de constatación.' },
    { code: 77, severity: 'Grave', description: 'No mantener layout dispuesto en terminales.', evidence_required: 'Acta de constatación.' },
    { code: 78, severity: 'Grave', description: 'No entregar y revisar bus con personal de SONDA según protocolo establecido.', evidence_required: 'Acta de constatación.' },
    { code: 79, severity: 'Grave', description: 'Desplazar vehículo sin la licencia de conducir correspondiente.', evidence_required: 'Acta de constatación.' },
    { code: 80, severity: 'Grave', description: 'No respetar las normativas ISO 9001-2008.', evidence_required: 'Acta de constatación.' },
    { code: 81, severity: 'Menos Grave', description: 'No respetar los procedimientos de bodega.', evidence_required: 'Acta de constatación.' },
    { code: 82, severity: 'Grave', description: 'Iniciar la jornada laboral sin la respectiva charla diaria.', evidence_required: 'Acta de constatación.' },
    { code: 83, severity: 'Gravísima', description: 'Exceder los límites de velocidad establecidos dentro de las instalaciones.', evidence_required: 'Causal de Desvinculación (Evaluación jefaturas).' },
    { code: 84, severity: 'Gravísima', description: 'Utilizar camionetas a cargo para fines no establecidos por jefaturas.', evidence_required: 'Causal de Desvinculación (Evaluación jefaturas).' },
    { code: 85, severity: 'Grave', description: 'No cumplir con la normativa DS148 (Manejo de Residuos Peligrosos).', evidence_required: 'Acta de constatación.' },
    { code: 87, severity: 'Grave', description: 'Realizar modificaciones no establecidas en los vehículos de la empresa.', evidence_required: 'Acta de constatación.' },
    { code: 4, severity: 'Menos Grave', description: 'Llegar atrasado entre 31 y 59 minutos.', evidence_required: 'Informe de pistola o copia libro de asistencia.' },
    { code: 18, severity: 'Grave', description: 'Llegar atrasado más de 1 hora.', evidence_required: 'Debe colocar hora de ingreso en la descripción.' },
];
