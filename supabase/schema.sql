-- =============================================
-- ASISS DATABASE SCHEMA
-- Run this in Supabase SQL Editor
-- =============================================

-- =============================================
-- SECTION: PERSONAL
-- =============================================

-- Enum para estado de staff
CREATE TYPE staff_status AS ENUM ('ACTIVO', 'DESVINCULADO');

-- Tabla principal de personal
CREATE TABLE staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rut TEXT UNIQUE NOT NULL,
  nombre TEXT NOT NULL,
  cargo TEXT NOT NULL,
  terminal_code TEXT NOT NULL,
  turno TEXT NOT NULL,
  horario TEXT NOT NULL,
  contacto TEXT NOT NULL,
  status staff_status NOT NULL DEFAULT 'ACTIVO',
  terminated_at TIMESTAMPTZ,
  termination_comment TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Índices para staff
CREATE INDEX idx_staff_rut ON staff(rut);
CREATE INDEX idx_staff_terminal ON staff(terminal_code);
CREATE INDEX idx_staff_cargo ON staff(cargo); 
CREATE INDEX idx_staff_status ON staff(status);

-- Trigger para actualizar updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_staff_updated_at
  BEFORE UPDATE ON staff
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Tabla de amonestaciones
CREATE TABLE staff_admonitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  admonition_date DATE NOT NULL,
  document_path TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_admonitions_staff ON staff_admonitions(staff_id, admonition_date DESC);

-- Tabla de cupos máximos
CREATE TABLE staff_caps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_type TEXT NOT NULL CHECK (scope_type IN ('TERMINAL_GROUP', 'TERMINAL', 'COMPANY')),
  scope_code TEXT NOT NULL,
  cargo TEXT NOT NULL,
  max_q INT NOT NULL CHECK (max_q >= 0),
  UNIQUE(scope_type, scope_code, cargo)
);

-- Insertar cupos para ER_LR (El Roble + La Reina)
INSERT INTO staff_caps (scope_type, scope_code, cargo, max_q) VALUES
  ('TERMINAL_GROUP', 'ER_LR', 'conductor', 12),
  ('TERMINAL_GROUP', 'ER_LR', 'inspector_patio', 21),
  ('TERMINAL_GROUP', 'ER_LR', 'cleaner', 36),
  ('TERMINAL_GROUP', 'ER_LR', 'planillero', 9),
  ('TERMINAL_GROUP', 'ER_LR', 'supervisor', 7);

-- Enable Realtime for tables
ALTER PUBLICATION supabase_realtime ADD TABLE staff;
ALTER PUBLICATION supabase_realtime ADD TABLE staff_admonitions;

-- RLS Policies (permissive for development)
ALTER TABLE staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_admonitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_caps ENABLE ROW LEVEL SECURITY;

-- Allow all operations (adjust for production)
CREATE POLICY "Allow all for staff" ON staff FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for admonitions" ON staff_admonitions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow read for caps" ON staff_caps FOR SELECT USING (true);












-- =============================================
-- STORAGE: Create bucket for staff documents
-- Run this separately or create via Supabase Dashboard:
-- Bucket name: staff-docs
-- Public: false
-- =============================================

-- =============================================
-- SECTION: ASISTENCIA
-- =============================================

-- Enum para estado de autorización
CREATE TYPE auth_status_enum AS ENUM ('PENDIENTE', 'AUTORIZADO', 'RECHAZADO');

-- Enum para entrada/salida
CREATE TYPE entry_exit_enum AS ENUM ('ENTRADA', 'SALIDA');

-- Tabla: No Marcaciones
CREATE TABLE attendance_no_marcaciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rut TEXT NOT NULL,
  nombre TEXT NOT NULL,
  area TEXT,
  cargo TEXT,
  jefe_terminal TEXT,
  terminal_code TEXT NOT NULL,
  cabezal TEXT,
  incident_state TEXT,
  schedule_in_out TEXT,
  date DATE NOT NULL,
  time_range TEXT,
  observations TEXT,
  informed_by TEXT,
  auth_status auth_status_enum NOT NULL DEFAULT 'PENDIENTE',
  authorized_by TEXT,
  authorized_at TIMESTAMPTZ,
  rejection_reason TEXT,
  created_by_supervisor TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_no_marcaciones_rut ON attendance_no_marcaciones(rut);
CREATE INDEX idx_no_marcaciones_terminal ON attendance_no_marcaciones(terminal_code);
CREATE INDEX idx_no_marcaciones_status ON attendance_no_marcaciones(auth_status);
CREATE INDEX idx_no_marcaciones_date ON attendance_no_marcaciones(date DESC);

CREATE TRIGGER update_no_marcaciones_updated_at
  BEFORE UPDATE ON attendance_no_marcaciones
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Tabla: Sin Credenciales
CREATE TABLE attendance_sin_credenciales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rut TEXT NOT NULL,
  nombre TEXT NOT NULL,
  terminal_code TEXT NOT NULL,
  cabezal TEXT,
  date DATE NOT NULL,
  start_time TIME,
  end_time TIME,
  cargo TEXT,
  supervisor_autoriza TEXT,
  area TEXT,
  responsable TEXT,
  observacion TEXT,
  auth_status auth_status_enum NOT NULL DEFAULT 'PENDIENTE',
  authorized_by TEXT,
  authorized_at TIMESTAMPTZ,
  rejection_reason TEXT,
  created_by_supervisor TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_sin_credenciales_rut ON attendance_sin_credenciales(rut);
