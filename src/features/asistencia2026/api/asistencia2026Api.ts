/**
 * Asistencia 2026 API Functions
 * Supabase queries and mutations
 */

import { supabase, isSupabaseConfigured } from '../../../shared/lib/supabaseClient';
import { TerminalContext } from '../../../shared/types/terminal';
import { resolveTerminalsForContext } from '../../../shared/utils/terminal';
import {
    ShiftType,
    StaffShift,
    StaffShiftSpecialTemplate,
    StaffShiftOverride,
    AttendanceMark,
    AttendanceLicense,
    AttendancePermission,
    OffboardingRequest,
    StaffWithShift,
    AttendanceMarkFormValues,
    AttendanceLicenseFormValues,
    AttendancePermissionFormValues,
    OffboardingRequestFormValues,
    StaffShiftFormValues,
    GridFilters,
    SpecialTemplateSettings,
} from '../types';

// ==========================================
// SHIFT TYPES
// ==========================================

export async function fetchShiftTypes(): Promise<ShiftType[]> {
    if (!isSupabaseConfigured()) return [];

    const { data, error } = await supabase
        .from('shift_types')
        .select('*')
        .order('code');

    if (error) throw error;
    return data || [];
}

// ==========================================
// STAFF WITH SHIFTS
// ==========================================

export async function fetchStaffWithShifts(
    terminalContext: TerminalContext,
    filters?: GridFilters
): Promise<StaffWithShift[]> {
    if (!isSupabaseConfigured()) return [];

    // Fetch staff without embedded relation (embedded select not working)
    let query = supabase
        .from('staff')
        .select('id, rut, nombre, cargo, terminal_code, turno, horario, contacto, status')
        .order('cargo')
        .order('nombre');

    // Apply terminal filter - prioritize UI filter over store context
    let terminals: string[] = [];
    if (filters?.terminal && filters.terminal !== 'ALL') {
        // Use explicit UI filter
        terminals = [filters.terminal];
    } else {
        // Fall back to store context
        terminals = resolveTerminalsForContext(terminalContext);
    }

    if (terminals.length > 0) {
        query = query.in('terminal_code', terminals);
    }

    // Apply turno filter
    if (filters?.turno && filters.turno !== 'TODOS') {
        if (filters.turno === 'DIA') {
            // Include all day shifts: dia, day, mañana, morning, tarde, afternoon, rotativo, rotating
            query = query.or('turno.ilike.%dia%,turno.ilike.%day%,turno.ilike.%mañana%,turno.ilike.%morning%,turno.ilike.%tarde%,turno.ilike.%afternoon%,turno.ilike.%rotativ%,turno.ilike.%rotating%');
        } else {
            // Include all night shifts: noche, night
            query = query.or('turno.ilike.%noche%,turno.ilike.%night%');
        }
    }

    // Apply search filter
    if (filters?.search) {
        const search = `%${filters.search}%`;
        query = query.or(`rut.ilike.${search},nombre.ilike.${search}`);
    }

    const { data: staffData, error: staffError } = await query;
    if (staffError) throw staffError;

    // Fetch ALL staff_shifts separately
    const { data: shiftsData, error: shiftsError } = await supabase
        .from('staff_shifts')
        .select('*');

    // Log shifts fetch result
    if (shiftsError) {
        console.warn('fetchStaffWithShifts - Error fetching shifts:', shiftsError.message);
    }
    console.log('fetchStaffWithShifts - Fetched shifts:', shiftsData?.length ?? 0);

    // Build shifts map by staff_id
    const shiftsMap = new Map<string, StaffShift>();
    if (shiftsData) {
        for (const shift of shiftsData) {
            shiftsMap.set(shift.staff_id, shift as StaffShift);
            console.log('Shift loaded:', shift.staff_id, '->', shift.shift_type_code, shift.variant_code);
        }
    }

    // Fetch admonitions count (simpler, just count)
    const { data: admonitionsData } = await supabase
        .from('staff_admonitions')
        .select('staff_id');

    const admonitionsMap = new Map<string, number>();
    if (admonitionsData) {
        for (const adm of admonitionsData) {
            admonitionsMap.set(adm.staff_id, (admonitionsMap.get(adm.staff_id) || 0) + 1);
        }
    }

    // Combine staff with shifts
    const result = (staffData || []).map((staff: Record<string, unknown>) => {
        const staffId = staff.id as string;
        const shiftData = shiftsMap.get(staffId);

        return {
            id: staffId,
            rut: staff.rut as string,
            nombre: staff.nombre as string,
            cargo: staff.cargo as string,
            terminal_code: staff.terminal_code as StaffWithShift['terminal_code'],
            turno: staff.turno as string,
            horario: staff.horario as string,
            contacto: staff.contacto as string,
            status: staff.status as StaffWithShift['status'],
            shift: shiftData,
            admonitionCount: admonitionsMap.get(staffId) || 0,
        };
    });

    console.log('fetchStaffWithShifts - Loaded', result.length, 'staff, with shifts:', result.filter(s => s.shift).length);
    return result;
}

