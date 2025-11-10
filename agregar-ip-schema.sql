-- =============================================
-- AGREGAR COLUMNA IP A REVISIONES
-- =============================================
-- Agrega seguimiento de IP para auditoría
-- =============================================

-- 1. AGREGAR COLUMNA ip_address EN REVISIONES
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'revisiones' AND column_name = 'ip_address'
    ) THEN
        ALTER TABLE revisiones ADD COLUMN ip_address TEXT;
    END IF;
END $$;

-- 2. AGREGAR COLUMNA ip_info EN REVISIONES (JSONB para guardar info adicional)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'revisiones' AND column_name = 'ip_info'
    ) THEN
        ALTER TABLE revisiones ADD COLUMN ip_info JSONB;
    END IF;
END $$;

-- 3. CREAR ÍNDICE PARA IP (útil para búsquedas y auditoría)
CREATE INDEX IF NOT EXISTS idx_revisiones_ip_address ON revisiones(ip_address);

-- 4. VERIFICACIÓN
SELECT
    table_name,
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_name = 'revisiones'
  AND column_name IN ('ip_address', 'ip_info')
ORDER BY column_name;

-- =============================================
-- ✅ SCRIPT COMPLETADO
-- =============================================
-- CAMBIOS APLICADOS:
-- ✅ Columna ip_address agregada (TEXT)
-- ✅ Columna ip_info agregada (JSONB)
-- ✅ Índice creado para búsquedas por IP
-- =============================================
