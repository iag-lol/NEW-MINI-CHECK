-- =============================================================================
-- SEGURIDAD DE CREDENCIALES
-- =============================================================================
-- Ejecutar completo en Supabase → SQL Editor → New query → Run.
-- Es idempotente: se puede volver a ejecutar sin romper nada ni perder datos.
--
-- QUÉ ARREGLA
-- -----------
-- Hasta ahora la aplicación verificaba la contraseña en el navegador. Para
-- poder compararla tenía que descargarse el hash bcrypt del usuario, y la
-- clave anónima de Supabase está —por definición— en el código que sirve la
-- web. Cualquiera podía abrir la consola del navegador y ejecutar:
--
--     supabase.from('usuarios').select('rut, password')
--
-- para llevarse la tabla completa de credenciales y romperla sin conexión, a
-- su ritmo y sin dejar rastro. Además, nada impedía un UPDATE sobre la columna
-- `password` de cualquier usuario: bastaba con eso para entrar como
-- supervisor.
--
-- Este script cierra las dos puertas:
--   1. Quita a la clave anónima el permiso de LEER y ESCRIBIR la columna
--      `password`. Deja de ser descargable y deja de ser sobrescribible.
--   2. Crea funciones SECURITY DEFINER que hacen la verificación dentro de la
--      base de datos y devuelven al usuario SIN su hash, con bloqueo temporal
--      tras varios intentos fallidos.
--
-- COMPATIBILIDAD
-- --------------
-- Las contraseñas actuales están hasheadas con bcryptjs ($2a$ / $2b$), que es
-- el mismo formato que usa pgcrypto. No hay que resetear ninguna: siguen
-- funcionando tal cual.
-- =============================================================================


-- =============================================================================
-- 0. COMPROBACIÓN PREVIA
-- =============================================================================

DO $$
BEGIN
  IF to_regclass('public.usuarios') IS NULL THEN
    RAISE EXCEPTION
      'No existe public.usuarios en esta base de datos (%). Casi siempre significa que el editor SQL está apuntando a otro proyecto de Supabase. Comprueba que el proyecto coincide con VITE_SUPABASE_URL de tu hosting. Ejecuta sql-scripts/00-diagnostico.sql para confirmarlo.',
      current_database();
  END IF;
END $$;

-- `crypt()` y `gen_salt()` viven aquí. En Supabase suele estar en el esquema
-- `extensions`, que ya está en el search_path por defecto.
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;


-- =============================================================================
-- 1. REGISTRO DE INTENTOS DE ACCESO
-- =============================================================================
-- Sin esto, probar contraseñas es gratis e ilimitado: un script puede lanzar
-- miles por minuto contra un RUT conocido. Con bloqueo progresivo, un ataque
-- por fuerza bruta pasa de horas a siglos.
--
-- Se guarda también el último acceso correcto: sirve para detectar sesiones
-- iniciadas a horas raras o desde otro sitio.

CREATE TABLE IF NOT EXISTS public.auth_intentos (
  rut              TEXT NOT NULL,
  intentos         INTEGER NOT NULL DEFAULT 0,
  ultimo_intento   TIMESTAMPTZ,
  bloqueado_hasta  TIMESTAMPTZ,
  ultimo_acceso_ok TIMESTAMPTZ,
  -- La constraint se nombra a mano porque las funciones la referencian por
  -- nombre: `ON CONFLICT (rut)` sería ambiguo, ya que `rut` es también un
  -- parámetro de salida de autenticar_usuario.
  CONSTRAINT auth_intentos_pkey PRIMARY KEY (rut)
);

-- Nadie de fuera necesita leer ni tocar esta tabla: sólo la usan las funciones
-- SECURITY DEFINER, que corren con los permisos del propietario.
ALTER TABLE public.auth_intentos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.auth_intentos FROM anon, authenticated;

DROP POLICY IF EXISTS "auth_intentos sin acceso directo" ON public.auth_intentos;


