-- =============================================
-- SCHEMA DE PERFIL Y PERSONALIZACIÓN
-- =============================================

-- Agregar columnas de personalización a la tabla usuarios
ALTER TABLE usuarios
ADD COLUMN IF NOT EXISTS foto_perfil TEXT,
ADD COLUMN IF NOT EXISTS tema_color TEXT DEFAULT 'azul',
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Crear trigger para actualizar updated_at
CREATE OR REPLACE FUNCTION update_usuario_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS update_usuarios_updated_at ON usuarios;
CREATE TRIGGER update_usuarios_updated_at
    BEFORE UPDATE ON usuarios
    FOR EACH ROW
    EXECUTE FUNCTION update_usuario_updated_at();

-- =============================================
-- TEMAS DISPONIBLES:
-- - rosado (pastel rosa)
-- - fucsia (pastel fucsia)
-- - azul (azul por defecto)
-- - negro (tema oscuro)
-- - rojo-azul (combinación rojo y azul)
-- =============================================