// ==========================================
// STAFF SHIFTS
// ==========================================

export async function fetchStaffShift(staffId: string): Promise<StaffShift | null> {
    if (!isSupabaseConfigured()) return null;

    const { data, error } = await supabase
        .from('staff_shifts')
        .select('*')
        .eq('staff_id', staffId)
        .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data || null;
}

export async function upsertStaffShift(values: StaffShiftFormValues): Promise<StaffShift> {
    if (!isSupabaseConfigured()) throw new Error('Supabase not configured');

    console.log('upsertStaffShift - Attempting insert:', values);

    const { data, error } = await supabase
        .from('staff_shifts')
        .upsert({
            staff_id: values.staff_id,
            shift_type_code: values.shift_type_code,
            variant_code: values.variant_code,
            start_date: values.start_date || '2026-01-01',
        }, { onConflict: 'staff_id' })
        .select()
        .single();

    if (error) {
        console.error('upsertStaffShift - ERROR:', error);
        throw error;
    }

    console.log('upsertStaffShift - SUCCESS:', data);
    return data;
}

// ==========================================
// SPECIAL TEMPLATES
// ==========================================

export async function fetchSpecialTemplate(
    staffId: string
): Promise<StaffShiftSpecialTemplate | null> {
    if (!isSupabaseConfigured()) return null;

    try {
        const { data, error } = await supabase
            .from('staff_shift_special_templates')
            .select('*')
            .eq('staff_id', staffId)
            .single();

        // PGRST116 = not found, 406 = table RLS issue - both should return null
        if (error && (error.code !== 'PGRST116' && error.code !== '406')) {
            console.warn('fetchSpecialTemplate error (ignoring):', error.code, error.message);
            return null;
        }
        return data || null;
    } catch (err) {
        console.warn('fetchSpecialTemplate exception (ignoring):', err);
        return null;
    }
}

/**
 * Fetch all special templates for staff with ESPECIAL shift type
 */
export async function fetchAllSpecialTemplates(
    staffIds: string[]
): Promise<StaffShiftSpecialTemplate[]> {
    if (!isSupabaseConfigured() || staffIds.length === 0) return [];

    try {
        const { data, error } = await supabase
            .from('staff_shift_special_templates')
            .select('*')
            .in('staff_id', staffIds);

        if (error) {
            console.warn('fetchAllSpecialTemplates error (ignoring):', error.message);
            return [];
        }
        return data || [];
    } catch (err) {
        console.warn('fetchAllSpecialTemplates exception (ignoring):', err);
        return [];
    }
}

export async function upsertSpecialTemplate(
    staffId: string,
    offDays: number[],
    settings?: SpecialTemplateSettings
): Promise<StaffShiftSpecialTemplate> {
    if (!isSupabaseConfigured()) throw new Error('Supabase not configured');

    const updatePayload: any = {
        staff_id: staffId,
        off_days_json: offDays,
    };

    if (settings) {
        updatePayload.settings_json = settings;
    }

    const { data, error } = await supabase
        .from('staff_shift_special_templates')
        .upsert(updatePayload, { onConflict: 'staff_id' })
        .select()
        .single();

    if (error) throw error;
    return data;
}

// ==========================================
// SHIFT OVERRIDES
// ==========================================

export async function fetchOverridesForMonth(
    staffIds: string[],
    year: number,
    month: number
): Promise<StaffShiftOverride[]> {
    if (!isSupabaseConfigured() || staffIds.length === 0) return [];

    const startDate = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const endDate = new Date(year, month + 1, 0).toISOString().split('T')[0];

    const { data, error } = await supabase
        .from('staff_shift_overrides')
        .select('*')
        .in('staff_id', staffIds)
        .gte('override_date', startDate)
        .lte('override_date', endDate);

    if (error) throw error;
    return data || [];
}

export async function upsertOverride(
    staffId: string,
    date: string,
    type: 'OFF' | 'WORK' | 'CUSTOM',
    meta?: Record<string, unknown>
): Promise<StaffShiftOverride> {
    if (!isSupabaseConfigured()) throw new Error('Supabase not configured');

    const { data, error } = await supabase
        .from('staff_shift_overrides')
        .upsert({
            staff_id: staffId,
            override_date: date,
            override_type: type,
            meta_json: meta || {},
        }, { onConflict: 'staff_id,override_date' })
        .select()
        .single();

    if (error) throw error;
    return data;
}

// ==========================================
// ATTENDANCE MARKS
// ==========================================

