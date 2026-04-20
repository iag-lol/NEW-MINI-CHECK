-- Migración idempotente para tabla inspeccion_ica (Norma A18)
-- Se puede ejecutar múltiples veces sin errores.

-- 1. Crear tabla (si no existe)
CREATE TABLE IF NOT EXISTS public.inspeccion_ica (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    ppu           TEXT        NOT NULL,
    terminal_code TEXT        NOT NULL,
    fiscalizador  TEXT        NOT NULL,
    fecha         DATE        NOT NULL DEFAULT CURRENT_DATE,
    norma         TEXT        NOT NULL DEFAULT 'A18',
    condiciones   JSONB       NOT NULL,
    score         INTEGER     NOT NULL,
    total         INTEGER     NOT NULL DEFAULT 4,
    resultado     TEXT        NOT NULL CHECK (resultado IN ('CUMPLE', 'NO_CUMPLE')),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Activar RLS
ALTER TABLE public.inspeccion_ica ENABLE ROW LEVEL SECURITY;

-- 3. Eliminar policy si ya existe y recrear (evita error 42710)
DROP POLICY IF EXISTS "Enable all access" ON public.inspeccion_ica;

CREATE POLICY "Enable all access"
    ON public.inspeccion_ica
    FOR ALL
    USING (true)
    WITH CHECK (true);

-- 4. Índices
CREATE INDEX IF NOT EXISTS idx_inspeccion_ica_fecha     ON public.inspeccion_ica(fecha);
CREATE INDEX IF NOT EXISTS idx_inspeccion_ica_terminal  ON public.inspeccion_ica(terminal_code);
CREATE INDEX IF NOT EXISTS idx_inspeccion_ica_ppu       ON public.inspeccion_ica(ppu);
CREATE INDEX IF NOT EXISTS idx_inspeccion_ica_resultado ON public.inspeccion_ica(resultado);

-- 5. Forzar recarga del schema cache de PostgREST (resuelve el 404)
NOTIFY pgrst, 'reload schema';
