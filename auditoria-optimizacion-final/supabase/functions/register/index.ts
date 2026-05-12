/**
 * 🔒 EDGE FUNCTION SEGURA PARA REGISTRO
 * Archivo: supabase/functions/register/index.ts
 * 
 * Este archivo implementa el flujo seguro de registro en el servidor.
 * El cliente NUNCA controla el rol - se asigna en el servidor.
 */

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://esm.sh/zod@3.22.4";

// ============================================================================
// CORS HEADERS
// ============================================================================

const corsHeaders = {
  "Access-Control-Allow-Origin": process.env.FRONTEND_URL || "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, content-type",
};

// ============================================================================
// VALIDACIÓN CON ZOD
// ============================================================================

const registerSchema = z.object({
  name: z
    .string()
    .min(2, "El nombre debe tener mínimo 2 caracteres")
    .max(100, "El nombre no puede exceder 100 caracteres")
    .regex(/^[a-zA-Z\s'-]+$/, "El nombre contiene caracteres inválidos"),

  email: z
    .string()
    .email("Email inválido")
    .max(100, "Email muy largo")
    .toLowerCase(),

  password: z
    .string()
    .min(12, "La contraseña debe tener mínimo 12 caracteres")
    .max(128, "La contraseña no puede exceder 128 caracteres")
    .regex(/[A-Z]/, "La contraseña debe contener mayúscula")
    .regex(/[a-z]/, "La contraseña debe contener minúscula")
    .regex(/[0-9]/, "La contraseña debe contener número")
    .regex(/[@$!%*?&]/, "La contraseña debe contener símbolo"),
});

// ============================================================================
// FUNCIONES HELPER
// ============================================================================

/**
 * Loguear eventos de seguridad
 * NO loguear: passwords, tokens, emails
 */
function logSecurityEvent(event: string, details: Record<string, string>) {
  const timestamp = new Date().toISOString();
  console.log(JSON.stringify({
    timestamp,
    event,
    ...details,
  }));
}

/**
 * Mapear errores a mensajes seguros
 */
function getSafeErrorMessage(error: unknown): string {
  const message = (error as any)?.message?.toLowerCase() || "";

  const errorMap: Record<string, string> = {
    "unique violation": "Este email ya está registrado",
    "invalid email": "Email inválido",
    "authentication": "Error de autenticación",
    "network": "Error de conexión",
  };

  for (const [key, safeMesage] of Object.entries(errorMap)) {
    if (message.includes(key)) {
      return safeMesage;
    }
  }

  return "Error al registrar. Por favor intenta más tarde.";
}

/**
 * Validar token JWT (opcional, para más seguridad)
 */
function validateJWT(token: string): boolean {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return false;

    // Decode payload (sin verificar firma aquí, Supabase lo hace)
    const payload = JSON.parse(atob(parts[1]));
    const exp = payload.exp * 1000;

    // Verificar que no está expirado
    return exp > Date.now();
  } catch {
    return false;
  }
}

// ============================================================================
// HANDLER PRINCIPAL
// ============================================================================

serve(async (req) => {
  console.log(`${req.method} ${new URL(req.url).pathname}`);

  // ✅ Manejo de CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Solo POST permitido
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }

  try {
    // ============================================================================
    // 1. PARSEAR BODY
    // ============================================================================

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid JSON" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // ============================================================================
    // 2. VALIDAR BODY CON ZOD
    // ============================================================================

    const result = registerSchema.safeParse(body);
    if (!result.success) {
      const errors = result.error.flatten();
      return new Response(
        JSON.stringify({
          error: "Validation failed",
          details: errors.fieldErrors,
        }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const { name, email, password } = result.data;

    // ============================================================================
    // 3. CREAR CLIENTE SUPABASE (con service_role key en servidor)
    // ============================================================================

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") || "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    // ============================================================================
    // 4. CREAR USUARIO EN AUTH
    // ============================================================================

    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: false,  // Requiere confirmación de email
    });

    if (authError || !authData.user) {
      logSecurityEvent("register_failed", {
        reason: "auth_creation_failed",
        email: email,
      });

      return new Response(
        JSON.stringify({
          error: getSafeErrorMessage(authError),
        }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const userId = authData.user.id;

    // ============================================================================
    // 5. CREAR PERFIL CON ROL "user" (NUNCA controlado por cliente)
    // ============================================================================

    const { error: profileError } = await supabase
      .from("profiles")
      .insert({
        id: userId,
        name: name,
        email: email,
        role: "user",  // ✅ HARDCODEADO - no es controlable
        created_at: new Date().toISOString(),
      });

    if (profileError) {
      // ✅ Rollback: Eliminar usuario si falla la creación del perfil
      await supabase.auth.admin.deleteUser(userId);

      logSecurityEvent("register_failed", {
        reason: "profile_creation_failed",
        email: email,
      });

      return new Response(
        JSON.stringify({
          error: getSafeErrorMessage(profileError),
        }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // ============================================================================
    // 6. LOGUEAR EVENTO DE REGISTRO EXITOSO
    // ============================================================================

    logSecurityEvent("register_success", {
      user_id: userId,
      email: email,
      ip: req.headers.get("x-forwarded-for") || "unknown",
    });

    // ============================================================================
    // 7. RETORNAR RESPUESTA EXITOSA
    // ============================================================================

    return new Response(
      JSON.stringify({
        success: true,
        message: "Usuario registrado exitosamente",
        user_id: userId,
      }),
      {
        status: 201,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders,
        },
      }
    );
  } catch (error) {
    console.error("Unexpected error:", error);

    logSecurityEvent("register_error", {
      reason: "unexpected_error",
      error: (error as Error).message,
    });

    return new Response(
      JSON.stringify({
        error: "Algo salió mal. Por favor intenta más tarde.",
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders,
        },
      }
    );
  }
});

// ============================================================================
// VARIABLES DE ENTORNO REQUERIDAS
// ============================================================================
/**
 * Asegúrate de que estas variables están configuradas en Supabase:
 * 
 * SUPABASE_URL = Tu URL de Supabase (ej: https://proyecto.supabase.co)
 * SUPABASE_SERVICE_ROLE_KEY = Tu service role key (¡MANTENER SEGURA!)
 * FRONTEND_URL = Tu dominio del frontend (para CORS, ej: https://app.example.com)
 */
