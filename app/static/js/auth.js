// /static/js/auth.js
document.addEventListener("DOMContentLoaded", () => {
  const LOGIN_ENDPOINT = "/auth/login";

  const tabs = Array.from(document.querySelectorAll(".auth-tab"));
  const form = document.getElementById("loginForm");

  const lblUser = document.getElementById("lblUser");
  const email = document.getElementById("email");
  const password = document.getElementById("password");
  const remember = document.getElementById("remember");
  const btnLogin = document.getElementById("btnLogin");
  const msg = document.getElementById("authMsg");

  let mode = "ies"; // "ies" | "admin"

  function setMode(m) {
    mode = m;
    tabs.forEach((t) => t.classList.toggle("active", t.dataset.mode === m));

    if (lblUser) lblUser.textContent = m === "admin" ? "Correo admin" : "Correo institucional";
    if (email) email.placeholder = m === "admin" ? "admin@cedepro.com" : "ies@institucion.edu.ec";
  }

  function showMsg(text) {
    if (!msg) return;
    msg.textContent = text;
    msg.classList.remove("hidden");
  }

  function hideMsg() {
    msg?.classList.add("hidden");
  }

  async function loginRequest(user, pass) {
    const res = await fetch(LOGIN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: user,
        password: pass,
        mode, // opcional: el backend puede ignorarlo
      }),
    });

    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error(t || `Login falló (${res.status})`);
    }
    return await res.json();
  }

  tabs.forEach((t) => t.addEventListener("click", () => setMode(t.dataset.mode)));

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

    try {
      const data = await loginRequest(user, pass);
      const token = data?.access_token || data?.token;
      if (!token) throw new Error("El backend no devolvió access_token.");

      // ✅ Guardar token usando el core.js (evita estados mezclados)
      const A = window.ASTRA;
      const persist = !!remember?.checked;
      if (A?.auth?.set) A.auth.set(token, persist);
      else {
        const storage = persist ? localStorage : sessionStorage;
        storage.setItem("access_token", token);
      }

      // ✅ CRÍTICO: sincroniza ies_slug/rol desde backend
      if (A?.refreshSession) {
        await A.refreshSession();
      } else {
        // fallback mínimo si core.js aún no cargó (raro, pero safe)
        try {
          const res = await fetch("/auth/me", {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (res.ok) {
            const me = await res.json();
            localStorage.setItem("ies_slug", me?.ies_slug || "");
            localStorage.setItem("rol", me?.rol || "");
          }
        } catch {}
      }

      // ✅ Redirigir (ya con contexto correcto)
      window.location.replace("/app");
    } catch (e) {
      console.error(e);
      showMsg("No se pudo iniciar sesión. Verifica credenciales o endpoint.");
    } finally {
      btnLogin.disabled = false;
      btnLogin.textContent = old || "Entrar";
    }
  });

  // default
  setMode("ies");
});
