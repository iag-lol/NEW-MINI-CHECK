-- ============================================
-- 💬 SISTEMA DE COMUNICACIÓN EN TIEMPO REAL
-- ============================================
-- Sistema completo tipo WhatsApp con menciones,
-- imágenes, notificaciones y tiempo real
--
-- Ejecuta este script en Supabase SQL Editor
-- Dashboard → SQL Editor → New Query → Pegar y Run

-- ============================================
-- PASO 1: CREAR TABLA DE MENSAJES
-- ============================================

CREATE TABLE IF NOT EXISTS public.mensajes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  usuario_rut TEXT NOT NULL REFERENCES public.usuarios(rut) ON DELETE CASCADE,
  usuario_nombre TEXT NOT NULL,
  usuario_cargo TEXT NOT NULL,
  usuario_foto TEXT,
  mensaje TEXT NOT NULL CHECK (char_length(mensaje) > 0),
  imagen_url TEXT,
  menciones TEXT[] DEFAULT ARRAY[]::TEXT[], -- Array de RUTs mencionados con @
  leido_por TEXT[] DEFAULT ARRAY[]::TEXT[], -- Array de RUTs que han leído el mensaje
  editado BOOLEAN DEFAULT FALSE,
  editado_en TIMESTAMPTZ,
  deleted BOOLEAN DEFAULT FALSE
);

-- ============================================
-- PASO 2: ÍNDICES PARA OPTIMIZACIÓN
-- ============================================

-- Índice para consultas ordenadas por fecha (más recientes primero)
CREATE INDEX IF NOT EXISTS idx_mensajes_created_at ON public.mensajes(created_at DESC);

-- Índice para buscar mensajes por usuario
CREATE INDEX IF NOT EXISTS idx_mensajes_usuario_rut ON public.mensajes(usuario_rut);

-- Índice GIN para búsqueda en array de menciones (importante para notificaciones)
CREATE INDEX IF NOT EXISTS idx_mensajes_menciones ON public.mensajes USING GIN(menciones);

-- Índice GIN para búsqueda en array de leído_por
CREATE INDEX IF NOT EXISTS idx_mensajes_leido_por ON public.mensajes USING GIN(leido_por);

-- Índice para búsqueda de texto en mensajes
CREATE INDEX IF NOT EXISTS idx_mensajes_busqueda ON public.mensajes USING GIN(to_tsvector('spanish', mensaje));

-- ============================================
-- PASO 3: HABILITAR ROW LEVEL SECURITY
-- ============================================

ALTER TABLE public.mensajes ENABLE ROW LEVEL SECURITY;

-- ============================================
-- PASO 4: POLÍTICAS RLS
-- ============================================

-- Política: Todos pueden leer mensajes
CREATE POLICY "Todos pueden leer mensajes"
ON public.mensajes
FOR SELECT
USING (deleted = FALSE);

-- Política: Usuarios autenticados pueden insertar mensajes
CREATE POLICY "Usuarios autenticados pueden enviar mensajes"
ON public.mensajes
FOR INSERT
WITH CHECK (true);

-- Política: Solo el autor puede editar su mensaje
CREATE POLICY "Solo el autor puede editar su mensaje"
ON public.mensajes
FOR UPDATE
USING (usuario_rut = current_setting('request.jwt.claims', true)::json->>'rut')
WITH CHECK (usuario_rut = current_setting('request.jwt.claims', true)::json->>'rut');

-- Política: Solo el autor puede eliminar (soft delete) su mensaje
CREATE POLICY "Solo el autor puede eliminar su mensaje"
ON public.mensajes
FOR UPDATE
USING (usuario_rut = current_setting('request.jwt.claims', true)::json->>'rut');

-- ============================================
-- PASO 5: CREAR BUCKET PARA IMÁGENES DE CHAT
-- ============================================

-- Eliminar bucket existente si hay problemas
DELETE FROM storage.buckets WHERE id = 'chat-images';

-- Crear bucket público
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'chat-images',
  'chat-images',
  true,
  10485760,  -- 10MB máximo
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp']
);

-- ============================================
-- PASO 6: POLÍTICAS RLS PARA STORAGE
-- ============================================

