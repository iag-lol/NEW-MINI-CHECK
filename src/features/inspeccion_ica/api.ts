import { supabase } from '../../shared/lib/supabaseClient';
import { InspeccionICARow, InspeccionICAInsert } from './types';

const TABLE = 'inspeccion_ica';

export interface InspeccionesFilters {
    ppu?: string;
    terminal_code?: string;
    fechaDesde?: string;
    fechaHasta?: string;
}

export const saveInspeccion = async (data: InspeccionICAInsert): Promise<InspeccionICARow> => {
    const { data: result, error } = await supabase
        .from(TABLE)
        .insert(data)
        .select()
        .single();
    if (error) throw error;
    return result as InspeccionICARow;
};

export const fetchInspecciones = async (filters?: InspeccionesFilters): Promise<InspeccionICARow[]> => {
    let query = supabase
        .from(TABLE)
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);

    if (filters?.ppu) query = query.ilike('ppu', `%${filters.ppu}%`);
    if (filters?.terminal_code) query = query.eq('terminal_code', filters.terminal_code);
    if (filters?.fechaDesde) query = query.gte('fecha', filters.fechaDesde);
    if (filters?.fechaHasta) query = query.lte('fecha', filters.fechaHasta);

    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as InspeccionICARow[];
};
