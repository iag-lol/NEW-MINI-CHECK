-- Tabla de inspecciones ICA - Norma A18
-- "El interior del vehículo está limpio: Libre de suciedad."

CREATE TABLE IF NOT EXISTS public.inspeccion_ica (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    ppu         TEXT        NOT NULL,
    terminal_code TEXT      NOT NULL,
    fiscalizador  TEXT      NOT NULL,
    fecha         DATE      NOT NULL DEFAULT CURRENT_DATE,
    norma         TEXT      NOT NULL DEFAULT 'A18',
    -- JSONB: { c1: {cumple: bool, observacion: str}, c2: ..., c3: ..., c4: ... }
    condiciones   JSONB     NOT NULL,
    score         INTEGER   NOT NULL,
    total         INTEGER   NOT NULL DEFAULT 4,
    resultado     TEXT      NOT NULL CHECK (resultado IN ('CUMPLE', 'NO_CUMPLE')),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.inspeccion_ica ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable all access"
    ON public.inspeccion_ica
    FOR ALL
    USING (true)
    WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_inspeccion_ica_fecha      ON public.inspeccion_ica(fecha);
CREATE INDEX IF NOT EXISTS idx_inspeccion_ica_terminal   ON public.inspeccion_ica(terminal_code);
CREATE INDEX IF NOT EXISTS idx_inspeccion_ica_ppu        ON public.inspeccion_ica(ppu);
CREATE INDEX IF NOT EXISTS idx_inspeccion_ica_resultado  ON public.inspeccion_ica(resultado);
