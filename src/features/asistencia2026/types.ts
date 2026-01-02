import { TerminalCode } from '../../shared/types/terminal';

// ==========================================
// SHIFT TYPES
// ==========================================

export type ShiftTypeCode = '5X2_FIJO' | '5X2_ROTATIVO' | '5X2_SUPER' | 'ESPECIAL' | 'SUPERVISOR_RELEVO';
export type VariantCode = 'PRINCIPAL' | 'CONTRATURNO' | 'SUPER' | 'FIJO' | 'ESPECIAL' | 'RELEVO';

export interface ShiftType {
    id: string;
    code: ShiftTypeCode;
    name: string;
    pattern_json: ShiftPattern;
    created_at: string;
}

export interface ShiftPattern {
    type: 'fixed' | 'rotating' | 'manual';
    description: string;
    offDays?: number[]; // For fixed (0=Sunday, 6=Saturday)
    cycle?: number; // Number of weeks in cycle
    weeks?: { offDays: number[] }[]; // For rotating
    cycleDays?: number; // For manual (typically 28)
}

export interface StaffShift {
    id: string;
    staff_id: string;
    shift_type_code: ShiftTypeCode;
    variant_code: VariantCode;
    start_date: string;
    created_at: string;
}

export interface StaffShiftSpecialTemplate {
    id: string;
    staff_id: string;
    cycle_days: number;
    off_days_json: number[]; // Array of day indices (0-27) that are off
    settings_json?: SpecialTemplateSettings; // Advanced settings (daily D/N, early exit)
    updated_at: string;
}

export interface SpecialTemplateSettings {
    // Map day index (0-27) to 'DIA' or 'NOCHE'. Default is 'DIA' if not present.
    daily_shifts?: Record<number, 'DIA' | 'NOCHE'>;

    // Recurring early exit rules
    early_exit?: {
        enabled: boolean;
        day_of_week: number; // 0-6 (Sun-Sat)
        time: string; // "14:00"
    };
}

export interface StaffShiftOverride {
    id: string;
    staff_id: string;
    override_date: string;
    override_type: 'OFF' | 'WORK' | 'CUSTOM';
    meta_json: Record<string, unknown>;
    created_at: string;
}

// ==========================================
// ATTENDANCE MARKS
// ==========================================

export type AttendanceMarkType = 'P' | 'A';

export interface AttendanceMark {
    id: string;
    staff_id: string;
    mark_date: string;
    mark: AttendanceMarkType;
    note: string | null;
    created_by: string;
    created_at: string;
}

// ==========================================
// LICENSES & PERMISSIONS
// ==========================================

export interface AttendanceLicense {
    id: string;
    staff_id: string;
    start_date: string;
    end_date: string;
    note: string | null;
    document_path: string | null;
    created_by: string;
    created_at: string;
}

export interface AttendancePermission {
    id: string;
    staff_id: string;
    start_date: string;
    end_date: string;
    permission_type: string;
    note: string | null;
    created_by: string;
    created_at: string;
}

export interface AttendanceNoMark {
    rut: string;
    date: string;
}

export interface AttendanceNoCredential {
    rut: string;
    date: string;
}

export interface AttendanceDayChange {
    rut: string;
    date: string;
    target_date?: string; // Optional as API currently only returns 'date'
}

export interface AttendanceAuthorization {
    rut: string;
    date: string;
}

export interface AttendanceIncidences {
    noMarcaciones: AttendanceNoMark[];
    sinCredenciales: AttendanceNoCredential[];
    cambiosDia: AttendanceDayChange[];
    autorizaciones: AttendanceAuthorization[];
}

// ==========================================
// OFFBOARDING
// ==========================================

export type OffboardingStatus = 'ENVIADA' | 'APROBADA' | 'RECHAZADA';

export interface OffboardingRequest {
    id: string;
    staff_id: string;
    staff_rut: string;
    staff_name: string;
    terminal_code: string;
    reason: string;
    requested_by: string;
    status: OffboardingStatus;
    created_at: string;
}

// ==========================================
// GRID & DISPLAY TYPES
// ==========================================

export type DayStatusType =
    | 'OFF'      // Día libre
    | 'WORK'     // Día de trabajo
    | 'LIC'      // Licencia médica
    | 'VAC'      // Vacaciones
    | 'PER'      // Permiso
    | 'P'        // Presente (marcado)
    | 'A';       // Ausente (marcado)