CREATE INDEX idx_sin_credenciales_terminal ON attendance_sin_credenciales(terminal_code);
CREATE INDEX idx_sin_credenciales_status ON attendance_sin_credenciales(auth_status);
CREATE INDEX idx_sin_credenciales_date ON attendance_sin_credenciales(date DESC);

CREATE TRIGGER update_sin_credenciales_updated_at
  BEFORE UPDATE ON attendance_sin_credenciales
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Tabla: Cambios de Día
CREATE TABLE attendance_cambios_dia (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rut TEXT NOT NULL,
  nombre TEXT NOT NULL,
  terminal_code TEXT NOT NULL,
  cabezal TEXT,
  date DATE NOT NULL,
  prog_start TIME,
  prog_end TIME,
  reprogram_start TIME,
  reprogram_end TIME,
  day_off_date DATE,
  day_off_start TIME,
  day_off_end TIME,
  day_on_date DATE,
  day_on_start TIME,
  day_on_end TIME,
  document_path TEXT,
  auth_status auth_status_enum NOT NULL DEFAULT 'PENDIENTE',
  authorized_by TEXT,
  authorized_at TIMESTAMPTZ,
  rejection_reason TEXT,
  created_by_supervisor TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_cambios_dia_rut ON attendance_cambios_dia(rut);
CREATE INDEX idx_cambios_dia_terminal ON attendance_cambios_dia(terminal_code);
CREATE INDEX idx_cambios_dia_status ON attendance_cambios_dia(auth_status);
CREATE INDEX idx_cambios_dia_date ON attendance_cambios_dia(date DESC);

CREATE TRIGGER update_cambios_dia_updated_at
  BEFORE UPDATE ON attendance_cambios_dia
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Tabla: Autorizaciones (retiro anticipado / llegada tardía)
CREATE TABLE attendance_autorizaciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rut TEXT NOT NULL,
  nombre TEXT NOT NULL,
  cargo TEXT,
  terminal_code TEXT NOT NULL,
  turno TEXT,
  horario TEXT,
  authorization_date DATE NOT NULL,
  entry_or_exit entry_exit_enum NOT NULL,
  motivo TEXT NOT NULL,
  auth_status auth_status_enum NOT NULL DEFAULT 'PENDIENTE',
  authorized_by TEXT,
  authorized_at TIMESTAMPTZ,
  rejection_reason TEXT,
  created_by_supervisor TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_autorizaciones_rut ON attendance_autorizaciones(rut);
CREATE INDEX idx_autorizaciones_terminal ON attendance_autorizaciones(terminal_code);
CREATE INDEX idx_autorizaciones_status ON attendance_autorizaciones(auth_status);
CREATE INDEX idx_autorizaciones_date ON attendance_autorizaciones(authorization_date DESC);

CREATE TRIGGER update_autorizaciones_updated_at
  BEFORE UPDATE ON attendance_autorizaciones
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Enable Realtime for attendance tables
ALTER PUBLICATION supabase_realtime ADD TABLE attendance_no_marcaciones;
ALTER PUBLICATION supabase_realtime ADD TABLE attendance_sin_credenciales;
ALTER PUBLICATION supabase_realtime ADD TABLE attendance_cambios_dia;
ALTER PUBLICATION supabase_realtime ADD TABLE attendance_autorizaciones;

-- RLS for attendance tables
ALTER TABLE attendance_no_marcaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_sin_credenciales ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_cambios_dia ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_autorizaciones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for no_marcaciones" ON attendance_no_marcaciones FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for sin_credenciales" ON attendance_sin_credenciales FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for cambios_dia" ON attendance_cambios_dia FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for autorizaciones" ON attendance_autorizaciones FOR ALL USING (true) WITH CHECK (true);

-- =============================================
-- STORAGE: Create bucket for attendance documents
-- Bucket name: attendance-docs
-- Public: false
-- =============================================

-- =============================================
-- SECTION: CREDENCIALES DE RESPALDO
-- Control de préstamo de tarjetas de respaldo
-- =============================================

-- Enums para estados
CREATE TYPE backup_card_status_enum AS ENUM ('LIBRE', 'ASIGNADA', 'INACTIVA');
CREATE TYPE backup_loan_status_enum AS ENUM ('ASIGNADA', 'RECUPERADA', 'CERRADA', 'CANCELADA');
CREATE TYPE backup_reason_enum AS ENUM ('PERDIDA', 'DETERIORO');

-- Tabla: Inventario de tarjetas de respaldo
CREATE TABLE backup_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_number TEXT UNIQUE NOT NULL,
  inventory_terminal TEXT NOT NULL CHECK (inventory_terminal IN ('El Roble', 'La Reina', 'Maria Angelica')),
  status backup_card_status_enum NOT NULL DEFAULT 'LIBRE',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_backup_cards_terminal_status ON backup_cards(inventory_terminal, status);

CREATE TRIGGER update_backup_cards_updated_at
  BEFORE UPDATE ON backup_cards
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Tabla: Préstamos de tarjetas de respaldo
CREATE TABLE backup_loans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id UUID NOT NULL REFERENCES backup_cards(id),
  -- Datos de la persona (independiente de tabla Personal)
  person_rut TEXT NOT NULL,
  person_name TEXT NOT NULL,
  person_cargo TEXT,
  person_terminal TEXT NOT NULL,
  person_turno TEXT,
  person_horario TEXT,
  person_contacto TEXT,
  boss_email TEXT,
  -- Solicitud
  reason backup_reason_enum NOT NULL,
  requested_at DATE NOT NULL DEFAULT CURRENT_DATE,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Tiempos esperados y alertas
  expected_return_days INT NOT NULL DEFAULT 3,
  alert_after_days INT NOT NULL DEFAULT 7,
  -- Estado del préstamo
  status backup_loan_status_enum NOT NULL DEFAULT 'ASIGNADA',
  recovered_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  cancel_reason TEXT,
  -- Descuento
  discount_amount INT NOT NULL DEFAULT 5000,
  discount_applied BOOLEAN NOT NULL DEFAULT true,
  discount_evidence_path TEXT,
  -- Auditoría
  created_by_supervisor TEXT NOT NULL,
  emails_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Índice único parcial: Una tarjeta solo puede tener UN préstamo activo (ASIGNADA)
CREATE UNIQUE INDEX idx_backup_loans_active_card ON backup_loans(card_id) WHERE status = 'ASIGNADA';

-- Índices para consultas frecuentes
CREATE INDEX idx_backup_loans_person_rut ON backup_loans(person_rut);
CREATE INDEX idx_backup_loans_terminal_status ON backup_loans(person_terminal, status, issued_at DESC);
CREATE INDEX idx_backup_loans_status_issued ON backup_loans(status, issued_at DESC);
CREATE INDEX idx_backup_loans_issued ON backup_loans(issued_at DESC);

CREATE TRIGGER update_backup_loans_updated_at
  BEFORE UPDATE ON backup_loans
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Tabla: Configuración de correos
CREATE TABLE backup_email_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_type TEXT NOT NULL CHECK (scope_type IN ('GLOBAL', 'TERMINAL')),
  scope_code TEXT NOT NULL,
  manager_email TEXT NOT NULL,
  cc_emails TEXT,
  subject_manager TEXT NOT NULL DEFAULT 'Solicitud de Nueva Credencial',
  subject_boss TEXT NOT NULL DEFAULT 'Notificación de Credencial de Respaldo',
  enabled BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(scope_type, scope_code)
);

