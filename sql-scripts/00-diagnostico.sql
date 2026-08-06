-- =============================================================================
-- DIAGNÓSTICO: ¿estoy en la base de datos correcta?
-- =============================================================================
-- Ejecuta esto ANTES de cualquier otro script cuando aparezca un error del
-- tipo: ERROR: 42P01: relation "revisiones" does not exist
--
-- Ese error significa una de dos cosas, y conviene distinguirlas antes de
-- crear nada: o el editor SQL está apuntando a un proyecto de Supabase que no
-- es el que usa la aplicación, o esta base de datos está vacía.
-- =============================================================================

-- 1. Identidad de la base de datos y esquema activo
SELECT
  current_database()      AS base_de_datos,
  current_schema()        AS esquema_actual,
  current_setting('search_path') AS search_path;

-- 2. Tablas que existen ahora mismo en el esquema public
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;

-- 3. Comprobación directa de las tablas base de la aplicación
SELECT
  to_regclass('public.usuarios')   IS NOT NULL AS tiene_usuarios,
  to_regclass('public.revisiones') IS NOT NULL AS tiene_revisiones,
  to_regclass('public.flota')      IS NOT NULL AS tiene_flota,
  to_regclass('public.tags')       IS NOT NULL AS tiene_tags;

-- =============================================================================
-- CÓMO LEER EL RESULTADO
-- =============================================================================
--
-- Si el punto 3 devuelve TRUE en todas:
--     Estás en la base correcta. El error venía de otra cosa; vuelve a
--     ejecutar modulos-configurables.sql, que ahora está cualificado con
--     `public.` de forma explícita.
--
-- Si devuelve FALSE en todas:
--     Este NO es el proyecto que usa la aplicación. En el panel de Supabase,
--     arriba a la izquierda, cambia de proyecto y comprueba que coincide con
--     la variable VITE_SUPABASE_URL de tu hosting (Netlify/Vercel/Render →
--     Environment variables). El host de esa URL es el ID del proyecto.
--     No ejecutes nada aquí: crearías las tablas en la base equivocada.
--
-- Si devuelve TRUE en unas y FALSE en otras:
--     La base está a medio montar. Ejecuta primero, en este orden:
--       1. supabase-schema.sql
--       2. supabase-schema-updates.sql
--       3. modulos-configurables.sql
-- =============================================================================
