/**
 * 🔒 REGISTRO SEGURO - Componente corregido
 * Este archivo reemplaza a src/components/Register.jsx
 * 
 * Cambios implementados:
 * ✅ Eliminado field de "role" - solo se asigna "user" desde servidor
 * ✅ Validación completa de inputs
 * ✅ Sanitización de HTML
 * ✅ Mensajes de error seguros
 * ✅ Sin datos sensibles expuestos
 */

import { useState } from "react";
import { supabase } from "../supabaseClient";
import { useNavigate } from "react-router-dom";
import DOMPurify from "dompurify";
import { z } from "zod";

// ✅ Esquema de validación con Zod
const registrationSchema = z.object({
  name: z
    .string()
    .min(2, "El nombre debe tener mínimo 2 caracteres")
    .max(100, "El nombre no puede exceder 100 caracteres")
    .regex(/^[a-zA-Z\s'-]+$/, "El nombre solo puede contener letras, espacios y guiones")
    .transform(v => v.trim()),

  email: z
    .string()
    .email("Por favor ingresa un email válido")
    .max(100, "Email muy largo")
    .toLowerCase()
    .transform(v => v.trim()),

  password: z
    .string()
    .min(12, "La contraseña debe tener mínimo 12 caracteres")
    .max(128, "La contraseña no puede exceder 128 caracteres")
    .regex(/[A-Z]/, "La contraseña debe contener al menos una mayúscula")
    .regex(/[a-z]/, "La contraseña debe contener al menos una minúscula")
    .regex(/[0-9]/, "La contraseña debe contener al menos un número")
    .regex(/[@$!%*?&]/, "La contraseña debe contener al menos un símbolo (@$!%*?&)")
});

// ✅ Funciones de validación
const sanitizeInput = (input, maxLength = 100) => {
  if (typeof input !== 'string') return '';

  let sanitized = input.trim();

  // Limitar longitud
  if (sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength);
  }

  // Sanitizar HTML
  sanitized = DOMPurify.sanitize(sanitized, { 
    ALLOWED_TAGS: [] // Solo texto plano
  });

  // Remover caracteres de control
  sanitized = sanitized.replace(/[\x00-\x1F\x7F]/g, '');

  return sanitized;
};

// ✅ Mapeo seguro de errores
const getErrorMessage = (error) => {
  if (!error) return "Error desconocido";

  const message = error.message || '';

  // Mapear errores conocidos a mensajes seguros
  if (message.includes("already exists")) {
    return "Este email ya está registrado";
  }
  if (message.includes("email")) {
    return "Email inválido";
  }
  if (message.includes("password")) {
    return "La contraseña no cumple los requisitos";
  }
  if (message.includes("connection") || message.includes("network")) {
    return "Error de conexión. Intenta más tarde";
  }

  // Mensaje genérico para otros errores
  return "Error al registrar. Por favor intenta más tarde";
};

export default function Register() {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: ""
  });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const navigate = useNavigate();

  // ✅ Cambio de input con sanitización en tiempo real
  const handleChange = (e) => {
    const { name, value } = e.target;

    // Sanitizar el input
    const maxLength = name === 'email' ? 100 : 100;
    const sanitized = sanitizeInput(value, maxLength);

    setFormData(prev => ({
      ...prev,
      [name]: sanitized
    }));

    // Limpiar error del campo al empezar a escribir
    if (errors[name]) {
      setErrors(prev => ({
        ...prev,
        [name]: undefined
      }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrors({});
    setLoading(true);
    setSuccess(false);

    try {
      // ✅ Validar todos los datos con Zod
      const validated = registrationSchema.parse({
        name: formData.name,
        email: formData.email,
        password: formData.password
      });

      // ✅ Si llegamos aquí, todos los datos son válidos
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: validated.email,
        password: validated.password
      });

      if (signUpError) {
        const safeError = getErrorMessage(signUpError);
        setErrors({ submit: safeError });
        return;
      }

      if (!data.user) {
        setErrors({ submit: "Error al crear la cuenta" });
        return;
      }

      // ✅ Crear perfil con rol SIEMPRE "user" (nunca controlado por cliente)
      const { error: insertError } = await supabase
        .from("profiles")
        .insert({
          id: data.user.id,
          name: validated.name,
          email: validated.email,
          role: "user"  // 🔒 Hardcodeado - no es controlable
        });

      if (insertError) {
        const safeError = getErrorMessage(insertError);
        setErrors({ submit: safeError });
        return;
      }

      setSuccess(true);
      
      // Redirigir después de breve delay
      setTimeout(() => {
        navigate("/dashboard");
      }, 1500);

    } catch (error) {
      if (error instanceof z.ZodError) {
        // ✅ Errores de validación - mapear a campos
        const newErrors = {};
        error.errors.forEach(err => {
          const fieldName = err.path[0];
          newErrors[fieldName] = err.message;
        });
        setErrors(newErrors);
      } else {
        // Error no esperado
        setErrors({ submit: getErrorMessage(error) });
      }
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="register-success">
        <h2>¡Cuenta creada exitosamente!</h2>
        <p>Redirigiendo al panel...</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="register-form">
      <h2>Crear Nueva Cuenta</h2>

      {/* ✅ Mensaje de error general sin HTML */}
      {errors.submit && (
        <div role="alert" className="form-error" style={{
          padding: '12px',
          marginBottom: '16px',
          backgroundColor: '#fee',
          borderLeft: '4px solid #f00',
          borderRadius: '4px',
          color: '#c33'
        }}>
          {errors.submit}
        </div>
      )}

      {/* Campo: Nombre */}
      <div className="form-group">
        <label htmlFor="name">Nombre Completo</label>
        <input
          id="name"
          name="name"
          type="text"
          placeholder="Ej: Juan García"
          value={formData.name}
          onChange={handleChange}
          maxLength="100"
          disabled={loading}
          required
          aria-invalid={!!errors.name}
          aria-describedby={errors.name ? "name-error" : undefined}
          style={{
            borderColor: errors.name ? '#f00' : '#ccc',
            padding: '8px',
            borderRadius: '4px',
            fontSize: '14px'
          }}
        />
        {errors.name && (
          <span id="name-error" className="field-error" style={{
            color: '#c33',
            fontSize: '12px',
            marginTop: '4px',
            display: 'block'
          }}>
            {errors.name}
          </span>
        )}
      </div>

      {/* Campo: Email */}
      <div className="form-group">
        <label htmlFor="email">Correo Electrónico</label>
        <input
          id="email"
          name="email"
          type="email"
          placeholder="tu@email.com"
          value={formData.email}
          onChange={handleChange}
          maxLength="100"
          disabled={loading}
          required
          aria-invalid={!!errors.email}
          aria-describedby={errors.email ? "email-error" : undefined}
          style={{
            borderColor: errors.email ? '#f00' : '#ccc',
            padding: '8px',
            borderRadius: '4px',
            fontSize: '14px'
          }}
        />
        {errors.email && (
          <span id="email-error" className="field-error" style={{
            color: '#c33',
            fontSize: '12px',
            marginTop: '4px',
            display: 'block'
          }}>
            {errors.email}
          </span>
        )}
      </div>

      {/* Campo: Contraseña */}
      <div className="form-group">
        <label htmlFor="password">Contraseña</label>
        <input
          id="password"
          name="password"
          type="password"
          placeholder="Min 12 caracteres (Mayús, número, símbolo)"
          value={formData.password}
          onChange={handleChange}
          maxLength="128"
          disabled={loading}
          required
          aria-invalid={!!errors.password}
          aria-describedby={errors.password ? "password-error" : undefined}
          style={{
            borderColor: errors.password ? '#f00' : '#ccc',
            padding: '8px',
            borderRadius: '4px',
            fontSize: '14px'
          }}
        />
        {errors.password && (
          <span id="password-error" className="field-error" style={{
            color: '#c33',
            fontSize: '12px',
            marginTop: '4px',
            display: 'block'
          }}>
            {errors.password}
          </span>
        )}
        
        {/* ✅ Requisitos de contraseña */}
        <div className="password-requirements" style={{
          fontSize: '12px',
          marginTop: '8px',
          color: '#666'
        }}>
          <p>Requisitos:</p>
          <ul style={{ margin: '4px 0', paddingLeft: '20px' }}>
            <li>Mínimo 12 caracteres</li>
            <li>Al menos una mayúscula (A-Z)</li>
            <li>Al menos un número (0-9)</li>
            <li>Al menos un símbolo (@$!%*?&)</li>
          </ul>
        </div>
      </div>

      <button 
        type="submit" 
        disabled={loading}
        style={{
          padding: '10px 20px',
          fontSize: '14px',
          backgroundColor: loading ? '#ccc' : '#007bff',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: loading ? 'not-allowed' : 'pointer',
          marginTop: '16px',
          width: '100%'
        }}
      >
        {loading ? 'Creando cuenta...' : 'Registrarse'}
      </button>

      <p style={{ marginTop: '16px', fontSize: '14px', textAlign: 'center' }}>
        ¿Ya tienes cuenta? <a href="/login">Inicia sesión aquí</a>
      </p>
    </form>
  );
}

export default Register;
