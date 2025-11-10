-- =============================================
-- MINI-CHECK - ACTUALIZACIONES DE SCHEMA
-- =============================================
-- Ejecuta este script en Supabase SQL Editor
-- Script idempotente - puede ejecutarse múltiples veces
-- =============================================

-- 1. MIGRAR DATOS ANTIGUOS PRIMERO (CON_DANO → CON_DAÑO)
-- Esto debe hacerse ANTES de actualizar el constraint
UPDATE camaras
SET monitor_estado = 'CON_DAÑO'
WHERE monitor_estado = 'CON_DANO';

-- 2. ACTUALIZAR CONSTRAINT DE CAMARAS (monitor_estado)
DO $$
BEGIN
    -- Eliminar constraint antiguo si existe
    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'camaras_monitor_estado_check'
    ) THEN
        ALTER TABLE camaras DROP CONSTRAINT camaras_monitor_estado_check;
    END IF;

    -- Crear nuevo constraint con todos los valores correctos
    ALTER TABLE camaras ADD CONSTRAINT camaras_monitor_estado_check
    CHECK (monitor_estado IN ('FUNCIONA', 'APAGADO', 'CON_DAÑO', 'SIN_SENAL'));
END $$;

-- 3. AGREGAR COLUMNA updated_at EN CAMARAS
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'camaras' AND column_name = 'updated_at'
    ) THEN
        ALTER TABLE camaras ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
    END IF;
END $$;

-- 4. AGREGAR COLUMNA updated_at EN TAGS
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'tags' AND column_name = 'updated_at'
    ) THEN
        ALTER TABLE tags ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
    END IF;
END $$;

-- 5. AGREGAR COLUMNA updated_at EN EXTINTORES
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'extintores' AND column_name = 'updated_at'
    ) THEN
        ALTER TABLE extintores ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
    END IF;
END $$;

-- 6. AGREGAR COLUMNA updated_at EN MOBILEYE
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'mobileye' AND column_name = 'updated_at'
    ) THEN
        ALTER TABLE mobileye ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
    END IF;
END $$;

-- 7. AGREGAR COLUMNA updated_at EN ODOMETRO
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'odometro' AND column_name = 'updated_at'
    ) THEN
        ALTER TABLE odometro ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
    END IF;
END $$;

-- 8. AGREGAR COLUMNA updated_at EN PUBLICIDAD
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'publicidad' AND column_name = 'updated_at'
    ) THEN
        ALTER TABLE publicidad ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
    END IF;
END $$;

-- 9. AGREGAR COLUMNAS ADICIONALES EN TICKETS (una por una)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'tickets' AND column_name = 'responsable'
    ) THEN
        ALTER TABLE tickets ADD COLUMN responsable TEXT;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'tickets' AND column_name = 'fecha_limite'
    ) THEN
        ALTER TABLE tickets ADD COLUMN fecha_limite TIMESTAMPTZ;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'tickets' AND column_name = 'completado_por'
    ) THEN
        ALTER TABLE tickets ADD COLUMN completado_por TEXT;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'tickets' AND column_name = 'completado_en'
    ) THEN
        ALTER TABLE tickets ADD COLUMN completado_en TIMESTAMPTZ;
    END IF;
END $$;

-- 10. CREAR FUNCIÓN PARA AUTO-ACTUALIZAR updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

-- 11. CREAR TRIGGERS PARA AUTO-ACTUALIZAR updated_at

-- Trigger para camaras
DROP TRIGGER IF EXISTS update_camaras_updated_at ON camaras;
CREATE TRIGGER update_camaras_updated_at
    BEFORE UPDATE ON camaras
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger para tags
DROP TRIGGER IF EXISTS update_tags_updated_at ON tags;
CREATE TRIGGER update_tags_updated_at
    BEFORE UPDATE ON tags
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger para extintores
DROP TRIGGER IF EXISTS update_extintores_updated_at ON extintores;
CREATE TRIGGER update_extintores_updated_at
    BEFORE UPDATE ON extintores
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger para mobileye
DROP TRIGGER IF EXISTS update_mobileye_updated_at ON mobileye;
CREATE TRIGGER update_mobileye_updated_at
    BEFORE UPDATE ON mobileye
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger para odometro
DROP TRIGGER IF EXISTS update_odometro_updated_at ON odometro;
CREATE TRIGGER update_odometro_updated_at
    BEFORE UPDATE ON odometro
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger para publicidad
DROP TRIGGER IF EXISTS update_publicidad_updated_at ON publicidad;
CREATE TRIGGER update_publicidad_updated_at
    BEFORE UPDATE ON publicidad
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 12. CREAR ÍNDICES PARA MEJOR PERFORMANCE

