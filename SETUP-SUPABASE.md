# 🚀 CONFIGURACIÓN DE SUPABASE - PASOS OBLIGATORIOS

## ⚠️ IMPORTANTE: DEBES EJECUTAR ESTOS SCRIPTS PARA QUE LA APP FUNCIONE

Las fotos de perfil y el chat NO FUNCIONARÁN hasta que ejecutes estos scripts en Supabase.

---

## 📋 PASO 1: CONFIGURAR TABLA USUARIOS

**Archivo:** `sql-scripts/arreglar-perfil-y-temas.sql`

**Qué hace:**
- Agrega columna `foto_perfil` a usuarios
- Agrega columna `tema_color` a usuarios
- Agrega columna `updated_at` a usuarios
- Crea trigger para actualizar `updated_at` automáticamente

**Cómo ejecutar:**
1. Ve a Supabase Dashboard → SQL Editor
2. Abre `sql-scripts/arreglar-perfil-y-temas.sql`
3. Copia TODO el contenido
4. Pégalo en SQL Editor
5. Click en **RUN**

✅ **Resultado esperado:** Verás las nuevas columnas en la tabla usuarios

---

## 📋 PASO 2: CONFIGURAR BUCKET DE FOTOS DE PERFIL

**Archivo:** `sql-scripts/configurar-bucket-fotos.sql`

**Qué hace:**
- Crea bucket `profile-photos` en Supabase Storage
- Configura políticas RLS para permitir:
  - Ver fotos (SELECT)
  - Subir fotos (INSERT)
  - Actualizar fotos (UPDATE)
  - Borrar fotos (DELETE)

**Cómo ejecutar:**
1. Ve a Supabase Dashboard → SQL Editor
2. Abre `sql-scripts/configurar-bucket-fotos.sql`
3. Copia TODO el contenido
4. Pégalo en SQL Editor
5. Click en **RUN**

✅ **Resultado esperado:** Verás el bucket `profile-photos` en Storage

---

## 📋 PASO 3: CONFIGURAR SISTEMA DE CHAT

**Archivo:** `sql-scripts/crear-sistema-comunicacion.sql`

**Qué hace:**
- Crea tabla `mensajes` para el chat
- Crea bucket `chat-images` para imágenes del chat
- Configura políticas RLS para mensajes
- Configura políticas RLS para imágenes del chat
- Crea función `marcar_mensaje_leido`
- Crea función `obtener_mensajes_no_leidos`
- Agrega índices para performance

**Cómo ejecutar:**
1. Ve a Supabase Dashboard → SQL Editor
2. Abre `sql-scripts/crear-sistema-comunicacion.sql`
3. Copia TODO el contenido
4. Pégalo en SQL Editor
5. Click en **RUN**

✅ **Resultado esperado:**
- Tabla `mensajes` creada
- Bucket `chat-images` en Storage

---

## 📋 PASO 4: VERIFICAR QUE TODO FUNCIONA

### Verificar columnas de usuarios:
```sql
SELECT
    column_name,
    data_type
FROM information_schema.columns
WHERE table_schema = 'public'
    AND table_name = 'usuarios'
ORDER BY ordinal_position;
```

Deberías ver:
- ✅ `foto_perfil` (text)
- ✅ `tema_color` (text)
- ✅ `updated_at` (timestamp with time zone)

### Verificar buckets de Storage:
1. Ve a Supabase Dashboard → Storage
2. Deberías ver:
   - ✅ `profile-photos`
   - ✅ `chat-images`

### Verificar tabla mensajes:
```sql
SELECT * FROM mensajes LIMIT 1;
```

Si sale error "relation mensajes does not exist", NO EJECUTASTE el script del PASO 3.

---

## 🐛 SI LAS FOTOS SIGUEN SIN FUNCIONAR:

### 1. Verifica las políticas RLS:

**Para profile-photos:**
```sql
SELECT
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual
FROM pg_policies
WHERE schemaname = 'storage'
    AND tablename = 'objects';
```

Deberías ver políticas para `profile-photos`.

### 2. Verifica permisos del bucket:

1. Ve a Storage → profile-photos → Configuration
2. Asegúrate que:
   - ✅ Public access: OFF (usamos RLS)
   - ✅ File size limit: 10 MB
   - ✅ Allowed MIME types: image/*

### 3. Verifica en la consola del navegador:

1. Abre DevTools (F12)
2. Ve a la pestaña Console
3. Intenta subir una foto
4. Si sale error, cópialo y revísalo

---

## 📞 ERRORES COMUNES:

### Error: "relation usuarios does not have column foto_perfil"
❌ **NO ejecutaste** `arreglar-perfil-y-temas.sql`
✅ **Solución:** Ejecuta el PASO 1

### Error: "Bucket not found: profile-photos"
❌ **NO ejecutaste** `configurar-bucket-fotos.sql`
✅ **Solución:** Ejecuta el PASO 2

### Error: "relation mensajes does not exist"
❌ **NO ejecutaste** `crear-sistema-comunicacion.sql`
✅ **Solución:** Ejecuta el PASO 3

### Error: "new row violates check constraint"
❌ El bucket NO tiene las políticas RLS correctas
✅ **Solución:** Re-ejecuta el script correspondiente

---

## ✅ CHECKLIST FINAL:

Antes de decir "las fotos no funcionan", verifica:

- [ ] ¿Ejecutaste `arreglar-perfil-y-temas.sql`?
- [ ] ¿Ejecutaste `configurar-bucket-fotos.sql`?
- [ ] ¿Ejecutaste `crear-sistema-comunicacion.sql`?
- [ ] ¿Verificaste que los buckets existen en Storage?
- [ ] ¿Verificaste las políticas RLS?
- [ ] ¿Revisaste la consola del navegador?

---

## 🎯 ORDEN DE EJECUCIÓN CORRECTO:

```
1. arreglar-perfil-y-temas.sql
2. configurar-bucket-fotos.sql
3. crear-sistema-comunicacion.sql
4. Refrescar la app
5. Probar subir foto
```

**SI SIGUES ESTOS PASOS, LAS FOTOS FUNCIONARÁN 100%**
