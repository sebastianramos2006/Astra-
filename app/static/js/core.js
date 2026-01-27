// /static/js/core.js
(function () {
  const A = (window.ASTRA = window.ASTRA || {});
  A.state = A.state || {};

  A.qs = (sel, root = document) => root.querySelector(sel);

  // --------------------------
  // Auth storage
  // --------------------------
  A.auth = {
    get() {
      try {
        return (
          localStorage.getItem("access_token") ||
          sessionStorage.getItem("access_token") ||
          null
        );
      } catch {
        return null;
      }
    },
    set(token, persist = true) {
      try {
        if (persist) localStorage.setItem("access_token", token);
        else sessionStorage.setItem("access_token", token);
      } catch {}
    },
    clear() {
      try {
        localStorage.removeItem("access_token");
        sessionStorage.removeItem("access_token");
      } catch {}
    },
  };

  // --------------------------
  // JWT helpers
  // --------------------------
  function b64UrlToJson(b64url) {
    const b64 = String(b64url).replace(/-/g, "+").replace(/_/g, "/");
    const pad = b64.length % 4;
    const padded = pad ? b64 + "=".repeat(4 - pad) : b64;
    const json = atob(padded);
    try {
      return decodeURIComponent(
        Array.prototype.map
          .call(json, (c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
          .join("")
      );
    } catch {
      return json;
    }
  }

  A.parseJwt = function (token) {
    try {
      const t = token || A.auth.get();
      if (!t) return null;
      const parts = String(t).split(".");
      if (parts.length !== 3) return null;
      const payloadStr = b64UrlToJson(parts[1]);
      return JSON.parse(payloadStr);
    } catch {
      return null;
    }
  };

  // --------------------------
  // Role normalization
  // --------------------------
  A.getRoleRaw = function () {
    const p = A.parseJwt();
    return (p?.rol || p?.role || "").toString().trim();
  };

  // backend: admin | cliente
  // frontend: admin | ies
  A.getRole = function () {
    const r = (A.getRoleRaw() || "").toLowerCase();
    if (r === "admin") return "admin";
    if (r === "cliente" || r === "ies" || r === "institucion" || r === "institution")
      return "ies";
    return r || "";
  };

  A.isAdmin = () => A.getRole() === "admin";
  A.isIES = () => A.getRole() === "ies";

  // --------------------------
  // ✅ Session context (IES) — robust (NO /auth/me)
  // - Evita 404 de /auth/me
  // - Deriva ies_slug desde el JWT (si existe)
  // - Mantiene compatibilidad con planner.js y módulos viejos vía localStorage
  // --------------------------
  function pickIesSlugFromPayload(p) {
    const slug =
      p?.ies_slug ||
      p?.iesSlug ||
      p?.ies ||
      p?.ies_code ||
      p?.iesCode ||
      p?.institucion_slug ||
      p?.institution_slug ||
      p?.org_slug ||
      p?.orgSlug ||
      "";

    return (slug || "").toString().trim();
  }

  function pickIesIdFromPayload(p) {
    const v = p?.ies_id ?? p?.iesId ?? p?.iesID ?? null;
    const n = v === null || v === undefined ? null : Number(v);
    return Number.isFinite(n) ? n : null;
  }

  function persistSessionContext({ rol = "", ies_slug = "", ies_id = null } = {}) {
    try {
      localStorage.setItem("rol", String(rol || ""));
      localStorage.setItem("ies_slug", String(ies_slug || ""));
      localStorage.setItem("ies_id", ies_id === null ? "" : String(ies_id));
    } catch {}

    A.state.rol = String(rol || "");
    A.state.ies_slug = String(ies_slug || "");
    A.state.ies_id = ies_id === null ? null : Number(ies_id);
  }

  A.refreshSession = async function () {
    const token = A.auth.get();
    if (!token) return null;

    const p = A.parseJwt(token) || null;
    const rol = A.getRole(); // admin | ies

    // Guardar rol siempre
    const ies_slug = rol === "ies" ? pickIesSlugFromPayload(p || {}) : "";
    const ies_id = rol === "ies" ? pickIesIdFromPayload(p || {}) : null;

    persistSessionContext({ rol, ies_slug, ies_id });

    // ✅ NO llamamos /auth/me (no existe en tu backend)
    return { rol, ies_slug, ies_id, from: "jwt" };
  };

  A.getIesSlug = function () {
    if (A.state?.ies_slug) return A.state.ies_slug;
    try {
      return localStorage.getItem("ies_slug") || "";
    } catch {
      return "";
    }
  };

  A.getIesId = function () {
    if (A.state?.ies_id) return A.state.ies_id;
    try {
      const v = localStorage.getItem("ies_id") || "";
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    } catch {
      return null;
    }
  };

  A.clearSessionContext = function () {
    try {
      localStorage.removeItem("ies_slug");
      localStorage.removeItem("rol");
      localStorage.removeItem("ies_id");
    } catch {}
    try {
      delete A.state.ies_slug;
      delete A.state.rol;
      delete A.state.ies_id;
    } catch {}
  };

  // --------------------------
  // Guard
  // --------------------------
  A.requireAuth = function () {
    const t = A.auth.get();
    if (!t || String(t).split(".").length !== 3) {
      const next = encodeURIComponent(location.pathname + location.search);
      location.replace("/login?next=" + next);
      return false;
    }
    return true;
  };

  // --------------------------
  // Logout
  // --------------------------
  A.logout = function () {
    A.auth.clear();
    A.clearSessionContext();
    try {
      A.state = {};
    } catch {}
    window.location.replace("/login");
  };

  function wireLogout() {
    const btn = document.getElementById("btnLogout");
    if (!btn) return;
    if (btn.dataset.wired === "1") return;
    btn.dataset.wired = "1";
    btn.addEventListener("click", (ev) => {
      ev.preventDefault();
      A.logout();
    });
  }

  document.addEventListener("DOMContentLoaded", wireLogout);
  document.addEventListener("click", (ev) => {
    const el = ev.target?.closest?.("[data-logout='1']");
    if (!el) return;
    ev.preventDefault();
    A.logout();
  });

  // --------------------------
  // ✅ Toast system (Astra)
  // --------------------------
  const ASTRA_IMG = "/static/img/astra.png";
  const HOST_ID = "astraToasts";

  function ensureToastHost() {
    let host = document.getElementById(HOST_ID);
    if (!host) {
      host = document.createElement("div");
      host.id = HOST_ID;
      host.className = "astra-toasts";
      host.setAttribute("aria-live", "polite");
      host.setAttribute("aria-atomic", "true");
      document.body.appendChild(host);
    }
    return host;
  }

  function safeHtml(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  async function copyToClipboard(text) {
    const t = String(text ?? "");
    try {
      await navigator.clipboard.writeText(t);
      return true;
    } catch {
      try {
        const ta = document.createElement("textarea");
        ta.value = t;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        const ok = document.execCommand("copy");
        document.body.removeChild(ta);
        return !!ok;
      } catch {
        return false;
      }
    }
  }

  /**
   * A.toast({
   *   type: "success" | "info" | "warn" | "error",
   *   title: string,
   *   message: string,
   *   timeout: ms (default 5200), // sticky=true no se cierra solo
   *   sticky: boolean,
   *   actions: [{ label, onClick }]
   * })
   */
  A.toast = function ({
    type = "info",
    title = "ASTRA",
    message = "",
    timeout = 5200,
    sticky = false,
    actions = [],
  } = {}) {
    const host = ensureToastHost();

    const el = document.createElement("div");
    el.className = `astra-toast astra-toast--${type}`;

    const close = () => {
      el.style.opacity = "0";
      el.style.transform = "translateY(8px)";
      setTimeout(() => el.remove(), 160);
    };

    el.innerHTML = `
      <div class="astra-toast__row">
        <img class="astra-toast__img" src="${ASTRA_IMG}" alt="Astra" />
        <div>
          <div class="astra-toast__title">${safeHtml(title)}</div>
          <div class="astra-toast__msg">${safeHtml(message)}</div>
        </div>
        <button class="astra-toast__close" aria-label="Cerrar">✕</button>
      </div>
      <div class="astra-toast__actions" style="display:${actions?.length ? "flex" : "none"}"></div>
    `;

    el.querySelector(".astra-toast__close")?.addEventListener("click", close);

    const actionsBox = el.querySelector(".astra-toast__actions");
    (actions || []).forEach((a) => {
      const b = document.createElement("button");
      b.className = "astra-toast__btn";
      b.type = "button";
      b.textContent = a.label || "Acción";
      b.addEventListener("click", async () => {
        try {
          await a.onClick?.();
        } catch {}
      });
      actionsBox.appendChild(b);
    });

    host.appendChild(el);

    if (!sticky) setTimeout(close, Math.max(1500, Number(timeout) || 5200));
    return { close };
  };

  // helper: toast credenciales con copiar
  A.toastCreds = function ({ email, password, title = "Credenciales provisionales" } = {}) {
    const msg = `${email ? "Email: " + email : ""}${email && password ? "\n" : ""}${
      password ? "Clave: " + password : ""
    }`.trim();
    return A.toast({
      type: "success",
      title,
      message: msg || "Listo ✓",
      sticky: true,
      actions: [
        email
          ? {
              label: "Copiar email",
              onClick: async () => {
                const ok = await copyToClipboard(email);
                A.toast({
                  type: ok ? "success" : "warn",
                  title: "Copiar",
                  message: ok ? "Email copiado ✓" : "No pude copiar",
                });
              },
            }
          : null,
        password
          ? {
              label: "Copiar clave",
              onClick: async () => {
                const ok = await copyToClipboard(password);
                A.toast({
                  type: ok ? "success" : "warn",
                  title: "Copiar",
                  message: ok ? "Clave copiada ✓" : "No pude copiar",
                });
              },
            }
          : null,
        { label: "Cerrar", onClick: async () => {} },
      ].filter(Boolean),
    });
  };

  // --------------------------
  // Mensaje inicial por rol (1 vez por sesión)
  // --------------------------
  function welcomeOnce() {
    const key = "astra_welcome_once";
    try {
      if (sessionStorage.getItem(key) === "1") return;
      sessionStorage.setItem(key, "1");
    } catch {}

    const role = A.getRole();
    if (role === "admin") {
      A.toast({
        type: "info",
        title: "Modo Admin",
        message:
          "Selecciona una IES desde la barra superior para ver su información. Cada institución es independiente.",
        timeout: 6500,
      });
    } else if (role === "ies") {
      A.toast({
        type: "info",
        title: "Modo IES",
        message:
          "Aquí registras evidencias y revisas tu avance. Elige un subprograma y luego un submódulo.",
        timeout: 6500,
      });
    }
  }

  document.addEventListener("DOMContentLoaded", async () => {
    // Si hay token, sincronizamos sesión (sin molestar en /login)
    if (!location.pathname.includes("/login")) {
      const t = A.auth.get();
      if (t && String(t).split(".").length === 3) {
        await A.refreshSession(); // ✅ ahora NO genera 404
        welcomeOnce();
      }
    }
  });

  // --------------------------
  // API wrapper (mejorado)
  // - conserva tu interfaz
  // - agrega status en el error
  // --------------------------
  A.api = async function (path, opts = {}) {
    const token = A.auth.get();

    const isFormData = typeof FormData !== "undefined" && opts.body instanceof FormData;

    const headers = Object.assign(
      isFormData ? {} : { "Content-Type": "application/json" },
      opts.headers || {},
      token ? { Authorization: `Bearer ${token}` } : {}
    );

    const res = await fetch(path, { ...opts, headers });

    const ct = res.headers.get("content-type") || "";
    const readBody = async () => {
      try {
        if (ct.includes("application/json")) return await res.json();
        return await res.text();
      } catch {
        return "";
      }
    };

    const body = await readBody();

    if (!res.ok) {
      const msg =
        (typeof body === "string" && body) ||
        (body?.detail ? (typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail)) : "") ||
        `HTTP ${res.status} ${res.statusText}`;
      const err = new Error(msg);
      err.status = res.status;
      err.body = body;
      throw err;
    }

    return body;
  };
})();
