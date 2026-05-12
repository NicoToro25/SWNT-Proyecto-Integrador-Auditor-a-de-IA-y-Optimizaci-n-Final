# 🔐 GUÍA DE CONFIGURACIÓN SEGURA

## Paso 1: Configurar Variables de Entorno

### Crear archivo `.env.local`

```bash
# .env.local (NO COMMITEAR)
VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Opcional: Variables de desarrollo
VITE_API_BASE_URL=http://localhost:3000
VITE_LOG_LEVEL=debug
```

### Crear archivo `.env.example` (SÍ COMMITEAR)

```bash
# .env.example (Plantilla para el equipo)
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here

VITE_API_BASE_URL=http://localhost:3000
VITE_LOG_LEVEL=debug
```

### Configurar `.gitignore`

```
# Variables de entorno
.env
.env.local
.env.*.local
.env.production

# Otros archivos sensibles
.DS_Store
*.pem
*.key
*.cert
private/
secrets/
```

## Paso 2: Implementar el Componente Seguro

### Opción A: Reemplazar directamente

```bash
# Copiar el componente seguro
cp src/components/RegisterSecure.jsx src/components/Register.jsx

# Instalar dependencias necesarias
npm install --save dompurify zod @supabase/supabase-js react-router-dom
```

### Opción B: Actualización gradual (Recomendado)

```javascript
// App.jsx
import Register from "./components/RegisterSecure";  // Usar componente nuevo temporalmente

function App() {
  return <Register />;
}

export default App;
```

Luego, cuando se valide:
```bash
mv src/components/RegisterSecure.jsx src/components/Register.jsx
```

## Paso 3: Actualizar Base de Datos (RLS)

### En Supabase Console:

1. Ir a "SQL Editor"
2. Crear nueva query
3. Ejecutar contenido de `rls-policies-secure.sql`

```bash
# O desde CLI:
supabase db push
```

### Verificar RLS:

```sql
-- Ejecutar en Supabase Console
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' AND tablename = 'profiles';

-- Resultado esperado:
-- profiles | true
```

## Paso 4: Actualizar Supabase Client

```bash
# Reemplazar el cliente
cp supabaseClient-secure.js supabaseClient.js
```

## Paso 5: Instalar Dependencias de Seguridad

```bash
npm install --save \
  dompurify \
  zod \
  @supabase/supabase-js \
  react-router-dom

# Opcional pero recomendado:
npm install --save-dev \
  npm-audit \
  snyk \
  eslint-plugin-security
```

## Paso 6: Verificar Vulnerabilidades en Dependencias

```bash
# Auditar paquetes
npm audit --production

# Usando snyk (si está instalado)
npx snyk test

# Listar vulnerabilidades por severidad
npm audit --production --json | jq '.metadata.vulnerabilities'
```

## Paso 7: Configurar CSP (Content Security Policy)

### En `index.html`

```html
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  
  <!-- ✅ Content Security Policy -->
  <meta http-equiv="Content-Security-Policy" content="
    default-src 'self';
    script-src 'self' 'wasm-unsafe-eval';
    style-src 'self' 'unsafe-inline';
    img-src 'self' data: https:;
    font-src 'self';
    connect-src 'self' https://tu-proyecto.supabase.co;
    frame-ancestors 'none';
    base-uri 'self';
    form-action 'self';
    object-src 'none';
  " />
  
  <!-- ✅ Otros headers de seguridad -->
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <meta http-equiv="X-Content-Type-Options" content="nosniff" />
  <meta http-equiv="X-Frame-Options" content="DENY" />
  <meta http-equiv="X-XSS-Protection" content="1; mode=block" />
  <meta name="referrer" content="strict-origin-when-cross-origin" />
  
  <title>Auditoría & Optimización</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/src/main.jsx"></script>
</body>
</html>
```

## Paso 8: Configurar Rate Limiting (Opcional pero Recomendado)

### En `vite.config.js`

```javascript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  
  // ✅ Configurar servidor de desarrollo
  server: {
    middlewareMode: false,
    cors: {
      origin: ['http://localhost:5173'],
      credentials: true,
    },
  },
  
  // ✅ Configurar build
  build: {
    sourcemap: false,  // No incluir sourcemaps en producción
    minify: 'terser',
  },
});
```