CREATE TRIGGER update_backup_email_settings_updated_at
  BEFORE UPDATE ON backup_email_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Enable Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE backup_cards;
ALTER PUBLICATION supabase_realtime ADD TABLE backup_loans;

-- RLS (permisivo para desarrollo)
ALTER TABLE backup_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE backup_loans ENABLE ROW LEVEL SECURITY;
ALTER TABLE backup_email_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for backup_cards" ON backup_cards FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for backup_loans" ON backup_loans FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for backup_email_settings" ON backup_email_settings FOR ALL USING (true) WITH CHECK (true);

-- =============================================
-- STORAGE: Create bucket for backup evidence
-- Bucket name: backup-evidence
-- Public: false
-- =============================================

-- =============================================
-- SECTION: SOLICITUDES INTELIGENTES DE INSUMOS
-- Gestion de insumos, solicitudes, y entregas
-- =============================================

-- Tabla: Catalogo de insumos
CREATE TABLE supplies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  unit TEXT NOT NULL,
  life_days INT,
  min_stock INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_supplies_name ON supplies(name);

-- Tabla: Perfiles de consumo por ubicacion y periodo
CREATE TABLE supply_consumption_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_type TEXT NOT NULL CHECK (location_type IN ('TERMINAL', 'CABEZAL')),
  location_name TEXT NOT NULL,
  period TEXT NOT NULL CHECK (period IN ('DAY', 'NIGHT', 'WEEKEND')),
  supply_id UUID NOT NULL REFERENCES supplies(id) ON DELETE CASCADE,
  quantity INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(location_type, location_name, period, supply_id)
);

CREATE INDEX idx_consumption_profiles_location ON supply_consumption_profiles(location_type, location_name);

CREATE TRIGGER update_consumption_profiles_updated_at
  BEFORE UPDATE ON supply_consumption_profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Tabla: Solicitudes de insumos
CREATE TABLE supply_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  terminal TEXT NOT NULL,
  request_type TEXT NOT NULL CHECK (request_type IN ('SEMANA', 'FIN_SEMANA', 'EXTRA')),
  status TEXT NOT NULL CHECK (status IN ('PENDIENTE', 'RETIRADO')) DEFAULT 'PENDIENTE',
  receipt_path TEXT,
  requested_at TIMESTAMPTZ DEFAULT now(),
  retrieved_at TIMESTAMPTZ,
  created_by TEXT NOT NULL,
  consumption_snapshot JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_supply_requests_terminal ON supply_requests(terminal);
CREATE INDEX idx_supply_requests_status ON supply_requests(status);
CREATE INDEX idx_supply_requests_date ON supply_requests(requested_at DESC);

CREATE TRIGGER update_supply_requests_updated_at
  BEFORE UPDATE ON supply_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Tabla: Items de cada solicitud
CREATE TABLE supply_request_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES supply_requests(id) ON DELETE CASCADE,
  supply_id UUID NOT NULL REFERENCES supplies(id),
  quantity INT NOT NULL DEFAULT 0,
  is_extra BOOLEAN DEFAULT false
);

CREATE INDEX idx_request_items_request ON supply_request_items(request_id);

-- Tabla: Entregas a personal (cleaners)
CREATE TABLE supply_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supply_id UUID NOT NULL REFERENCES supplies(id),
  staff_rut TEXT NOT NULL,
  staff_name TEXT NOT NULL,
  quantity INT NOT NULL,
  delivered_at TIMESTAMPTZ DEFAULT now(),
  next_delivery_at TIMESTAMPTZ,
  notes TEXT,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_supply_deliveries_staff ON supply_deliveries(staff_rut);
CREATE INDEX idx_supply_deliveries_supply ON supply_deliveries(supply_id);
CREATE INDEX idx_supply_deliveries_next ON supply_deliveries(next_delivery_at);

