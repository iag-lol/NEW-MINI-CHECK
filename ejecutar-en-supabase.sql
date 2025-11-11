-- =====================================================
-- EJECUTA ESTE SCRIPT EN SUPABASE SQL EDITOR
-- =====================================================
-- Copia y pega TODO este código en el SQL Editor de Supabase
-- Ve a: Dashboard → SQL Editor → New Query → Pega esto → Run

-- PASO 1: Verificar que existe la columna foto_perfil
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS foto_perfil TEXT;

-- PASO 2: Configurar políticas de Storage
-- Estas políticas permiten que usuarios suban y vean fotos

-- Eliminar políticas existentes si hay conflictos
DROP POLICY IF EXISTS "Usuarios autenticados pueden subir fotos" ON storage.objects;
DROP POLICY IF EXISTS "Fotos de perfil son públicas" ON storage.objects;
DROP POLICY IF EXISTS "Usuarios pueden actualizar sus fotos" ON storage.objects;
DROP POLICY IF EXISTS "Usuarios pueden eliminar sus fotos" ON storage.objects;

-- Crear política: Cualquier usuario autenticado puede SUBIR fotos
CREATE POLICY "Usuarios autenticados pueden subir fotos"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'profile-photos'
);

-- Crear política: Cualquiera puede VER las fotos (lectura pública)
CREATE POLICY "Fotos de perfil son públicas"
ON storage.objects
FOR SELECT
TO public
USING (
  bucket_id = 'profile-photos'
);

-- Crear política: Usuarios pueden ACTUALIZAR fotos
CREATE POLICY "Usuarios pueden actualizar sus fotos"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'profile-photos')
WITH CHECK (bucket_id = 'profile-photos');

-- Crear política: Usuarios pueden ELIMINAR fotos
CREATE POLICY "Usuarios pueden eliminar sus fotos"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'profile-photos');

-- =====================================================
-- VERIFICACIÓN FINAL
-- =====================================================

-- Ver las políticas creadas
SELECT
  schemaname,
  tablename,
  policyname,
  cmd as operacion,
  roles
FROM pg_policies
WHERE tablename = 'objects'
AND schemaname = 'storage'
ORDER BY policyname;

-- Confirmar columna foto_perfil
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'usuarios'
AND column_name = 'foto_perfil';

-- Mensaje de éxito
SELECT '✅ Script ejecutado correctamente!' as resultado,
       'Ahora ve a Storage y crea el bucket "profile-photos"' as siguiente_paso;
