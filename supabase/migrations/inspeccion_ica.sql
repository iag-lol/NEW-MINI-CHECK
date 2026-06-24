-- ============================================================================
-- ICA (Norma A18) - Script idempotente y robusto para Supabase
-- Ejecutar en SQL Editor de Supabase cuando falle el registro de inspecciones.
-- ============================================================================

BEGIN;

-- 0) Dependencia para UUID
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1) Crear tabla base si no existe
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

-- 2) Compatibilidad de estructura (si la tabla ya existía con columnas faltantes)
ALTER TABLE public.inspeccion_ica
    ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid(),
    ADD COLUMN IF NOT EXISTS ppu TEXT,
    ADD COLUMN IF NOT EXISTS terminal_code TEXT,
    ADD COLUMN IF NOT EXISTS fiscalizador TEXT,
    ADD COLUMN IF NOT EXISTS fecha DATE DEFAULT CURRENT_DATE,
    ADD COLUMN IF NOT EXISTS norma TEXT DEFAULT 'A18',
    ADD COLUMN IF NOT EXISTS condiciones JSONB,
    ADD COLUMN IF NOT EXISTS score INTEGER,
    ADD COLUMN IF NOT EXISTS total INTEGER DEFAULT 4,
    ADD COLUMN IF NOT EXISTS resultado TEXT,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- 3) Defaults necesarios para inserts desde frontend
ALTER TABLE public.inspeccion_ica
    ALTER COLUMN id SET DEFAULT gen_random_uuid(),
    ALTER COLUMN fecha SET DEFAULT CURRENT_DATE,
    ALTER COLUMN norma SET DEFAULT 'A18',
    ALTER COLUMN total SET DEFAULT 4,
    ALTER COLUMN created_at SET DEFAULT NOW();

-- 4) Constraints idempotentes (sin romper datos antiguos)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'inspeccion_ica_resultado_check'
          AND conrelid = 'public.inspeccion_ica'::regclass
    ) THEN
        ALTER TABLE public.inspeccion_ica
            ADD CONSTRAINT inspeccion_ica_resultado_check
            CHECK (resultado IN ('CUMPLE', 'NO_CUMPLE')) NOT VALID;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'inspeccion_ica_score_check'
          AND conrelid = 'public.inspeccion_ica'::regclass
    ) THEN
        ALTER TABLE public.inspeccion_ica
            ADD CONSTRAINT inspeccion_ica_score_check
            CHECK (score >= 0 AND score <= total) NOT VALID;
    END IF;
END
$$;

-- 5) RLS: limpiar políticas antiguas y recrear políticas explícitas
ALTER TABLE public.inspeccion_ica ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
    p RECORD;
BEGIN
    FOR p IN
        SELECT policyname
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'inspeccion_ica'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.inspeccion_ica', p.policyname);
    END LOOP;
END
$$;

CREATE POLICY inspeccion_ica_select_public
    ON public.inspeccion_ica
    FOR SELECT
    TO public
    USING (true);

CREATE POLICY inspeccion_ica_insert_public
    ON public.inspeccion_ica
    FOR INSERT
    TO public
    WITH CHECK (true);

CREATE POLICY inspeccion_ica_update_public
    ON public.inspeccion_ica
    FOR UPDATE
    TO public
    USING (true)
    WITH CHECK (true);

CREATE POLICY inspeccion_ica_delete_public
    ON public.inspeccion_ica
    FOR DELETE
    TO public
    USING (true);

-- 6) Permisos
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.inspeccion_ica TO anon, authenticated, service_role;

-- 7) Índices
CREATE INDEX IF NOT EXISTS idx_inspeccion_ica_fecha     ON public.inspeccion_ica (fecha);
CREATE INDEX IF NOT EXISTS idx_inspeccion_ica_terminal  ON public.inspeccion_ica (terminal_code);
CREATE INDEX IF NOT EXISTS idx_inspeccion_ica_ppu       ON public.inspeccion_ica (ppu);
CREATE INDEX IF NOT EXISTS idx_inspeccion_ica_resultado ON public.inspeccion_ica (resultado);
CREATE INDEX IF NOT EXISTS idx_inspeccion_ica_created_at ON public.inspeccion_ica (created_at DESC);

-- 8) Compatibilidad ICA -> tabla de PPUs
-- El frontend ICA usa .from('flota'). Si no existe y sí existe fleet_vehicles,
-- creamos una vista de compatibilidad.
DO $$
BEGIN
    IF to_regclass('public.flota') IS NULL
       AND to_regclass('public.fleet_vehicles') IS NOT NULL THEN
        EXECUTE 'CREATE VIEW public.flota AS
                 SELECT ppu, terminal
                 FROM public.fleet_vehicles';
    END IF;
END
$$;

DO $$
BEGIN
    IF to_regclass('public.flota') IS NOT NULL THEN
        EXECUTE 'GRANT SELECT ON TABLE public.flota TO anon, authenticated, service_role';
    END IF;
END
$$;

-- 9) Recargar cache de PostgREST
NOTIFY pgrst, 'reload schema';

COMMIT;