-- Tabla: Configuracion de correos automaticos
CREATE TABLE supply_email_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger TEXT NOT NULL CHECK (trigger IN ('MONDAY', 'FRIDAY', 'MANUAL')),
  recipients TEXT NOT NULL,
  subject TEXT NOT NULL DEFAULT 'Solicitud de Insumos',
  body TEXT NOT NULL DEFAULT '',
  enabled BOOLEAN DEFAULT true,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(trigger)
);

CREATE TRIGGER update_supply_email_settings_updated_at
  BEFORE UPDATE ON supply_email_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Enable Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE supplies;
ALTER PUBLICATION supabase_realtime ADD TABLE supply_consumption_profiles;
ALTER PUBLICATION supabase_realtime ADD TABLE supply_requests;
ALTER PUBLICATION supabase_realtime ADD TABLE supply_deliveries;

-- RLS (permisivo para desarrollo)
ALTER TABLE supplies ENABLE ROW LEVEL SECURITY;
ALTER TABLE supply_consumption_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE supply_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE supply_request_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE supply_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE supply_email_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for supplies" ON supplies FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for supply_consumption_profiles" ON supply_consumption_profiles FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for supply_requests" ON supply_requests FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for supply_request_items" ON supply_request_items FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for supply_deliveries" ON supply_deliveries FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for supply_email_settings" ON supply_email_settings FOR ALL USING (true) WITH CHECK (true);

-- Seed: Insumos base
INSERT INTO supplies (name, unit, life_days, min_stock) VALUES
  ('Nova', 'unidad', NULL, 10),
  ('Confort', 'unidad', NULL, 15),
  ('Bolsas chicas', 'paquete', NULL, 5),
  ('Bolsas grandes', 'paquete', NULL, 5),
  ('Traperos', 'unidad', 30, 3),
  ('Escobillones', 'unidad', 60, 2),
  ('Dispensadores', 'unidad', NULL, 1),
  ('Pulverizador', 'unidad', NULL, 2),
  ('Jabon', 'bidon', NULL, 2)
ON CONFLICT DO NOTHING;

-- Seed: Configuracion de correos por defecto
INSERT INTO supply_email_settings (trigger, recipients, subject, body, enabled) VALUES
  ('MONDAY', '', 'Solicitud Semanal de Insumos', 'Adjunto solicitud de insumos para la semana.', true),
  ('FRIDAY', '', 'Solicitud Fin de Semana - Insumos', 'Adjunto solicitud de insumos para el fin de semana.', true),
  ('MANUAL', '', 'Solicitud Manual de Insumos', 'Solicitud manual de insumos.', true)
ON CONFLICT (trigger) DO NOTHING;

-- =============================================
-- STORAGE: Create bucket for supply receipts
-- Bucket name: supply-receipts
-- Public: false
-- Allowed types: pdf, jpg, png
-- =============================================

-- =============================================
-- PERSONAL (ALTER: tallas y correo)
-- Agregado: 2025-12-26
-- Campos NULLables para compatibilidad con registros existentes
-- =============================================

ALTER TABLE staff ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS talla_polera TEXT;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS talla_chaqueta TEXT;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS talla_pantalon TEXT;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS talla_zapato_seguridad TEXT;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS talla_chaleco_reflectante TEXT;

-- =============================================
-- ASISTENCIA (ALTER: Vacaciones Inteligentes)
-- Agregado: 2025-12-26
-- Sistema de gestión de vacaciones con detección de conflictos
-- =============================================

-- Tabla: Vacaciones
CREATE TABLE attendance_vacaciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Worker info (from staff lookup)
  rut TEXT NOT NULL,
  nombre TEXT NOT NULL,
  cargo TEXT NOT NULL,
  terminal_code TEXT NOT NULL,
  turno TEXT NOT NULL,
  
  -- Vacation dates
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  return_date DATE NOT NULL,
  
  -- Calculated fields
  calendar_days INT NOT NULL,
  business_days INT NOT NULL,
  
  -- Conflict info
  has_conflict BOOLEAN DEFAULT false,
  conflict_authorized BOOLEAN DEFAULT false,
  conflict_details TEXT,
  
  -- Authorization workflow
  auth_status auth_status_enum NOT NULL DEFAULT 'PENDIENTE',
  authorized_by TEXT,
  authorized_at TIMESTAMPTZ,
  rejection_reason TEXT,
  created_by_supervisor TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for vacaciones
CREATE INDEX idx_vacaciones_rut ON attendance_vacaciones(rut);
CREATE INDEX idx_vacaciones_terminal ON attendance_vacaciones(terminal_code);
CREATE INDEX idx_vacaciones_cargo ON attendance_vacaciones(cargo);
CREATE INDEX idx_vacaciones_turno ON attendance_vacaciones(turno);
CREATE INDEX idx_vacaciones_dates ON attendance_vacaciones(start_date, end_date);
CREATE INDEX idx_vacaciones_status ON attendance_vacaciones(auth_status);

-- Trigger for updated_at
CREATE TRIGGER update_vacaciones_updated_at
  BEFORE UPDATE ON attendance_vacaciones
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Enable Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE attendance_vacaciones;

-- RLS (permissive for development)
ALTER TABLE attendance_vacaciones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for vacaciones" ON attendance_vacaciones FOR ALL USING (true) WITH CHECK (true);

-- =============================================
-- SECTION: REUNIONES
-- =============================================

-- Status enum for meetings
CREATE TYPE meeting_status AS ENUM ('PROGRAMADA', 'REALIZADA', 'CANCELADA');
CREATE TYPE notification_status AS ENUM ('PENDIENTE', 'ENVIADO', 'ERROR');
CREATE TYPE action_status AS ENUM ('PENDIENTE', 'CUMPLIDO', 'VENCIDO');