-- Índices para camaras
CREATE INDEX IF NOT EXISTS idx_camaras_monitor_estado ON camaras(monitor_estado);
CREATE INDEX IF NOT EXISTS idx_camaras_updated_at ON camaras(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_camaras_bus_ppu ON camaras(bus_ppu);
CREATE INDEX IF NOT EXISTS idx_camaras_terminal ON camaras(terminal);

-- Índices para tags
CREATE INDEX IF NOT EXISTS idx_tags_tiene ON tags(tiene);
CREATE INDEX IF NOT EXISTS idx_tags_updated_at ON tags(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_tags_bus_ppu ON tags(bus_ppu);
CREATE INDEX IF NOT EXISTS idx_tags_terminal ON tags(terminal);

-- Índices para extintores
CREATE INDEX IF NOT EXISTS idx_extintores_certificacion ON extintores(certificacion);
CREATE INDEX IF NOT EXISTS idx_extintores_presion ON extintores(presion);
CREATE INDEX IF NOT EXISTS idx_extintores_updated_at ON extintores(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_extintores_bus_ppu ON extintores(bus_ppu);
CREATE INDEX IF NOT EXISTS idx_extintores_terminal ON extintores(terminal);

-- Índices para mobileye
CREATE INDEX IF NOT EXISTS idx_mobileye_updated_at ON mobileye(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_mobileye_bus_ppu ON mobileye(bus_ppu);
CREATE INDEX IF NOT EXISTS idx_mobileye_terminal ON mobileye(terminal);

-- Índices para odometro
CREATE INDEX IF NOT EXISTS idx_odometro_estado ON odometro(estado);
CREATE INDEX IF NOT EXISTS idx_odometro_updated_at ON odometro(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_odometro_bus_ppu ON odometro(bus_ppu);
CREATE INDEX IF NOT EXISTS idx_odometro_terminal ON odometro(terminal);

-- Índices para publicidad
CREATE INDEX IF NOT EXISTS idx_publicidad_tiene ON publicidad(tiene);
CREATE INDEX IF NOT EXISTS idx_publicidad_danio ON publicidad(danio);
CREATE INDEX IF NOT EXISTS idx_publicidad_updated_at ON publicidad(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_publicidad_bus_ppu ON publicidad(bus_ppu);
CREATE INDEX IF NOT EXISTS idx_publicidad_terminal ON publicidad(terminal);

-- Índices adicionales para tickets
CREATE INDEX IF NOT EXISTS idx_tickets_responsable ON tickets(responsable);
CREATE INDEX IF NOT EXISTS idx_tickets_fecha_limite ON tickets(fecha_limite);
CREATE INDEX IF NOT EXISTS idx_tickets_completado_por ON tickets(completado_por);

-- 13. CREAR VISTA PARA ESTADÍSTICAS RÁPIDAS
CREATE OR REPLACE VIEW estadisticas_modulos AS
SELECT
    'camaras' as modulo,
    COUNT(*) as total_registros,
    COUNT(*) FILTER (WHERE monitor_estado = 'FUNCIONA') as estado_ok,
    COUNT(*) FILTER (WHERE monitor_estado != 'FUNCIONA') as con_problemas,
    MAX(created_at) as ultima_revision
FROM camaras
UNION ALL
SELECT
    'tags' as modulo,
    COUNT(*) as total_registros,
    COUNT(*) FILTER (WHERE tiene = true) as estado_ok,
    COUNT(*) FILTER (WHERE tiene = false) as con_problemas,
    MAX(created_at) as ultima_revision
FROM tags
UNION ALL
SELECT
    'extintores' as modulo,
    COUNT(*) as total_registros,
    COUNT(*) FILTER (WHERE certificacion = 'VIGENTE') as estado_ok,
    COUNT(*) FILTER (WHERE certificacion = 'VENCIDA') as con_problemas,
    MAX(created_at) as ultima_revision
FROM extintores
UNION ALL
SELECT
    'odometro' as modulo,
    COUNT(*) as total_registros,
    COUNT(*) FILTER (WHERE estado = 'OK') as estado_ok,
    COUNT(*) FILTER (WHERE estado != 'OK') as con_problemas,
    MAX(created_at) as ultima_revision
FROM odometro;

-- 14. CREAR FUNCIÓN PARA OBTENER HISTORIAL DE REVISIONES POR BUS
CREATE OR REPLACE FUNCTION get_historial_bus(bus_ppu_param TEXT)
RETURNS TABLE (
    fecha TIMESTAMPTZ,
    modulo TEXT,
    estado TEXT,
    detalles JSONB
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        r.created_at as fecha,
        'revision_general' as modulo,
        r.estado_bus as estado,
        jsonb_build_object(
            'inspector', r.inspector_nombre,
            'terminal', r.terminal_reportado,
            'operativo', r.operativo
        ) as detalles
    FROM revisiones r
    WHERE r.bus_ppu = bus_ppu_param

    UNION ALL

    SELECT
        c.created_at as fecha,
        'camaras' as modulo,
        c.monitor_estado as estado,
        jsonb_build_object(
            'detalle', c.detalle,
            'observacion', c.observacion
        ) as detalles
    FROM camaras c
    WHERE c.bus_ppu = bus_ppu_param

    UNION ALL

    SELECT
        t.created_at as fecha,
        'tag' as modulo,
        CASE WHEN t.tiene THEN 'INSTALADO' ELSE 'NO_TIENE' END as estado,
        jsonb_build_object(
            'serie', t.serie,
            'observacion', t.observacion
        ) as detalles
    FROM tags t
    WHERE t.bus_ppu = bus_ppu_param

    UNION ALL

    SELECT
        e.created_at as fecha,
        'extintores' as modulo,
        COALESCE(e.certificacion::TEXT, 'NO_REGISTRADO') as estado,
        jsonb_build_object(
            'vencimiento_mes', e.vencimiento_mes,
            'vencimiento_anio', e.vencimiento_anio,
            'presion', e.presion,
            'observacion', e.observacion
        ) as detalles
    FROM extintores e
    WHERE e.bus_ppu = bus_ppu_param

    UNION ALL

    SELECT
        o.created_at as fecha,
        'odometro' as modulo,
        o.estado as estado,
        jsonb_build_object(
            'lectura', o.lectura,
            'observacion', o.observacion
        ) as detalles
    FROM odometro o
    WHERE o.bus_ppu = bus_ppu_param

    ORDER BY fecha DESC;
END;
$$;

-- 15. CREAR VISTA PARA REPORTE DE CÁMARAS
CREATE OR REPLACE VIEW reporte_camaras AS
SELECT
    c.bus_ppu,
    c.terminal,
    c.monitor_estado,
    c.observacion,
    c.created_at as fecha_revision,
    r.inspector_nombre,
    r.estado_bus as estado_bus_general
FROM camaras c
LEFT JOIN revisiones r ON c.revision_id = r.id
ORDER BY c.created_at DESC;

-- 16. CREAR VISTA PARA ALERTAS DE EXTINTORES VENCIDOS
CREATE OR REPLACE VIEW extintores_vencidos AS
SELECT
    e.bus_ppu,
    e.terminal,
    e.vencimiento_mes,
    e.vencimiento_anio,
    e.certificacion,
    e.presion,
    e.created_at as fecha_revision,
    CASE
        WHEN e.vencimiento_mes IS NOT NULL AND e.vencimiento_anio IS NOT NULL THEN
            DATE(e.vencimiento_anio || '-' || LPAD(e.vencimiento_mes::TEXT, 2, '0') || '-01')
        ELSE NULL
    END as fecha_vencimiento,
    CASE
        WHEN e.vencimiento_mes IS NOT NULL AND e.vencimiento_anio IS NOT NULL THEN
            CURRENT_DATE > DATE(e.vencimiento_anio || '-' || LPAD(e.vencimiento_mes::TEXT, 2, '0') || '-01')
        ELSE false
    END as esta_vencido
FROM extintores e
WHERE e.certificacion = 'VENCIDA'
   OR (e.vencimiento_mes IS NOT NULL
       AND e.vencimiento_anio IS NOT NULL
       AND CURRENT_DATE > DATE(e.vencimiento_anio || '-' || LPAD(e.vencimiento_mes::TEXT, 2, '0') || '-01'))
ORDER BY e.created_at DESC;

-- 17. PERMITIR INSERCIÓN Y ACTUALIZACIÓN EN USUARIOS
-- Primero eliminar políticas existentes si hay conflictos
DROP POLICY IF EXISTS "Permitir inserción pública de usuarios" ON usuarios;
DROP POLICY IF EXISTS "Permitir actualización de usuarios" ON usuarios;

-- Crear política para INSERT (permite crear nuevos usuarios)
CREATE POLICY "Permitir inserción pública de usuarios"
ON usuarios
FOR INSERT
WITH CHECK (true);

-- Crear política para UPDATE (permite actualizar usuarios existentes)
CREATE POLICY "Permitir actualización de usuarios"
ON usuarios
FOR UPDATE
USING (true)
WITH CHECK (true);

-- Crear política para DELETE (opcional, solo si necesitas eliminar usuarios)
DROP POLICY IF EXISTS "Permitir eliminación de usuarios" ON usuarios;
CREATE POLICY "Permitir eliminación de usuarios"
ON usuarios
FOR DELETE
USING (true);

-- 18. VERIFICACIÓN FINAL
-- Muestra un resumen de los datos actualizados
SELECT
    'camaras' as tabla,
    COUNT(*) as total_registros,
    COUNT(DISTINCT monitor_estado) as estados_distintos,
    COUNT(*) FILTER (WHERE monitor_estado = 'CON_DAÑO') as con_dano_corregido
FROM camaras
UNION ALL
SELECT
    'tags' as tabla,
    COUNT(*) as total_registros,
    COUNT(*) FILTER (WHERE tiene = true) as con_tag,
    NULL as extra
FROM tags
UNION ALL
SELECT
    'extintores' as tabla,
    COUNT(*) as total_registros,
    COUNT(*) FILTER (WHERE certificacion = 'VIGENTE') as vigentes,
    COUNT(*) FILTER (WHERE certificacion = 'VENCIDA') as vencidos
FROM extintores
UNION ALL
SELECT
    'tickets' as tabla,
    COUNT(*) as total_registros,
    COUNT(*) FILTER (WHERE responsable IS NOT NULL) as con_responsable,
    NULL as extra
FROM tickets;

-- =============================================
-- ✅ SCRIPT COMPLETADO
-- =============================================
-- RESUMEN DE CAMBIOS APLICADOS:
--
-- ✅ Datos migrados automáticamente (CON_DANO → CON_DAÑO) - PRIMERO
-- ✅ Constraint de monitor_estado actualizado (CON_DAÑO con tilde) - DESPUÉS
-- ✅ Columnas updated_at agregadas en 6 tablas
-- ✅ Triggers automáticos creados para updated_at
-- ✅ 4 columnas nuevas en tickets (responsable, fecha_limite, completado_por, completado_en)
-- ✅ 25+ índices creados para mejor performance
-- ✅ Vista estadisticas_modulos para consultas rápidas
-- ✅ Función get_historial_bus() para historial completo
-- ✅ Vista reporte_camaras para análisis
-- ✅ Vista extintores_vencidos para alertas
-- ✅ Políticas RLS para usuarios (INSERT, UPDATE, DELETE)
-- ✅ Verificación final con conteo de registros
--
-- El script es idempotente y puede ejecutarse múltiples veces sin errores.
-- =============================================
