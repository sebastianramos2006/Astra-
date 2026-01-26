// /static/js/auth.js
document.addEventListener("DOMContentLoaded", () => {
  const LOGIN_ENDPOINT = "/auth/login"; // <-- AJUSTA a tu backend real

  const tabs = Array.from(document.querySelectorAll(".auth-tab"));
  const form = document.getElementById("loginForm");

  const lblUser = document.getElementById("lblUser");
  const email = document.getElementById("email");
  const password = document.getElementById("password");
  const remember = document.getElementById("remember");
  const btnLogin = document.getElementById("btnLogin");
  const msg = document.getElementById("authMsg");

  let mode = "ies"; // "ies" | "admin"

  function setMode(m){
    mode = m;
    tabs.forEach(t => t.classList.toggle("active", t.dataset.mode === m));

    if (lblUser) lblUser.textContent = (m === "admin") ? "Correo admin" : "Correo institucional";
    if (email) email.placeholder = (m === "admin") ? "admin@astra.cedepro.com" : "ies@institucion.edu.ec";
  }

  function showMsg(text){
    if (!msg) return;
    msg.textContent = text;
    msg.classList.remove("hidden");
  }

  function hideMsg(){
    msg?.classList.add("hidden");
  }

  function parseJwt(token){
    try{
      const payload = token.split(".")[1];
      const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
      return JSON.parse(decodeURIComponent(escape(json)));
    } catch(e){
      return null;
    }
  }

  async function loginRequest(user, pass){
    const res = await fetch(LOGIN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type":"application/json" },
      body: JSON.stringify({
        email: user,
        password: pass,
        // opcional: el backend puede ignorarlo, pero sirve para validar modo
        mode
      })
    });

    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error(t || `Login falló (${res.status})`);
    }
    return await res.json();
  }

  tabs.forEach(t => t.addEventListener("click", () => setMode(t.dataset.mode)));

  form?.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    hideMsg();

    const user = (email?.value || "").trim();
    const pass = (password?.value || "").trim();

    if (!user || !pass) {
      showMsg("Completa correo y contraseña.");
      return;
    }

    btnLogin.disabled = true;
    const old = btnLogin.textContent;
    btnLogin.textContent = "Entrando…";

    try{
      const data = await loginRequest(user, pass);
      const token = data?.access_token || data?.token;
      if (!token) throw new Error("El backend no devolvió access_token.");

      const p = parseJwt(token);
      const rol = (p?.rol || p?.role || "").toLowerCase();

      // Guardar token
      const storage = remember?.checked ? localStorage : sessionStorage;
      storage.setItem("access_token", token);

      // Redirigir
      // (tu /app ya hace guard temprano + requireAuth)
      window.location.replace("/app");
    } catch(e){
      console.error(e);
      showMsg("No se pudo iniciar sesión. Verifica credenciales o endpoint.");
    } finally{
      btnLogin.disabled = false;
      btnLogin.textContent = old || "Entrar";
    }
  });

  // default
  setMode("ies");
});