-- Main meetings table
CREATE TABLE meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  terminal_code TEXT NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL,
  duration_minutes INT NOT NULL DEFAULT 30,
  location TEXT,
  meeting_link TEXT,
  status meeting_status NOT NULL DEFAULT 'PROGRAMADA',
  cancel_reason TEXT,
  agenda_json JSONB DEFAULT '[]'::jsonb,
  minutes_text TEXT,
  created_by_supervisor TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Meeting invitees
CREATE TABLE meeting_invitees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  staff_id UUID REFERENCES staff(id) ON DELETE SET NULL,
  invitee_name TEXT NOT NULL,
  invitee_email TEXT,
  notification_status notification_status NOT NULL DEFAULT 'PENDIENTE',
  notified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Meeting files/attachments
CREATE TABLE meeting_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INT NOT NULL,
  uploaded_by TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Meeting actions/agreements
CREATE TABLE meeting_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  responsible_staff_id UUID REFERENCES staff(id) ON DELETE SET NULL,
  responsible_name TEXT,
  due_date DATE,
  status action_status NOT NULL DEFAULT 'PENDIENTE',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Meeting email settings
CREATE TABLE meeting_email_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_type TEXT NOT NULL CHECK (scope_type IN ('GLOBAL', 'TERMINAL')),
  scope_code TEXT NOT NULL,
  enabled BOOLEAN DEFAULT true,
  cc_emails TEXT,
  subject_template TEXT NOT NULL DEFAULT 'Invitación a Reunión: {{title}}',
  body_template TEXT NOT NULL DEFAULT 'Estimado/a {{invitee_name}},\n\nLe invitamos a la reunión "{{title}}" programada para el {{date}} a las {{time}}.\n\nLugar: {{location}}\n\nSaludos cordiales.',
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(scope_type, scope_code)
);

-- Indexes for meetings
CREATE INDEX idx_meetings_terminal_starts ON meetings(terminal_code, starts_at DESC);
CREATE INDEX idx_meetings_status ON meetings(status);
CREATE INDEX idx_meetings_starts_at ON meetings(starts_at);

-- Indexes for invitees
CREATE INDEX idx_invitees_meeting ON meeting_invitees(meeting_id);
CREATE INDEX idx_invitees_staff ON meeting_invitees(staff_id);

-- Indexes for files
CREATE INDEX idx_files_meeting ON meeting_files(meeting_id);

-- Indexes for actions
CREATE INDEX idx_actions_meeting ON meeting_actions(meeting_id);
CREATE INDEX idx_actions_responsible ON meeting_actions(responsible_staff_id);
CREATE INDEX idx_actions_status ON meeting_actions(status);

-- Triggers for updated_at
CREATE TRIGGER update_meetings_updated_at
  BEFORE UPDATE ON meetings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_actions_updated_at
  BEFORE UPDATE ON meeting_actions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_email_settings_updated_at
  BEFORE UPDATE ON meeting_email_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Enable Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE meetings;
ALTER PUBLICATION supabase_realtime ADD TABLE meeting_invitees;
ALTER PUBLICATION supabase_realtime ADD TABLE meeting_actions;

-- RLS (permissive for development)
ALTER TABLE meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_invitees ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_email_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for meetings" ON meetings FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for meeting_invitees" ON meeting_invitees FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for meeting_files" ON meeting_files FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for meeting_actions" ON meeting_actions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for meeting_email_settings" ON meeting_email_settings FOR ALL USING (true) WITH CHECK (true);

-- Insert default global email settings
INSERT INTO meeting_email_settings (scope_type, scope_code, enabled, subject_template, body_template)
VALUES ('GLOBAL', 'ALL', true, 
  'Invitación a Reunión: {{title}}',
  'Estimado/a {{invitee_name}},

Le invitamos a participar en la reunión:

Título: {{title}}
Fecha: {{date}}
Hora: {{time}}
Duración: {{duration}} minutos
Lugar: {{location}}

Agenda:
{{agenda}}

Saludos cordiales,
{{organizer}}')
ON CONFLICT (scope_type, scope_code) DO NOTHING;

-- Storage bucket for meeting files (run this in SQL Editor)
-- INSERT INTO storage.buckets (id, name, public) VALUES ('meeting-files', 'meeting-files', true)
-- ON CONFLICT (id) DO NOTHING;

-- =============================================
-- SECTION: TAREAS
-- =============================================

-- Status enum for tasks
CREATE TYPE task_status_enum AS ENUM ('PENDIENTE', 'EN_CURSO', 'TERMINADO', 'EVALUADO', 'RECHAZADO');

-- Priority enum for tasks
CREATE TYPE task_priority_enum AS ENUM ('BAJA', 'MEDIA', 'ALTA', 'CRITICA');

-- Main tasks table
CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  terminal_code TEXT NOT NULL,
  priority task_priority_enum NOT NULL DEFAULT 'MEDIA',
  status task_status_enum NOT NULL DEFAULT 'PENDIENTE',
  assigned_to_staff_id UUID REFERENCES staff(id) ON DELETE SET NULL,
  assigned_to_name TEXT NOT NULL,
  assigned_to_email TEXT,
  created_by_supervisor TEXT NOT NULL,
  due_at TIMESTAMPTZ,
  period_start DATE,
  period_end DATE,
  evaluated_by TEXT,
  evaluated_at TIMESTAMPTZ,
  evaluation_note TEXT,
  rejected_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT valid_period CHECK (period_end IS NULL OR period_start IS NULL OR period_end >= period_start)
);

