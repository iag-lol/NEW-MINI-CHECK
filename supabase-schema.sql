-- =============================================
-- NEW MINI-CHECK - SUPABASE SCHEMA
-- Sistema de Revisión de Flota de Buses
-- =============================================
-- Este archivo contiene todas las migraciones SQL necesarias
-- para configurar la base de datos en Supabase.
--
-- Ejecutar en: Supabase SQL Editor
-- =============================================

-- 1. TABLA: usuarios
-- Almacena inspectores y supervisores con autenticación
CREATE TABLE IF NOT EXISTS usuarios (
  rut TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  cargo TEXT NOT NULL CHECK (cargo IN ('INSPECTOR', 'SUPERVISOR')),
  terminal TEXT NOT NULL,
  password TEXT NOT NULL, -- Hash bcrypt
  foto_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para usuarios
CREATE INDEX IF NOT EXISTS idx_usuarios_cargo ON usuarios(cargo);
CREATE INDEX IF NOT EXISTS idx_usuarios_terminal ON usuarios(terminal);

-- 2. TABLA: flota
-- Catálogo de buses disponibles
CREATE TABLE IF NOT EXISTS flota (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ppu TEXT UNIQUE NOT NULL,
  numero_interno TEXT NOT NULL,
  marca TEXT NOT NULL,
  modelo TEXT NOT NULL,
  anio INTEGER NOT NULL CHECK (anio >= 2000 AND anio <= 2030),
  terminal TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para flota
CREATE INDEX IF NOT EXISTS idx_flota_ppu ON flota(ppu);
CREATE INDEX IF NOT EXISTS idx_flota_numero_interno ON flota(numero_interno);
CREATE INDEX IF NOT EXISTS idx_flota_terminal ON flota(terminal);

-- 3. TABLA: revisiones
-- Registro principal de inspecciones
CREATE TABLE IF NOT EXISTS revisiones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  inspector_rut TEXT NOT NULL REFERENCES usuarios(rut),
  inspector_nombre TEXT NOT NULL,
  terminal_detectado TEXT NOT NULL,
  terminal_reportado TEXT NOT NULL,
  bus_ppu TEXT NOT NULL,
  bus_interno TEXT NOT NULL,
  estado_bus TEXT NOT NULL CHECK (estado_bus IN ('OPERATIVO', 'EN_PANNE')),
  lat NUMERIC NOT NULL,
  lon NUMERIC NOT NULL,
  observaciones TEXT,
  semana_iso TEXT NOT NULL, -- Formato: 2025-W01
  operativo BOOLEAN NOT NULL DEFAULT true
);

-- Índices para revisiones
CREATE INDEX IF NOT EXISTS idx_revisiones_created_at ON revisiones(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_revisiones_inspector_rut ON revisiones(inspector_rut);
CREATE INDEX IF NOT EXISTS idx_revisiones_bus_ppu ON revisiones(bus_ppu);
CREATE INDEX IF NOT EXISTS idx_revisiones_semana_iso ON revisiones(semana_iso);
CREATE INDEX IF NOT EXISTS idx_revisiones_terminal ON revisiones(terminal_reportado);

-- 4. TABLA: tags
-- Registro de TAG por revisión
CREATE TABLE IF NOT EXISTS tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  revision_id UUID NOT NULL REFERENCES revisiones(id) ON DELETE CASCADE,
  tiene BOOLEAN NOT NULL,
  serie TEXT,
  observacion TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  bus_ppu TEXT NOT NULL,
  terminal TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tags_revision_id ON tags(revision_id);
CREATE INDEX IF NOT EXISTS idx_tags_bus_ppu ON tags(bus_ppu);

-- 5. TABLA: camaras
-- Registro de sistema de cámaras
CREATE TABLE IF NOT EXISTS camaras (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  revision_id UUID NOT NULL REFERENCES revisiones(id) ON DELETE CASCADE,
  monitor_estado TEXT NOT NULL CHECK (monitor_estado IN ('FUNCIONA', 'APAGADO', 'CON_DANO', 'SIN_SENAL')),
  detalle JSONB, -- Almacena estado de cada cámara individual
  observacion TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  bus_ppu TEXT NOT NULL,
  terminal TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_camaras_revision_id ON camaras(revision_id);

-- 6. TABLA: extintores
-- Registro de extintores
CREATE TABLE IF NOT EXISTS extintores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  revision_id UUID NOT NULL REFERENCES revisiones(id) ON DELETE CASCADE,
  tiene BOOLEAN NOT NULL,
  vencimiento_mes INTEGER CHECK (vencimiento_mes BETWEEN 1 AND 12),
  vencimiento_anio INTEGER CHECK (vencimiento_anio BETWEEN 2023 AND 2035),
  certificacion TEXT CHECK (certificacion IN ('VIGENTE', 'VENCIDA')),
  sonda TEXT CHECK (sonda IN ('OK', 'SIN_LECTURA', 'FUERA_DE_RANGO')),
  manometro TEXT CHECK (manometro IN ('OK', 'SIN_LECTURA', 'FUERA_DE_RANGO')),
  presion TEXT CHECK (presion IN ('SOBRECARGA', 'OPTIMO', 'BAJA_CARGA')),
  cilindro TEXT CHECK (cilindro IN ('OK', 'ABOLLADO', 'OXIDADO')),
  porta TEXT CHECK (porta IN ('TIENE', 'NO_TIENE', 'DANADO')),
  observacion TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  bus_ppu TEXT NOT NULL,
  terminal TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_extintores_revision_id ON extintores(revision_id);

-- 7. TABLA: mobileye
-- Registro de sistema Mobileye (solo buses Volvo)
CREATE TABLE IF NOT EXISTS mobileye (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  revision_id UUID NOT NULL REFERENCES revisiones(id) ON DELETE CASCADE,
  bus_marca TEXT NOT NULL,
  alerta_izq BOOLEAN,
  alerta_der BOOLEAN,
  consola BOOLEAN,
  sensor_frontal BOOLEAN,
  sensor_izq BOOLEAN,
  sensor_der BOOLEAN,
  observacion TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  bus_ppu TEXT NOT NULL,
  terminal TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_mobileye_revision_id ON mobileye(revision_id);

-- 8. TABLA: odometro
-- Registro de lectura de odómetro
CREATE TABLE IF NOT EXISTS odometro (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  revision_id UUID NOT NULL REFERENCES revisiones(id) ON DELETE CASCADE,
  lectura NUMERIC NOT NULL CHECK (lectura >= 0),
  estado TEXT NOT NULL CHECK (estado IN ('OK', 'INCONSISTENTE', 'NO_FUNCIONA')),
  observacion TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  bus_ppu TEXT NOT NULL,
  terminal TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_odometro_revision_id ON odometro(revision_id);
CREATE INDEX IF NOT EXISTS idx_odometro_bus_ppu ON odometro(bus_ppu);

-- 9. TABLA: publicidad
-- Registro de publicidad por lateral
CREATE TABLE IF NOT EXISTS publicidad (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  revision_id UUID NOT NULL REFERENCES revisiones(id) ON DELETE CASCADE,
  tiene BOOLEAN NOT NULL,
  danio BOOLEAN,
  residuos BOOLEAN,
  detalle_lados JSONB, -- { izquierda: {}, derecha: {}, luneta: {} }
  nombre_publicidad TEXT,
  observacion TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  bus_ppu TEXT NOT NULL,
  terminal TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_publicidad_revision_id ON publicidad(revision_id);

-- 10. TABLA: tickets
-- Sistema de tickets automáticos y manuales
CREATE TABLE IF NOT EXISTS tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  modulo TEXT NOT NULL,
  revision_id UUID REFERENCES revisiones(id) ON DELETE SET NULL,
  estado TEXT NOT NULL CHECK (estado IN ('PENDIENTE', 'EN_PROCESO', 'RESUELTO')) DEFAULT 'PENDIENTE',
  prioridad TEXT NOT NULL CHECK (prioridad IN ('ALTA', 'MEDIA', 'BAJA')) DEFAULT 'MEDIA',
  descripcion TEXT NOT NULL,
  terminal TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  actualizado_en TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tickets_estado ON tickets(estado);
CREATE INDEX IF NOT EXISTS idx_tickets_created_at ON tickets(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tickets_terminal ON tickets(terminal);

-- 11. TABLA: personal
-- Gestión de personal del terminal
CREATE TABLE IF NOT EXISTS personal (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  cargo TEXT NOT NULL,
  terminal TEXT NOT NULL,
  telefono TEXT,
  correo TEXT,
  estado TEXT NOT NULL CHECK (estado IN ('DISPONIBLE', 'LICENCIA', 'TURNO')) DEFAULT 'DISPONIBLE',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_personal_terminal ON personal(terminal);
CREATE INDEX IF NOT EXISTS idx_personal_estado ON personal(estado);

-- =============================================
-- ROW LEVEL SECURITY (RLS)
-- =============================================
-- Habilitar RLS en todas las tablas

ALTER TABLE usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE flota ENABLE ROW LEVEL SECURITY;
ALTER TABLE revisiones ENABLE ROW LEVEL SECURITY;
ALTER TABLE tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE camaras ENABLE ROW LEVEL SECURITY;
ALTER TABLE extintores ENABLE ROW LEVEL SECURITY;
ALTER TABLE mobileye ENABLE ROW LEVEL SECURITY;
ALTER TABLE odometro ENABLE ROW LEVEL SECURITY;
ALTER TABLE publicidad ENABLE ROW LEVEL SECURITY;
ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE personal ENABLE ROW LEVEL SECURITY;

-- =============================================
-- POLÍTICAS RLS - ACCESO PÚBLICO (ANON KEY)
-- =============================================
-- Estas políticas permiten acceso con la anon key de Supabase
-- En producción, deberías ajustar estas políticas según tus necesidades de seguridad

-- Políticas para usuarios (lectura pública, sin escritura)
CREATE POLICY "Permitir lectura pública de usuarios" ON usuarios
  FOR SELECT USING (true);

-- Políticas para flota (lectura pública)
CREATE POLICY "Permitir lectura pública de flota" ON flota
  FOR SELECT USING (true);

CREATE POLICY "Permitir inserción pública en flota" ON flota
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Permitir actualización pública en flota" ON flota
  FOR UPDATE USING (true);

-- Políticas para revisiones (acceso completo)
CREATE POLICY "Permitir lectura pública de revisiones" ON revisiones
  FOR SELECT USING (true);

CREATE POLICY "Permitir inserción pública en revisiones" ON revisiones
  FOR INSERT WITH CHECK (true);

-- Políticas para módulos (acceso completo)
CREATE POLICY "Permitir todo en tags" ON tags
  FOR ALL USING (true);

CREATE POLICY "Permitir todo en camaras" ON camaras
  FOR ALL USING (true);

CREATE POLICY "Permitir todo en extintores" ON extintores
  FOR ALL USING (true);

CREATE POLICY "Permitir todo en mobileye" ON mobileye
  FOR ALL USING (true);

CREATE POLICY "Permitir todo en odometro" ON odometro
  FOR ALL USING (true);

CREATE POLICY "Permitir todo en publicidad" ON publicidad
  FOR ALL USING (true);

-- Políticas para tickets (acceso completo)
CREATE POLICY "Permitir todo en tickets" ON tickets
  FOR ALL USING (true);

-- Políticas para personal (acceso completo)
CREATE POLICY "Permitir todo en personal" ON personal
  FOR ALL USING (true);

-- =============================================
-- FUNCIONES Y TRIGGERS
-- =============================================

-- Función para actualizar timestamp de tickets
CREATE OR REPLACE FUNCTION actualizar_timestamp_tickets()
RETURNS TRIGGER AS $$
BEGIN
  NEW.actualizado_en = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para actualizar timestamp de tickets
DROP TRIGGER IF EXISTS trigger_actualizar_timestamp_tickets ON tickets;
CREATE TRIGGER trigger_actualizar_timestamp_tickets
  BEFORE UPDATE ON tickets
  FOR EACH ROW
  EXECUTE FUNCTION actualizar_timestamp_tickets();

-- =============================================
-- DATOS DE EJEMPLO (OPCIONAL)
-- =============================================
-- Descomentar para insertar datos de prueba

-- Insertar usuario de prueba (Supervisor)
-- Contraseña: "admin123" (hash bcrypt)
INSERT INTO usuarios (rut, nombre, cargo, terminal, password)
VALUES (
  '12.345.678-9',
  'Juan Pérez',
  'SUPERVISOR',
  'El Roble',
  '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy'
) ON CONFLICT (rut) DO NOTHING;

-- Insertar usuario inspector de prueba
INSERT INTO usuarios (rut, nombre, cargo, terminal, password)
VALUES (
  '98.765.432-1',
  'María González',
  'INSPECTOR',
  'La Reina',
  '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy'
) ON CONFLICT (rut) DO NOTHING;

-- Insertar buses de ejemplo
INSERT INTO flota (ppu, numero_interno, marca, modelo, anio, terminal) VALUES
  ('SHRS75', '1001', 'Mercedes Benz', 'O500U', 2018, 'El Roble'),
  ('SHRS76', '1002', 'Volvo', 'B270F', 2020, 'La Reina'),
  ('SHRS77', '1003', 'Mercedes Benz', 'O500U', 2019, 'María Angélica'),
  ('SHRS78', '1004', 'Volvo', 'B290R', 2021, 'El Descanso')
ON CONFLICT (ppu) DO NOTHING;

-- =============================================
-- NOTAS IMPORTANTES
-- =============================================
-- 1. Las contraseñas deben ser hasheadas con bcrypt antes de almacenarlas
-- 2. Los hash bcrypt deben generarse en el backend con bcryptjs
-- 3. Las políticas RLS están configuradas para acceso público
--    En producción, considera implementar políticas más restrictivas
-- 4. Asegúrate de configurar las variables de entorno en tu aplicación:
--    - VITE_SUPABASE_URL
--    - VITE_SUPABASE_ANON_KEY
--
-- Para más información sobre Row Level Security:
-- https://supabase.com/docs/guides/auth/row-level-security
