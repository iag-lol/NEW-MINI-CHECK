-- ============================================
-- 🔥 FIX URGENTE: BUCKET PROFILE-PHOTOS
-- ============================================
-- Este script arregla el error de RLS en profile-photos
--
-- ERROR QUE SOLUCIONA:
-- "new row violates row-level security policy"
--
-- EJECUTA ESTE SCRIPT EN SUPABASE SQL EDITOR

-- ============================================
-- PASO 1: LIMPIAR TODO LO EXISTENTE
-- ============================================

-- Eliminar todas las políticas viejas
DROP POLICY IF EXISTS "Usuarios autenticados pueden subir fotos" ON storage.objects;
DROP POLICY IF EXISTS "Fotos de perfil son públicas" ON storage.objects;
DROP POLICY IF EXISTS "Usuarios pueden actualizar sus fotos" ON storage.objects;
DROP POLICY IF EXISTS "Usuarios pueden eliminar sus fotos" ON storage.objects;

-- Eliminar bucket existente
DELETE FROM storage.buckets WHERE id = 'profile-photos';

-- ============================================
-- PASO 2: CREAR BUCKET PÚBLICO
-- ============================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'profile-photos',
  'profile-photos',
  true,  -- ⭐ PÚBLICO = SIN AUTENTICACIÓN REQUERIDA
  5242880,  -- 5MB
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];

-- ============================================
-- PASO 3: POLÍTICAS RLS SÚPER PERMISIVAS
-- ============================================

-- Política 1: CUALQUIER USUARIO AUTENTICADO puede SUBIR
CREATE POLICY "profile_photos_insert_policy"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'profile-photos');

-- Política 2: TODO EL MUNDO puede VER (público)
CREATE POLICY "profile_photos_select_policy"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'profile-photos');

-- Política 3: CUALQUIER USUARIO AUTENTICADO puede ACTUALIZAR
CREATE POLICY "profile_photos_update_policy"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'profile-photos');

-- Política 4: CUALQUIER USUARIO AUTENTICADO puede ELIMINAR
CREATE POLICY "profile_photos_delete_policy"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'profile-photos');

-- ============================================
-- PASO 4: VERIFICAR QUE TODO ESTÁ BIEN
-- ============================================

-- Ver bucket
SELECT id, name, public, file_size_limit
FROM storage.buckets
WHERE id = 'profile-photos';

-- Ver políticas
SELECT policyname, cmd
FROM pg_policies
WHERE schemaname = 'storage'
  AND tablename = 'objects'
  AND policyname LIKE 'profile_photos%';

-- ============================================
-- ✅ RESULTADO ESPERADO
-- ============================================
-- Deberías ver:
-- 1. Bucket 'profile-photos' con public = true
-- 2. 4 políticas: profile_photos_insert_policy, profile_photos_select_policy,
--    profile_photos_update_policy, profile_photos_delete_policy
--
-- ¡AHORA LAS FOTOS DE PERFIL SE SUBIRÁN SIN PROBLEMAS!
-- ============================================
