-- =============================================
-- MINI-CHECK - LIMPIAR TABLAS
-- =============================================
-- ⚠️ ADVERTENCIA: Este script elimina TODOS los datos
-- excepto de las tablas: usuarios y flota
--
-- Úsalo con precaución en producción!
-- =============================================

-- OPCIÓN 1: TRUNCATE (Más rápido, reinicia contadores)
-- Recomendado si quieres empezar completamente desde cero

BEGIN;

-- Limpiar tablas relacionadas con revisiones (en orden correcto)
TRUNCATE TABLE tags CASCADE;
TRUNCATE TABLE camaras CASCADE;
TRUNCATE TABLE extintores CASCADE;
TRUNCATE TABLE mobileye CASCADE;
TRUNCATE TABLE odometro CASCADE;
TRUNCATE TABLE publicidad CASCADE;

-- Limpiar tabla principal de revisiones
TRUNCATE TABLE revisiones CASCADE;

-- Limpiar tablas independientes
TRUNCATE TABLE tickets CASCADE;
TRUNCATE TABLE personal CASCADE;

COMMIT;

-- Verificación: Contar registros en cada tabla
SELECT
    'usuarios' as tabla,
    COUNT(*) as registros,
    '✅ NO BORRADO' as estado
FROM usuarios
UNION ALL
SELECT
    'flota' as tabla,
    COUNT(*) as registros,
    '✅ NO BORRADO' as estado
FROM flota
UNION ALL
SELECT
    'revisiones' as tabla,
    COUNT(*) as registros,
    '🗑️ LIMPIADO' as estado
FROM revisiones
UNION ALL
SELECT
    'tags' as tabla,
    COUNT(*) as registros,
    '🗑️ LIMPIADO' as estado
FROM tags
UNION ALL
SELECT
    'camaras' as tabla,
    COUNT(*) as registros,
    '🗑️ LIMPIADO' as estado
FROM camaras
UNION ALL
SELECT
    'extintores' as tabla,
    COUNT(*) as registros,
    '🗑️ LIMPIADO' as estado
FROM extintores
UNION ALL
SELECT
    'mobileye' as tabla,
    COUNT(*) as registros,
    '🗑️ LIMPIADO' as estado
FROM mobileye
UNION ALL
SELECT
    'odometro' as tabla,
    COUNT(*) as registros,
    '🗑️ LIMPIADO' as estado
FROM odometro
UNION ALL
SELECT
    'publicidad' as tabla,
    COUNT(*) as registros,
    '🗑️ LIMPIADO' as estado
FROM publicidad
UNION ALL
SELECT
    'tickets' as tabla,
    COUNT(*) as registros,
    '🗑️ LIMPIADO' as estado
FROM tickets
UNION ALL
SELECT
    'personal' as tabla,
    COUNT(*) as registros,
    '🗑️ LIMPIADO' as estado
FROM personal
ORDER BY tabla;

-- =============================================
-- ✅ SCRIPT COMPLETADO
-- =============================================
-- TABLAS LIMPIADAS:
-- 🗑️ revisiones
-- 🗑️ tags
-- 🗑️ camaras
-- 🗑️ extintores
-- 🗑️ mobileye
-- 🗑️ odometro
-- 🗑️ publicidad
-- 🗑️ tickets
-- 🗑️ personal
--
-- TABLAS PRESERVADAS:
-- ✅ usuarios (mantenida)
-- ✅ flota (mantenida)
-- =============================================