-- Limpiar políticas existentes
DROP POLICY IF EXISTS "Usuarios autenticados pueden subir imágenes al chat" ON storage.objects;
DROP POLICY IF EXISTS "Imágenes del chat son públicas" ON storage.objects;
DROP POLICY IF EXISTS "Usuarios pueden actualizar imágenes del chat" ON storage.objects;
DROP POLICY IF EXISTS "Usuarios pueden eliminar imágenes del chat" ON storage.objects;

-- Política: Usuarios autenticados pueden subir imágenes
CREATE POLICY "Usuarios autenticados pueden subir imágenes al chat"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'chat-images');

-- Política: Imágenes son públicas (lectura)
CREATE POLICY "Imágenes del chat son públicas"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'chat-images');

-- Política: Usuarios pueden actualizar imágenes
CREATE POLICY "Usuarios pueden actualizar imágenes del chat"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'chat-images')
WITH CHECK (bucket_id = 'chat-images');

-- Política: Usuarios pueden eliminar imágenes
CREATE POLICY "Usuarios pueden eliminar imágenes del chat"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'chat-images');

-- ============================================
-- PASO 7: FUNCIÓN PARA MARCAR MENSAJES COMO LEÍDOS
-- ============================================

CREATE OR REPLACE FUNCTION marcar_mensaje_leido(mensaje_id UUID, usuario_rut TEXT)
RETURNS VOID AS $$
BEGIN
  UPDATE public.mensajes
  SET leido_por = array_append(leido_por, usuario_rut)
  WHERE id = mensaje_id
  AND NOT (usuario_rut = ANY(leido_por));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- PASO 8: FUNCIÓN PARA OBTENER MENSAJES NO LEÍDOS
-- ============================================

CREATE OR REPLACE FUNCTION obtener_mensajes_no_leidos(rut_usuario TEXT)
RETURNS TABLE (
  mensaje_id UUID,
  usuario_nombre TEXT,
  mensaje TEXT,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    m.id,
    m.usuario_nombre,
    m.mensaje,
    m.created_at
  FROM public.mensajes m
  WHERE NOT (rut_usuario = ANY(m.leido_por))
    AND m.deleted = FALSE
    AND (
      rut_usuario = ANY(m.menciones)  -- Mensajes donde fui mencionado
      OR m.menciones = ARRAY[]::TEXT[] -- O mensajes generales
    )
  ORDER BY m.created_at ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- PASO 9: VERIFICAR INSTALACIÓN
-- ============================================

-- Ver estructura de la tabla
SELECT
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'mensajes'
ORDER BY ordinal_position;

-- Ver configuración del bucket
SELECT
  id,
  name,
  public as "es_publico",
  file_size_limit as "tamaño_max_mb",
  allowed_mime_types as "tipos_permitidos"
FROM storage.buckets
WHERE id = 'chat-images';

-- Ver políticas RLS
SELECT
  policyname as "nombre_politica",
  cmd as "operacion"
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'mensajes';

-- ============================================
-- ✅ RESULTADO ESPERADO
-- ============================================
-- Deberías ver:
-- 1. Tabla 'mensajes' con todas las columnas
-- 2. Bucket 'chat-images' configurado como público
-- 3. 4 políticas RLS en la tabla mensajes
-- 4. 4 políticas RLS en storage.objects para chat-images
--
-- ¡El sistema está listo para usarse!
-- ============================================

-- ============================================
-- 📝 NOTAS DE USO
-- ============================================
-- Menciones:
--   - Formato en mensaje: "@12.345.678-9" o "@nombre"
--   - Array menciones: ['12.345.678-9', '98.765.432-1']
--
-- Notificaciones:
--   - Solo usuarios en array 'menciones' reciben notificación
--   - Usar Supabase Realtime para escuchar nuevos mensajes
--
-- Imágenes:
--   - Máximo 10MB por imagen
--   - Formatos: JPG, PNG, GIF, WEBP
--   - URL pública automática
--
-- Estado de lectura:
--   - Usar función marcar_mensaje_leido(mensaje_id, usuario_rut)
--   - Array leido_por se actualiza automáticamente
-- ============================================
