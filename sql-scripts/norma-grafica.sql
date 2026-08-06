-- =============================================================================
-- REVISIÓN DE NORMA GRÁFICA
-- =============================================================================
-- Ejecutar completo en Supabase → SQL Editor → New query → Run.
-- Es idempotente: se puede volver a ejecutar sin romper nada ni perder datos.
--
-- Levantamiento del estado de la rotulación obligatoria del bus:
--   · N° interno delantero y trasero
--   · Norma PPU lateral derecho y trasera
--   · Placas patentes delantera y trasera
--
-- Requisito previo: sql-scripts/modulos-configurables.sql (crea modulos_config).
-- Si aún no lo has ejecutado, hazlo primero: este script sólo registra el
-- módulo en la configuración cuando esa tabla ya existe.
-- =============================================================================


-- =============================================================================
-- 0. COMPROBACIÓN PREVIA
-- =============================================================================
-- `norma_grafica` referencia a `revisiones`. Si esa tabla no existe, PostgreSQL
-- corta con un escueto «42P01: relation "revisiones" does not exist» que no
-- dice qué hacer. Esta guarda lo traduce a algo accionable y evita crear tablas
-- sueltas en una base de datos que no es la de la aplicación.

DO $$
BEGIN
  IF to_regclass('public.revisiones') IS NULL THEN
    RAISE EXCEPTION
      'No existe public.revisiones en esta base de datos (%). Casi siempre significa que el editor SQL está apuntando a otro proyecto de Supabase. Comprueba que el proyecto coincide con VITE_SUPABASE_URL de tu hosting, o ejecuta antes supabase-schema.sql si la base está vacía. Ejecuta sql-scripts/00-diagnostico.sql para confirmarlo.',
      current_database();
  END IF;
END $$;


-- =============================================================================
-- 1. TABLA DE NORMA GRÁFICA
-- =============================================================================
-- Cada elemento admite tres estados y no dos a propósito:
--   'OK'          → completo, legible y bien adherido
--   'DETERIORADO' → existe pero está despintado, rayado, despegado o ilegible
--   'FALTA'       → no está instalado en el bus
-- Con un sí/no, «despintado» y «no está» caerían en el mismo saco, y se
-- resuelven de formas distintas: uno se repinta y el otro se instala.
--
-- `cumple` lo calcula la aplicación (los seis elementos en 'OK'); se guarda ya
-- resuelto para que los reportes no tengan que repetir la regla.

CREATE TABLE IF NOT EXISTS public.norma_grafica (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  revision_id         UUID NOT NULL REFERENCES public.revisiones(id) ON DELETE CASCADE,
  interno_delantero   TEXT NOT NULL DEFAULT 'OK',
  interno_trasero     TEXT NOT NULL DEFAULT 'OK',
  ppu_lateral_derecho TEXT NOT NULL DEFAULT 'OK',
  ppu_trasera         TEXT NOT NULL DEFAULT 'OK',
  patente_delantera   TEXT NOT NULL DEFAULT 'OK',
  patente_trasera     TEXT NOT NULL DEFAULT 'OK',
  cumple              BOOLEAN NOT NULL DEFAULT TRUE,
  observacion         TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  bus_ppu             TEXT NOT NULL,
  terminal            TEXT NOT NULL
);

-- Estados válidos: evita que un error de la app deje datos sin sentido
DO $$
DECLARE
  columna TEXT;
BEGIN
  FOREACH columna IN ARRAY ARRAY[
    'interno_delantero', 'interno_trasero',
    'ppu_lateral_derecho', 'ppu_trasera',
    'patente_delantera', 'patente_trasera'
  ]
  LOOP
    EXECUTE format(
      'ALTER TABLE public.norma_grafica DROP CONSTRAINT IF EXISTS norma_grafica_%s_valido',
      columna
    );
    EXECUTE format(
      'ALTER TABLE public.norma_grafica ADD CONSTRAINT norma_grafica_%s_valido
         CHECK (%I IN (''OK'', ''DETERIORADO'', ''FALTA''))',
      columna, columna
    );
  END LOOP;
END $$;

