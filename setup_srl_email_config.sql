-- =====================================================
-- SCRIPT: Crear Configuración Inicial de Email para SRL
-- Descripción: Inserta la configuración por defecto
-- para que las notificaciones de SRL funcionen
-- =====================================================

-- IMPORTANTE: Reemplaza los emails con los correctos antes de ejecutar

BEGIN;

-- 1. Verificar si ya existe configuración
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM srl_email_settings LIMIT 1) THEN
        RAISE NOTICE 'Ya existe configuración de email. Actualizando...';
        
        -- Actualizar configuración existente
        UPDATE srl_email_settings
        SET 
            enabled = true,
            recipients = 'srl@tuempresa.com, logistica@tuempresa.com',  -- ⚠️ CAMBIAR ESTOS EMAILS
            cc_emails = 'supervisor@tuempresa.com',                      -- ⚠️ CAMBIAR ESTE EMAIL (opcional)
            subject_template = NULL,
            body_template = NULL,
            updated_at = NOW()
        WHERE id = (SELECT id FROM srl_email_settings LIMIT 1);
        
    ELSE
        RAISE NOTICE 'No existe configuración. Creando nueva...';
        
        -- Insertar nueva configuración
        INSERT INTO srl_email_settings (
            enabled,
            recipients,
            cc_emails,
            subject_template,
            body_template
        ) VALUES (
            true,                                                        -- Habilitado
            'srl@tuempresa.com, logistica@tuempresa.com',               -- ⚠️ CAMBIAR ESTOS EMAILS
            'supervisor@tuempresa.com',                                  -- ⚠️ CAMBIAR ESTE EMAIL (opcional)
            NULL,                                                        -- Usar template por defecto
            NULL                                                         -- Usar template por defecto
        );
    END IF;
END $$;

COMMIT;

-- =====================================================
-- VERIFICACIÓN
-- =====================================================

-- Ver la configuración creada
SELECT 
    id,
    enabled,
    recipients,
    cc_emails,
    created_at,
    updated_at
FROM srl_email_settings;

-- =====================================================
-- INSTRUCCIONES
-- =====================================================

/*
1. ANTES DE EJECUTAR:
   - Reemplaza 'srl@tuempresa.com' con el email real
   - Reemplaza 'logistica@tuempresa.com' con el email real
   - Reemplaza 'supervisor@tuempresa.com' con el email real (o elimina la línea si no quieres CC)

2. EJECUTAR EN SUPABASE:
   - Ve a Supabase → SQL Editor
   - Pega este script
   - Modifica los emails
   - Click en "Run"

3. VERIFICAR:
   - Deberías ver 1 fila con la configuración
   - enabled = true
   - recipients con tus emails

4. PROBAR:
   - Recarga la app
   - Crea una solicitud SRL
   - Revisa la consola - ahora debería enviar el email

FORMATO DE EMAILS:
- Múltiples emails separados por comas
- Ejemplo: 'email1@empresa.com, email2@empresa.com, email3@empresa.com'
- Sin espacios extra al inicio/final
*/