-- Task comments/updates
CREATE TABLE task_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  author_name TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Task attachments (files and URLs)
CREATE TABLE task_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('FILE', 'URL')),
  storage_path TEXT,
  url TEXT,
  file_name TEXT,
  mime_type TEXT,
  size_bytes INT,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Task email settings
CREATE TABLE task_email_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_type TEXT NOT NULL CHECK (scope_type IN ('GLOBAL', 'TERMINAL')),
  scope_code TEXT NOT NULL,
  enabled BOOLEAN DEFAULT true,
  cc_emails TEXT,
  subject_templates JSONB NOT NULL DEFAULT '{
    "assigned": "Nueva tarea asignada: {{title}}",
    "status_change": "Tarea actualizada: {{title}}",
    "overdue": "Tarea vencida: {{title}}",
    "evaluated_ok": "Tarea evaluada: {{title}}",
    "evaluated_reject": "Tarea rechazada: {{title}}"
  }'::jsonb,
  body_templates JSONB NOT NULL DEFAULT '{
    "assigned": "Estimado/a {{assigned_name}},\n\nSe le ha asignado la tarea: {{title}}\n\nDescripción: {{description}}\nVencimiento: {{due_date}}\nPrioridad: {{priority}}\n\nSaludos cordiales,\n{{creator}}",
    "status_change": "La tarea \"{{title}}\" ha cambiado a estado: {{status}}",
    "overdue": "La tarea \"{{title}}\" ha vencido y requiere atención.",
    "evaluated_ok": "La tarea \"{{title}}\" ha sido evaluada y aceptada.",
    "evaluated_reject": "La tarea \"{{title}}\" ha sido rechazada.\n\nMotivo: {{reason}}"
  }'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(scope_type, scope_code)
);

-- Indexes for tasks
CREATE INDEX idx_tasks_terminal_status ON tasks(terminal_code, status, updated_at DESC);
CREATE INDEX idx_tasks_due_at ON tasks(due_at);
CREATE INDEX idx_tasks_assigned ON tasks(assigned_to_staff_id);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_created_by ON tasks(created_by_supervisor);

-- Indexes for comments
CREATE INDEX idx_task_comments_task ON task_comments(task_id, created_at DESC);

-- Indexes for attachments
CREATE INDEX idx_task_attachments_task ON task_attachments(task_id, created_at DESC);

-- Trigger for updated_at
CREATE TRIGGER update_tasks_updated_at
  BEFORE UPDATE ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_task_email_settings_updated_at
  BEFORE UPDATE ON task_email_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Enable Realtime (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'tasks'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE tasks;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'task_comments'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE task_comments;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'task_attachments'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE task_attachments;
  END IF;
END $$;

-- RLS (permissive for development)
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_email_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for tasks" ON tasks FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for task_comments" ON task_comments FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for task_attachments" ON task_attachments FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for task_email_settings" ON task_email_settings FOR ALL USING (true) WITH CHECK (true);

-- Insert default global email settings
INSERT INTO task_email_settings (scope_type, scope_code, enabled)
VALUES ('GLOBAL', 'ALL', true)
ON CONFLICT (scope_type, scope_code) DO NOTHING;


-- Storage bucket for task files (run this in SQL Editor)
-- INSERT INTO storage.buckets (id, name, public) VALUES ('task-files', 'task-files', true)
-- ON CONFLICT (id) DO NOTHING;

-- =============================================
-- SECTION: ASISTENCIA 2026
-- Sistema de programación anual y control de 
-- asistencia diaria
-- =============================================

-- Tabla: Tipos de turno con patrón JSON
CREATE TABLE shift_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  pattern_json JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Índice para código de turno
CREATE INDEX idx_shift_types_code ON shift_types(code);

-- Tabla: Asignación de turno por trabajador
CREATE TABLE staff_shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  shift_type_code TEXT NOT NULL REFERENCES shift_types(code),
  variant_code TEXT NOT NULL CHECK (variant_code IN ('PRINCIPAL', 'CONTRATURNO', 'SUPER', 'FIJO', 'ESPECIAL')),
  start_date DATE NOT NULL DEFAULT '2026-01-01',
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(staff_id)
);

CREATE INDEX idx_staff_shifts_staff ON staff_shifts(staff_id);
CREATE INDEX idx_staff_shifts_type ON staff_shifts(shift_type_code);

-- Tabla: Plantillas especiales para ESPECIAL (28 días editables)
CREATE TABLE staff_shift_special_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE UNIQUE,
  cycle_days INT NOT NULL DEFAULT 28,
  off_days_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_special_templates_staff ON staff_shift_special_templates(staff_id);

CREATE TRIGGER update_special_templates_updated_at
  BEFORE UPDATE ON staff_shift_special_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Tabla: Excepciones/overrides por fecha específica
CREATE TABLE staff_shift_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  override_date DATE NOT NULL,
  override_type TEXT NOT NULL CHECK (override_type IN ('OFF', 'WORK', 'CUSTOM')),
  meta_json JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(staff_id, override_date)
);

CREATE INDEX idx_shift_overrides_staff_date ON staff_shift_overrides(staff_id, override_date);

-- Tabla: Marcas de asistencia diarias (P/A)
CREATE TABLE attendance_marks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  mark_date DATE NOT NULL,
  mark TEXT NOT NULL CHECK (mark IN ('P', 'A')),
  note TEXT,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(staff_id, mark_date)
);

CREATE INDEX idx_attendance_marks_staff_date ON attendance_marks(staff_id, mark_date);
CREATE INDEX idx_attendance_marks_date ON attendance_marks(mark_date);

