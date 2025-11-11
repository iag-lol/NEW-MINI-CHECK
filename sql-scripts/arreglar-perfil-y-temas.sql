-- ============================================
-- 🎨 ARREGLAR PERFIL Y TEMAS DE COLORES
-- ============================================
-- Este script agrega las columnas necesarias para
-- que funcionen las fotos de perfil y los temas de color
--
-- Ejecuta este script en Supabase SQL Editor

-- ============================================
-- PASO 1: AGREGAR COLUMNAS FALTANTES
-- ============================================

-- Agregar columna foto_perfil si no existe
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'usuarios'
        AND column_name = 'foto_perfil'
    ) THEN
        ALTER TABLE public.usuarios
        ADD COLUMN foto_perfil TEXT;
    END IF;
END $$;

-- Agregar columna tema_color si no existe
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'usuarios'
        AND column_name = 'tema_color'
    ) THEN
        ALTER TABLE public.usuarios
        ADD COLUMN tema_color TEXT DEFAULT 'azul';
    END IF;
END $$;

-- Agregar columna updated_at si no existe
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'usuarios'
        AND column_name = 'updated_at'
    ) THEN
        ALTER TABLE public.usuarios
        ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
    END IF;
END $$;

-- ============================================
-- PASO 2: AGREGAR CONSTRAINT PARA TEMA_COLOR
-- ============================================

-- Eliminar constraint anterior si existe
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'usuarios_tema_color_check'
    ) THEN
        ALTER TABLE public.usuarios
        DROP CONSTRAINT usuarios_tema_color_check;
    END IF;
END $$;

-- Agregar constraint con temas válidos
ALTER TABLE public.usuarios
ADD CONSTRAINT usuarios_tema_color_check
CHECK (tema_color IN ('rosado', 'fucsia', 'azul', 'negro', 'rojo-azul'));

-- ============================================
-- PASO 3: TRIGGER PARA updated_at AUTOMÁTICO
-- ============================================

-- Crear función para actualizar updated_at
CREATE OR REPLACE FUNCTION actualizar_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Eliminar trigger si existe
DROP TRIGGER IF EXISTS trigger_actualizar_updated_at_usuarios ON public.usuarios;

-- Crear trigger
CREATE TRIGGER trigger_actualizar_updated_at_usuarios
    BEFORE UPDATE ON public.usuarios
    FOR EACH ROW
    EXECUTE FUNCTION actualizar_updated_at();

-- ============================================
-- PASO 4: ACTUALIZAR USUARIOS EXISTENTES
-- ============================================

-- Poner tema por defecto 'azul' a usuarios sin tema
UPDATE public.usuarios
SET tema_color = 'azul'
WHERE tema_color IS NULL;

-- ============================================
-- PASO 5: VERIFICAR INSTALACIÓN
-- ============================================

-- Ver estructura de la tabla usuarios
SELECT
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_schema = 'public'
    AND table_name = 'usuarios'
ORDER BY ordinal_position;

-- Ver usuarios y sus temas
SELECT
    rut,
    nombre,
    cargo,
    terminal,
    tema_color,
    foto_perfil,
    created_at,
    updated_at
FROM public.usuarios
ORDER BY created_at DESC
LIMIT 10;

-- ============================================
-- ✅ RESULTADO ESPERADO
-- ============================================
-- Deberías ver:
-- 1. Columna 'foto_perfil' de tipo TEXT
-- 2. Columna 'tema_color' de tipo TEXT con default 'azul'
-- 3. Columna 'updated_at' de tipo TIMESTAMPTZ
-- 4. Todos los usuarios con tema_color = 'azul' (o el que eligieron)
--
-- ¡Ahora los temas y fotos funcionarán correctamente!
-- ============================================
