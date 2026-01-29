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
    try { return JSON.parse(s); } catch { return null; }
  }

  function getToken() {
    try {
      return localStorage.getItem("access_token") || sessionStorage.getItem("access_token") || "";
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
      const headers = new Headers(opts.headers || {});
      if (!headers.has("Content-Type") && opts.method && opts.method !== "GET") {
        headers.set("Content-Type", "application/json");
      }
      const t = getToken();
      if (t && !headers.has("Authorization")) headers.set("Authorization", `Bearer ${t}`);

      const res = await fetch(path, { ...opts, headers });

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
  // Sincroniza sesión YA
  // ============================================================
  try {
    if (typeof A.refreshSession === "function") await A.refreshSession();
  } catch (e) {
    console.warn("refreshSession falló:", e);
  }

  // ============================================================
  // Toast compat
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
  const canvas = canvasEl && window.bootstrap ? new bootstrap.Offcanvas(canvasEl) : null;

  const submodsMeta = qs("#submodsMeta");
  const submodsTitle = qs("#submodsCanvasLabel");
  const submodulosList = qs("#submodulosList");
  const searchSubm = qs("#searchSubm");
  const btnVerResumen = qs("#btnVerResumen");

  const constellation = document.querySelector(".constellation");

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
  // Coach Astra (UNA sola guía)
  // ============================================================
  const COACH_KEY = "astra_onboarding_v2_done"; // una sola vez global
  let coach = null;
  let coachStep = 0;
  let coachAutoMode = false;
  let coachLastTarget = null;

  function shouldAutoCoach() {
    try { return localStorage.getItem(COACH_KEY) !== "1"; } catch { return true; }
  }

  function markCoachDone() {
    try { localStorage.setItem(COACH_KEY, "1"); } catch {}
  }

  function ensureCoach() {
    if (coach) return coach;

    const root = document.createElement("div");
    root.className = "astra-coach";
    root.style.display = "none";

    const img = document.createElement("img");
    img.className = "astra-coach__img";
    img.src = "/static/img/astra_saludo.png";
    img.onerror = () => (img.src = "/static/img/astra.png");
    img.alt = "Astra";

    const arrow = document.createElement("div");
    arrow.className = "astra-coach__arrow";

    const bubble = document.createElement("div");
    bubble.className = "astra-coach__bubble";
    bubble.innerHTML = `
      <div class="astra-coach__title">
        <span>Astra</span>
        <button class="astra-coach__close" title="Cerrar">×</button>
      </div>
      <div class="astra-coach__msg">…</div>
      <div class="astra-coach__footer">
        <button type="button" class="btn btn-outline-light btn-sm astra-coach__back">Atras</button>
        <div class="astra-coach__dots">1/4</div>
        <button type="button" class="btn btn-light btn-sm astra-coach__next">Siguiente</button>
      </div>
    `;

    root.appendChild(img);
    root.appendChild(arrow);
    root.appendChild(bubble);
    document.body.appendChild(root);

    const c = {
      root,
      img,
      arrow,
      bubble,
      msg: bubble.querySelector(".astra-coach__msg"),
      dots: bubble.querySelector(".astra-coach__dots"),
      btnBack: bubble.querySelector(".astra-coach__back"),
      btnNext: bubble.querySelector(".astra-coach__next"),
      btnClose: bubble.querySelector(".astra-coach__close"),
      _cleanup: null,
    };

    c.btnClose?.addEventListener("click", () => hideCoach(false));
    c.btnBack?.addEventListener("click", () => tourPrev());
    c.btnNext?.addEventListener("click", () => tourNext());

    coach = c;
    return coach;
  }

  function setCoachPose(pose = "point") {
    const c = ensureCoach();
    const mapPose = {
      saludo: "/static/img/astra_saludo.png",
      point: "/static/img/astra_point.png",
      checklist: "/static/img/astra_checklist.png",
      exit: "/static/img/astra_exit.png",
    };
    c.img.src = mapPose[pose] || mapPose.point;
  }

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

  function positionCoachToTarget(targetEl) {
    const c = ensureCoach();
    const r = targetEl.getBoundingClientRect();

    const tx = r.left + r.width * 0.65;
    const ty = r.top + r.height * 0.40;

    // Astra afuera
    const ax = Math.max(140, tx - 320);
    const ay = Math.min(window.innerHeight - 140, ty + 110);

    // burbuja
    const bx = Math.min(window.innerWidth - 360, tx + 120);
    const by = Math.max(18, ty - 40);

    const arx = Math.min(window.innerWidth - 24, bx - 10);
    const ary = Math.max(18, by + 18);

    c.img.style.left = `${ax}px`;
    c.img.style.top = `${ay}px`;

    c.bubble.style.left = `${bx}px`;
    c.bubble.style.top = `${by}px`;

    c.arrow.style.left = `${arx}px`;
    c.arrow.style.top = `${ary}px`;
  }

  function showCoach({ target, text, pose, step, total } = {}) {
    if (!target) return;

    const c = ensureCoach();
    setCoachPose(pose);
    c.msg.textContent = text || "";
    c.dots.textContent = `${step}/${total}`;
    c.btnBack.disabled = step <= 1;
    c.btnNext.textContent = step >= total ? "Finalizar" : "Siguiente";

    c.root.style.display = "block";
    applyCoachTargetHighlight(target);
    positionCoachToTarget(target);

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
  }

  function hideCoach(markDone = false) {
    if (!coach) return;

    coach.root.style.display = "none";
    coach._cleanup?.();
    coach._cleanup = null;

    clearCoachTargetHighlight();

    // Solo marcar "visto" si fue auto-onboarding o si explícitamente pides markDone
    if (markDone || coachAutoMode) markCoachDone();
  }

  function pickTarget(list = []) {
    for (const it of list) {
      const el = typeof it === "string" ? document.querySelector(it) : it;
      if (el) return el;
    }
    return document.body;
  }

  function getTourSteps() {
    const total = 4;
    const firstSubp = field?.querySelector(".subp-node");
    const offcanvas = document.getElementById("submodsCanvas");

    if (isAdmin()) {
      return [
        {
          pose: "saludo",
          text: "Hola 👋 Soy Astra. Te guío en 4 pasos rápidos.",
          target: pickTarget([iesSelect, "#iesSelect", adminIesBar, "body"]),
          total,
        },
        {
          pose: "point",
          text: "Paso 2: Selecciona una IES aquí para ver su información (cada institución es independiente).",
          target: pickTarget([iesSelect, "#iesSelect", adminIesBar, "body"]),
          total,
        },
        {
          pose: "checklist",
          text: "Paso 3: Usa 'Resumen general' para revisar avance, evidencias y responsables por submódulo.",
          target: pickTarget([btnResumenGlobal, "#btnResumenGlobal", "body"]),
          total,
        },
        {
          pose: "exit",
          text: "Paso 4: Si quieres repasar, presiona el botón 'Guía' cuando quieras.",
          target: pickTarget([btnLogout, "#btnLogout", "body"]),
          total,
        },
      ];
    }

    // IES
    return [
      {
        pose: "saludo",
        text: "Hola 👋 Soy Astra. Bienvenido. Te muestro cómo usar ASTRA en 4 pasos.",
        target: pickTarget([".stage-kicker", firstSubp, field, "body"]),
        total,
      },
      {
        pose: "point",
        text: "Paso 2: Elige un subprograma en la constelación para ver sus submódulos.",
        target: pickTarget([firstSubp, field, "body"]),
        total,
      },
      {
        pose: "checklist",
        text: "Paso 3: En el panel lateral selecciona un submódulo para abrir la Operativa y registrar evidencias.",
        target: pickTarget([offcanvas, "#submodsCanvas", field, "body"]),
        total,
      },
      {
        pose: "exit",
        text: "Paso 4: Usa 'Ver resumen' para revisar el avance cuando quieras. (Y 'Guía' para repetir esto).",
        target: pickTarget([btnVerResumen, "#btnVerResumen", offcanvas, "body"]),
        total,
      },
    ];
  }

  function renderTourStep() {
    const steps = getTourSteps();
    const total = steps.length;
    const idx = Math.max(0, Math.min(total - 1, coachStep));
    const s = steps[idx];

    showCoach({
      target: s.target,
      pose: s.pose,
      text: s.text,
      step: idx + 1,
      total,
    });
  }

  function tourStart({ auto = false } = {}) {
    coachAutoMode = !!auto;
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

  // API pública: botón "Guía"
  A.openGuide = function () {
    tourStart({ auto: false });
  };

  // Auto-onboarding: SOLO una vez
  setTimeout(() => {
    if (shouldAutoCoach()) {
      try { tourStart({ auto: true }); } catch {}
    }
  }, 450);

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
  // showOnly
  // ============================================================
  function showOnly(panel) {
    // NO dispares coach aquí (evita que reaparezca)
    if (isAdminLocked()) {
      resetLockedAdminUI();
      return;
    }

    if (isAdmin()) {
      if (constellation) setHidden(constellation, true);
      if (field) field.innerHTML = "";
      if (searchSubp) searchSubp.value = "";
      setHidden(operativaPanel, true);

      const resumenIsVisible = panel === "resumen";
      setHidden(resumenPanel, !resumenIsVisible);
      return;
    }

    // IES
    const operativaIsVisible = panel === "operativa";
    const resumenIsVisible = panel === "resumen";

    setHidden(operativaPanel, !operativaIsVisible);
    setHidden(resumenPanel, !resumenIsVisible);
    if (constellation) setHidden(constellation, panel !== "home");

    if (panel === "home") renderSubprogramas();
  }

  // ============================================================
  // Error helper (401/403)
  // ============================================================
  function getHttpStatus(e) {
    return e?.status ?? e?.response?.status ?? e?.cause?.status ?? e?.data?.status ?? e?.statusCode ?? null;
  }

  function getHttpDetail(e) {
    return e?.data?.detail || e?.data?.message || e?.message || e?.toString?.() || "";
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
  //  IES context resolver
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

  async function loadIESContext() {
    enforceRoleUI();

    if (isIES()) {
      const ctx = resolveIESContextFromCoreAndJwt();
      A.state.ies = ctx.slug ? ctx : { ...ctx, slug: null };

      if (!ctx.slug) {
        setUserActive("Institución activa: (sin slug)", true);
        toastCompat({
          type: "warning",
          title: "Falta IES (slug)",
          msg: "No tengo ies_slug en sesión. Igual te cargo el catálogo.",
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
          toastCompat({
            type: "success",
            title: "IES activa",
            msg: `${found.nombre} (${found.slug}).`,
            ms: 2200,
          });
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
    const list = (A.state.subprogramas || []).filter((sp) => !q || normalize(sp.nombre).includes(q));
    field.innerHTML = list.map((sp, idx) => subpNodeHTML(sp, idx)).join("");

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
    const list = (A.state.submodulos || []).filter((sm) => !q || normalize(sm.nombre).includes(q));
    submodulosList.innerHTML = list.map(submItemHTML).join("");
  }

  function setActiveSubp(subprogramaId) {
    const sp = (A.state.subprogramas || []).find((x) => x.id === subprogramaId);
    if (!sp) return;

    A.state.activeSubp = sp;

    field?.querySelectorAll(".subp-node").forEach((n) => n.classList.remove("active"));
    field?.querySelector(`.subp-node[data-id="${subprogramaId}"]`)?.classList.add("active");

    if (submodsTitle) submodsTitle.textContent = sp.nombre;
    if (submodsMeta) submodsMeta.textContent = `Subprograma #${sp.id} · elige un submódulo`;
    if (btnVerResumen) btnVerResumen.disabled = true;
  }

  function openSubmodsDrawer() {
    try {
      if (canvasEl) {
        canvasEl.style.visibility = "visible";
        canvasEl.removeAttribute("aria-hidden");
      }
      canvas?.show();
    } catch {}
  }

  // ============================================================
  // Eventos
  // ============================================================
  field?.addEventListener("click", async (ev) => {
    if (!isIES()) return;
    const node = ev.target.closest(".subp-node");
    if (!node) return;

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

  btnReset?.addEventListener("click", () => {
    A.state.activeSubp = null;
    A.state.activeSubm = null;

    forceCloseSubmodsDrawer();
    field?.querySelectorAll(".subp-node").forEach((n) => n.classList.remove("active"));

    if (operativaPanel) { operativaPanel.innerHTML = ""; setHidden(operativaPanel, true); }
    if (resumenPanel) { resumenPanel.innerHTML = ""; setHidden(resumenPanel, true); }

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
    toastCompat({
      type: "danger",
      title: "Error",
      msg: "No se pudo cargar el catálogo. Revisa consola/endpoint.",
      ms: 6500,
    });
  }
});