-- Tabla: Licencias médicas
CREATE TABLE attendance_licenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  note TEXT,
  document_path TEXT,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT valid_license_dates CHECK (end_date >= start_date)
);

CREATE INDEX idx_attendance_licenses_staff ON attendance_licenses(staff_id);
CREATE INDEX idx_attendance_licenses_dates ON attendance_licenses(start_date, end_date);

-- Tabla: Permisos
CREATE TABLE attendance_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  permission_type TEXT NOT NULL DEFAULT 'PERSONAL',
  note TEXT,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT valid_permission_dates CHECK (end_date >= start_date)
);

CREATE INDEX idx_attendance_permissions_staff ON attendance_permissions(staff_id);
CREATE INDEX idx_attendance_permissions_dates ON attendance_permissions(start_date, end_date);

-- Tabla: Configuración de correos para asistencia 2026
CREATE TABLE attendance_2026_email_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_type TEXT NOT NULL CHECK (scope_type IN ('GLOBAL', 'TERMINAL')),
  scope_code TEXT NOT NULL,
  recipients TEXT NOT NULL DEFAULT '',
  subject_template TEXT NOT NULL DEFAULT 'Notificación de Asistencia',
  body_template TEXT NOT NULL DEFAULT '',
  enabled BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(scope_type, scope_code)
);

CREATE TRIGGER update_attendance_2026_email_settings_updated_at
  BEFORE UPDATE ON attendance_2026_email_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Tabla: Solicitudes de desvinculación
CREATE TABLE offboarding_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  staff_rut TEXT NOT NULL,
  staff_name TEXT NOT NULL,
  terminal_code TEXT NOT NULL,
  reason TEXT NOT NULL,
  requested_by TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('ENVIADA', 'APROBADA', 'RECHAZADA')) DEFAULT 'ENVIADA',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_offboarding_staff ON offboarding_requests(staff_id);
CREATE INDEX idx_offboarding_status ON offboarding_requests(status);
CREATE INDEX idx_offboarding_terminal ON offboarding_requests(terminal_code);

