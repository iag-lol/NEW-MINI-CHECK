# 🔥 SOLUCIÓN INMEDIATA: ERROR DE IMÁGENES

## ❌ ERROR QUE ESTÁS VIENDO

```
POST https://...supabase.co/storage/v1/object/chat-images/... 400 (Bad Request)
Error subiendo imagen: StorageApiError: new row violates row-level security policy
```

## 🎯 CAUSA DEL PROBLEMA

Las **políticas RLS (Row Level Security)** de Supabase están bloqueando las subidas de imágenes.

## ✅ SOLUCIÓN (5 MINUTOS)

### PASO 1: Ve a Supabase SQL Editor

1. Abre tu proyecto en Supabase
2. Ve a **SQL Editor** (menú lateral izquierdo)
3. Click en **"New Query"**

### PASO 2: Ejecuta el script para CHAT IMAGES

Copia y pega TODO el contenido de:
```
sql-scripts/FIX-CHAT-IMAGES-BUCKET.sql
```

Click en **RUN** (o presiona Cmd/Ctrl + Enter)

✅ Verás: "Success. No rows returned"

### PASO 3: Ejecuta el script para PROFILE PHOTOS

Crea una nueva query (New Query)

Copia y pega TODO el contenido de:
```
sql-scripts/FIX-PROFILE-PHOTOS-BUCKET.sql
```

Click en **RUN** (o presiona Cmd/Ctrl + Enter)

✅ Verás: "Success. No rows returned"

### PASO 4: Verifica que funcionó

En SQL Editor, ejecuta esta consulta:

```sql
-- Ver buckets
SELECT id, name, public
FROM storage.buckets
WHERE id IN ('chat-images', 'profile-photos');

-- Ver políticas
SELECT policyname, cmd
FROM pg_policies
WHERE schemaname = 'storage'
  AND tablename = 'objects'
  AND (policyname LIKE 'chat_images%' OR policyname LIKE 'profile_photos%');
```

**Deberías ver:**
- 2 buckets con `public = true`
- 8 políticas en total (4 para cada bucket)

### PASO 5: Prueba subir una imagen

1. Ve a la app: https://new-mini-check.onrender.com
2. Intenta subir una imagen en el chat
3. O cambia tu foto de perfil

¡DEBERÍA FUNCIONAR PERFECTAMENTE! 🎉

## 📝 QUÉ HACEN LOS SCRIPTS

Los scripts:
1. **Eliminan** las políticas antiguas que estaban mal configuradas
2. **Recrean** los buckets con configuración pública
3. **Crean políticas SÚPER PERMISIVAS** que permiten:
   - INSERT para usuarios autenticados
   - SELECT para todo el mundo (público)
   - UPDATE para usuarios autenticados
   - DELETE para usuarios autenticados

## 🚨 SI SIGUE SIN FUNCIONAR

1. **Verifica que estás logueado** en la app
2. **Limpia caché** del navegador (Cmd/Ctrl + Shift + R)
3. **Revisa la consola** del navegador (F12) para ver errores específicos
4. **Ejecuta de nuevo** los scripts SQL

## 🔐 SEGURIDAD

Estas políticas son permisivas porque:
- Solo usuarios **autenticados** pueden subir
- Las imágenes son **públicas** (necesario para mostrarlas)
- No hay datos sensibles en las imágenes

Si necesitas más restricciones, podemos agregarlas después.

## 📞 AYUDA

Si sigue fallando, compárteme:
1. Screenshot del error en la consola
2. Screenshot de los resultados de la verificación (PASO 4)
3. ¿Estás logueado en la app?
