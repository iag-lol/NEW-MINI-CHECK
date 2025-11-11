-- ============================================
-- 📸 CONFIGURACIÓN COMPLETA DE FOTOS DE PERFIL
-- ============================================
-- Ejecuta este script en Supabase SQL Editor
-- Dashboard → SQL Editor → New Query → Pegar y Run

-- ============================================
-- PASO 1: CREAR BUCKET PÚBLICO
-- ============================================

-- Primero, eliminar bucket existente si hay problemas
DELETE FROM storage.buckets WHERE id = 'profile-photos';

-- Crear bucket público desde cero
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'profile-photos',
  'profile-photos',
  true,  -- ⭐ IMPORTANTE: Bucket PÚBLICO
  5242880,  -- 5MB máximo
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp']
);

-- ============================================
-- PASO 2: ELIMINAR POLÍTICAS EXISTENTES (LIMPIEZA)
-- ============================================

DROP POLICY IF EXISTS "Usuarios autenticados pueden subir fotos" ON storage.objects;
DROP POLICY IF EXISTS "Fotos de perfil son públicas" ON storage.objects;
DROP POLICY IF EXISTS "Usuarios pueden actualizar sus fotos" ON storage.objects;
DROP POLICY IF EXISTS "Usuarios pueden eliminar sus fotos" ON storage.objects;

-- ============================================
-- PASO 3: CREAR POLÍTICAS RLS CORRECTAS
-- ============================================

-- Política 1: Cualquier usuario autenticado puede SUBIR fotos
CREATE POLICY "Usuarios autenticados pueden subir fotos"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'profile-photos');

-- Política 2: Cualquiera puede VER las fotos (lectura pública)
CREATE POLICY "Fotos de perfil son públicas"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'profile-photos');

-- Política 3: Usuarios autenticados pueden ACTUALIZAR fotos
CREATE POLICY "Usuarios pueden actualizar sus fotos"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'profile-photos')
WITH CHECK (bucket_id = 'profile-photos');

-- Política 4: Usuarios autenticados pueden ELIMINAR fotos
CREATE POLICY "Usuarios pueden eliminar sus fotos"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'profile-photos');

-- ============================================
-- PASO 4: VERIFICAR CONFIGURACIÓN
-- ============================================

-- Ver configuración del bucket
SELECT
  id,
  name,
  public as "es_publico",
  file_size_limit as "tamaño_max_bytes",
  allowed_mime_types as "tipos_permitidos"
FROM storage.buckets
WHERE id = 'profile-photos';

-- Ver políticas configuradas
SELECT
  policyname as "nombre_politica",
  cmd as "operacion",
  roles as "roles"
FROM pg_policies
WHERE schemaname = 'storage'
  AND tablename = 'objects'
  AND policyname LIKE '%foto%';

-- ============================================
-- ✅ RESULTADO ESPERADO
-- ============================================
-- Deberías ver:
-- 1. Un bucket llamado 'profile-photos' con public = true
-- 2. 4 políticas configuradas (INSERT, SELECT, UPDATE, DELETE)
--
-- Ahora ve a la aplicación web y prueba subir una foto!
-- ============================================