CREATE INDEX IF NOT EXISTS idx_norma_grafica_created_at  ON public.norma_grafica(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_norma_grafica_revision_id ON public.norma_grafica(revision_id);
CREATE INDEX IF NOT EXISTS idx_norma_grafica_bus_ppu     ON public.norma_grafica(bus_ppu);
CREATE INDEX IF NOT EXISTS idx_norma_grafica_terminal    ON public.norma_grafica(terminal);
CREATE INDEX IF NOT EXISTS idx_norma_grafica_cumple      ON public.norma_grafica(cumple);

ALTER TABLE public.norma_grafica ENABLE ROW LEVEL SECURITY;

-- La app entra con bcrypt contra la tabla `usuarios`, no con Supabase Auth,
-- así que auth.uid() es NULL: exigir sesión autenticada dejaría al formulario
-- sin poder guardar nada. Mismo criterio que el resto de módulos.
DROP POLICY IF EXISTS "Lectura pública de norma_grafica" ON public.norma_grafica;
CREATE POLICY "Lectura pública de norma_grafica" ON public.norma_grafica
  FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS "Inserción pública en norma_grafica" ON public.norma_grafica;
CREATE POLICY "Inserción pública en norma_grafica" ON public.norma_grafica
  FOR INSERT WITH CHECK (TRUE);

DROP POLICY IF EXISTS "Actualización pública de norma_grafica" ON public.norma_grafica;
CREATE POLICY "Actualización pública de norma_grafica" ON public.norma_grafica
  FOR UPDATE USING (TRUE) WITH CHECK (TRUE);

DROP POLICY IF EXISTS "Borrado público de norma_grafica" ON public.norma_grafica;
CREATE POLICY "Borrado público de norma_grafica" ON public.norma_grafica
  FOR DELETE USING (TRUE);


-- =============================================================================
-- 2. REGISTRO EN LA CONFIGURACIÓN DE MÓDULOS
-- =============================================================================
-- Queda activo y sin programación: aparece en todas las revisiones hasta que
-- se cambie desde Configuración → Qué se revisa y cuándo.
-- Si modulos_config todavía no existe, se avisa en vez de fallar: la app
-- funciona igual (sin la tabla muestra todos los módulos activos).

DO $$
BEGIN
  IF to_regclass('public.modulos_config') IS NULL THEN
    RAISE NOTICE 'public.modulos_config no existe: ejecuta sql-scripts/modulos-configurables.sql para poder encender, apagar o programar este módulo desde Configuración.';
  ELSE
    INSERT INTO public.modulos_config (clave, activo, tipo, orden)
    VALUES ('normaGrafica', TRUE, 'siempre', 85)
    ON CONFLICT (clave) DO NOTHING;
  END IF;
END $$;


-- =============================================================================
-- 3. REALTIME
-- =============================================================================
-- Necesario para que las notificaciones y los contadores lleguen al instante.
-- Si la tabla ya está en la publicación, el DO ignora el error.

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.norma_grafica;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;


-- =============================================================================
-- 4. COMPROBACIÓN
-- =============================================================================
-- La tabla debe existir vacía y el módulo aparecer en la configuración.

SELECT COUNT(*) AS revisiones_norma_grafica FROM public.norma_grafica;

SELECT clave, activo, tipo, semanas_mes, dias_semana, meses, orden
FROM public.modulos_config
ORDER BY orden;


-- =============================================================================
-- CONSULTAS ÚTILES (opcionales)
-- =============================================================================

-- Último estado de cada bus, sólo los que NO cumplen:
-- SELECT DISTINCT ON (bus_ppu)
--        bus_ppu, terminal, interno_delantero, interno_trasero,
--        ppu_lateral_derecho, ppu_trasera, patente_delantera, patente_trasera,
--        observacion, created_at
--   FROM public.norma_grafica
--  ORDER BY bus_ppu, created_at DESC;

-- Cuántos buses fallan en cada elemento (decide si conviene pedir un lote):
-- SELECT
--   COUNT(*) FILTER (WHERE interno_delantero   <> 'OK') AS interno_delantero,
--   COUNT(*) FILTER (WHERE interno_trasero     <> 'OK') AS interno_trasero,
--   COUNT(*) FILTER (WHERE ppu_lateral_derecho <> 'OK') AS ppu_lateral_derecho,
--   COUNT(*) FILTER (WHERE ppu_trasera         <> 'OK') AS ppu_trasera,
--   COUNT(*) FILTER (WHERE patente_delantera   <> 'OK') AS patente_delantera,
--   COUNT(*) FILTER (WHERE patente_trasera     <> 'OK') AS patente_trasera
-- FROM public.norma_grafica;

-- Programar la norma gráfica sólo la 2ª y la 4ª semana de cada mes:
-- UPDATE public.modulos_config
--    SET tipo = 'programado', semanas_mes = ARRAY[2,4], activo = TRUE
--  WHERE clave = 'normaGrafica';

-- Apagarla del formulario sin borrar su historial:
-- UPDATE public.modulos_config SET activo = FALSE WHERE clave = 'normaGrafica';
