export type CondicionId = 'c1' | 'c2' | 'c3' | 'c4';

export interface CondicionA18 {
    id: CondicionId;
    label: string;
    descripcion: string;
}

export interface DetalleCondicion {
    cumple: boolean | null;
    observacion: string;
}

export type CondicionesMap = Record<CondicionId, DetalleCondicion>;

export interface InspeccionICARow {
    id: string;
    ppu: string;
    terminal_code: string;
    fiscalizador: string;
    fecha: string;
    norma: string;
    condiciones: CondicionesMap;
    score: number;
    total: number;
    resultado: 'CUMPLE' | 'NO_CUMPLE';
    created_at: string;
}

export interface InspeccionICAInsert {
    ppu: string;
    terminal_code: string;
    fiscalizador: string;
    fecha: string;
    norma: string;
    condiciones: CondicionesMap;
    score: number;
    total: number;
    resultado: 'CUMPLE' | 'NO_CUMPLE';
}

export const A18_CONDICIONES: CondicionA18[] = [
    {
        id: 'c1',
        label: 'El bus presenta el interior sin basura y completamente limpio',
        descripcion: 'Incluye mecanismo articulado.',
    },
    {
        id: 'c2',
        label: 'El bus presenta el interior seco',
        descripcion: 'Incluye mecanismo articulado.',
    },
    {
        id: 'c3',
        label: 'La cabina del conductor debe estar limpia y seca',
        descripcion: '',
    },
    {
        id: 'c4',
        label: 'No tiene presencia de grafitis en asientos y/o superficies interiores',
        descripcion: 'Incluye techo, piso y paredes.',
    },
];

export const TOTAL_CONDICIONES = A18_CONDICIONES.length;

export const getInitialCondiciones = (): CondicionesMap =>
    Object.fromEntries(
        A18_CONDICIONES.map((c) => [c.id, { cumple: null, observacion: '' }])
    ) as CondicionesMap;
