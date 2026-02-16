-- Tabla WiFi para revisiones de conexión WiFi
CREATE TABLE IF NOT EXISTS public.wifi (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  revision_id UUID NOT NULL REFERENCES public.revisiones(id) ON DELETE CASCADE,
  ppu_visible BOOLEAN,
  bus_encendido BOOLEAN,
  tiene_internet BOOLEAN,
  observacion TEXT,
  bus_ppu TEXT NOT NULL,
  terminal TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices para mejorar rendimiento
CREATE INDEX IF NOT EXISTS idx_wifi_revision_id ON public.wifi(revision_id);
CREATE INDEX IF NOT EXISTS idx_wifi_bus_ppu ON public.wifi(bus_ppu);
CREATE INDEX IF NOT EXISTS idx_wifi_terminal ON public.wifi(terminal);
CREATE INDEX IF NOT EXISTS idx_wifi_created_at ON public.wifi(created_at);

-- Comentarios en la tabla
COMMENT ON TABLE public.wifi IS 'Registro de revisiones de conexión WiFi por bus';
COMMENT ON COLUMN public.wifi.ppu_visible IS 'Indica si la PPU del bus aparece en la señal WiFi buscada';
COMMENT ON COLUMN public.wifi.bus_encendido IS 'Indica si el bus estaba encendido durante la revisión';
COMMENT ON COLUMN public.wifi.tiene_internet IS 'Indica si el bus tiene conexión a internet';

