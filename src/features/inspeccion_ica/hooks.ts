import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchInspecciones, saveInspeccion, InspeccionesFilters } from './api';
import { InspeccionICAInsert } from './types';

const QK = {
    all: ['inspeccion_ica'] as const,
    list: (f?: InspeccionesFilters) => [...QK.all, 'list', f ?? {}] as const,
};

export const useInspecciones = (filters?: InspeccionesFilters) =>
    useQuery({
        queryKey: QK.list(filters),
        queryFn: () => fetchInspecciones(filters),
    });

export const useSaveInspeccion = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (data: InspeccionICAInsert) => saveInspeccion(data),
        onSuccess: () => qc.invalidateQueries({ queryKey: QK.all }),
    });
};
