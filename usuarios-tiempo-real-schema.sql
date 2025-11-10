-- =============================================
-- USUARIOS EN TIEMPO REAL - TRACKING ACTIVO
-- =============================================
-- Sistema para trackear usuarios conectados y su ubicación GPS
-- =============================================

-- 1. CREAR TABLA DE USUARIOS ACTIVOS
CREATE TABLE IF NOT EXISTS usuarios_activos (
  usuario_rut TEXT PRIMARY KEY REFERENCES usuarios(rut) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  cargo TEXT NOT NULL,
  terminal TEXT NOT NULL,
  lat NUMERIC NOT NULL,
  lon NUMERIC NOT NULL,
  accuracy NUMERIC, -- Precisión del GPS en metros
  last_heartbeat TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_address TEXT,
  device_info JSONB, -- Info del dispositivo (navegador, OS, etc.)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. CREAR ÍNDICES PARA PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_usuarios_activos_heartbeat
  ON usuarios_activos(last_heartbeat DESC);

CREATE INDEX IF NOT EXISTS idx_usuarios_activos_terminal
  ON usuarios_activos(terminal);

CREATE INDEX IF NOT EXISTS idx_usuarios_activos_cargo
  ON usuarios_activos(cargo);

-- 3. FUNCIÓN PARA LIMPIAR USUARIOS INACTIVOS (>5 minutos sin heartbeat)
CREATE OR REPLACE FUNCTION limpiar_usuarios_inactivos()
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM usuarios_activos
  WHERE last_heartbeat < NOW() - INTERVAL '5 minutes';

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

-- 4. FUNCIÓN PARA ACTUALIZAR/INSERTAR USUARIO ACTIVO (UPSERT)
CREATE OR REPLACE FUNCTION actualizar_usuario_activo(
  p_usuario_rut TEXT,
  p_nombre TEXT,
  p_cargo TEXT,
  p_terminal TEXT,
  p_lat NUMERIC,
  p_lon NUMERIC,
  p_accuracy NUMERIC DEFAULT NULL,
  p_ip_address TEXT DEFAULT NULL,
  p_device_info JSONB DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO usuarios_activos (
    usuario_rut, nombre, cargo, terminal, lat, lon,
    accuracy, ip_address, device_info, last_heartbeat
  )
  VALUES (
    p_usuario_rut, p_nombre, p_cargo, p_terminal, p_lat, p_lon,
    p_accuracy, p_ip_address, p_device_info, NOW()
  )
  ON CONFLICT (usuario_rut)
  DO UPDATE SET
    nombre = EXCLUDED.nombre,
    cargo = EXCLUDED.cargo,
    terminal = EXCLUDED.terminal,
    lat = EXCLUDED.lat,
    lon = EXCLUDED.lon,
    accuracy = EXCLUDED.accuracy,
    ip_address = EXCLUDED.ip_address,
    device_info = EXCLUDED.device_info,
    last_heartbeat = NOW(),
    updated_at = NOW();
END;
$$;

-- 5. CREAR TRIGGER PARA AUTO-ACTUALIZAR updated_at
CREATE OR REPLACE FUNCTION update_usuarios_activos_timestamp()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_update_usuarios_activos_timestamp ON usuarios_activos;
CREATE TRIGGER trigger_update_usuarios_activos_timestamp
    BEFORE UPDATE ON usuarios_activos
    FOR EACH ROW
    EXECUTE FUNCTION update_usuarios_activos_timestamp();

-- 6. POLÍTICAS RLS PARA USUARIOS ACTIVOS
ALTER TABLE usuarios_activos ENABLE ROW LEVEL SECURITY;

-- Permitir lectura pública (para ver usuarios en mapa)
DROP POLICY IF EXISTS "Permitir lectura pública usuarios activos" ON usuarios_activos;
CREATE POLICY "Permitir lectura pública usuarios activos"
  ON usuarios_activos
  FOR SELECT
  USING (true);

-- Permitir inserción pública (para heartbeat)
DROP POLICY IF EXISTS "Permitir inserción usuarios activos" ON usuarios_activos;
CREATE POLICY "Permitir inserción usuarios activos"
  ON usuarios_activos
  FOR INSERT
  WITH CHECK (true);

-- Permitir actualización pública (para heartbeat)
DROP POLICY IF EXISTS "Permitir actualización usuarios activos" ON usuarios_activos;
CREATE POLICY "Permitir actualización usuarios activos"
  ON usuarios_activos
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- Permitir eliminación pública (para logout)
DROP POLICY IF EXISTS "Permitir eliminación usuarios activos" ON usuarios_activos;
CREATE POLICY "Permitir eliminación usuarios activos"
  ON usuarios_activos
  FOR DELETE
  USING (true);

-- 7. VISTA PARA USUARIOS ACTIVOS CON ÚLTIMA REVISIÓN
CREATE OR REPLACE VIEW usuarios_activos_detallados AS
SELECT
  ua.*,
  EXTRACT(EPOCH FROM (NOW() - ua.last_heartbeat)) as segundos_inactivo,
  (SELECT COUNT(*) FROM revisiones r
   WHERE r.inspector_rut = ua.usuario_rut
   AND r.created_at >= CURRENT_DATE) as inspecciones_hoy,
  (SELECT r.bus_ppu FROM revisiones r
   WHERE r.inspector_rut = ua.usuario_rut
   ORDER BY r.created_at DESC LIMIT 1) as ultimo_bus_inspeccionado,
  (SELECT r.created_at FROM revisiones r
   WHERE r.inspector_rut = ua.usuario_rut
   ORDER BY r.created_at DESC LIMIT 1) as ultima_inspeccion_fecha
FROM usuarios_activos ua
WHERE ua.last_heartbeat > NOW() - INTERVAL '5 minutes'
ORDER BY ua.last_heartbeat DESC;

-- 8. VERIFICACIÓN
SELECT
  'usuarios_activos' as tabla,
  COUNT(*) as registros_actuales
FROM usuarios_activos;

-- =============================================
-- ✅ SCRIPT COMPLETADO
-- =============================================
-- FUNCIONALIDADES CREADAS:
-- ✅ Tabla usuarios_activos con tracking GPS
-- ✅ Función para limpiar inactivos (>5 min)
-- ✅ Función UPSERT para actualizar posición
-- ✅ Trigger auto-update timestamps
-- ✅ Políticas RLS completas
-- ✅ Vista con detalles y métricas
-- ✅ Índices para performance
--
-- USO:
-- - Cada 10 segundos, la app llama actualizar_usuario_activo()
-- - El mapa consulta usuarios_activos_detallados cada 5 segundos
-- - Usuarios inactivos >5 min se eliminan automáticamente
-- =============================================
