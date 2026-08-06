-- =============================================================================
-- MÓDULOS CONFIGURABLES + REVISIÓN +15
-- =============================================================================
-- Ejecutar completo en Supabase → SQL Editor → New query → Run.
-- Es idempotente: se puede volver a ejecutar sin romper nada ni perder datos.
--
-- Crea dos cosas:
--   1. `modulos_config` — qué módulos aparecen en el formulario y cuándo.
--   2. `mas15`          — resultados de la revisión de +15.
-- =============================================================================


-- =============================================================================
-- 1. CONFIGURACIÓN DE MÓDULOS
-- =============================================================================
-- Una fila por módulo del formulario. `tipo = 'siempre'` lo muestra en todas
-- las revisiones; `tipo = 'programado'` lo limita a las fechas que cumplan
-- TODAS las condiciones rellenadas (las vacías no filtran).
--
-- semanas_mes: ordinal de la semana dentro del mes, 1 a 5.
--              Los días 1-7 son la semana 1, los 8-14 la 2, etc.
-- dias_semana: 1 = lunes … 7 = domingo (ISO).
-- meses:       1 = enero … 12 = diciembre.
-- La regla se repite indefinidamente mientras no se cambie.

CREATE TABLE IF NOT EXISTS modulos_config (
  clave           TEXT PRIMARY KEY,
  activo          BOOLEAN NOT NULL DEFAULT TRUE,
  tipo            TEXT    NOT NULL DEFAULT 'siempre'
                    CHECK (tipo IN ('siempre', 'programado')),
  semanas_mes     INTEGER[] DEFAULT '{}',
  dias_semana     INTEGER[] DEFAULT '{}',
  meses           INTEGER[] DEFAULT '{}',
  vigente_desde   DATE,
  vigente_hasta   DATE,
  orden           INTEGER DEFAULT 0,
  actualizado_en  TIMESTAMPTZ DEFAULT NOW(),
  actualizado_por TEXT
);

-- Rangos válidos: evita que un error de la app deje datos sin sentido
ALTER TABLE modulos_config DROP CONSTRAINT IF EXISTS modulos_config_semanas_validas;
ALTER TABLE modulos_config ADD CONSTRAINT modulos_config_semanas_validas
  CHECK (semanas_mes <@ ARRAY[1,2,3,4,5]);

ALTER TABLE modulos_config DROP CONSTRAINT IF EXISTS modulos_config_dias_validos;
ALTER TABLE modulos_config ADD CONSTRAINT modulos_config_dias_validos
  CHECK (dias_semana <@ ARRAY[1,2,3,4,5,6,7]);

ALTER TABLE modulos_config DROP CONSTRAINT IF EXISTS modulos_config_meses_validos;
ALTER TABLE modulos_config ADD CONSTRAINT modulos_config_meses_validos
  CHECK (meses <@ ARRAY[1,2,3,4,5,6,7,8,9,10,11,12]);

-- Semilla: todos los módulos activos y sin programación.
-- ON CONFLICT DO NOTHING conserva lo que ya hayas configurado.
INSERT INTO modulos_config (clave, activo, tipo, orden) VALUES
  ('tag',        TRUE, 'siempre', 10),
  ('camaras',    TRUE, 'siempre', 20),
  ('extintores', TRUE, 'siempre', 30),
  ('odometro',   TRUE, 'siempre', 40),
  ('mobileye',   TRUE, 'siempre', 50),
  ('rack',       TRUE, 'siempre', 60),
  ('wifi',       TRUE, 'siempre', 70),
  ('publicidad', TRUE, 'siempre', 80),
  ('mas15',      TRUE, 'siempre', 90)
ON CONFLICT (clave) DO NOTHING;

ALTER TABLE modulos_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Lectura pública de modulos_config" ON modulos_config;
CREATE POLICY "Lectura pública de modulos_config" ON modulos_config
  FOR SELECT USING (TRUE);

-- La app entra con bcrypt contra la tabla `usuarios`, no con Supabase Auth,
-- así que auth.uid() es NULL: la escritura no puede exigir sesión autenticada
-- o la pantalla de Configuración no podría guardar nada.
DROP POLICY IF EXISTS "Escritura pública de modulos_config" ON modulos_config;
CREATE POLICY "Escritura pública de modulos_config" ON modulos_config
  FOR ALL USING (TRUE) WITH CHECK (TRUE);


