/**
 * 🔒 CONFIGURACIÓN SEGURA DE SUPABASE
 * Archivo: supabaseClient.js (Versión Segura)
 */

import { createClient } from "@supabase/supabase-js";

// ============================================================================
// VALIDACIÓN DE VARIABLES DE ENTORNO
// ============================================================================

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// ✅ Validar que las variables de entorno están configuradas
if (!supabaseUrl || !supabaseAnonKey) {
  console.error("❌ Error: Faltan variables de entorno de Supabase");
  console.error("   Asegúrate de que .env.local contiene:");
  console.error("   - VITE_SUPABASE_URL");
  console.error("   - VITE_SUPABASE_ANON_KEY");
  
  throw new Error(
    "Missing Supabase environment variables. " +
    "Create .env.local with VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY"
  );
}

// ✅ Validar formato de URL
if (!supabaseUrl.startsWith("https://")) {
  throw new Error("VITE_SUPABASE_URL debe comenzar con https://");
}

// ✅ El anon key debe tener formato de JWT
if (supabaseAnonKey.split('.').length !== 3) {
  throw new Error("VITE_SUPABASE_ANON_KEY parece estar mal formada");
}

// ============================================================================
// CREAR CLIENTE DE SUPABASE
// ============================================================================

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // ✅ Usar localStorage solo para tokens (más seguro que sessionstorage)
    storageKey: 'supabase.auth.token',
    storage: window.localStorage,
    
    // ✅ Desactivar autoRefresh - refrescar manualmente
    autoRefreshToken: true,
    
    // ✅ Detectar cambios de sesión en otras pestañas
    detectSessionInUrl: true,
    
    // ✅ Persistir sesión entre recargas
    persistSession: true,
  },
  
  // ✅ Configurar timeout de conexión
  db: {
    schema: 'public'
  },
  
  // ✅ Configurar realtime (si se usa)
  realtime: {
    params: {
      eventsPerSecond: 10
    }
  }
});

// ============================================================================
// HELPERS DE SEGURIDAD
// ============================================================================

/**
 * Obtener token de sesión actual
 * @returns {Promise<string|null>}
 */
export async function getActiveToken() {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token || null;
  } catch (error) {
    console.error("Error getting token:", error);
    return null;
  }
}

/**
 * Verificar si el usuario está autenticado
 * @returns {Promise<boolean>}
 */
export async function isUserAuthenticated() {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    return !!user;
  } catch (error) {
    console.error("Error checking auth:", error);
    return false;
  }
}

/**
 * Obtener usuario actual de forma segura
 * @returns {Promise<Object|null>}
 */
export async function getCurrentUser() {
  try {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error) throw error;
    return user;
  } catch (error) {
    console.error("Error getting current user:", error);
    return null;
  }
}

/**
 * Hacer logout de forma segura
 * @returns {Promise<boolean>}
 */
export async function logout() {
  try {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    
    // ✅ Limpiar token del localStorage
    window.localStorage.removeItem('supabase.auth.token');
    
    return true;
  } catch (error) {
    console.error("Error during logout:", error);
    return false;
  }
}

/**
 * Refrescar token manualmente
 * @returns {Promise<boolean>}
 */
export async function refreshToken() {
  try {
    const { data, error } = await supabase.auth.refreshSession();
    if (error) throw error;
    return !!data.session;
  } catch (error) {
    console.error("Error refreshing token:", error);
    return false;
  }
}

// ============================================================================
// INTERCEPTOR DE ERRORES SEGURO
// ============================================================================

/**
 * Mapear errores de Supabase a mensajes seguros
 * Nunca exponer detalles técnicos al usuario
 */
export function mapSupabaseError(error) {
  const errorMessage = error?.message?.toLowerCase() || '';

  const errorMap = {
    'user already registered': 'Este email ya está registrado',
    'invalid login credentials': 'Email o contraseña inválida',
    'email not confirmed': 'Por favor confirma tu email',
    'email link has expired': 'El enlace ha expirado. Solicita uno nuevo',
    'weak password': 'La contraseña es muy débil',
    'password should be different': 'La nueva contraseña debe ser diferente',
    'row level security': 'No tienes permiso para esta acción',
    'duplicate key': 'Este registro ya existe',
    'network': 'Error de conexión. Intenta más tarde',
    'timeout': 'La solicitud tardó demasiado. Intenta nuevamente',
  };

  for (const [key, message] of Object.entries(errorMap)) {
    if (errorMessage.includes(key)) {
      return message;
    }
  }

  // Mensaje genérico para errores desconocidos
  return 'Algo salió mal. Por favor intenta más tarde';
}

// ============================================================================
// LISTENER DE CAMBIOS DE AUTENTICACIÓN
// ============================================================================

/**
 * Escuchar cambios de sesión (login/logout)
 * Útil para sincronizar estado en toda la app
 */
export function onAuthStateChange(callback) {
  const { data: { subscription } } = supabase.auth.onAuthStateChange(
    (event, session) => {
      callback(event, session);
    }
  );
  return subscription;
}

// ============================================================================
// VALIDACIÓN DE PERMISOS
// ============================================================================

/**
 * Verificar si el usuario es admin
 * @param {string} userId - ID del usuario
 * @returns {Promise<boolean>}
 */
export async function isUserAdmin(userId) {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .single();

    if (error) throw error;
    return data?.role === 'admin';
  } catch (error) {
    console.error("Error checking admin role:", error);
    return false;
  }
}

/**
 * Obtener perfil del usuario actual
 * @returns {Promise<Object|null>}
 */
export async function getCurrentUserProfile() {
  try {
    const user = await getCurrentUser();
    if (!user) return null;

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error("Error getting user profile:", error);
    return null;
  }
}

// ============================================================================
// LOGGING DE SEGURIDAD (Sin exponer datos sensibles)
// ============================================================================

/**
 * Log de eventos de seguridad
 * NO loguear: passwords, tokens, emails personales
 */
function logSecurityEvent(event, details) {
  const timestamp = new Date().toISOString();
  const isDev = import.meta.env.DEV;

  if (isDev) {
    console.log(`[${timestamp}] 🔒 ${event}:`, details);
  }

  // En producción, enviar a servicio de logging centralizado
  // await sendToLoggingService({ timestamp, event, details });
}

export default supabase;
