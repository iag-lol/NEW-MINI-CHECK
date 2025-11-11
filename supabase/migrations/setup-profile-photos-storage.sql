-- =====================================================
-- CONFIGURACIÓN DE STORAGE PARA FOTOS DE PERFIL
-- =====================================================
-- Este script configura el bucket de Supabase Storage
-- y las políticas de seguridad para subir fotos de perfil

-- 1. Crear bucket para fotos de perfil (si no existe)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'profile-photos',
  'profile-photos',
  true,  -- Bucket público para que las fotos sean accesibles
  5242880,  -- 5MB en bytes
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- 2. Política: Permitir a TODOS los usuarios autenticados SUBIR fotos
CREATE POLICY "Usuarios autenticados pueden subir fotos"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'profile-photos'
);

-- 3. Política: Permitir a TODOS ver las fotos (lectura pública)
CREATE POLICY "Fotos de perfil son públicas"
ON storage.objects
FOR SELECT
TO public
USING (
  bucket_id = 'profile-photos'
);

-- 4. Política: Usuarios pueden actualizar sus propias fotos
CREATE POLICY "Usuarios pueden actualizar sus fotos"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'profile-photos' AND
  (storage.foldername(name))[1] = 'avatars'
)
WITH CHECK (
  bucket_id = 'profile-photos' AND
  (storage.foldername(name))[1] = 'avatars'
);

-- 5. Política: Usuarios pueden eliminar sus propias fotos
CREATE POLICY "Usuarios pueden eliminar sus fotos"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'profile-photos' AND
  (storage.foldername(name))[1] = 'avatars'
);

-- 6. Verificar que el campo foto_perfil existe en la tabla usuarios
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'usuarios'
    AND column_name = 'foto_perfil'
  ) THEN
    ALTER TABLE usuarios ADD COLUMN foto_perfil TEXT;
  END IF;
END $$;

-- =====================================================
-- VERIFICACIÓN FINAL
-- =====================================================

-- Mostrar información del bucket creado
SELECT
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
FROM storage.buckets
WHERE id = 'profile-photos';

-- Mostrar las políticas creadas
SELECT
  policyname,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'storage'
AND tablename = 'objects'
AND policyname LIKE '%perfil%' OR policyname LIKE '%foto%';

-- Confirmar que el campo foto_perfil existe
SELECT
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'usuarios'
AND column_name = 'foto_perfil';