-- Enable Realtime (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'shift_types'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE shift_types;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'staff_shifts'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE staff_shifts;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'attendance_marks'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE attendance_marks;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'attendance_licenses'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE attendance_licenses;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'attendance_permissions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE attendance_permissions;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'offboarding_requests'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE offboarding_requests;
  END IF;
END $$;

-- RLS (permissive for development)
ALTER TABLE shift_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_shift_special_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_shift_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_marks ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_licenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_2026_email_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE offboarding_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for shift_types" ON shift_types FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for staff_shifts" ON staff_shifts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for staff_shift_special_templates" ON staff_shift_special_templates FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for staff_shift_overrides" ON staff_shift_overrides FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for attendance_marks" ON attendance_marks FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for attendance_licenses" ON attendance_licenses FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for attendance_permissions" ON attendance_permissions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for attendance_2026_email_settings" ON attendance_2026_email_settings FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for offboarding_requests" ON offboarding_requests FOR ALL USING (true) WITH CHECK (true);

-- Seed: Tipos de turno
INSERT INTO shift_types (code, name, pattern_json) VALUES
  ('5X2_FIJO', '5x2 Fijo', '{
    "type": "fixed",
    "description": "Lunes a Viernes trabaja, Sábado y Domingo libre",
    "offDays": [6, 0]
  }'::jsonb),
  ('5X2_ROTATIVO', '5x2 Rotativo', '{
    "type": "rotating",
    "description": "Semana 1: Miércoles+Domingo libre. Semana 2: Viernes+Sábado libre",
    "cycle": 2,
    "weeks": [
      {"offDays": [3, 0]},
      {"offDays": [5, 6]}
    ]
  }'::jsonb),
  ('5X2_SUPER', '5x2 Super', '{
    "type": "rotating",
    "description": "Semana 1: Miércoles+Domingo libre. Semana 2: Jueves+Viernes libre",
    "cycle": 2,
    "weeks": [
      {"offDays": [3, 0]},
      {"offDays": [4, 5]}
    ]
  }'::jsonb),
  ('ESPECIAL', 'Especial (Manual)', '{
    "type": "manual",
    "description": "Plantilla de 28 días definida manualmente",
    "cycleDays": 28
  }'::jsonb),
  ('SUPERVISOR_RELEVO', 'Supervisor Relevo', '{
    "type": "rotating",
    "description": "Cubre supervisores. Sem1: 2 libres (Mié+Dom). Sem2: 3 libres (Mié+Vie+Sáb). Respeta descanso post-noche.",
    "cycle": 2,
    "weeks": [
      {"offDays": [3, 0], "note": "Semana 1: Mié libre (post-noche Mar), Dom libre"},
      {"offDays": [3, 5, 6], "note": "Semana 2: Mié+Vie+Sáb libres (3 días)"}
    ],
    "coversBoth": true,
    "noNightThenDay": true
  }'::jsonb)
ON CONFLICT (code) DO NOTHING;

-- Insert default global email settings
INSERT INTO attendance_2026_email_settings (scope_type, scope_code, recipients, subject_template, body_template, enabled)
VALUES ('GLOBAL', 'ALL', '', 'Notificación de Asistencia 2026', 'Estimado/a,\n\nSe ha registrado un evento en el sistema de asistencia.\n\nSaludos cordiales.', true)
ON CONFLICT (scope_type, scope_code) DO NOTHING;

-- ==========================================
-- ASIS COMMAND - Command Palette System
-- ==========================================

-- Command logs table
CREATE TABLE IF NOT EXISTS asis_command_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    command_text TEXT NOT NULL,
    parsed_intent TEXT,
    payload_json JSONB DEFAULT '{}',
    executed_by TEXT NOT NULL,
    terminal_code TEXT,
    status TEXT CHECK (status IN ('OK', 'ERROR', 'CANCELLED')) DEFAULT 'OK',
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Email settings per intent
CREATE TABLE IF NOT EXISTS asis_command_email_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    intent TEXT UNIQUE NOT NULL,
    recipients TEXT NOT NULL DEFAULT '',
    subject_template TEXT NOT NULL DEFAULT 'Notificación Asis Command',
    enabled BOOLEAN DEFAULT true
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_asis_command_logs_created ON asis_command_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_asis_command_logs_executed_by ON asis_command_logs(executed_by);

-- RLS policies (public for now, can be tightened)
ALTER TABLE asis_command_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE asis_command_email_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "asis_command_logs_all" ON asis_command_logs;
CREATE POLICY "asis_command_logs_all" ON asis_command_logs FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "asis_command_email_settings_all" ON asis_command_email_settings;
CREATE POLICY "asis_command_email_settings_all" ON asis_command_email_settings FOR ALL USING (true) WITH CHECK (true);

-- Seed email settings
INSERT INTO asis_command_email_settings (intent, recipients, subject_template, enabled) VALUES
    ('VACACIONES', '', 'Vacaciones registradas - {nombre}', true),
    ('LICENCIA', '', 'Licencia médica registrada - {nombre}', true),
    ('PERMISO', '', 'Permiso registrado - {nombre}', true),
    ('AUTORIZACION_LLEGADA', '', 'Llegada tardía autorizada - {nombre}', true),
    ('AUTORIZACION_SALIDA', '', 'Salida anticipada autorizada - {nombre}', true)
ON CONFLICT (intent) DO NOTHING;

-- =============================================
-- SRL MODULE (Solicitudes y Reparaciones)
-- =============================================

-- 1. SRL Requests (Header)
CREATE TABLE IF NOT EXISTS srl_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    terminal_code TEXT NOT NULL,
    required_date DATE,
    criticality TEXT CHECK (criticality IN ('BAJA', 'MEDIA', 'ALTA')) DEFAULT 'BAJA',
    applus BOOLEAN DEFAULT false,
    status TEXT NOT NULL DEFAULT 'CREADA', -- CREADA, ENVIADA, PROGRAMADA, EN_REVISION, REPARADA, NO_REPARADA, REAGENDADA, CERRADA
    
    -- Creation info
    created_by TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    
    -- Workflow timestamps
    sent_at TIMESTAMPTZ,
    closed_at TIMESTAMPTZ,
    
    -- Technician info
    technician_name TEXT,
    technician_visit_at TIMESTAMPTZ,
    technician_message TEXT,
    result TEXT CHECK (result IN ('OPERATIVO', 'NO_OPERATIVO')),
    next_visit_at TIMESTAMPTZ,
    
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. SRL Request Buses (Detail)
CREATE TABLE IF NOT EXISTS srl_request_buses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id UUID REFERENCES srl_requests(id) ON DELETE CASCADE,
    bus_ppu TEXT NOT NULL,
    bus_model TEXT,
    problem_type TEXT,
    observation TEXT,
    applus BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. SRL Bus Images (Evidence)
CREATE TABLE IF NOT EXISTS srl_bus_images (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_bus_id UUID REFERENCES srl_request_buses(id) ON DELETE CASCADE,
    storage_path TEXT NOT NULL,
    mime_type TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. SRL Reports (PDFs)
CREATE TABLE IF NOT EXISTS srl_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id UUID REFERENCES srl_requests(id) ON DELETE CASCADE,
    storage_path TEXT NOT NULL,
    uploaded_at TIMESTAMPTZ DEFAULT now(),
    uploaded_by TEXT
);

-- 5. SRL Email Settings
CREATE TABLE IF NOT EXISTS srl_email_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    enabled BOOLEAN DEFAULT true,
    recipients TEXT NOT NULL DEFAULT '',
    cc_emails TEXT,
    subject_template TEXT DEFAULT 'Solicitud SRL - {terminal} - {buses}',
    body_template TEXT,
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_srl_requests_status ON srl_requests(status);
CREATE INDEX IF NOT EXISTS idx_srl_requests_terminal ON srl_requests(terminal_code);
CREATE INDEX IF NOT EXISTS idx_srl_request_buses_ppu ON srl_request_buses(bus_ppu);

-- Enable RLS
ALTER TABLE srl_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE srl_request_buses ENABLE ROW LEVEL SECURITY;
ALTER TABLE srl_bus_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE srl_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE srl_email_settings ENABLE ROW LEVEL SECURITY;

-- Permissive Policies (Authenticated users)
CREATE POLICY "srl_requests_all" ON srl_requests FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "srl_request_buses_all" ON srl_request_buses FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "srl_bus_images_all" ON srl_bus_images FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "srl_reports_all" ON srl_reports FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "srl_email_settings_all" ON srl_email_settings FOR ALL USING (true) WITH CHECK (true);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE srl_requests;
ALTER PUBLICATION supabase_realtime ADD TABLE srl_request_buses;

-- Initial Settings
INSERT INTO srl_email_settings (recipients, subject_template) 
VALUES ('srl@example.com', 'Solicitud SRL - {terminal} - {count} Buses')
ON CONFLICT DO NOTHING;

-- 
-- ALTER: Add settings_json to staff_shift_special_templates for advanced manual config
-- 
ALTER TABLE staff_shift_special_templates 
ADD COLUMN IF NOT EXISTS settings_json JSONB DEFAULT '{}'::jsonb;