-- =============================================================================
-- 2. REVISIÓN +15
-- =============================================================================
-- Procedimiento en terreno:
--   1. Encender el bus y esperar a que consola y validador se enciendan.
--   2. Con ambos encendidos, apagar el bus.
--   3. Retirar el corta corriente.
--   4. Si consola Y validador siguen encendidos → el bus CUENTA con +15.
--      Si ambos se apagan → NO cuenta con +15.
--
-- `tiene_mas15` lo calcula la aplicación a partir de los dos equipos; se
-- guarda ya resuelto para que los reportes no tengan que repetir la regla.
-- Queda en NULL cuando el bus no llegó a encender: no es un "no tiene",
-- es un "no se pudo medir", y mezclarlos falsearía los porcentajes.

CREATE TABLE IF NOT EXISTS mas15 (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  revision_id         UUID NOT NULL REFERENCES revisiones(id) ON DELETE CASCADE,
  arranque_ok         BOOLEAN NOT NULL DEFAULT FALSE,
  consola_encendida   BOOLEAN,
  validador_encendido BOOLEAN,
  tiene_mas15         BOOLEAN,
  observacion         TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  bus_ppu             TEXT NOT NULL,
  terminal            TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_mas15_created_at  ON mas15(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mas15_revision_id ON mas15(revision_id);
CREATE INDEX IF NOT EXISTS idx_mas15_bus_ppu     ON mas15(bus_ppu);
CREATE INDEX IF NOT EXISTS idx_mas15_terminal    ON mas15(terminal);
CREATE INDEX IF NOT EXISTS idx_mas15_resultado   ON mas15(tiene_mas15);

ALTER TABLE mas15 ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Lectura pública de mas15" ON mas15;
CREATE POLICY "Lectura pública de mas15" ON mas15
  FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS "Inserción pública en mas15" ON mas15;
CREATE POLICY "Inserción pública en mas15" ON mas15
  FOR INSERT WITH CHECK (TRUE);

DROP POLICY IF EXISTS "Actualización pública de mas15" ON mas15;
CREATE POLICY "Actualización pública de mas15" ON mas15
  FOR UPDATE USING (TRUE) WITH CHECK (TRUE);

DROP POLICY IF EXISTS "Borrado público de mas15" ON mas15;
CREATE POLICY "Borrado público de mas15" ON mas15
  FOR DELETE USING (TRUE);


-- =============================================================================
-- 3. REALTIME
-- =============================================================================
-- Necesario para que las notificaciones y los contadores lleguen al instante.
-- Si la tabla ya está en la publicación, el DO ignora el error.

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE mas15;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE modulos_config;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;


-- =============================================================================
-- 4. COMPROBACIÓN
-- =============================================================================
-- Debe devolver 9 filas de configuración y la tabla mas15 vacía.

SELECT clave, activo, tipo, semanas_mes, dias_semana, meses, orden
FROM modulos_config
ORDER BY orden;

SELECT COUNT(*) AS revisiones_mas15 FROM mas15;


-- =============================================================================
-- EJEMPLOS DE PROGRAMACIÓN (opcionales, ejecutar sólo si se quieren)
-- =============================================================================

-- +15 sólo la 1ª y la 3ª semana de cada mes, indefinidamente:
-- UPDATE modulos_config
--    SET tipo = 'programado', semanas_mes = ARRAY[1,3], activo = TRUE
--  WHERE clave = 'mas15';

-- Publicidad sólo la última semana del mes:
-- UPDATE modulos_config
--    SET tipo = 'programado', semanas_mes = ARRAY[4,5]
--  WHERE clave = 'publicidad';

-- Odómetro sólo los lunes:
-- UPDATE modulos_config
--    SET tipo = 'programado', dias_semana = ARRAY[1]
--  WHERE clave = 'odometro';

-- Campaña acotada a un trimestre concreto:
-- UPDATE modulos_config
--    SET tipo = 'programado',
--        vigente_desde = '2026-01-01',
--        vigente_hasta = '2026-03-31'
--  WHERE clave = 'publicidad';

-- Apagar un módulo del formulario sin borrar su historial:
-- UPDATE modulos_config SET activo = FALSE WHERE clave = 'wifi';
