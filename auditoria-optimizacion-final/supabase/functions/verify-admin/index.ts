/**
 * 🔒 EDGE FUNCTION PARA VERIFICAR PERMISOS
 * Archivo: supabase/functions/verify-admin/index.ts
 * 
 * Verificar si un usuario es admin de forma segura
 * Nunca confiar en cliente para autenticación/autorización
 */

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { jwtVerify } from "https://esm.sh/jose@5.1.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": process.env.FRONTEND_URL || "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, content-type",
};

/**
 * Verificar JWT y retornar usuario autenticado
 */
async function verifyAuth(req: Request): Promise<{ userId: string } | null> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }

  try {
    // ✅ Verificar token JWT usando la secret key
    const token = authHeader.slice(7);
    const secret = new TextEncoder().encode(
      Deno.env.get("SUPABASE_JWT_SECRET") || ""
    );

    const { payload } = await jwtVerify(token, secret);
    return { userId: payload.sub as string };
  } catch {
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "GET") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }

  try {
    // 1. Verificar autenticación
    const auth = await verifyAuth(req);
    if (!auth) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // 2. Crear cliente Supabase
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") || "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
    );

    // 3. Verificar rol en BD
    const { data, error } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", auth.userId)
      .single();

    if (error || !data) {
      return new Response(
        JSON.stringify({ error: "User not found" }),
        { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const isAdmin = data.role === "admin";

    return new Response(
      JSON.stringify({
        user_id: auth.userId,
        is_admin: isAdmin,
        role: data.role,
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error) {
    console.error("Error:", error);

    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});
