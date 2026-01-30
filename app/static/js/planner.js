// /static/js/planner.js
document.addEventListener("DOMContentLoaded", async () => {
  // ============================================================
  // ASTRA namespace
  // ============================================================
  const A = (window.ASTRA = window.ASTRA || {});
  A.state = A.state || {};

  // ============================================================
  // Utils base
  // ============================================================
  const qs = A.qs
    ? (sel, root = document) => A.qs(sel, root)
    : (sel, root = document) => root.querySelector(sel);

  function normalize(s) {
    return (s || "")
      .toString()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
  }

  function escapeHtml(str) {
    return (str || "")
      .toString()
      .replace(/[&<>"']/g, (m) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      }[m]));
  }

  function safeJsonParse(s) {
    try {
      return JSON.parse(s);
    } catch {
      return null;
    }
  }

  function getToken() {
    try {
      return (
        localStorage.getItem("access_token") ||
        sessionStorage.getItem("access_token") ||
        ""
      );
    } catch {
      return "";
    }
  }

  function isJwtLike(t) {
    return !!(t && String(t).split(".").length === 3);
  }
  // ============================================================
  // Auth gate
  // ============================================================
  if (A?.requireAuth && !A.requireAuth()) return;

  // ============================================================
  // Fallbacks IMPORTANTES (no pisan si ya existen en core.js)
  // ============================================================
  if (typeof A.parseJwt !== "function") {
    A.parseJwt = function () {
      const t = getToken();
      if (!isJwtLike(t)) return null;
      try {
        const payload = t.split(".")[1];
        const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
        return safeJsonParse(json);
      } catch {
        return null;
      }
    };
  }

  if (typeof A.getRoleRaw !== "function") {
    A.getRoleRaw = function () {
      const p = A.parseJwt?.();
      return p?.role || p?.rol || p?.tipo || p?.perfil || "";
    };
  }

  if (typeof A.getRole !== "function") {
    A.getRole = function () {
      const r0 = A.getRoleRaw?.() || "";
      const r = String(r0).toLowerCase().trim();
      if (r === "admin") return "admin";
      if (r === "cliente" || r === "ies") return "ies";
      return r;
    };
  }

  // NO pisar A.api si ya existe (core.js)
  if (typeof A.api !== "function") {
    A.api = async function (path, opts = {}) {
      const url = path.startsWith("http") ? path : `${path}`;

      const headers = new Headers(opts.headers || {});
      if (!headers.has("Content-Type") && opts.method && opts.method !== "GET") {
        headers.set("Content-Type", "application/json");
      }

      const t = getToken();
      if (t && !headers.has("Authorization")) headers.set("Authorization", `Bearer ${t}`);

      const res = await fetch(url, { ...opts, headers });

      const ct = res.headers.get("content-type") || "";
      const body = ct.includes("application/json")
        ? await res.json().catch(() => null)
        : await res.text().catch(() => "");

      if (!res.ok) {
        const msg =
          (body && typeof body === "object" && (body.detail || body.message)) ||
          (typeof body === "string" && body) ||
          `HTTP ${res.status}`;
        const err = new Error(msg);
        err.status = res.status;
        err.body = body;
        throw err;
      }
      return body;
    };
  }

  // ============================================================
  //  IMPORTANTE: sincroniza sesión YA
  // ============================================================
  try {
    if (typeof A.refreshSession === "function") {
      await A.refreshSession();
    }
  } catch (e) {
    console.warn("refreshSession falló:", e);
  }
// ============================================================
//  Toast COMPAT (planner.js -> core.js)
// ============================================================
function toastCompat({
  title = "ASTRA",
  msg = "",
  message = "",
  type = "info",
  ms = 5200,
  timeout = null,
  sticky = false,
  actions = [],
} = {}) {
  const map = { info: "info", success: "success", warning: "warn", danger: "error" };

  const finalMessage = (message || msg || "").toString();
  const finalTimeout = timeout ?? ms;

  // usa el toast real del core si existe
  if (typeof A.toast === "function") {
    return A.toast({
      type: map[type] || "info",
      title,
      message: finalMessage,
      timeout: finalTimeout,
      sticky,
      actions,
    });
  }

  // fallback si por alguna razón no hay core.js
  console.log(`[${type}] ${title}: ${finalMessage}`);
}


  // ============================================================
  // DOM
  // ============================================================
  const field = qs("#subprogramasField");
  const searchSubp = qs("#searchSubp");
  const btnReset = qs("#btnReset");

  const adminIesBar = qs("#adminIesBar");
  const iesSearch = qs("#iesSearch");
  const iesSelect = qs("#iesSelect");
  const userActive = qs("#userActive");

  const btnResumenGlobal = qs("#btnResumenGlobal");
  const btnLogout = qs("#btnLogout");

  const operativaPanel = qs("#operativaPanel");
  const resumenPanel = qs("#resumenPanel");

const canvasEl = document.getElementById("submodsCanvas");
const canvas =
  canvasEl && window.bootstrap?.Offcanvas
    ? window.bootstrap.Offcanvas.getOrCreateInstance(canvasEl)
    : null;


  const submodsMeta = qs("#submodsMeta");
  const submodsTitle = qs("#submodsCanvasLabel");
  const submodulosList = qs("#submodulosList");
  const searchSubm = qs("#searchSubm");
  const btnVerResumen = qs("#btnVerResumen");

  const constellation = document.querySelector(".constellation");

// ============================================================
//  Coach Astra (TOUR 4 pasos + 4 imagenes) - Admin + IES (V4)
//  FIXES:
//  - NO inyecta CSS (usa planner.css)
//  - expone showCoach/hideCoach/shouldAutoCoach (evita ReferenceError)
//  - limpia coaches viejos / evita duplicados
//  - posiciona Astra sin tapar burbuja
//  - auto-onboarding solo 1 vez + boton Guia
// ============================================================
(function AstraCoachV4() {
  if (window.__astraCoachV4) return;
  window.__astraCoachV4 = true;

  const A = (window.ASTRA = window.ASTRA || {});
  const COACH_KEY = "astra_onboarding_v2_done";

  // Limpia restos de versiones anteriores
  try {
    document.querySelectorAll(".astra-coach").forEach((n) => n.remove());
    const oldStyle = document.getElementById("astraCoachStylesV3");
    if (oldStyle) oldStyle.remove();
  } catch {}

  let coach = null;
  let coachTimer = null;
  let coachStep = 0;
  let coachLastTarget = null;

  // --------------------------
  // Helpers visibles/targets
  // --------------------------
  function qs(sel) { return document.querySelector(sel); }

  function isVisible(el) {
    if (!el) return false;
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || cs.opacity === "0") return false;
    const rects = el.getClientRects();
    return rects && rects.length > 0;
  }

  function pickTarget(candidates = []) {
    for (const c of candidates) {
      const el = typeof c === "string" ? qs(c) : c;
      if (el && isVisible(el)) return el;
    }
    return null;
  }

  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

  function scrollIntoViewSmart(el) {
    try {
      el.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
    } catch {}
  }

  // --------------------------
  // Role safe
  // --------------------------
  function getRoleSafe() {
    try {
      if (typeof A.getRole === "function") {
        const r = String(A.getRole() || "").toLowerCase().trim();
        if (r) return r;
      }
    } catch {}
    // fallback suave
    const role = String(A?.state?.user?.role || A?.state?.role || "").toLowerCase().trim();
    return role || "ies";
  }

  // --------------------------
  // Coach DOM
  // --------------------------
  function ensureCoach() {
    if (coach) return coach;

    const root = document.createElement("div");
    root.className = "astra-coach";
    root.style.display = "none";

    const dim = document.createElement("div");
    dim.className = "astra-coach__dim";
    dim.addEventListener("click", () => hideCoach(false));

    const line = document.createElement("div");
    line.className = "astra-coach__line";

    const dot = document.createElement("div");
    dot.className = "astra-coach__dot";

    const img = document.createElement("img");
    img.className = "astra-coach__img";
    img.alt = "Astra";

    const bubble = document.createElement("div");
    bubble.className = "astra-coach__bubble";
    bubble.innerHTML = `
      <div class="astra-coach__title">
        <span>Astra</span>
        <button class="astra-coach__close" title="Cerrar">×</button>
      </div>

      <div class="astra-coach__msg">…</div>

      <div class="astra-coach__footer">
        <button type="button" class="astra-coach__btn astra-coach__back">Atras</button>
        <div class="astra-coach__dots">1/4</div>
        <button type="button" class="astra-coach__btn astra-coach__btn--primary astra-coach__next">Siguiente</button>
      </div>
    `;

    bubble.querySelector(".astra-coach__close")?.addEventListener("click", () => hideCoach(true));
    bubble.querySelector(".astra-coach__back")?.addEventListener("click", () => tourPrev());
    bubble.querySelector(".astra-coach__next")?.addEventListener("click", () => tourNext());

    root.appendChild(dim);
    root.appendChild(line);
    root.appendChild(dot);
    root.appendChild(img);
    root.appendChild(bubble);
    document.body.appendChild(root);

    coach = {
      root, dim, line, dot, img, bubble,
      msg: bubble.querySelector(".astra-coach__msg"),
      dots: bubble.querySelector(".astra-coach__dots"),
      btnBack: bubble.querySelector(".astra-coach__back"),
      btnNext: bubble.querySelector(".astra-coach__next"),
      _cleanup: null,
    };

    return coach;
  }

  // --------------------------
  // Poses / assets
  // --------------------------
  function setCoachPose(pose = "point") {
    const c = ensureCoach();

    const mapPose = {
      saludo: "/static/img/astra_saludo.png",
      point: "/static/img/astra_point.png",
      checklist: "/static/img/astra_checklist.png",
      exit: "/static/img/astra_exit.png",
    };

    // fallback chain
    const trySrc = (src, fallback1, fallback2) => {
      c.img.onerror = null;
      c.img.src = src;
      c.img.onerror = () => {
        c.img.onerror = null;
        c.img.src = fallback1;
        c.img.onerror = () => {
          c.img.onerror = null;
          c.img.src = fallback2;
        };
      };
    };

    const src = mapPose[pose] || mapPose.point;
    trySrc(src, "/static/img/astra.png", "/static/img/astra.jpg");

    // Ajuste tamaño seguro (evita "gigante")
    const vw = Math.max(320, window.innerWidth || 1200);
    const base = pose === "point" ? 420 : pose === "checklist" ? 400 : 390;
    const maxW = vw < 520 ? 260 : vw < 900 ? 340 : 420;
    c.img.style.width = `${Math.min(base, maxW)}px`;
  }

  // --------------------------
  // Highlight target
  // --------------------------
  function clearCoachTargetHighlight() {
    if (coachLastTarget) coachLastTarget.classList.remove("astra-coach--target");
    coachLastTarget = null;
  }

  function applyCoachTargetHighlight(targetEl) {
    clearCoachTargetHighlight();
    if (!targetEl) return;
    targetEl.classList.add("astra-coach--target");
    coachLastTarget = targetEl;
  }

  // --------------------------
  // Positioning (burbuja + linea + astra)
  // --------------------------
  function positionCoachToTarget(targetEl) {
    const c = ensureCoach();
    const pad = 10;

    if (!targetEl || !isVisible(targetEl)) return;

    const r = targetEl.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;

    // medir burbuja real
    c.bubble.style.visibility = "hidden";
    c.bubble.style.left = `${pad}px`;
    c.bubble.style.top = `${pad}px`;
    const bw = c.bubble.offsetWidth || 280;
    const bh = c.bubble.offsetHeight || 140;
    c.bubble.style.visibility = "visible";

    // opciones alrededor del target
    const candidates = [
      { name: "right",  x: r.right + 14,     y: cy - bh / 2 },
      { name: "left",   x: r.left - bw - 14, y: cy - bh / 2 },
      { name: "bottom", x: cx - bw / 2,      y: r.bottom + 14 },
      { name: "top",    x: cx - bw / 2,      y: r.top - bh - 14 },
    ];

    const fits = (x, y) =>
      x >= pad &&
      y >= pad &&
      x + bw <= window.innerWidth - pad &&
      y + bh <= window.innerHeight - pad;

    const chosen = candidates.find(o => fits(o.x, o.y)) || candidates[0];

    const bx = clamp(chosen.x, pad, window.innerWidth - bw - pad);
    const by = clamp(chosen.y, pad, window.innerHeight - bh - pad);

    c.bubble.style.left = `${bx}px`;
    c.bubble.style.top = `${by}px`;

    // punto en target
    c.dot.style.left = `${cx - 5}px`;
    c.dot.style.top = `${cy - 5}px`;

    // linea: del centro burbuja al target
    const bcx = bx + bw / 2;
    const bcy = by + bh / 2;
    const dx = cx - bcx;
    const dy = cy - bcy;
    const ang = Math.atan2(dy, dx);
    const len = Math.max(40, Math.hypot(dx, dy) - 18);

    c.line.style.left = `${bcx}px`;
    c.line.style.top = `${bcy}px`;
    c.line.style.width = `${len}px`;
    c.line.style.transform = `rotate(${ang}rad)`;

    // Astra en el lado OPUESTO a la burbuja para no taparla
    const imgW = parseFloat(getComputedStyle(c.img).width) || 360;
    const imgH = imgW * 1.05;

    let ax = cx;
    let ay = cy;

    // offsets suaves (no "tapa" burbuja)
    const offX = imgW * 0.75;
    const offY = imgH * 0.25;

    if (chosen.name === "right") { ax = cx - offX; ay = cy + offY; }
    if (chosen.name === "left")  { ax = cx + offX; ay = cy + offY; }
    if (chosen.name === "top")   { ax = cx - offX * 0.35; ay = cy + imgH * 0.60; }
    if (chosen.name === "bottom"){ ax = cx - offX * 0.35; ay = cy - imgH * 0.35; }

    // permite un poco afuera, pero controlado
    ax = clamp(ax, -60, window.innerWidth + 60);
    ay = clamp(ay, -60, window.innerHeight + 60);

    c.img.style.left = `${ax}px`;
    c.img.style.top = `${ay}px`;
  }

  // --------------------------
  // Public show/hide (NECESARIO para showOnly/INIT)
  // --------------------------
  function showCoach({ target, text, pose = "point", step = 1, total = 4, autoCloseMs = 0 } = {}) {
    const c = ensureCoach();

    // cleanup previo
    c._cleanup?.();
    c._cleanup = null;

    clearTimeout(coachTimer);

    if (!target || !isVisible(target)) return;

    setCoachPose(pose);
    c.msg.textContent = text || "";
    c.dots.textContent = `${step}/${total}`;
    c.btnBack.disabled = step <= 1;
    c.btnNext.textContent = step >= total ? "Finalizar" : "Siguiente";

    c.root.style.display = "block";
    applyCoachTargetHighlight(target);

    scrollIntoViewSmart(target);

    requestAnimationFrame(() => positionCoachToTarget(target));

    const onMove = () => {
      if (c.root.style.display !== "block") return;
      if (!coachLastTarget) return;
      positionCoachToTarget(coachLastTarget);
    };

    window.addEventListener("resize", onMove, { passive: true });
    window.addEventListener("scroll", onMove, { passive: true });

    c._cleanup = () => {
      window.removeEventListener("resize", onMove);
      window.removeEventListener("scroll", onMove);
    };

    if (autoCloseMs && autoCloseMs > 0) {
      coachTimer = setTimeout(() => hideCoach(false), autoCloseMs);
    }
  }

  function hideCoach(markDone = false) {
    if (!coach) return;
    clearTimeout(coachTimer);

    coach.root.style.display = "none";
    coach._cleanup?.();
    coach._cleanup = null;

    clearCoachTargetHighlight();

    if (markDone) {
      try { localStorage.setItem(COACH_KEY, "1"); } catch {}
    }
  }

  function shouldAutoCoach() {
    try { return localStorage.getItem(COACH_KEY) !== "1"; } catch { return true; }
  }

  // Exporta para el resto de planner.js (evita ReferenceError)
  A.showCoach = showCoach;
  A.hideCoach = hideCoach;
  A.shouldAutoCoach = shouldAutoCoach;

  // Back-compat (tu archivo llama showCoach/hideCoach/shouldAutoCoach directo)
  window.showCoach = showCoach;
  window.hideCoach = hideCoach;
  window.shouldAutoCoach = shouldAutoCoach;

  // --------------------------
  // TOUR (4 pasos)
  // --------------------------
  function tryOpenOffcanvas(offcanvasEl) {
    if (!offcanvasEl) return;
    try {
      if (window.bootstrap?.Offcanvas) {
        window.bootstrap.Offcanvas.getOrCreateInstance(offcanvasEl).show();
      }
    } catch {}
    try { offcanvasEl.classList.add("show"); } catch {}
  }

  function getTourSteps() {
    const role = getRoleSafe();

    const field = document.getElementById("subprogramasField");
    const firstSubp = field?.querySelector(".subp-node");
    const adminBar = document.getElementById("adminIesBar");
    const iesSelect = document.getElementById("iesSelect");
    const btnResumenGlobal = document.getElementById("btnResumenGlobal");
    const btnVerResumen = document.getElementById("btnVerResumen");
    const offcanvas = document.getElementById("submodsCanvas") || document.getElementById("submodulosList");

    if (role === "admin") {
      return [
        {
          pose: "saludo",
          text: "Hola 👋 Soy Astra. Te guio en 4 pasos.",
          target: () => pickTarget([iesSelect, "#iesSelect", adminBar, "#adminIesBar", ".astra-brand"]),
        },
        {
          pose: "point",
          text: "Paso 1: selecciona una IES para ver y gestionar su informacion.",
          target: () => pickTarget([iesSelect, "#iesSelect", adminBar, "#adminIesBar"]),
        },
        {
          pose: "checklist",
          text: "Paso 2: abre el Resumen general para revisar avance y evidencias.",
          target: () => pickTarget([btnResumenGlobal, "#btnResumenGlobal"]),
        },
        {
          pose: "exit",
          text: "Listo. Si quieres ver esta guia otra vez, usa el boton Guia.",
          target: () => pickTarget(["#btnGuide", btnResumenGlobal, ".astra-brand"]),
        },
      ];
    }

    // IES
    return [
      {
        pose: "saludo",
        text: "Hola 👋 Soy Astra. Te muestro como usar ASTRA en 4 pasos.",
        target: () => pickTarget(["#subprogramasField .subp-node", firstSubp, field, ".astra-brand"]),
      },
      {
        pose: "point",
        text: "Paso 1: haz clic en un subprograma para ver sus submodulos.",
        target: () => pickTarget(["#subprogramasField .subp-node", firstSubp, field]),
      },
      {
        pose: "checklist",
        text: "Paso 2: se abre el panel derecho. Elige un submodulo para registrar evidencias.",
        before: () => {
          if (firstSubp) { try { firstSubp.click(); } catch {} }
          tryOpenOffcanvas(document.getElementById("submodsCanvas"));
        },
        target: () => pickTarget([offcanvas, "#submodsCanvas", "#submodulosList"]),
      },
      {
        pose: "exit",
        text: "Paso 3: usa 'Ver resumen' para revisar el avance cuando quieras.",
        target: () => pickTarget([btnVerResumen, "#btnVerResumen", offcanvas, field]),
      },
    ];
  }

  function renderTourStep() {
    const steps = getTourSteps();
    const total = steps.length;
    const s = steps[Math.max(0, Math.min(coachStep, total - 1))];

    try { s.before?.(); } catch {}

    setTimeout(() => {
      const target = (typeof s.target === "function") ? s.target() : s.target;
      showCoach({
        target,
        pose: s.pose,
        text: s.text,
        step: coachStep + 1,
        total,
      });
    }, 80);
  }

  function tourStart() {
    coachStep = 0;
    renderTourStep();
  }

  function tourNext() {
    const steps = getTourSteps();
    if (coachStep >= steps.length - 1) {
      hideCoach(true);
      return;
    }
    coachStep += 1;
    renderTourStep();
  }

  function tourPrev() {
    if (coachStep <= 0) return;
    coachStep -= 1;
    renderTourStep();
  }

  // API boton "Guia"
  A.openGuide = function () { tourStart(); };

  // Si existe el botón, lo cableamos (sin duplicar)
  const btnGuide = document.getElementById("btnGuide");
  if (btnGuide && !btnGuide.dataset.wiredGuide) {
    btnGuide.dataset.wiredGuide = "1";
    btnGuide.addEventListener("click", (ev) => {
      ev.preventDefault();
      tourStart();
    });
  }

  // Auto onboarding (solo 1 vez)
  function autoStartIfNeeded() {
    if (!shouldAutoCoach()) return;
    setTimeout(() => { try { tourStart(); } catch {} }, 350);
  }

  // Estamos dentro de DOMContentLoaded (planner.js), pero por seguridad:
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", autoStartIfNeeded, { once: true });
  } else {
    autoStartIfNeeded();
  }
})();



  // ============================================================
  // Logout
  // ============================================================
  if (btnLogout && !btnLogout.dataset.wired) {
    btnLogout.dataset.wired = "1";
    btnLogout.addEventListener("click", (ev) => {
      ev.preventDefault();
      if (typeof A.logout === "function") A.logout();
      else {
        try { localStorage.removeItem("access_token"); } catch {}
        try { sessionStorage.removeItem("access_token"); } catch {}
        window.location.replace("/login");
      }
    });
  }

  // ============================================================
  // State
  // ============================================================
  A.state.subprogramas = Array.isArray(A.state.subprogramas) ? A.state.subprogramas : [];
  A.state.submodulos = Array.isArray(A.state.submodulos) ? A.state.submodulos : [];
  A.state.activeSubp = A.state.activeSubp || null;
  A.state.activeSubm = A.state.activeSubm || null;

  A.state.ies = A.state.ies || null;      // {id, slug, nombre, _source, _trusted}
  A.state.iesList = Array.isArray(A.state.iesList) ? A.state.iesList : [];

  // ============================================================
  // Role helpers
  // ============================================================
  function role() {
    const r0 = (typeof A.getRole === "function" ? A.getRole() : A.getRoleRaw?.() || "") || "";
    const r = String(r0).toLowerCase().trim();
    if (r === "admin") return "admin";
    if (r === "cliente" || r === "ies") return "ies";
    return r;
  }
  const isAdmin = () => role() === "admin";
  const isIES = () => role() === "ies";

  function getDisplayName() {
    const p = A.parseJwt?.() || {};
    const raw = p?.nombre || p?.name || p?.usuario || p?.email || "";
    if (!raw) return "👋";
    const s = String(raw);
    if (s.includes("@")) return s.split("@")[0];
    return s;
  }

  function setUserActive(text, show = true) {
    if (!userActive) return;
    userActive.textContent = text || "";
    userActive.classList.toggle("hidden", !show);
  }

  function setAdminBarVisible(showAdminBar) {
    if (!adminIesBar) return;
    adminIesBar.classList.toggle("hidden", !showAdminBar);
  }

  function enforceRoleUI() {
    if (isIES()) {
      setAdminBarVisible(false);
      iesSearch?.classList.add("hidden");
      iesSelect?.classList.add("hidden");
    } else {
      setAdminBarVisible(true);
      iesSearch?.classList.remove("hidden");
      iesSelect?.classList.remove("hidden");
    }
  }

  // ============================================================
  // Admin lock
  // ============================================================
  const isAdminLocked = () => isAdmin() && !A.state?.ies?.id;

  function setHidden(el, hidden) {
    if (!el) return;
    el.classList.toggle("hidden", !!hidden);
    el.style.display = hidden ? "none" : "";
  }

  function cleanupBackdrops() {
    document.querySelectorAll(".offcanvas-backdrop").forEach((b) => b.remove());
    document.body.classList.remove("modal-open");
    document.body.style.overflow = "";
  }

  function forceCloseSubmodsDrawer() {
    try { canvas?.hide(); } catch {}
    if (canvasEl) {
      canvasEl.classList.remove("show");
      canvasEl.style.visibility = "hidden";
      canvasEl.setAttribute("aria-hidden", "true");
    }
    cleanupBackdrops();
  }

  if (canvasEl && !canvasEl.dataset.cleanupBound) {
    canvasEl.dataset.cleanupBound = "1";
    canvasEl.addEventListener("hidden.bs.offcanvas", () => cleanupBackdrops());
  }

  function resetLockedAdminUI() {
    A.state.activeSubp = null;
    A.state.activeSubm = null;
    A.state.submodulos = [];

    forceCloseSubmodsDrawer();
    if (submodulosList) submodulosList.innerHTML = "";
    if (searchSubm) searchSubm.value = "";
    if (btnVerResumen) btnVerResumen.disabled = true;

    if (operativaPanel) operativaPanel.innerHTML = "";
    if (resumenPanel) resumenPanel.innerHTML = "";

    setHidden(operativaPanel, true);
    setHidden(resumenPanel, true);

    if (constellation) setHidden(constellation, true);
    if (field) field.innerHTML = "";
  }

// ============================================================
// showOnly (FIX)
// - NO relanza coach automáticamente aquí
// - Limpia paneles correctamente por rol
// - Home solo renderiza mapa (sin coach)
// ============================================================
function showOnly(panel) {
  // Solo ocultamos coach, pero NO marcamos "done"
  hideCoach(false);

  // Admin sin IES seleccionada: bloquea todo
  if (isAdminLocked()) {
    resetLockedAdminUI();
    return;
  }

  // --------------------------
  // ADMIN
  // --------------------------
  if (isAdmin()) {
    // Admin no usa mapa constelación ni operativa
    if (constellation) setHidden(constellation, true);

    // Limpia el field para que no queden subprogramas visibles
    if (field) field.innerHTML = "";
    if (searchSubp) searchSubp.value = "";

    // Operativa siempre oculta en admin
    setHidden(operativaPanel, true);

    // Solo muestra resumen si panel === "resumen"
    const resumenIsVisible = panel === "resumen";
    setHidden(resumenPanel, !resumenIsVisible);

    // Cierra drawer por si quedó abierto
    forceCloseSubmodsDrawer();

    return;
  }

  // --------------------------
  // IES
  // --------------------------
  const operativaIsVisible = panel === "operativa";
  const resumenIsVisible = panel === "resumen";
  const homeIsVisible = panel === "home";

  setHidden(operativaPanel, !operativaIsVisible);
  setHidden(resumenPanel, !resumenIsVisible);

  // Constelación solo en home
  if (constellation) setHidden(constellation, !homeIsVisible);

  if (homeIsVisible) {
    // Renderiza solo el mapa; NO dispares coach aquí (se maneja en INIT o botón Guía)
    renderSubprogramas();

    // Si quieres, cierra el drawer cuando vuelves a home
    forceCloseSubmodsDrawer();
  }
}


// ============================================================
// Error helper (401/403) + helpers operativa + valoracion niveles
// (Pega ESTE BLOQUE reemplazando todo tu bloque actual)
// ============================================================

function getHttpStatus(e) {
  // Soporta errores lanzados por A.api/core.js y fetch genérico
  return (
    e?.status ??
    e?.response?.status ??
    e?.cause?.status ??
    e?.data?.status ??
    e?.statusCode ??
    null
  );
}

function getHttpDetail(e) {
  return (
    e?.data?.detail ||
    e?.data?.message ||
    e?.message ||
    e?.toString?.() ||
    ""
  );
}

function toastHttpError(e, context = "") {
  const status = getHttpStatus(e);
  const detail = getHttpDetail(e) || "Falló la operación.";

  if (status === 401) {
    toastCompat({
      type: "warning",
      title: "Sesión",
      msg: "Tu sesión expiró o no es válida. Vuelve a iniciar sesión.",
      ms: 6500,
    });
    return;
  }

  if (status === 403) {
    toastCompat({
      type: "danger",
      title: "Permisos",
      msg: (context ? `${context}. ` : "") + (detail || "Acceso denegado."),
      ms: 8500,
    });
    return;
  }

  toastCompat({
    type: "danger",
    title: "Error",
    msg: (context ? `${context}. ` : "") + detail,
    ms: 7000,
  });
}

function toDateInput(v) {
  if (!v) return "";
  return String(v).slice(0, 10);
}

function clamp01_100(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(100, x));
}

function evidenciaIdOf(e) {
  // soporta diferentes formas del backend
  return e?.evidencia_id ?? e?.id ?? e?.evidenciaId ?? null;
}

// ============================================================
// Valoracion por niveles (UI)
// OJO: no dupliques este const en otra parte del archivo.
// ============================================================
const VALORACION_LEVELS = [
  { key: "deficiente", label: "Deficiente", score: 25 },
  { key: "poco_satisfactorio", label: "Poco satisfactorio", score: 50 },
  { key: "cuasi_satisfactorio", label: "Cuasi satisfactorio", score: 75 },
  { key: "satisfactorio", label: "Satisfactorio", score: 100 },
];

function labelFromNivel(key) {
  const it = VALORACION_LEVELS.find((x) => x.key === key);
  return it ? it.label : "Deficiente";
}

function scoreFromNivel(key) {
  const it = VALORACION_LEVELS.find((x) => x.key === key);
  return it ? it.score : 25;
}

function nivelFromValoracion(score0_100) {
  const v = clamp01_100(score0_100);
  if (v >= 88) return "satisfactorio";
  if (v >= 63) return "cuasi_satisfactorio";
  if (v >= 38) return "poco_satisfactorio";
  return "deficiente";
}

// ============================================================
// Render tabla operativa
// ============================================================
function buildOperativaTableHTML(evidencias, submoduloNombre, iesNombre) {
  const rows = (Array.isArray(evidencias) ? evidencias : []).map((e, idx) => {
    const evidId = evidenciaIdOf(e);

    const titulo = e?.titulo ?? `Evidencia ${idx + 1}`;
    const responsable = e?.responsable ?? "";

    // backend puede traer valoracion numérica
    const valoracionNum = clamp01_100(e?.valoracion ?? 0);

    // si backend ya guarda el nivel en extra_data, lo usamos
    const nivelSavedRaw =
      e?.extra_data?.valoracion_nivel ??
      e?.extra_data?.valoracionNivel ??
      e?.extra_data?.valoracion_level ??
      "";

    const nivelSaved = (nivelSavedRaw || "").toString().trim();
    const nivelKey = nivelSaved ? nivelSaved : nivelFromValoracion(valoracionNum);

    const avance = clamp01_100(e?.avance_pct ?? 0);
    const fechaIni = toDateInput(e?.fecha_inicio);
    const fechaFin = toDateInput(e?.fecha_fin);
    const presenta = !!e?.presenta;
    const cat = (e?.categoria_si_no ?? "").toString();

    // si no hay id, no se puede guardar
    const canSave = !!evidId;

    return `
      <tr data-evid="${escapeHtml(String(evidId ?? ""))}">
        <td style="width:40px;" class="text-secondary">${idx + 1}</td>

        <td style="min-width:340px;">
          <div class="fw-semibold">${escapeHtml(titulo)}</div>
          <div class="text-secondary small">
            Evidencia #${escapeHtml(String(evidId ?? "—"))}
            · Submódulo #${escapeHtml(String(e?.submodulo_id ?? ""))}
          </div>
        </td>

        <td style="min-width:180px;">
          <input class="form-control form-control-sm bg-dark text-light border-secondary js-responsable"
                 value="${escapeHtml(responsable)}" placeholder="Responsable" />
        </td>

        <td style="min-width:130px;">
          <div class="d-flex align-items-center gap-2">
            <input type="checkbox" class="form-check-input js-presenta" ${presenta ? "checked" : ""} />
            <span class="small text-secondary">Presenta</span>
          </div>
        </td>

        <td style="min-width:210px;">
          <select class="form-select form-select-sm bg-dark text-light border-secondary js-valoracion-nivel">
            ${VALORACION_LEVELS.map((l) => {
              const selected = l.key === nivelKey ? "selected" : "";
              return `<option value="${escapeHtml(l.key)}" ${selected}>${escapeHtml(l.label)}</option>`;
            }).join("")}
          </select>
          <div class="text-secondary small mt-1">Valoración</div>
        </td>

        <td style="min-width:120px;">
          <input type="number" min="0" max="100"
                 class="form-control form-control-sm bg-dark text-light border-secondary js-avance"
                 value="${escapeHtml(String(avance))}" />
          <div class="text-secondary small mt-1">Avance %</div>
        </td>

        <td style="min-width:150px;">
          <input type="date"
                 class="form-control form-control-sm bg-dark text-light border-secondary js-fecha-inicio"
                 value="${escapeHtml(fechaIni)}" />
          <div class="text-secondary small mt-1">Inicio</div>
        </td>

        <td style="min-width:150px;">
          <input type="date"
                 class="form-control form-control-sm bg-dark text-light border-secondary js-fecha-fin"
                 value="${escapeHtml(fechaFin)}" />
          <div class="text-secondary small mt-1">Fin</div>
        </td>

        <td style="min-width:150px;">
          <select class="form-select form-select-sm bg-dark text-light border-secondary js-categoria">
            <option value="" ${cat === "" ? "selected" : ""}>—</option>
            <option value="SI" ${cat.toUpperCase() === "SI" ? "selected" : ""}>SI</option>
            <option value="NO" ${cat.toUpperCase() === "NO" ? "selected" : ""}>NO</option>
          </select>
          <div class="text-secondary small mt-1">Categoría</div>
        </td>

        <td style="min-width:140px;" class="text-end">
          <button class="btn btn-outline-light btn-sm js-guardar" ${canSave ? "" : "disabled"}>Guardar</button>
          <div class="text-secondary small mt-1 js-status" style="min-height:18px;"></div>
        </td>
      </tr>
    `;
  });

  return `
    <div class="container-fluid mt-3">
      <div class="d-flex align-items-start justify-content-between gap-3 flex-wrap">
        <div>
          <div class="text-secondary small">OPERATIVA</div>
          <h4 class="mb-1">${escapeHtml(submoduloNombre || "Submódulo")}</h4>
          <div class="text-secondary small">IES: ${escapeHtml(iesNombre || "—")}</div>
        </div>
        <div class="text-secondary small">
          Tip: edita y presiona <b>Guardar</b> por fila.
        </div>
      </div>

      <hr class="my-2" />

      <div class="table-responsive mt-3">
        <table class="table table-dark table-sm align-middle">
          <thead>
            <tr>
              <th>#</th>
              <th>Evidencia</th>
              <th>Responsable</th>
              <th>Presenta</th>
              <th class="text-end">Valoración</th>
              <th class="text-end">Avance</th>
              <th>Fecha inicio</th>
              <th>Fecha fin</th>
              <th>Categoría</th>
              <th class="text-end">Acción</th>
            </tr>
          </thead>
          <tbody id="opTbody">
            ${rows.join("") || `<tr><td colspan="10" class="text-secondary">No hay evidencias.</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

// ============================================================
// Handler Guardar por fila
// ============================================================
async function wireOperativaTableHandlers(rootEl) {
  const tbody = rootEl.querySelector("#opTbody");
  if (!tbody) return;

  tbody.addEventListener("click", async (ev) => {
    const btn = ev.target.closest(".js-guardar");
    if (!btn) return;

    const tr = ev.target.closest("tr[data-evid]");
    if (!tr) return;

    const evidId = Number(tr.dataset.evid);
    if (!evidId) return;

    const statusEl = tr.querySelector(".js-status");
    const setStatus = (txt, kind = "muted") => {
      if (!statusEl) return;
      statusEl.className = `text-${kind} small mt-1 js-status`;
      statusEl.textContent = txt || "";
    };

    const nivelKey =
      tr.querySelector(".js-valoracion-nivel")?.value || "deficiente";

    // ✅ categoria_si_no debe ser boolean (true/false) o null
    const catRaw = (tr.querySelector(".js-categoria")?.value || "")
      .toString()
      .trim()
      .toUpperCase();

    const catBool = catRaw === "SI" ? true : catRaw === "NO" ? false : null;

    const payload = {
      responsable: tr.querySelector(".js-responsable")?.value?.trim() || "",
      presenta: !!tr.querySelector(".js-presenta")?.checked,

      // backend sigue recibiendo número (0-100)
      valoracion: scoreFromNivel(nivelKey),

      // extra_data solo si tu backend lo soporta (en tu modelo sí existe JSONB)
      extra_data: {
        valoracion_nivel: nivelKey,
        valoracion_label: labelFromNivel(nivelKey),
      },

      avance_pct: clamp01_100(tr.querySelector(".js-avance")?.value),
      fecha_inicio: tr.querySelector(".js-fecha-inicio")?.value || null,
      fecha_fin: tr.querySelector(".js-fecha-fin")?.value || null,

      // ✅ ahora sí: boolean/null
      categoria_si_no: catBool,
    };

    try {
      btn.disabled = true;
      setStatus("Guardando…", "secondary");
      await saveEvidenciaPatch(evidId, payload);
      setStatus("Guardado ✓", "success");
      toastCompat({
        type: "success",
        title: "Operativa",
        msg: "Fila guardada.",
        ms: 1800,
      });
    } catch (e) {
      console.error(e);
      toastHttpError(e, "No se pudo guardar");
      setStatus("Error al guardar", "danger");
    } finally {
      btn.disabled = false;
      setTimeout(() => setStatus(""), 2500);
    }
  });
}

  // ============================================================
  // Admin gate message
  // ============================================================
  let adminGateShown = false;
  function showAdminGateIfNeeded() {
    if (isAdmin() && !A.state.ies?.id) {
      resetLockedAdminUI();
      if (!adminGateShown) {
        adminGateShown = true;
        toastCompat({
          type: "info",
          title: `Hola ${getDisplayName()} 👋`,
          msg: "Primero selecciona una IES para ver su Resumen general.",
          ms: 5200,
        });
      }
      return true;
    }
    return false;
  }

  // ============================================================
  //  IES context resolver (NO ADIVINAR POR EMAIL)
  // ============================================================
  function resolveIESContextFromCoreAndJwt() {
    const p = A.parseJwt?.() || {};

    let slug = "";
    let id = null;

    try {
      slug =
        (typeof A.getIesSlug === "function" ? A.getIesSlug() : "") ||
        localStorage.getItem("ies_slug") ||
        "";
    } catch {}

    try {
      const v =
        (typeof A.getIesId === "function" ? A.getIesId() : null) ??
        (localStorage.getItem("ies_id") || "");
      const n = Number(v);
      id = Number.isFinite(n) ? n : null;
    } catch {
      id = null;
    }

    const jwtSlug =
      p?.ies_slug ||
      p?.iesSlug ||
      p?.institucion_slug ||
      p?.institution_slug ||
      p?.org_slug ||
      p?.orgSlug ||
      p?.ies?.slug ||
      p?.institucion?.slug ||
      "";

    const jwtId =
      p?.ies_id ??
      p?.iesId ??
      p?.iesID ??
      p?.ies?.id ??
      p?.institucion?.id ??
      null;

    const finalSlug = (jwtSlug || slug || "").toString().trim();
    const finalId = (() => {
      const n = Number(jwtId ?? id);
      return Number.isFinite(n) ? n : null;
    })();

    return {
      id: finalId,
      slug: finalSlug || null,
      nombre: p?.ies_nombre || p?.iesNombre || finalSlug || null,
      _source: jwtSlug ? "jwt" : (slug ? "storage" : "none"),
      _trusted: !!jwtSlug || !!slug,
    };
  }

  // ============================================================
  //  NUEVO: resolver IES automáticamente por ies_id -> /ies/
  // ============================================================
async function ensureIESResolved() {
  if (A.state?.ies?.slug) return A.state.ies;

  const ctx = resolveIESContextFromCoreAndJwt();
  A.state.ies = ctx;

  // 🚫 IES no puede consultar /ies/ (admin-only)
  if (isIES()) return A.state.ies;

  // ✅ Admin: si tengo id pero no slug, resuelvo consultando /ies/
  if (!A.state.ies.slug && A.state.ies.id) {
    try {
      const list = await A.api("/ies/");
      const found = Array.isArray(list)
        ? list.find((x) => Number(x.id) === Number(A.state.ies.id))
        : null;

      if (found?.slug) {
        A.state.ies = {
          ...A.state.ies,
          slug: found.slug,
          nombre: found.nombre || A.state.ies.nombre,
          _source: "ies-list-by-id",
          _trusted: true,
        };
        try {
          localStorage.setItem("ies_slug", found.slug);
          localStorage.setItem("ies_id", String(found.id));
        } catch {}
      }
    } catch (e) {
      console.warn("No se pudo resolver ies_slug usando /ies/:", e);
    }
  }

  return A.state.ies;
}

  // ============================================================
  // Loaders: IES context + IES list (admin)
  // ============================================================
  async function loadIESContext() {
    enforceRoleUI();

    if (isIES()) {
      const ctx = resolveIESContextFromCoreAndJwt();
      A.state.ies = ctx.slug ? ctx : { ...ctx, slug: null };

      //  OJO: ya NO retornamos aquí para no matar el catálogo
      if (!ctx.slug) {
        setUserActive("Institución activa: (sin slug)", true);
        toastCompat({
          type: "warning",
          title: "Falta IES (slug)",
          msg:
            "No tengo ies_slug en sesión. Igual te cargo el catálogo. " +
            "Cuando abras Operativa intentaré resolverlo con /ies/ usando ies_id.",
          ms: 8000,
        });
        return;
      }

      setUserActive(`Institución activa: ${ctx.nombre || ctx.slug}`, true);
      return;
    }

    // Admin: carga lista IES
    setUserActive("", false);

    let list = A.state.iesList;
    if (!Array.isArray(list) || !list.length) {
      list = await A.api("/ies/");
      A.state.iesList = Array.isArray(list) ? list : [];
    }

    if (iesSelect && !iesSelect.dataset.plannerBound) {
      iesSelect.dataset.plannerBound = "1";

      const buildOptions = (arr) =>
        [
          `<option value="">-- Selecciona una IES --</option>`,
          ...arr.map((i) => `<option value="${i.id}">${escapeHtml(i.nombre)} (${escapeHtml(i.slug)})</option>`),
        ].join("");

      iesSelect.innerHTML = buildOptions(A.state.iesList);

      iesSelect.addEventListener("change", async () => {
        const id = Number(iesSelect.value);
        const found = A.state.iesList.find((x) => Number(x.id) === id) || null;
        A.state.ies = found ? { ...found, _source: "admin-select", _trusted: true } : null;

        if (found) {
          setUserActive(`IES activa: ${found.nombre} (${found.slug})`, true);
          toastCompat ({
            type: "success",
            title: "IES activa",
            msg: `${found.nombre} (${found.slug}). Abriendo Resumen general…`,
            ms: 3200,
          });
          try { await openResumenGeneral(); } catch (e) { toastHttpError(e, "No se pudo abrir Resumen general"); }
        } else {
          A.state.ies = null;
          setUserActive("", false);
          resetLockedAdminUI();
          showAdminGateIfNeeded();
        }
      });

      if (A.state.ies?.id) {
        const exists = A.state.iesList.some((x) => Number(x.id) === Number(A.state.ies.id));
        if (exists) iesSelect.value = String(A.state.ies.id);
      }
    }

    if (iesSearch && !iesSearch.dataset.plannerBound && iesSelect) {
      iesSearch.dataset.plannerBound = "1";
      iesSearch.addEventListener("input", () => {
        const q = normalize(iesSearch.value);
        const filtered = A.state.iesList.filter((i) => {
          const t = normalize(`${i.nombre} ${i.slug}`);
          return !q || t.includes(q);
        });

        const current = iesSelect.value || "";
        iesSelect.innerHTML = [
          `<option value="">-- Selecciona una IES --</option>`,
          ...filtered.map((i) => `<option value="${i.id}">${escapeHtml(i.nombre)} (${escapeHtml(i.slug)})</option>`),
        ].join("");

        iesSelect.value = filtered.some((x) => String(x.id) === current) ? current : "";
      });
    }

    showAdminGateIfNeeded();
  }

  // ============================================================
  // Subprogramas/submódulos (IES)
  // ============================================================
  const POS = [
    { left: "10%", top: "18%" },
    { left: "38%", top: "16%" },
    { left: "68%", top: "28%" },
    { left: "18%", top: "58%" },
    { left: "46%", top: "66%" },
    { left: "76%", top: "72%" },
  ];

  function subpNodeHTML(sp, idx) {
    const pos = POS[idx % POS.length];
    const float = (idx % 3) + 1;

    return `
      <div class="subp-node" data-id="${sp.id}" data-float="${float}"
           style="left:${pos.left}; top:${pos.top};">
        <div class="subp-top">
          <div>
            <h3 class="subp-title">${escapeHtml(sp.nombre)}</h3>
            <p class="subp-desc">Entra para ver submódulos y registrar evidencias.</p>
          </div>
          <div class="subp-chip">#${idx + 1}</div>
        </div>
      </div>
    `;
  }

  function submItemHTML(sm) {
    return `
      <div class="subm-item" data-id="${sm.id}">
        <h4 class="subm-name">${escapeHtml(sm.nombre)}</h4>
        <p class="subm-hint">Abrir operativa · revisar resumen</p>
      </div>
    `;
  }

  async function loadSubprogramas() {
    if (!isIES()) {
      A.state.subprogramas = [];
      if (constellation) setHidden(constellation, true);
      if (field) {
        field.innerHTML = `<div class="text-secondary small">
          <b>Modo Admin:</b> selecciona una IES y usa <b>Resumen general</b>.
        </div>`;
      }
      return;
    }

    //  NO bloquear por falta de slug: el catálogo NO depende del slug
    await ensureIESResolved();

    const data = await A.api("/catalogo/subprogramas");
    A.state.subprogramas = Array.isArray(data) ? data : [];
    renderSubprogramas();
  }

  function renderSubprogramas() {
    if (!field) return;

    if (!isIES()) {
      if (constellation) setHidden(constellation, true);
      field.innerHTML = `<div class="text-secondary small">
        <b>Modo Admin:</b> usa el selector de IES y <b>Resumen general</b>.
      </div>`;
      return;
    }

    const q = normalize(searchSubp?.value);
    const list = A.state.subprogramas.filter((sp) => !q || normalize(sp.nombre).includes(q));
    field.innerHTML = list.map((sp, idx) => subpNodeHTML(sp, idx)).join("");

    if (A.state.activeSubp) {
      const el = field.querySelector(`.subp-node[data-id="${A.state.activeSubp.id}"]`);
      if (el) el.classList.add("active");
    }
    if (constellation) setHidden(constellation, false);
  }

  async function loadSubmodulos(subprogramaId) {
    const data = await A.api(`/catalogo/subprogramas/${subprogramaId}/submodulos`);
    A.state.submodulos = Array.isArray(data) ? data : [];
    renderSubmodulos();
  }

  function renderSubmodulos() {
    if (!submodulosList) return;
    const q = normalize(searchSubm?.value);
    const list = A.state.submodulos.filter((sm) => !q || normalize(sm.nombre).includes(q));
    submodulosList.innerHTML = list.map(submItemHTML).join("");
  }

  function setActiveSubp(subprogramaId) {
    const sp = A.state.subprogramas.find((x) => x.id === subprogramaId);
    if (!sp) return;

    A.state.activeSubp = sp;

    field?.querySelectorAll(".subp-node").forEach((n) => n.classList.remove("active"));
    field?.querySelector(`.subp-node[data-id="${subprogramaId}"]`)?.classList.add("active");

    if (submodsTitle) submodsTitle.textContent = sp.nombre;
    if (submodsMeta) submodsMeta.textContent = `Subprograma #${sp.id} · elige un submódulo`;
    if (btnVerResumen) btnVerResumen.disabled = true;
  }

  function openSubmodsDrawer() {
    hideCoach(false);
    try {
      if (canvasEl) {
        canvasEl.style.visibility = "visible";
        canvasEl.removeAttribute("aria-hidden");
      }
      canvas?.show();
    } catch {}
  }

// ============================================================
// Endpoint helpers (CORREGIDO: IES vs Admin)
// ============================================================

// ----------------------------
// Evidencias
// ----------------------------
function evidenciasUrlForSubmodulo(submoduloId) {
  // ✅ IES (cliente): endpoint permitido (NO usa slug)
  if (isIES()) {
    return `/operacion/submodulos/${submoduloId}/evidencias`;
  }

  // ✅ Admin: endpoint con slug (admin-only)
  const slug = A.state.ies?.slug;
  if (!slug) throw new Error("Falta ies.slug para cargar evidencias (Admin).");
  return `/operacion/ies/${slug}/submodulos/${submoduloId}/evidencias`;
}

// ----------------------------
// Resumen
// ----------------------------
function resumenUrlForSubmodulo(submoduloId) {
  // ✅ IES: su propio resumen (NO requiere ies_id en URL)
  if (isIES()) {
    return `/api/resumen/mio/submodulo/${submoduloId}`;
  }

  // ✅ Admin: necesita ies_id seleccionado
  const iesId =
    A.state.ies?.id ||
    (typeof A.getIesId === "function" ? A.getIesId() : null);

  if (!iesId) throw new Error("Falta ies_id para cargar resumen (Admin).");
  return `/api/resumen/submodulo/${iesId}/${submoduloId}`;
}

// ----------------------------
// Fetch helpers
// ----------------------------
async function fetchEvidencias(submoduloId) {
  return await A.api(evidenciasUrlForSubmodulo(submoduloId));
}

async function fetchResumenSubmodulo(submoduloId) {
  return await A.api(resumenUrlForSubmodulo(submoduloId));
}

// ----------------------------
// Save evidencia (PATCH)
// ----------------------------
async function saveEvidenciaPatch(evidenciaId, payload) {
  // ✅ IES: PATCH permitido (no usa slug)
  if (isIES()) {
    return await A.api(`/operacion/evidencias/${evidenciaId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  }

  // ✅ Admin: PATCH con slug (admin-only)
  const slug = A.state.ies?.slug;
  if (!slug) throw new Error("Falta ies.slug para guardar evidencia (Admin).");

  return await A.api(`/operacion/ies/${slug}/evidencias/${evidenciaId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}



 // ============================================================
// Operativa (solo IES)
// ============================================================
async function openOperativa(submodulo) {
  hideCoach(false);

  if (!isIES()) {
    toastCompat({
      type: "warning",
      title: "Modo Admin",
      msg: "El Admin no llena operativa. Usa Resumen general.",
      ms: 4200,
    });
    return;
  }

  A.state.activeSubm = submodulo;
  showOnly("operativa");
  forceCloseSubmodsDrawer();

  if (!operativaPanel) return;

  const iesName = A.state.ies?.nombre || A.state.ies?.slug || "—";

  // skeleton mientras carga
  operativaPanel.innerHTML = `
    <div class="container-fluid mt-3">
      <div class="text-secondary small">OPERATIVA</div>
      <h4 class="mb-1">${escapeHtml(submodulo?.nombre || "Submódulo")}</h4>
      <div class="text-secondary small">IES: ${escapeHtml(iesName)}</div>
      <hr class="my-2" />
      <div class="text-secondary small">Cargando evidencias…</div>
    </div>
  `;

  try {
    // ✅ endpoint correcto para IES
    const evidencias = await fetchEvidencias(submodulo.id);
    const arr = Array.isArray(evidencias) ? evidencias : (evidencias?.items || []);

    // ✅ render tabla bonita
    operativaPanel.innerHTML = buildOperativaTableHTML(
      arr,
      submodulo?.nombre || "Submódulo",
      iesName
    );

    // ✅ conecta botones Guardar
    await wireOperativaTableHandlers(operativaPanel);
  } catch (e) {
    console.error(e);
    toastHttpError(e, "No se pudieron cargar evidencias");

    operativaPanel.innerHTML = `
      <div class="container-fluid mt-3">
        <div class="text-danger small">No se pudieron cargar evidencias.</div>
        <button id="btnBackOperativaErr" class="btn btn-outline-light btn-sm mt-2">Volver</button>
      </div>
    `;

    document.getElementById("btnBackOperativaErr")?.addEventListener("click", () => {
      showOnly("home");
    });
  }
}


  // ============================================================
  // Resumen (submódulo)
  // ============================================================
  async function openResumenFromPlanner(submodulo) {
    hideCoach(false);

    if (isAdminLocked()) {
      showAdminGateIfNeeded();
      return;
    }
    if (!resumenPanel) return;

    showOnly("resumen");
    forceCloseSubmodsDrawer();
    setHidden(resumenPanel, false);

    resumenPanel.innerHTML = `
      <div class="container-fluid mt-3">
        <div class="text-secondary small">Resumen</div>
        <h4 class="mb-1">${escapeHtml(submodulo?.nombre || "Submódulo")}</h4>
        <div class="text-secondary small">Cargando…</div>
      </div>
    `;

    try {
      const data = await fetchResumenSubmodulo(submodulo.id);

      const renderer = A.openResumenSubmodulo;
      if (typeof renderer === "function") {
        const iesNombre = A.state.ies?.nombre || A.state.ies?.slug || "—";
        renderer(resumenPanel, data, {
          iesNombre,
          submoduloNombre: submodulo.nombre,
          submoduloId: submodulo.id,
          onBack: () => (isIES() ? showOnly("operativa") : openResumenGeneral()),
        });
        return;
      }

      resumenPanel.innerHTML = `
        <div class="container-fluid mt-3">
          <div class="d-flex justify-content-between align-items-start gap-2 flex-wrap">
            <div>
              <div class="text-secondary small">Resumen</div>
              <h4 class="mb-1">${escapeHtml(submodulo?.nombre || "Submódulo")}</h4>
              <div class="text-secondary small">
                IES: ${escapeHtml(A.state.ies?.nombre || A.state.ies?.slug || "—")}
                · Submódulo #${escapeHtml(String(submodulo?.id || "—"))}
              </div>
            </div>
            <button id="btnBackFallback" class="btn btn-outline-light btn-sm">Volver</button>
          </div>
          <pre class="mt-3 small text-light" style="white-space:pre-wrap;">${escapeHtml(JSON.stringify(data, null, 2))}</pre>
        </div>
      `;

      document.getElementById("btnBackFallback")?.addEventListener("click", () => {
        if (isIES()) showOnly("operativa");
        else openResumenGeneral();
      });
    } catch (e) {
      console.error(e);
      toastHttpError(e, "No se pudo cargar el resumen");
      resumenPanel.innerHTML = `
        <div class="container-fluid mt-3">
          <div class="text-danger small">No se pudo cargar el resumen.</div>
          <button id="btnBackErr" class="btn btn-outline-light btn-sm mt-2">Volver</button>
        </div>
      `;
      document.getElementById("btnBackErr")?.addEventListener("click", () => {
        if (isIES()) showOnly("operativa");
        else openResumenGeneral();
      });
    }
  }

// ============================================================
// Resumen general (Admin + IES)
// ============================================================
function fmtDate(s) {
  if (!s) return "—";
  const d = String(s).slice(0, 10);
  const [y, m, day] = d.split("-");
  if (!y || !m || !day) return d;
  return `${day}/${m}/${y}`;
}

function pickLastUpdated(registros = []) {
  let best = null;
  for (const r of registros) {
    const u = r?.updated_at;
    if (!u) continue;
    const t = new Date(u).getTime();
    if (!Number.isFinite(t)) continue;
    if (best === null || t > best.t) best = { t, raw: u };
  }
  return best?.raw || null;
}

function pickResponsable(registros = []) {
  for (const r of registros) {
    const v = (r?.responsable ?? "").toString().trim();
    if (v) return v;
  }
  return "—";
}

async function mapLimit(items, limit, mapper) {
  const arr = Array.isArray(items) ? items : [];
  if (!arr.length) return [];
  const out = new Array(arr.length);
  let cursor = 0;

  const workers = Array.from({ length: Math.min(limit, arr.length) }, async () => {
    while (true) {
      const idx = cursor++;
      if (idx >= arr.length) break;
      out[idx] = await mapper(arr[idx], idx);
    }
  });

  await Promise.all(workers);
  return out;
}

function resumenGeneralShellHTML(iesNombre, iesId) {
  return `
    <div class="container-fluid mt-3">
      <div class="d-flex align-items-start justify-content-between gap-3 flex-wrap">
        <div>
          <div class="text-secondary small">RESUMEN GENERAL</div>
          <h4 class="mb-1">Subprogramas · Submódulos</h4>
          <div class="text-secondary small">
            IES: ${escapeHtml(iesNombre)}
            ${iesId ? `· ID: ${escapeHtml(String(iesId))}` : ""}
          </div>
        </div>
        <div class="d-flex gap-2">
          <button id="btnBackRG" class="btn btn-outline-light btn-sm">
            ${isIES() ? "Volver al mapa" : "Volver"}
          </button>
        </div>
      </div>

      <div id="rgProgress" class="text-secondary small mt-3">Cargando…</div>

      <div class="table-responsive mt-3">
        <table class="table table-dark table-sm align-middle">
          <thead>
            <tr>
              <th style="min-width:260px;">Subprograma</th>
              <th style="min-width:320px;">Submódulo</th>
              <th style="min-width:190px;">Responsable</th>
              <th class="text-end" style="min-width:110px;">Evidencias</th>
              <th class="text-end" style="min-width:90px;">Avance</th>
              <th style="min-width:150px;">Últ. actualización</th>
              <th style="min-width:110px;"></th>
            </tr>
          </thead>
          <tbody id="rgTbody">
            <tr><td colspan="7" class="text-secondary">Cargando…</td></tr>
          </tbody>
        </table>
      </div>

      <div class="text-secondary small mt-2">
        Abre un submódulo con <b>Ver</b> para revisar su resumen completo.
      </div>
    </div>
  `;
}

async function openResumenGeneral() {
  hideCoach(false);

  if (!resumenPanel) return;

  // Admin necesita IES seleccionada
  if (isAdminLocked()) {
    toastCompat({
      type: "warning",
      title: "Falta IES",
      msg: "Selecciona una IES para abrir el Resumen general.",
      ms: 4200,
    });
    showAdminGateIfNeeded();
    return;
  }

  const iesNombre = A.state.ies?.nombre || A.state.ies?.slug || "—";
  const iesId = A.state.ies?.id || null;

  showOnly("resumen");
  forceCloseSubmodsDrawer();
  setHidden(resumenPanel, false);

  resumenPanel.innerHTML = resumenGeneralShellHTML(iesNombre, iesId);

  document.getElementById("btnBackRG")?.addEventListener("click", () => {
    // IES vuelve al home mapa, Admin vuelve al home (con selector)
    showOnly("home");
  });

  const rgProgress = document.getElementById("rgProgress");
  const rgTbody = document.getElementById("rgTbody");

  try {
    if (rgProgress) rgProgress.textContent = "Cargando catálogo de subprogramas…";
    const subprogramas = await A.api("/catalogo/subprogramas");
    const sps = Array.isArray(subprogramas) ? subprogramas : [];

    if (!sps.length) {
      if (rgTbody) rgTbody.innerHTML = `<tr><td colspan="7" class="text-secondary">No hay subprogramas.</td></tr>`;
      if (rgProgress) rgProgress.textContent = "Listo.";
      return;
    }

    if (rgProgress) rgProgress.textContent = "Cargando submódulos…";
    const rows = [];

    for (const sp of sps) {
      const spId = sp?.id;
      const spName = sp?.nombre || `Subprograma ${spId}`;
      if (!spId) continue;

      const sms = await A.api(`/catalogo/subprogramas/${spId}/submodulos`);
      const list = Array.isArray(sms) ? sms : [];

      for (const sm of list) {
        if (!sm?.id) continue;
        rows.push({
          spId,
          spName,
          smId: sm.id,
          smName: sm.nombre || `Submódulo ${sm.id}`,
        });
      }
    }

    if (!rows.length) {
      if (rgTbody) rgTbody.innerHTML = `<tr><td colspan="7" class="text-secondary">No hay submódulos.</td></tr>`;
      if (rgProgress) rgProgress.textContent = "Listo.";
      return;
    }

    let done = 0;
    if (rgProgress) rgProgress.textContent = `Cargando resúmenes: 0/${rows.length}…`;

    const results = await mapLimit(rows, 4, async (row) => {
      try {
        const data = await fetchResumenSubmodulo(row.smId);
        return { ok: true, row, data };
      } catch (e) {
        console.error("Resumen submódulo falló:", row.smId, e);
        return { ok: false, row, err: e };
      } finally {
        done++;
        if (rgProgress) rgProgress.textContent = `Cargando resúmenes: ${done}/${rows.length}…`;
      }
    });

    if (rgProgress) rgProgress.textContent = `Listo ✓ (${rows.length} submódulos)`;

    if (rgTbody) {
      rgTbody.innerHTML = results
        .map((r) => {
          const sp = escapeHtml(r.row.spName);
          const sm = escapeHtml(r.row.smName);

          // si falló, igual dejamos botón "Ver"
          if (!r.ok) {
            return `
              <tr>
                <td style="opacity:.85;">${sp}</td>
                <td style="font-weight:700;">${sm}</td>
                <td class="text-secondary small">—</td>
                <td class="text-end">0</td>
                <td class="text-end">0%</td>
                <td class="text-secondary small">—</td>
                <td class="text-end">
                  <button class="btn btn-outline-light btn-sm rg-open" data-smid="${r.row.smId}">Ver</button>
                </td>
              </tr>
            `;
          }

          const data = r.data || {};
          const registros = Array.isArray(data?.registros) ? data.registros : [];

          const responsable =
            (data?.responsable_mas_reciente || "").toString().trim() ||
            pickResponsable(registros);

          const evid = Number(data?.evidencias_total ?? 0);
          const av = Math.max(0, Math.min(100, Number(data?.avance_promedio ?? 0)));

          const lastUpdRaw =
            data?.last_updated ||
            data?.ultima_actualizacion ||
            pickLastUpdated(registros);

          const lastUpd = fmtDate(lastUpdRaw);

          return `
            <tr>
              <td style="opacity:.85;">${sp}</td>
              <td style="font-weight:700;">${sm}</td>
              <td class="text-secondary small">${escapeHtml(responsable || "—")}</td>
              <td class="text-end">${Number.isFinite(evid) ? evid : 0}</td>
              <td class="text-end">${Math.round(Number.isFinite(av) ? av : 0)}%</td>
              <td class="text-secondary small">${escapeHtml(lastUpd)}</td>
              <td class="text-end">
                <button class="btn btn-outline-light btn-sm rg-open" data-smid="${r.row.smId}">Ver</button>
              </td>
            </tr>
          `;
        })
        .join("");

      rgTbody.onclick = async (ev) => {
        const btn = ev.target.closest(".rg-open");
        if (!btn) return;

        const smId = Number(btn.dataset.smid);
        const sm = rows.find((x) => x.smId === smId);
        if (!sm) return;

        await openResumenFromPlanner({ id: sm.smId, nombre: sm.smName });
      };
    }
  } catch (e) {
    console.error(e);
    toastHttpError(e, "No se pudo construir el resumen general");
    if (rgTbody) {
      rgTbody.innerHTML = `
        <tr>
          <td colspan="7" class="text-danger small">
            No se pudo construir el resumen general.
          </td>
        </tr>
      `;
    }
    if (rgProgress) rgProgress.textContent = "Error.";
  }
}

  // ============================================================
  // Events (map + drawer) — SOLO IES
  // ============================================================
  field?.addEventListener("click", async (ev) => {
    if (!isIES()) return;

    const node = ev.target.closest(".subp-node");
    if (!node) return;

    hideCoach(false);

    const id = Number(node.dataset.id);
    setActiveSubp(id);

    if (submodulosList) submodulosList.innerHTML = `<div class="text-secondary small">Cargando submódulos…</div>`;
    openSubmodsDrawer();

    try {
      await loadSubmodulos(id);
    } catch (e) {
      console.error(e);
      toastHttpError(e, "No se pudieron cargar submódulos");
      if (submodulosList) submodulosList.innerHTML = `<div class="text-danger small">Error cargando submódulos.</div>`;
    }
  });

  searchSubp?.addEventListener("input", () => { if (isIES()) renderSubprogramas(); });
  searchSubm?.addEventListener("input", () => { if (isIES()) renderSubmodulos(); });

  submodulosList?.addEventListener("click", async (ev) => {
    if (!isIES()) return;

    const item = ev.target.closest(".subm-item");
    if (!item) return;

    hideCoach(false);

    const id = Number(item.dataset.id);
    const sm = A.state.submodulos.find((x) => x.id === id) || null;
    A.state.activeSubm = sm;

    if (btnVerResumen) btnVerResumen.disabled = !sm;
    if (sm) await openOperativa(sm);
  });

  btnVerResumen?.addEventListener("click", async () => {
    if (!isIES()) return;
    if (!A.state.activeSubm) return;
    await openResumenFromPlanner(A.state.activeSubm);
  });

  let rgBusy = false;
  btnResumenGlobal?.addEventListener("click", async () => {
    if (rgBusy) return;
    rgBusy = true;

    hideCoach(false);

    const oldText = btnResumenGlobal?.textContent;
    if (btnResumenGlobal) {
      btnResumenGlobal.disabled = true;
      btnResumenGlobal.textContent = "Cargando…";
    }

    try {
      await openResumenGeneral();
    } finally {
      rgBusy = false;
      if (btnResumenGlobal) {
        btnResumenGlobal.disabled = false;
        btnResumenGlobal.textContent = oldText || "Resumen general";
      }
    }
  });

  btnReset?.addEventListener("click", () => {
    hideCoach(false);

    A.state.activeSubp = null;
    A.state.activeSubm = null;

    forceCloseSubmodsDrawer();
    field?.querySelectorAll(".subp-node").forEach((n) => n.classList.remove("active"));

    if (operativaPanel) {
      operativaPanel.innerHTML = "";
      setHidden(operativaPanel, true);
    }
    if (resumenPanel) {
      resumenPanel.innerHTML = "";
      setHidden(resumenPanel, true);
    }

    showOnly("home");
  });

  // ============================================================
  // INIT
  // ============================================================
  try {
    enforceRoleUI();
    await loadIESContext();
    await loadSubprogramas();

    if (isAdminLocked()) {
      resetLockedAdminUI();
      showAdminGateIfNeeded();
      return;
    }

    if (isAdmin()) {
      if (constellation) setHidden(constellation, true);
      if (field) {
        field.innerHTML = `<div class="text-secondary small">
          <b>Modo Admin:</b> selecciona una IES y usa <b>Resumen general</b>.
        </div>`;
      }
      showOnly("home");
      return;
    }

    // IES normal
    showOnly("home");
    renderSubprogramas();
  } catch (err) {
    console.error(err);
    if (field) field.innerHTML = `<div class="text-danger small">Error cargando catálogo.</div>`;
    toastCompat ({
      type: "danger",
      title: "Error",
      msg: "No se pudo cargar el catálogo. Revisa consola/endpoint.",
      ms: 6500,
    });
  }
});
