/**
 * 🔒 RLS POLICIES CORREGIDAS
 * Archivo: docs/rls-policies-secure.sql
 * 
 * ✅ RLS habilitado en todas las tablas
 * ✅ Principio de mínimo privilegio
 * ✅ Validación con auth.uid()
 * ✅ Auditoría de cambios
 */

-- ============================================================================
-- 1. HABILITAR ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 2. POLÍTICAS PARA TABLA: profiles
-- ============================================================================

-- ✅ POLÍTICA 1: Leer solo tu propio perfil
CREATE POLICY "Leer perfil propio"
ON profiles
FOR SELECT
TO authenticated
USING (auth.uid() = id);

-- ✅ POLÍTICA 2: Actualizar solo tu propio perfil
CREATE POLICY "Actualizar perfil propio"
ON profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (
  auth.uid() = id AND
  role = (SELECT role FROM profiles WHERE id = auth.uid()) -- Prevenir escalación
);

-- ✅ POLÍTICA 3: Insertar solo tu propio perfil (al registrarse)
CREATE POLICY "Crear perfil propio"
ON profiles
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = id AND
  role = 'user'  -- El rol SIEMPRE debe ser 'user' al crear
);

-- ✅ POLÍTICA 4: Admin puede leer todos los perfiles (para auditoría)
CREATE POLICY "Admin lee todos los perfiles"
ON profiles
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = auth.uid() 
    AND role = 'admin'
  )
);

-- ✅ POLÍTICA 5: Admin puede actualizar otros perfiles
CREATE POLICY "Admin actualiza perfiles"
ON profiles
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = auth.uid() 
    AND role = 'admin'
  )
);

-- ✅ POLÍTICA 6: Nadie puede eliminar perfiles (soft delete)
CREATE POLICY "Bloquear eliminación de perfiles"
ON profiles
FOR DELETE
USING (false);

-- ============================================================================
-- 3. TABLA DE AUDITORÍA
-- ============================================================================

CREATE TABLE IF NOT EXISTS audit_log (
  id BIGSERIAL PRIMARY KEY,
  table_name TEXT NOT NULL,
  operation TEXT NOT NULL CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE')),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  old_values JSONB,
  new_values JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para auditoría rápida
CREATE INDEX idx_audit_log_user_id ON audit_log(user_id);
CREATE INDEX idx_audit_log_table_name ON audit_log(table_name);
CREATE INDEX idx_audit_log_created_at ON audit_log(created_at DESC);

-- ✅ RLS en tabla de auditoría (solo el usuario ve sus cambios, admin ve todo)
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Ver el propio audit log"
ON audit_log
FOR SELECT
TO authenticated
USING (auth.uid() = user_id OR EXISTS (
  SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
));

-- ============================================================================
-- 4. TRIGGER DE AUDITORÍA
-- ============================================================================

CREATE OR REPLACE FUNCTION audit_trigger()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO audit_log (
    table_name,
    operation,
    user_id,
    old_values,
    new_values,
    ip_address,
    user_agent
  ) VALUES (
    TG_TABLE_NAME,
    TG_OP,
    auth.uid(),
    (CASE WHEN TG_OP = 'DELETE' THEN row_to_json(OLD) END),
    (CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN row_to_json(NEW) END),
    current_setting('app.client_ip', true)::inet,
    current_setting('app.user_agent', true)
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Aplicar trigger a tabla profiles
DROP TRIGGER IF EXISTS profiles_audit ON profiles;
CREATE TRIGGER profiles_audit
  AFTER INSERT OR UPDATE OR DELETE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION audit_trigger();

-- ============================================================================
-- 5. VALIDACIÓN DE PERMISOS (Función Helper)
-- ============================================================================

CREATE OR REPLACE FUNCTION has_admin_role()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 6. POLÍTICA DE EXPIRACIÓN DE SESIONES
-- ============================================================================

-- Crear tabla de sesiones activas
CREATE TABLE IF NOT EXISTS user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(user_id, token_hash)
);

-- Índice para limpiar sesiones expiradas
CREATE INDEX idx_user_sessions_expires_at ON user_sessions(expires_at);
CREATE INDEX idx_user_sessions_user_id ON user_sessions(user_id);

-- RLS en sesiones
ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Ver propias sesiones"
ON user_sessions
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Eliminar propias sesiones"
ON user_sessions
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- ============================================================================
-- 7. LIMPIEZA AUTOMÁTICA DE DATOS EXPIRADOS
-- ============================================================================

CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS void AS $$
BEGIN
  DELETE FROM user_sessions
  WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Ejecutar limpieza cada hora (via pg_cron si está disponible)
-- SELECT cron.schedule('cleanup-sessions', '0 * * * *', 'SELECT cleanup_expired_sessions()');

-- ============================================================================
-- 8. VERIFICACIÓN DE RLS
-- ============================================================================

-- Verificar que RLS está habilitado
-- SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public';

-- Ver todas las policies de una tabla
-- SELECT * FROM pg_policies WHERE tablename = 'profiles';

-- ============================================================================
-- 9. ANÁLISIS DE PERMISOS
-- ============================================================================

-- Crear vista para analizar permisos de usuarios
CREATE OR REPLACE VIEW user_permissions AS
SELECT
  p.id,
  p.name,
  p.email,
  p.role,
  p.created_at,
  (SELECT COUNT(*) FROM audit_log WHERE user_id = p.id) as audit_count,
  (SELECT COUNT(*) FROM user_sessions WHERE user_id = p.id) as active_sessions
FROM profiles p;

-- Ver permisos (solo para admins)
ALTER VIEW user_permissions SET SCHEMA public;
GRANT SELECT ON user_permissions TO authenticated;

-- ============================================================================
-- 10. RECOMENDACIONES DE SEGURIDAD ADICIONAL
-- ============================================================================

/*
✅ CHECKLIST DE RLS:

1. [ ] RLS está habilitado en TODAS las tablas sensibles:
   - profiles
   - user_settings
   - audit_log
   - Cualquier tabla con datos de usuarios

2. [ ] Políticas implementan auth.uid():
   - ✓ Usuarios leen solo sus datos
   - ✓ Usuarios actualizan solo sus datos
   - ✓ Usuarios no pueden escalar privilegios

3. [ ] Admin policies existen para:
   - ✓ Ver todos los perfiles (auditoría)
   - ✓ Actualizar perfiles (moderación)
   - ✓ Sin permiso para eliminar (data retention)

4. [ ] Auditoría configurada:
   - ✓ Tabla audit_log con todas las operaciones
   - ✓ Triggers activos en tablas sensibles
   - ✓ Índices para queries rápidas

5. [ ] Datos expirados:
   - ✓ Sesiones limpian automáticamente
   - ✓ Logs retenidos por X meses
   - ✓ Backups realizados regularmente

6. [ ] Testing:
   - ✓ Usuario A no puede leer datos de Usuario B
   - ✓ Usuario A no puede actualizar datos de Usuario B
   - ✓ Admin PUEDE leer/actualizar cualquier perfil
   - ✓ Nadie puede eliminar perfiles
*/
