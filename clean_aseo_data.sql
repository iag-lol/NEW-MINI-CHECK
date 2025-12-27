-- ==========================================
-- LIMPIAR TODAS LAS TABLAS DE ASEO
-- ==========================================
-- ADVERTENCIA: Esto eliminará TODOS los datos de prueba

-- 1. Eliminar todas las notificaciones
DELETE FROM public.aseo_notifications;

-- 2. Eliminar todas las tareas
DELETE FROM public.aseo_tasks;

-- 3. Eliminar todos los registros de limpieza
DELETE FROM public.aseo_records;

-- 4. Eliminar todos los limpiadores
DELETE FROM public.aseo_cleaners;

-- 5. Limpiar el storage bucket de fotos (ejecutar en Supabase Dashboard > Storage)
-- Ve a: Storage > aseo-photos > Seleccionar todas las carpetas/archivos > Delete

-- Verificar que todo está limpio
SELECT 'aseo_cleaners' as tabla, COUNT(*) as registros FROM public.aseo_cleaners
UNION ALL
SELECT 'aseo_records' as tabla, COUNT(*) as registros FROM public.aseo_records
UNION ALL
SELECT 'aseo_tasks' as tabla, COUNT(*) as registros FROM public.aseo_tasks
UNION ALL
SELECT 'aseo_notifications' as tabla, COUNT(*) as registros FROM public.aseo_notifications;

-- ==========================================
-- RESULTADO ESPERADO: Todos los conteos en 0
-- ==========================================