export async function fetchMarksForMonth(
    staffIds: string[],
    year: number,
    month: number
): Promise<AttendanceMark[]> {
    if (!isSupabaseConfigured() || staffIds.length === 0) return [];

    const startDate = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const endDate = new Date(year, month + 1, 0).toISOString().split('T')[0];

    const { data, error } = await supabase
        .from('attendance_marks')
        .select('*')
        .in('staff_id', staffIds)
        .gte('mark_date', startDate)
        .lte('mark_date', endDate);

    if (error) throw error;
    return data || [];
}

export async function createOrUpdateMark(
    values: AttendanceMarkFormValues,
    createdBy: string
): Promise<AttendanceMark> {
    if (!isSupabaseConfigured()) throw new Error('Supabase not configured');

    const { data, error } = await supabase
        .from('attendance_marks')
        .upsert({
            staff_id: values.staff_id,
            mark_date: values.mark_date,
            mark: values.mark,
            note: values.note || null,
            created_by: createdBy,
        }, { onConflict: 'staff_id,mark_date' })
        .select()
        .single();

    if (error) throw error;
    return data;
}

export async function bulkMarkPresent(
    staffIds: string[],
    date: string,
    createdBy: string
): Promise<AttendanceMark[]> {
    if (!isSupabaseConfigured()) throw new Error('Supabase not configured');
    if (staffIds.length === 0) return [];

    const records = staffIds.map((staff_id) => ({
        staff_id,
        mark_date: date,
        mark: 'P' as const,
        created_by: createdBy,
    }));

    const { data, error } = await supabase
        .from('attendance_marks')
        .upsert(records, { onConflict: 'staff_id,mark_date' })
        .select();

    if (error) throw error;
    return data || [];
}

// ==========================================
// LICENSES
// ==========================================

export async function fetchLicensesForMonth(
    staffIds: string[],
    year: number,
    month: number
): Promise<AttendanceLicense[]> {
    if (!isSupabaseConfigured() || staffIds.length === 0) return [];

    const startDate = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const endDate = new Date(year, month + 1, 0).toISOString().split('T')[0];

    const { data, error } = await supabase
        .from('attendance_licenses')
        .select('*')
        .in('staff_id', staffIds)
        .or(`start_date.lte.${endDate},end_date.gte.${startDate}`);

    if (error) throw error;
    return data || [];
}

export async function createLicense(
    values: AttendanceLicenseFormValues,
    createdBy: string
): Promise<AttendanceLicense> {
    if (!isSupabaseConfigured()) throw new Error('Supabase not configured');

    let documentPath: string | null = null;

    // Upload document if provided
    if (values.document) {
        const fileName = `${values.staff_id}/${Date.now()}_${values.document.name}`;
        const { error: uploadError } = await supabase.storage
            .from('attendance-docs')
            .upload(fileName, values.document);

        if (uploadError) throw uploadError;
        documentPath = fileName;
    }

    const { data, error } = await supabase
        .from('attendance_licenses')
        .insert({
            staff_id: values.staff_id,
            start_date: values.start_date,
            end_date: values.end_date,
            note: values.note || null,
            document_path: documentPath,
            created_by: createdBy,
        })
        .select()
        .single();

    if (error) throw error;
    return data;
}

// ==========================================
// PERMISSIONS
// ==========================================

export async function fetchPermissionsForMonth(
    staffIds: string[],
    year: number,
    month: number
): Promise<AttendancePermission[]> {
    if (!isSupabaseConfigured() || staffIds.length === 0) return [];

    const startDate = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const endDate = new Date(year, month + 1, 0).toISOString().split('T')[0];

    const { data, error } = await supabase
        .from('attendance_permissions')
        .select('*')
        .in('staff_id', staffIds)
        .or(`start_date.lte.${endDate},end_date.gte.${startDate}`);

    if (error) throw error;
    return data || [];
}

export async function createPermission(
    values: AttendancePermissionFormValues,
    createdBy: string
): Promise<AttendancePermission> {
    if (!isSupabaseConfigured()) throw new Error('Supabase not configured');

    const { data, error } = await supabase
        .from('attendance_permissions')
        .insert({
            staff_id: values.staff_id,
            start_date: values.start_date,
            end_date: values.end_date,
            permission_type: values.permission_type,
            note: values.note || null,
            created_by: createdBy,
        })
        .select()
        .single();

    if (error) throw error;
    return data;
}

// ==========================================
// VACATIONS (from existing table)
// ==========================================