## Paso 9: Testing de Seguridad

### Test de Autenticación

```javascript
// src/__tests__/register.test.js
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Register from '../components/Register';
import { supabase } from '../supabaseClient';

jest.mock('../supabaseClient');

describe('Register - Seguridad', () => {
  
  test('No envía rol al servidor', async () => {
    const { getByText, getByPlaceholderText } = render(<Register />);
    
    const nameInput = getByPlaceholderText('Ej: Juan García');
    const emailInput = getByPlaceholderText('tu@email.com');
    const passwordInput = getByPlaceholderText('Min 12 caracteres');
    const submitBtn = getByText('Registrarse');
    
    fireEvent.change(nameInput, { target: { value: 'Juan García' } });
    fireEvent.change(emailInput, { target: { value: 'juan@example.com' } });
    fireEvent.change(passwordInput, { target: { value: 'SecurePass123!' } });
    fireEvent.click(submitBtn);
    
    await waitFor(() => {
      const insertCall = supabase.from().insert.mock.calls[0][0];
      expect(insertCall.role).toBe('user');  // ✅ Siempre 'user'
      expect(insertCall.role).not.toBe('admin');
    });
  });

  test('Sanitiza valores de input', async () => {
    const { getByPlaceholderText } = render(<Register />);
    const nameInput = getByPlaceholderText('Ej: Juan García');
    
    const maliciousInput = '<script>alert("xss")</script>';
    fireEvent.change(nameInput, { target: { value: maliciousInput } });
    
    // ✅ El valor debe estar sanitizado
    expect(nameInput.value).not.toContain('<script>');
  });

  test('Rechaza contraseñas débiles', async () => {
    const { getByPlaceholderText, getByText } = render(<Register />);
    const passwordInput = getByPlaceholderText('Min 12 caracteres');
    const submitBtn = getByText('Registrarse');
    
    fireEvent.change(passwordInput, { target: { value: 'weak' } });
    fireEvent.click(submitBtn);
    
    // ✅ Debe mostrar error
    await waitFor(() => {
      expect(getByText(/mínimo 12 caracteres/i)).toBeInTheDocument();
    });
  });
});
```

### Test de RLS

```sql
-- Ejecutar en Supabase Console
-- Test: Usuario normal no puede leer otros perfiles

-- 1. Como usuario A
SET ROLE "usuario_a";
SELECT * FROM profiles;  -- Debe retornar solo el perfil de A

-- 2. Como usuario B
SET ROLE "usuario_b";
SELECT * FROM profiles;  -- Debe retornar solo el perfil de B

-- 3. Como admin
SET ROLE "admin_user";
SELECT * FROM profiles;  -- Puede retornar todos
```

## Paso 10: Validación Final Antes de Producción

### Checklist de Seguridad

```bash
# 1. Verificar que no hay secretos en el código
grep -r "service_role" src/
grep -r "SECRET_KEY" src/
grep -r "ADMIN_KEY" src/

# 2. Verificar que .env no está commiteado
git status | grep ".env"

# 3. Auditar npm packages
npm audit --production

# 4. Verificar que RLS está habilitado
# (Confirmado en Supabase Console)

# 5. Probar autenticación en staging
npm run build
npm run preview

# 6. Testing de RLS:
# - Login como usuario regular
# - Intentar acceder a perfil de otro usuario (debe fallar)
# - Login como admin
# - Debe poder acceder a todos los perfiles
```

## Comandos Útiles

```bash
# Limpiar variables de ambiente locales
unset VITE_SUPABASE_URL
unset VITE_SUPABASE_ANON_KEY

# Verificar que las variables están en .env.local
cat .env.local

# Rotar credenciales en Supabase
# (Hacer desde dashboard de Supabase)

# Ver histórico de cambios en BD
SELECT * FROM audit_log ORDER BY created_at DESC LIMIT 10;

# Limpiar sesiones expiradas
SELECT cleanup_expired_sessions();
```

---

**Próximas pasos después de implementar:**

1. ✅ Hacer code review con especialista en seguridad
2. ✅ Ejecutar pruebas de penetración (OWASP)
3. ✅ Monitorear logs de auditoría
4. ✅ Realizar backup regular de base de datos
5. ✅ Actualizar dependencias mensualmente
6. ✅ Mantener plan de respuesta ante incidentes