export type IncidenceCode = 'NM' | 'NC' | 'CD' | 'AUT';

export interface DayStatus {
    type: DayStatusType;
    horario?: string;
    turno?: 'DIA' | 'NOCHE';
    incidencies?: IncidenceCode[];
    isPending?: boolean; // Work day in past without mark
    mark?: AttendanceMark;
    license?: AttendanceLicense;
    vacation?: AttendanceVacation;
    permission?: AttendancePermission;
}

// Extended staff type for grid display
export interface StaffWithShift {
    id: string;
    rut: string;
    nombre: string;
    cargo: string;
    terminal_code: TerminalCode;
    turno: string;
    horario: string;
    contacto: string;
    status: 'ACTIVO' | 'DESVINCULADO';
    shift?: StaffShift;
    admonitionCount?: number;
}

// Vacation (reusing existing table structure)
export interface AttendanceVacation {
    id: string;
    rut: string;
    nombre: string;
    cargo: string;
    terminal_code: TerminalCode;
    turno: string;
    start_date: string;
    end_date: string;
    return_date: string;
    auth_status: 'PENDIENTE' | 'AUTORIZADO' | 'RECHAZADO';
}

// ==========================================
// FILTERS
// ==========================================

export interface GridFilters {
    month: number; // 0-11
    year: number;
    terminal?: TerminalCode | 'ALL';
    turno?: 'DIA' | 'NOCHE' | 'TODOS';
    search?: string;
}

// ==========================================
// KPIs
// ==========================================

export interface Asistencia2026KPIs {
    byPosition: {
        SUPERVISOR: number;
        INSPECTOR: number;
        CONDUCTOR: number;
        PLANILLERO: number;
        CLEANER: number;
    };
    programmmedDay: number;
    programmedNight: number;
    onLicense: number;
    onVacation: number;
    onPermission: number;
    withIncidencies: number;
    pendingMarks: number;
}

// ==========================================
// FORM VALUES
// ==========================================

export interface AttendanceMarkFormValues {
    staff_id: string;
    mark_date: string;
    mark: AttendanceMarkType;
    note?: string;
}

export interface AttendanceLicenseFormValues {
    staff_id: string;
    start_date: string;
    end_date: string;
    note?: string;
    document?: File;
}

export interface AttendancePermissionFormValues {
    staff_id: string;
    start_date: string;
    end_date: string;
    permission_type: string;
    note?: string;
}

export interface OffboardingRequestFormValues {
    staff_id: string;
    staff_rut: string;
    staff_name: string;
    terminal_code: string;
    reason: string;
}

export interface StaffShiftFormValues {
    staff_id: string;
    shift_type_code: ShiftTypeCode;
    variant_code: VariantCode;
    start_date?: string;
}

// ==========================================
// SUBSECTION TYPE
// ==========================================

export type AttendanceSubsection2026 = 'asistencia-2026';

// ==========================================
// CONSTANTS
// ==========================================

export const CARGO_ORDER = [
    'SUPERVISOR',
    'INSPECTOR',
    'CONDUCTOR',
    'PLANILLERO',
    'CLEANER',
] as const;

export const DAY_NAMES_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'] as const;

export const SHIFT_TYPE_LABELS: Record<ShiftTypeCode, string> = {
    '5X2_FIJO': '5x2 Fijo',
    '5X2_ROTATIVO': '5x2 Rotativo',
    '5X2_SUPER': '5x2 Super',
    'ESPECIAL': 'Especial (Manual)',
    'SUPERVISOR_RELEVO': 'Supervisor Relevo',
};

export const VARIANT_LABELS: Record<VariantCode, string> = {
    'PRINCIPAL': 'Principal',
    'CONTRATURNO': 'Contraturno',
    'SUPER': 'Super',
    'FIJO': 'Fijo',
    'ESPECIAL': 'Especial',
    'RELEVO': 'Relevo',
};

export const STATUS_COLORS: Record<DayStatusType, string> = {
    'OFF': 'bg-slate-200 text-slate-600',
    'WORK': 'bg-blue-100 text-blue-800',
    'LIC': 'bg-purple-100 text-purple-800',
    'VAC': 'bg-teal-100 text-teal-800',
    'PER': 'bg-orange-100 text-orange-800',
    'P': 'bg-emerald-100 text-emerald-800',
    'A': 'bg-red-100 text-red-800',
};
