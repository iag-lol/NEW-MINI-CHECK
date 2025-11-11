# 📸 Configuración de Fotos de Perfil

## ⚠️ IMPORTANTE: Configuración en Supabase

Para que la subida de fotos funcione, **DEBES** seguir estos pasos en Supabase:

---

## 📋 Paso 1: Crear el Bucket de Storage

### Opción A: Desde la Interfaz de Supabase (RECOMENDADO)

1. Ve a tu proyecto en **https://supabase.com/dashboard**
2. Click en **"Storage"** en el menú lateral
3. Click en **"Create a new bucket"**
4. Configurar así:
   ```
   Name: profile-photos
   Public bucket: ✅ MARCADO (importante!)
   File size limit: 5 MB
   Allowed MIME types: image/jpeg, image/jpg, image/png, image/gif, image/webp
   ```
5. Click en **"Create bucket"**

### Opción B: Desde SQL Editor

Si prefieres SQL, ve a **SQL Editor** y ejecuta:

```sql
-- Crear bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'profile-photos',
  'profile-photos',
  true,
  5242880,  -- 5MB
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;
```

---

## 🔐 Paso 2: Configurar Políticas de Seguridad (RLS)

Ve a **Storage → profile-photos → Policies** y crea estas 4 políticas:

### Política 1: Subir fotos (INSERT)
```
Nombre: Usuarios autenticados pueden subir fotos
Operación: INSERT
Target roles: authenticated
WITH CHECK: bucket_id = 'profile-photos'
```

### Política 2: Ver fotos (SELECT)
```
Nombre: Fotos de perfil son públicas
Operación: SELECT
Target roles: public
USING: bucket_id = 'profile-photos'
```

### Política 3: Actualizar fotos (UPDATE)
```
Nombre: Usuarios pueden actualizar sus fotos
Operación: UPDATE
Target roles: authenticated
USING: bucket_id = 'profile-photos'
WITH CHECK: bucket_id = 'profile-photos'
```

### Política 4: Eliminar fotos (DELETE)
```
Nombre: Usuarios pueden eliminar sus fotos
Operación: DELETE
Target roles: authenticated
USING: bucket_id = 'profile-photos'
```

---

## 🔧 Paso 3: Ejecutar SQL para Políticas (ALTERNATIVO)

Si prefieres hacerlo todo por SQL, ve a **SQL Editor** y ejecuta:

```sql
-- Políticas de seguridad
CREATE POLICY "Usuarios autenticados pueden subir fotos"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'profile-photos');

CREATE POLICY "Fotos de perfil son públicas"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'profile-photos');

CREATE POLICY "Usuarios pueden actualizar sus fotos"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'profile-photos')
WITH CHECK (bucket_id = 'profile-photos');

CREATE POLICY "Usuarios pueden eliminar sus fotos"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'profile-photos');
```

---

## ✅ Paso 4: Verificar que Todo Funciona

1. Ve a tu app en **Mi Perfil**
2. Click en el botón de **cámara** (botón redondo con icono de cámara)
3. Selecciona una imagen
4. Deberías ver:
   - Spinner de carga
   - Notificación de éxito
   - La foto aparece inmediatamente

---

## 🐛 Solución de Problemas

### Error: "new row violates row-level security policy"
**Solución:** Las políticas RLS no están configuradas correctamente. Verifica el Paso 2.

### Error: "Bucket 'profile-photos' not found"
**Solución:** El bucket no existe. Verifica el Paso 1.

### Error: "File size exceeds limit"
**Solución:** La imagen es mayor a 5MB. Usa una imagen más pequeña.

### La foto no se muestra
**Solución:** Verifica que el bucket esté marcado como **PUBLIC**.

---

## 📂 Estructura de Archivos

Las fotos se guardan con esta estructura:
```
profile-photos/
  └── avatars/
      ├── 12345678-9-1234567890.jpg
      ├── 98765432-1-1234567891.png
      └── ...
```

Formato de nombre: `{RUT}-{timestamp}.{extensión}`

---

## 🔗 URLs Generadas

Las fotos generan URLs públicas como:
```
https://[tu-proyecto].supabase.co/storage/v1/object/public/profile-photos/avatars/12345678-9-1234567890.jpg
```

Estas URLs:
- ✅ Son públicas (cualquiera puede verlas)
- ✅ Están en CDN (carga rápida)
- ✅ Se guardan en la base de datos (campo `foto_perfil`)
- ✅ Se muestran para TODOS los usuarios

---

## 💡 Notas Importantes

1. **Tamaño máximo:** 5MB por imagen
2. **Formatos permitidos:** JPG, PNG, GIF, WEBP
3. **El bucket DEBE ser público** para que las fotos se vean
4. **Las políticas permiten a cualquier usuario autenticado subir fotos**
5. **Los nombres de archivo son únicos** (incluyen timestamp)

---

¡Listo! Una vez configurado esto, la funcionalidad de fotos de perfil funcionará perfectamente. 📸✨
