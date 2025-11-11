-- ============================================
-- 🔥 FIX URGENTE: BUCKET CHAT-IMAGES
-- ============================================
-- Este script arregla el error de RLS en chat-images
--
-- ERROR QUE SOLUCIONA:
-- "new row violates row-level security policy"
--
-- EJECUTA ESTE SCRIPT EN SUPABASE SQL EDITOR

-- ============================================
-- PASO 1: LIMPIAR TODO LO EXISTENTE
-- ============================================

-- Eliminar todas las políticas viejas
DROP POLICY IF EXISTS "Usuarios autenticados pueden subir imágenes al chat" ON storage.objects;
DROP POLICY IF EXISTS "Imágenes del chat son públicas" ON storage.objects;
DROP POLICY IF EXISTS "Usuarios pueden actualizar imágenes del chat" ON storage.objects;
DROP POLICY IF EXISTS "Usuarios pueden eliminar imágenes del chat" ON storage.objects;

-- Eliminar bucket existente
DELETE FROM storage.buckets WHERE id = 'chat-images';

-- ============================================
-- PASO 2: CREAR BUCKET PÚBLICO
-- ============================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'chat-images',
  'chat-images',
  true,  -- ⭐ PÚBLICO = SIN AUTENTICACIÓN REQUERIDA
  10485760,  -- 10MB
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 10485760,
  allowed_mime_types = ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];

-- ============================================
-- PASO 3: POLÍTICAS RLS SÚPER PERMISIVAS
-- ============================================

-- Política 1: CUALQUIER USUARIO AUTENTICADO puede SUBIR
CREATE POLICY "chat_images_insert_policy"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'chat-images');

-- Política 2: TODO EL MUNDO puede VER (público)
CREATE POLICY "chat_images_select_policy"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'chat-images');

-- Política 3: CUALQUIER USUARIO AUTENTICADO puede ACTUALIZAR
CREATE POLICY "chat_images_update_policy"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'chat-images');

-- Política 4: CUALQUIER USUARIO AUTENTICADO puede ELIMINAR
CREATE POLICY "chat_images_delete_policy"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'chat-images');

-- ============================================
-- PASO 4: VERIFICAR QUE TODO ESTÁ BIEN
-- ============================================

-- Ver bucket
SELECT id, name, public, file_size_limit
FROM storage.buckets
WHERE id = 'chat-images';

-- Ver políticas
SELECT policyname, cmd
FROM pg_policies
WHERE schemaname = 'storage'
  AND tablename = 'objects'
  AND policyname LIKE 'chat_images%';

-- ============================================
-- ✅ RESULTADO ESPERADO
-- ============================================
-- Deberías ver:
-- 1. Bucket 'chat-images' con public = true
-- 2. 4 políticas: chat_images_insert_policy, chat_images_select_policy,
--    chat_images_update_policy, chat_images_delete_policy
--
-- ¡AHORA LAS IMÁGENES SE SUBIRÁN SIN PROBLEMAS!
-- ============================================
