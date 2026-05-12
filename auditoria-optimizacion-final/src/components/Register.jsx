import { useState } from "react";
import { supabase } from "../supabaseClient";
import { useNavigate } from "react-router-dom";

// ❶ CLAVE EXPUESTA EN CÓDIGO FUENTE
// 🔴 Crítica — service_role key nunca debe estar en el cliente
const ADMIN_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...";


export default function Register() {
  const [formData, setFormData] = useState({
    name: "", email: "", password: "", role: "user"
  });
  const [error, setError] = useState("");
  const navigate = useNavigate();

  // ❷ SIN VALIDACIÓN NI SANITIZACIÓN DEL INPUT
  const handleChange = (e) => {
    // 🔴 Crítica — el campo 'role' permite que el usuario se asigne admin
    setFormData({ ...formData, [e.target.name]: e.target.value });

  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // ❸ SIN VALIDACIÓN DE CONTRASEÑA
    // 🟡 Media — acepta passwords de 1 carácter
    if (!formData.email || !formData.password) {
      setError("Campos requeridos");
      return;
    }


    const { data, error } = await supabase.auth.signUp({
      email: formData.email,
      password: formData.password,
    });

    // ❹ INSERCIÓN DIRECTA CON ROL CONTROLADO POR EL USUARIO
    // 🔴 Crítica — el cliente decide su propio rol (privilege escalation)
    if (data.user) {
      await supabase.from("profiles").insert({
        id: data.user.id,
        name: formData.name,
        role: formData.role, // 💀 el usuario puede enviar role:"admin"
      });
    }


    // ❺ MENSAJE DE ERROR REVELA INFORMACIÓN INTERNA
    // 🟡 Media — expone detalles del stack/DB al usuario
    if (error) setError(error.message);


    navigate("/dashboard");
  };

  return (
    <form onSubmit={handleSubmit}>
      <h2>Crear cuenta</h2>

      // ❻ XSS — renderizado peligroso de mensajes sin sanitizar
      // 🔴 Crítica — dangerouslySetInnerHTML con datos no controlados
      {error && <div dangerouslySetInnerHTML={{ __html: error }} />}


      <input name="name"     placeholder="Nombre"    onChange={handleChange} />
      <input name="email"    placeholder="Email"     onChange={handleChange} />
      <input name="password" placeholder="Password"  onChange={handleChange} type="password" />

      // ❼ CAMPO OCULTO QUE ACEPTA ROL — JAMÁS exponer en el cliente
      // 🔴 Crítica — un atacante puede manipular el valor con DevTools
      <select name="role" onChange={handleChange}>
        <option value="user">Usuario</option>
        <option value="admin">Administrador</option>
      </select>


      <button type="submit">Registrarse</button>
    </form>
  );
}