-- =============================================================================
-- 1.bis · COMPARACIÓN DE CONTRASEÑAS COMPATIBLE CON bcryptjs
-- =============================================================================
-- pgcrypto sólo reconoce el prefijo `$2a$`. bcryptjs genera `$2b$` desde su
-- versión 2.4, y ante un prefijo que no conoce pgcrypto NO falla: se pasa
-- silenciosamente a DES y devuelve un hash de 13 caracteres que nunca va a
-- coincidir. El resultado sería que TODAS las contraseñas existentes dejan de
-- funcionar el día que se ejecuta este script, sin ningún mensaje de error.
--
-- `$2a$` y `$2b$` son el mismo algoritmo byte a byte. El prefijo `$2b$` sólo
-- marca a las implementaciones que corrigieron un desbordamiento con
-- contraseñas de más de 255 bytes; para cualquier contraseña real producen
-- idéntico resultado. Por eso reescribir el prefijo es seguro y no obliga a
-- resetear ni una sola clave.

CREATE OR REPLACE FUNCTION public.verificar_password(
  p_password TEXT,
  p_hash     TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_hash TEXT;
BEGIN
  IF p_hash IS NULL OR p_password IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Sólo se traducen los prefijos de la familia bcrypt; cualquier otro
  -- formato se deja intacto para que falle de forma visible.
  v_hash := regexp_replace(p_hash, '^\$2[bxy]\$', '$2a$');

  RETURN extensions.crypt(p_password, v_hash) = v_hash;
END;
$$;

REVOKE ALL ON FUNCTION public.verificar_password(TEXT, TEXT) FROM PUBLIC, anon, authenticated;


-- =============================================================================
-- 2. AUTENTICACIÓN
-- =============================================================================
-- Devuelve una fila siempre, con `ok` a TRUE o FALSE. No lanza excepción en el
-- fallo a propósito: un error de PostgreSQL se distingue por su forma de una
-- respuesta normal, y eso ya filtra información al atacante.
--
-- `motivo` distingue no_existe / password_incorrecta / bloqueado para poder
-- registrarlo, pero la aplicación muestra el MISMO mensaje en los dos primeros
-- casos: decir "ese RUT no está registrado" convierte el login en un
-- directorio de personal que cualquiera puede recorrer.

CREATE OR REPLACE FUNCTION public.autenticar_usuario(
  p_rut      TEXT,
  p_password TEXT
)
RETURNS TABLE (
  ok         BOOLEAN,
  motivo     TEXT,
  espera_seg INTEGER,
  rut        TEXT,
  nombre     TEXT,
  cargo      TEXT,
  terminal   TEXT,
  foto_url   TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
-- search_path fijo: sin esto, quien pueda crear objetos en un esquema del
-- search_path podría suplantar `crypt()` y hacer que la función ejecute su
-- código con los permisos del propietario.
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  -- 5 fallos bloquean 15 minutos. Es holgado para quien se equivoca de
  -- teclado y letal para un script que necesita millones de intentos.
  v_max_intentos  CONSTANT INTEGER  := 5;
  v_bloqueo       CONSTANT INTERVAL := INTERVAL '15 minutes';
  -- El contador se olvida solo: dos errores hoy y tres el mes que viene no
  -- deberían dejar a nadie fuera.
  v_ventana       CONSTANT INTERVAL := INTERVAL '30 minutes';
  v_usuario       RECORD;
  v_control       RECORD;
  v_rut           TEXT;
BEGIN
  v_rut := TRIM(p_rut);

  SELECT * INTO v_control FROM public.auth_intentos a WHERE a.rut = v_rut;

  -- ¿Bloqueado ahora mismo?
  IF v_control.bloqueado_hasta IS NOT NULL AND v_control.bloqueado_hasta > NOW() THEN
    RETURN QUERY SELECT
      FALSE,
      'bloqueado'::TEXT,
      CEIL(EXTRACT(EPOCH FROM (v_control.bloqueado_hasta - NOW())))::INTEGER,
      NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT;
    RETURN;
  END IF;

  SELECT u.rut, u.nombre, u.cargo, u.terminal, u.foto_url, u.password
    INTO v_usuario
    FROM public.usuarios u
   WHERE u.rut = v_rut;

  -- La comparación se hace igual aunque el RUT no exista, para que el tiempo
  -- de respuesta no delate qué RUT están registrados y cuáles no.
  IF v_usuario IS NULL THEN
    -- Salt fijo y válido: sólo sirve para que fallar por "RUT inexistente"
    -- cueste lo mismo que fallar por contraseña, y el tiempo de respuesta no
    -- delate qué RUT están dados de alta.
    PERFORM extensions.crypt(p_password, '$2a$10$0123456789012345678901');
    RETURN QUERY SELECT
      FALSE, 'no_existe'::TEXT, NULL::INTEGER,
      NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT;
    RETURN;
  END IF;

  IF public.verificar_password(p_password, v_usuario.password) THEN
    -- Acierto: se borra el historial de fallos
    INSERT INTO public.auth_intentos (rut, intentos, ultimo_intento, bloqueado_hasta, ultimo_acceso_ok)
    VALUES (v_rut, 0, NOW(), NULL, NOW())
    ON CONFLICT ON CONSTRAINT auth_intentos_pkey DO UPDATE
      SET intentos = 0, bloqueado_hasta = NULL,
          ultimo_intento = NOW(), ultimo_acceso_ok = NOW();

    RETURN QUERY SELECT
      TRUE, 'ok'::TEXT, NULL::INTEGER,
      v_usuario.rut, v_usuario.nombre, v_usuario.cargo,
      v_usuario.terminal, v_usuario.foto_url;
    RETURN;
  END IF;

  -- Fallo: sumar al contador (reiniciándolo si la ventana ya expiró)
  INSERT INTO public.auth_intentos (rut, intentos, ultimo_intento)
  VALUES (v_rut, 1, NOW())
  ON CONFLICT ON CONSTRAINT auth_intentos_pkey DO UPDATE
    SET intentos = CASE
          WHEN public.auth_intentos.ultimo_intento < NOW() - v_ventana THEN 1
          ELSE public.auth_intentos.intentos + 1
        END,
        ultimo_intento = NOW(),
        bloqueado_hasta = CASE
          WHEN (CASE
                  WHEN public.auth_intentos.ultimo_intento < NOW() - v_ventana THEN 1
                  ELSE public.auth_intentos.intentos + 1
                END) >= v_max_intentos
          THEN NOW() + v_bloqueo
          ELSE NULL
        END;

  RETURN QUERY SELECT
    FALSE, 'password_incorrecta'::TEXT, NULL::INTEGER,
    NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT;
END;
$$;


-- =============================================================================
-- 3. CAMBIO DE CONTRASEÑA POR EL PROPIO USUARIO
-- =============================================================================
-- Exige la contraseña actual: sin eso, cualquiera que se siente ante una
-- sesión abierta —o que consiga un XSS— se queda con la cuenta para siempre.

CREATE OR REPLACE FUNCTION public.cambiar_password(
  p_rut    TEXT,
  p_actual TEXT,
  p_nueva  TEXT
)
RETURNS TABLE (ok BOOLEAN, motivo TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_hash TEXT;
BEGIN
  IF LENGTH(COALESCE(p_nueva, '')) < 8 THEN
    RETURN QUERY SELECT FALSE, 'muy_corta'::TEXT;
    RETURN;
  END IF;

  SELECT u.password INTO v_hash FROM public.usuarios u WHERE u.rut = TRIM(p_rut);

  IF v_hash IS NULL THEN
    RETURN QUERY SELECT FALSE, 'no_existe'::TEXT;
    RETURN;
  END IF;

  IF NOT public.verificar_password(p_actual, v_hash) THEN
    RETURN QUERY SELECT FALSE, 'password_incorrecta'::TEXT;
    RETURN;
  END IF;

  UPDATE public.usuarios
     SET password = extensions.crypt(p_nueva, extensions.gen_salt('bf', 10)),
         updated_at = NOW()
   WHERE rut = TRIM(p_rut);

  RETURN QUERY SELECT TRUE, 'ok'::TEXT;
END;
$$;


-- =============================================================================
-- 4. GESTIÓN DE USUARIOS POR UN ADMINISTRADOR
-- =============================================================================
-- La app entra con bcrypt contra la tabla `usuarios`, no con Supabase Auth, así
-- que auth.uid() es NULL y la base de datos no tiene forma de saber quién
-- llama. Por eso el administrador acredita quién es con SU propia contraseña
-- en cada operación sensible.
--
-- No es burocracia: sin ello, "resetear la contraseña de cualquiera" sería una
-- llamada abierta a internet, y bastaría con verla una vez en la pestaña de
-- red del navegador para tomar el control de toda la plataforma.

CREATE OR REPLACE FUNCTION public.es_admin(p_rut TEXT, p_password TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_usuario RECORD;
BEGIN
  SELECT u.password, u.cargo INTO v_usuario
    FROM public.usuarios u WHERE u.rut = TRIM(p_rut);

  IF v_usuario IS NULL OR v_usuario.password IS NULL THEN
    RETURN FALSE;
  END IF;
  IF NOT public.verificar_password(p_password, v_usuario.password) THEN
    RETURN FALSE;
  END IF;

  RETURN v_usuario.cargo IN ('SUPERVISOR', 'JEFE DE TERMINAL');
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_establecer_password(
  p_rut_admin      TEXT,
  p_password_admin TEXT,
  p_rut_objetivo   TEXT,
  p_nueva          TEXT
)
RETURNS TABLE (ok BOOLEAN, motivo TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
BEGIN
  IF NOT public.es_admin(p_rut_admin, p_password_admin) THEN
    RETURN QUERY SELECT FALSE, 'no_autorizado'::TEXT;
    RETURN;
  END IF;

  IF LENGTH(COALESCE(p_nueva, '')) < 8 THEN
    RETURN QUERY SELECT FALSE, 'muy_corta'::TEXT;
    RETURN;
  END IF;

  UPDATE public.usuarios
     SET password = extensions.crypt(p_nueva, extensions.gen_salt('bf', 10)),
         updated_at = NOW()
   WHERE rut = TRIM(p_rut_objetivo);

  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 'no_existe'::TEXT;
    RETURN;
  END IF;

  -- Un reseteo levanta el bloqueo: si al usuario le cambiaron la clave porque
  -- la había olvidado, dejarlo fuera otros quince minutos no protege de nada.
  DELETE FROM public.auth_intentos WHERE rut = TRIM(p_rut_objetivo);

  RETURN QUERY SELECT TRUE, 'ok'::TEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_crear_usuario(
  p_rut_admin      TEXT,
  p_password_admin TEXT,
  p_rut            TEXT,
  p_nombre         TEXT,
  p_cargo          TEXT,
  p_terminal       TEXT,
  p_password       TEXT
)
RETURNS TABLE (ok BOOLEAN, motivo TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
BEGIN
  IF NOT public.es_admin(p_rut_admin, p_password_admin) THEN
    RETURN QUERY SELECT FALSE, 'no_autorizado'::TEXT;
    RETURN;
  END IF;

  IF LENGTH(COALESCE(p_password, '')) < 8 THEN
    RETURN QUERY SELECT FALSE, 'muy_corta'::TEXT;
    RETURN;
  END IF;

  IF p_cargo NOT IN ('INSPECTOR', 'SUPERVISOR', 'JEFE DE TERMINAL') THEN
    RETURN QUERY SELECT FALSE, 'cargo_invalido'::TEXT;
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM public.usuarios u WHERE u.rut = TRIM(p_rut)) THEN
    RETURN QUERY SELECT FALSE, 'ya_existe'::TEXT;
    RETURN;
  END IF;

  INSERT INTO public.usuarios (rut, nombre, cargo, terminal, password, foto_url)
  VALUES (
    TRIM(p_rut),
    TRIM(p_nombre),
    p_cargo,
    TRIM(p_terminal),
    extensions.crypt(p_password, extensions.gen_salt('bf', 10)),
    NULL
  );

  RETURN QUERY SELECT TRUE, 'ok'::TEXT;
END;
$$;


-- =============================================================================
-- 5. CERRAR LA COLUMNA `password`
-- =============================================================================
-- Este es el cambio que de verdad importa. Las funciones de arriba no sirven
-- de nada si la columna sigue siendo legible: quien quiera saltárselas sólo
-- tiene que consultar la tabla directamente.
--
-- Los permisos por columna de PostgreSQL son la herramienta correcta: PostgREST
-- los respeta, así que a partir de aquí `select('password')` responde
-- "permission denied" a cualquiera que use la clave anónima, mientras que el
-- resto de columnas se siguen leyendo con normalidad.
--
-- Las funciones SECURITY DEFINER no se ven afectadas: corren con los permisos
-- de su propietario, no con los de quien llama.

DO $$
DECLARE
  v_rol TEXT;
  v_columnas TEXT;
BEGIN
  -- Se conceden explícitamente todas las columnas MENOS `password`. Un
  -- REVOKE a secas sobre la columna no basta si el rol tiene un GRANT a
  -- nivel de tabla, que es lo que Supabase configura por defecto.
  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position)
    INTO v_columnas
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name = 'usuarios'
     AND column_name <> 'password';

  FOREACH v_rol IN ARRAY ARRAY['anon', 'authenticated']
  LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_rol) THEN
      EXECUTE format('REVOKE ALL ON public.usuarios FROM %I', v_rol);
      EXECUTE format('GRANT SELECT (%s) ON public.usuarios TO %I', v_columnas, v_rol);
      EXECUTE format('GRANT UPDATE (%s) ON public.usuarios TO %I', v_columnas, v_rol);
      EXECUTE format('GRANT INSERT (%s) ON public.usuarios TO %I', v_columnas, v_rol);
      EXECUTE format('GRANT DELETE ON public.usuarios TO %I', v_rol);
    END IF;
  END LOOP;
END $$;

-- Las funciones sí son invocables desde la app
GRANT EXECUTE ON FUNCTION public.autenticar_usuario(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cambiar_password(TEXT, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_establecer_password(TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_crear_usuario(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;

-- `es_admin` es una pieza interna: exponerla sería regalar un oráculo para
-- comprobar contraseñas de administradores sin pasar por el bloqueo del login.
REVOKE ALL ON FUNCTION public.es_admin(TEXT, TEXT) FROM PUBLIC, anon, authenticated;


-- =============================================================================
-- 6. COMPROBACIÓN
-- =============================================================================
-- 6.1 · La columna `password` ya no debe aparecer para anon.
--       Esta consulta debe devolver CERO filas.

SELECT grantee, privilege_type, column_name
  FROM information_schema.column_privileges
 WHERE table_schema = 'public'
   AND table_name = 'usuarios'
   AND column_name = 'password'
   AND grantee IN ('anon', 'authenticated');

-- 6.2 · Las cuatro funciones deben existir.
SELECT proname AS funcion, prosecdef AS security_definer
  FROM pg_proc
 WHERE pronamespace = 'public'::regnamespace
   AND proname IN (
     'autenticar_usuario', 'cambiar_password',
     'admin_establecer_password', 'admin_crear_usuario'
   )
 ORDER BY proname;

-- 6.3 · Prueba de fuego, con TU RUT y TU contraseña.
--       Debe devolver ok = true y tus datos, sin ninguna columna de hash.
-- SELECT * FROM public.autenticar_usuario('12.345.678-9', 'tu-contraseña');

-- 6.4 · Y esto debe FALLAR con "permission denied for table usuarios".
--       Si devuelve datos, el paso 5 no se aplicó.
-- SET ROLE anon;
-- SELECT rut, password FROM public.usuarios LIMIT 1;
-- RESET ROLE;


-- =============================================================================
-- 7. PENDIENTE FUERA DE ESTE SCRIPT
-- =============================================================================
-- Lo de arriba protege las credenciales. Queda una capa que sólo se puede
-- cerrar desde el panel de Supabase y conviene revisar:
--
--   · Storage: si el bucket de fotos de perfil es público, cualquiera con la
--     URL ve las imágenes. Pásalo a privado y sirve por URL firmada.
--   · Copias de seguridad: activa Point-in-Time Recovery en el proyecto.
--   · La clave `service_role` NUNCA debe estar en el código de la web ni en
--     variables VITE_*: todo lo que empieza por VITE_ se publica en el bundle.
--   · Las tablas de módulos tienen escritura abierta porque la app no usa
--     Supabase Auth. Migrar el login a Supabase Auth permitiría cerrarlas con
--     RLS por usuario; es el siguiente paso natural de este trabajo.
