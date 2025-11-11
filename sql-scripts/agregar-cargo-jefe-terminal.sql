-- ============================================
-- 📋 AGREGAR NUEVO CARGO: JEFE DE TERMINAL
-- ============================================
-- Ejecuta este script en Supabase SQL Editor
-- Dashboard → SQL Editor → New Query → Pegar y Run

-- ============================================
-- PASO 1: ELIMINAR CONSTRAINT ANTERIOR
-- ============================================

-- Eliminar el constraint que limita los cargos
ALTER TABLE public.usuarios
DROP CONSTRAINT IF EXISTS usuarios_cargo_check;

-- ============================================
-- PASO 2: CREAR NUEVO CONSTRAINT CON 3 CARGOS
-- ============================================

-- Agregar el nuevo constraint que incluye 'JEFE DE TERMINAL'
ALTER TABLE public.usuarios
ADD CONSTRAINT usuarios_cargo_check
CHECK (cargo IN ('INSPECTOR', 'SUPERVISOR', 'JEFE DE TERMINAL'));

-- ============================================
-- PASO 3: VERIFICAR QUE FUNCIONA
-- ============================================

-- Ver todos los usuarios y sus cargos actuales
SELECT
  nombre,
  cargo,
  terminal,
  created_at
FROM public.usuarios
ORDER BY created_at DESC;

-- ============================================
-- ✅ RESULTADO ESPERADO
-- ============================================
-- La tabla ahora acepta estos 3 valores para el campo 'cargo':
-- 1. 'INSPECTOR'
-- 2. 'SUPERVISOR'
-- 3. 'JEFE DE TERMINAL' ⭐ NUEVO
--
-- Ahora puedes crear usuarios con cargo "JEFE DE TERMINAL"
-- desde la web en la sección de Personal!
-- ============================================

-- ============================================
-- 📝 NOTA SOBRE PERMISOS FUTUROS
-- ============================================
-- El cargo 'JEFE DE TERMINAL' está preparado para tener
-- facultades especiales que se implementarán más adelante:
-- - Acceso a reportes avanzados de su terminal
-- - Gestión de inspectores de su terminal
-- - Aprobación de tickets prioritarios
-- - Dashboard con métricas específicas de terminal
-- ============================================
