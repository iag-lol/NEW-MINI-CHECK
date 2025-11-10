-- =============================================
-- MINI-CHECK - ACTUALIZACIONES DE SCHEMA
-- =============================================
-- Ejecuta este script en Supabase SQL Editor
-- para actualizar las tablas existentes
-- =============================================

-- 1. ACTUALIZAR TABLA CAMARAS
-- Cambiar el tipo del campo monitor_estado para incluir todas las opciones
ALTER TABLE camaras
DROP CONSTRAINT IF EXISTS camaras_monitor_estado_check;

ALTER TABLE camaras
ADD CONSTRAINT camaras_monitor_estado_check
CHECK (monitor_estado IN ('FUNCIONA', 'APAGADO', 'CON_DAÑO', 'SIN_SENAL'));

-- Actualizar registros existentes con el valor mal escrito
UPDATE camaras
SET monitor_estado = 'CON_DAÑO'
WHERE monitor_estado = 'CON_DANO';

-- 2. AGREGAR COLUMNAS ADICIONALES PARA MEJOR TRACKING
ALTER TABLE camaras
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE tags
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE extintores
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE mobileye
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE odometro
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE publicidad
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- 3. CREAR FUNCIÓN PARA AUTO-ACTUALIZAR updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 4. CREAR TRIGGERS PARA AUTO-ACTUALIZAR updated_at
DROP TRIGGER IF EXISTS update_camaras_updated_at ON camaras;
CREATE TRIGGER update_camaras_updated_at
    BEFORE UPDATE ON camaras
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_tags_updated_at ON tags;
CREATE TRIGGER update_tags_updated_at
    BEFORE UPDATE ON tags
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_extintores_updated_at ON extintores;
CREATE TRIGGER update_extintores_updated_at
    BEFORE UPDATE ON extintores
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_mobileye_updated_at ON mobileye;
CREATE TRIGGER update_mobileye_updated_at
    BEFORE UPDATE ON mobileye
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_odometro_updated_at ON odometro;
CREATE TRIGGER update_odometro_updated_at
    BEFORE UPDATE ON odometro
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_publicidad_updated_at ON publicidad;
CREATE TRIGGER update_publicidad_updated_at
    BEFORE UPDATE ON publicidad
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 5. AGREGAR ÍNDICES ADICIONALES PARA MEJOR PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_camaras_monitor_estado ON camaras(monitor_estado);
CREATE INDEX IF NOT EXISTS idx_camaras_updated_at ON camaras(updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_tags_tiene ON tags(tiene);
CREATE INDEX IF NOT EXISTS idx_tags_updated_at ON tags(updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_extintores_certificacion ON extintores(certificacion);
CREATE INDEX IF NOT EXISTS idx_extintores_presion ON extintores(presion);
CREATE INDEX IF NOT EXISTS idx_extintores_updated_at ON extintores(updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_mobileye_updated_at ON mobileye(updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_odometro_estado ON odometro(estado);
CREATE INDEX IF NOT EXISTS idx_odometro_updated_at ON odometro(updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_publicidad_tiene ON publicidad(tiene);
CREATE INDEX IF NOT EXISTS idx_publicidad_danio ON publicidad(danio);
CREATE INDEX IF NOT EXISTS idx_publicidad_updated_at ON publicidad(updated_at DESC);

-- 6. AGREGAR COLUMNA DE PRIORIDAD A TICKETS
ALTER TABLE tickets
ADD COLUMN IF NOT EXISTS responsable TEXT,
ADD COLUMN IF NOT EXISTS fecha_limite TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS completado_por TEXT,
ADD COLUMN IF NOT EXISTS completado_en TIMESTAMPTZ;

-- 7. CREAR VISTA PARA ESTADÍSTICAS RÁPIDAS
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

-- 8. CREAR FUNCIÓN PARA OBTENER HISTORIAL DE REVISIONES POR BUS
CREATE OR REPLACE FUNCTION get_historial_bus(bus_ppu_param TEXT)
RETURNS TABLE (
    fecha TIMESTAMPTZ,
    modulo TEXT,
    estado TEXT,
    detalles JSONB
) AS $$
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
$$ LANGUAGE plpgsql;

-- 9. VERIFICACIÓN FINAL
-- Consulta para verificar que todo está correcto
SELECT
    'camaras' as tabla,
    COUNT(*) as registros,
    COUNT(DISTINCT monitor_estado) as estados_distintos
FROM camaras
UNION ALL
SELECT
    'tags' as tabla,
    COUNT(*) as registros,
    COUNT(*) FILTER (WHERE tiene = true) as con_tag
FROM tags
UNION ALL
SELECT
    'extintores' as tabla,
    COUNT(*) as registros,
    COUNT(*) FILTER (WHERE certificacion = 'VIGENTE') as vigentes
FROM extintores;

-- =============================================
-- RESUMEN DE CAMBIOS:
-- =============================================
-- ✅ Corregido: monitor_estado ahora acepta 'CON_DAÑO' (con tilde)
-- ✅ Agregado: Columnas updated_at en todas las tablas de módulos
-- ✅ Agregado: Triggers automáticos para actualizar updated_at
-- ✅ Agregado: Índices adicionales para mejor performance
-- ✅ Agregado: Campos en tickets para mejor gestión
-- ✅ Agregado: Vista de estadísticas rápidas
-- ✅ Agregado: Función para obtener historial completo por bus
-- =============================================
