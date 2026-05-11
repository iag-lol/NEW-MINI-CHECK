-- =============================================
-- AGREGAR MODULO RACK (New Mini-Check)
-- =============================================

CREATE TABLE IF NOT EXISTS rack (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  revision_id UUID NOT NULL REFERENCES revisiones(id) ON DELETE CASCADE,
  tiene_disco_duro BOOLEAN,
  tiene_seguridad_extra BOOLEAN,
  tiene_candado BOOLEAN,
  cerraduras_buen_estado BOOLEAN,
  cantidad_cerraduras_esperada INTEGER NOT NULL CHECK (cantidad_cerraduras_esperada IN (2, 4)),
  observacion TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  bus_ppu TEXT NOT NULL,
  terminal TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rack_revision_id ON rack(revision_id);
CREATE INDEX IF NOT EXISTS idx_rack_bus_ppu ON rack(bus_ppu);
CREATE INDEX IF NOT EXISTS idx_rack_created_at ON rack(created_at DESC);

ALTER TABLE rack ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'rack'
      AND policyname = 'Permitir todo en rack'
  ) THEN
    CREATE POLICY "Permitir todo en rack" ON rack
      FOR ALL USING (true);
  END IF;
END $$;
