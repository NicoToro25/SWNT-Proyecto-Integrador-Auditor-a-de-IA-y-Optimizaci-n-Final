-- 🔴 RLS desactivado en tabla profiles
ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;

-- 🔴 Policy demasiado permisiva: cualquier usuario autenticado lee TODO
CREATE POLICY "Leer perfiles"
ON profiles FOR SELECT
TO authenticated
USING (true);  -- debería ser: auth.uid() = id

-- 🔴 Sin restricción de escritura: cualquiera puede actualizar cualquier perfil
CREATE POLICY "Actualizar perfil"
ON profiles FOR UPDATE
TO authenticated
USING (true);
