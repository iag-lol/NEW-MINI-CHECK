export type SanctionSeverity = 'Menos Grave' | 'Grave' | 'Gravísima';

export interface SanctionCode {
    code: number;
    severity: SanctionSeverity;
    description: string;
    evidence_required: string;
    template?: string; // For smart narrative generation
}

export interface AmonestacionFormData {
    worker_rut: string;
    worker_name: string;
    worker_cargo: string;
    worker_base: string; // derived from terminal

    date: string;
    time: string;

    place_terminal: string; // "cabezal o terminal"
    place_public_way: string; // "via publica"
    place_vehicle: string; // "vehiculo"
    place_ppu: string; // "PPU"
    place_detail: string; // "detalle del lugar"

    involved_jefatura: string;
    involved_companeros: string;
    involved_other: string;

    description: string; // "Descripción detallada de los hechos"

    witness1_name: string;
    witness1_rut: string;
    witness1_cargo: string;

    witness2_name: string;
    witness2_rut: string;
    witness2_cargo: string;

    responsible_name: string; // "Responsable de la constatación"
    responsible_cargo: string;

    sanction_code_id: number;
}