export async function fetchVacationsForMonth(
    staffIds: string[],
    year: number,
    month: number
): Promise<{ staff_id: string; start_date: string; end_date: string }[]> {
    if (!isSupabaseConfigured() || staffIds.length === 0) return [];

    const startDate = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const endDate = new Date(year, month + 1, 0).toISOString().split('T')[0];

    // Use existing vacaciones table - join by RUT to get staff_id
    const { data: staffData, error: staffError } = await supabase
        .from('staff')
        .select('id, rut')
        .in('id', staffIds);

    if (staffError) throw staffError;

    const ruts = (staffData || []).map(s => s.rut);
    const rutToId = Object.fromEntries((staffData || []).map(s => [s.rut, s.id]));

    const { data, error } = await supabase
        .from('attendance_vacaciones')
        .select('rut, start_date, end_date')
        .in('rut', ruts)
        .eq('auth_status', 'AUTORIZADO')
        .or(`start_date.lte.${endDate},end_date.gte.${startDate}`);

    if (error) throw error;

    return (data || []).map(v => ({
        staff_id: rutToId[v.rut],
        start_date: v.start_date,
        end_date: v.end_date,
    }));
}

// ==========================================
// INCIDENCES (from existing tables)
// ==========================================

export async function fetchIncidencesForMonth(
    terminalCodes: string[],
    year: number,
    month: number
): Promise<{
    noMarcaciones: { rut: string; date: string }[];
    sinCredenciales: { rut: string; date: string }[];
    cambiosDia: { rut: string; date: string }[];
    autorizaciones: { rut: string; date: string }[];
}> {
    if (!isSupabaseConfigured()) {
        return { noMarcaciones: [], sinCredenciales: [], cambiosDia: [], autorizaciones: [] };
    }

    const startDate = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const endDate = new Date(year, month + 1, 0).toISOString().split('T')[0];

    const [nm, sc, cd, aut] = await Promise.all([
        supabase
            .from('attendance_no_marcaciones')
            .select('rut, date')
            .in('terminal_code', terminalCodes)
            .gte('date', startDate)
            .lte('date', endDate),
        supabase
            .from('attendance_sin_credenciales')
            .select('rut, date')
            .in('terminal_code', terminalCodes)
            .gte('date', startDate)
            .lte('date', endDate),
        supabase
            .from('attendance_cambios_dia')
            .select('rut, date, day_on_date')
            .in('terminal_code', terminalCodes)
            .gte('date', startDate)
            .lte('date', endDate),
        supabase
            .from('attendance_autorizaciones')
            .select('rut, authorization_date')
            .in('terminal_code', terminalCodes)
            .gte('authorization_date', startDate)
            .lte('authorization_date', endDate),
    ]);

    return {
        noMarcaciones: (nm.data || []).map(r => ({ rut: r.rut, date: r.date })),
        sinCredenciales: (sc.data || []).map(r => ({ rut: r.rut, date: r.date })),
        cambiosDia: (cd.data || []).map(r => ({ rut: r.rut, date: r.date, target_date: r.day_on_date })),
        autorizaciones: (aut.data || []).map(r => ({ rut: r.rut, date: r.authorization_date })),
    };
}

// ==========================================
// OFFBOARDING REQUESTS
// ==========================================

export async function createOffboardingRequest(
    values: OffboardingRequestFormValues,
    requestedBy: string
): Promise<OffboardingRequest> {
    if (!isSupabaseConfigured()) throw new Error('Supabase not configured');

    const { data, error } = await supabase
        .from('offboarding_requests')
        .insert({
            staff_id: values.staff_id,
            staff_rut: values.staff_rut,
            staff_name: values.staff_name,
            terminal_code: values.terminal_code,
            reason: values.reason,
            requested_by: requestedBy,
            status: 'ENVIADA',
        })
        .select()
        .single();

    if (error) throw error;
    return data;
}

// ==========================================
// REALTIME SUBSCRIPTIONS
// ==========================================

export function subscribeToAsistencia2026Changes(
    onMarkChange: () => void,
    onLicenseChange: () => void,
    onPermissionChange: () => void
): () => void {
    const channels: ReturnType<typeof supabase.channel>[] = [];

    // Marks channel
    const marksChannel = supabase
        .channel('attendance_marks_changes')
        .on('postgres_changes',
            { event: '*', schema: 'public', table: 'attendance_marks' },
            () => onMarkChange()
        )
        .subscribe();
    channels.push(marksChannel);

    // Licenses channel
    const licensesChannel = supabase
        .channel('attendance_licenses_changes')
        .on('postgres_changes',
            { event: '*', schema: 'public', table: 'attendance_licenses' },
            () => onLicenseChange()
        )
        .subscribe();
    channels.push(licensesChannel);

    // Permissions channel
    const permissionsChannel = supabase
        .channel('attendance_permissions_changes')
        .on('postgres_changes',
            { event: '*', schema: 'public', table: 'attendance_permissions' },
            () => onPermissionChange()
        )
        .subscribe();
    channels.push(permissionsChannel);

    // Cleanup function
    return () => {
        channels.forEach(channel => {
            supabase.removeChannel(channel);
        });
    };
}
