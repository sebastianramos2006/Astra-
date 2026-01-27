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
  const canvas = canvasEl && window.bootstrap ? new bootstrap.Offcanvas(canvasEl) : null;

  const submodsMeta = qs("#submodsMeta");
  const submodsTitle = qs("#submodsCanvasLabel");
  const submodulosList = qs("#submodulosList");
  const searchSubm = qs("#searchSubm");
  const btnVerResumen = qs("#btnVerResumen");

  const constellation = document.querySelector(".constellation");

  // ============================================================
  //  Coach Astra (igual que tu versión)
  // ============================================================
  const COACH_KEY = "astra_onboarding_v1_done";
  let coach = null;

  function injectCoachStylesOnce() {
    if (document.getElementById("astraCoachStyles")) return;
    const st = document.createElement("style");
    st.id = "astraCoachStyles";
    st.textContent = `
      .astra-coach { position: fixed; inset: 0; z-index: 9999; pointer-events: none; }
      .astra-coach__img { position: fixed; width: 220px; height: auto; filter: drop-shadow(0 12px 28px rgba(0,0,0,.55)); pointer-events: none; transform: translate(-50%, -50%); }
      .astra-coach__bubble { position: fixed; max-width: 320px; padding: 12px 12px; border-radius: 12px; background: rgba(10,14,28,.86); border: 1px solid rgba(255,255,255,.12); box-shadow: 0 18px 44px rgba(0,0,0,.45); color: rgba(255,255,255,.92); font-size: 13px; line-height: 1.35; pointer-events: auto; backdrop-filter: blur(10px); }
      .astra-coach__title { font-weight: 800; font-size: 12px; opacity: .95; margin-bottom: 4px; display:flex; justify-content: space-between; gap: 8px; align-items: center; }
      .astra-coach__close { width: 28px; height: 28px; border-radius: 10px; border: 1px solid rgba(255,255,255,.14); background: rgba(255,255,255,.06); color: rgba(255,255,255,.85); cursor: pointer; }
      .astra-coach__close:hover { background: rgba(255,255,255,.10); }
      .astra-coach__arrow { position: fixed; width: 14px; height: 14px; transform: rotate(45deg); background: rgba(10,14,28,.86); border-left: 1px solid rgba(255,255,255,.12); border-top: 1px solid rgba(255,255,255,.12); pointer-events: none; }
    `;
    document.head.appendChild(st);
  }

  function ensureCoach() {
    if (coach) return coach;
    injectCoachStylesOnce();

    const root = document.createElement("div");
    root.className = "astra-coach";
    root.style.display = "none";

    const img = document.createElement("img");
    img.className = "astra-coach__img";
    img.src = "/static/img/astra_point.png";
    img.onerror = () => (img.src = "/static/img/astra.png");
    img.alt = "Astra";

    const bubble = document.createElement("div");
    bubble.className = "astra-coach__bubble";

    const arrow = document.createElement("div");
    arrow.className = "astra-coach__arrow";

    bubble.innerHTML = `
      <div class="astra-coach__title">
        <span>Astra</span>
        <button class="astra-coach__close" title="Cerrar">×</button>
      </div>
      <div class="astra-coach__msg">…</div>
    `;

    bubble.querySelector(".astra-coach__close")?.addEventListener("click", () => hideCoach(true));

    root.appendChild(img);
    root.appendChild(arrow);
    root.appendChild(bubble);
    document.body.appendChild(root);

    coach = { root, img, bubble, arrow, msg: bubble.querySelector(".astra-coach__msg") };
    return coach;
  }

  function setCoachContent({ text, pose = "point" } = {}) {
    const c = ensureCoach();
    const mapPose = {
      saludo: "/static/img/astra_saludo.png",
      point: "/static/img/astra_point.png",
      stats: "/static/img/astra_stats.png",
      exit: "/static/img/astra_exit.png",
    };
    c.img.src = mapPose[pose] || mapPose.point;
    c.msg.textContent = text || "";
  }

  function positionCoachToTarget(targetEl) {
    const c = ensureCoach();
    const r = targetEl.getBoundingClientRect();

    const tx = r.left + r.width * 0.65;
    const ty = r.top + r.height * 0.40;

    const ax = Math.max(120, tx - 190);
    const ay = Math.min(window.innerHeight - 140, ty + 80);

    const bx = Math.min(window.innerWidth - 360, tx + 120);
    const by = Math.max(20, ty - 40);

    const arx = Math.min(window.innerWidth - 30, bx - 10);
    const ary = Math.max(20, by + 18);

    c.img.style.left = `${ax}px`;
    c.img.style.top = `${ay}px`;

    c.bubble.style.left = `${bx}px`;
    c.bubble.style.top = `${by}px`;

    c.arrow.style.left = `${arx}px`;
    c.arrow.style.top = `${ary}px`;
  }

  let coachTimer = null;
  function showCoach({ target, text, pose = "point", autoCloseMs = 0 } = {}) {
    if (!target) return;
    const c = ensureCoach();
    clearTimeout(coachTimer);

    setCoachContent({ text, pose });
    positionCoachToTarget(target);

    c.root.style.display = "block";

    const onMove = () => {
      if (c.root.style.display !== "block") return;
      positionCoachToTarget(target);
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
    if (markDone) {
      try { localStorage.setItem(COACH_KEY, "1"); } catch {}
    }
  }

  function shouldAutoCoach() {
    try { return localStorage.getItem(COACH_KEY) !== "1"; } catch { return true; }
  }

  // expone para botón "Guía"
  A.openGuide = function () {
    if (!isIES()) return;
    const first = field?.querySelector(".subp-node");
    if (!first) return;
    showCoach({
      target: first,
      pose: "saludo",
      text: "Elige un subprograma para ver sus submódulos. Luego abre un submódulo y registra evidencias.",
      autoCloseMs: 0,
    });
  };

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
  // showOnly
  // ============================================================
  function showOnly(panel) {
    hideCoach(false);

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

    if (panel === "home") {
      renderSubprogramas();
      if (shouldAutoCoach()) {
        const first = field?.querySelector(".subp-node");
        if (first) {
          showCoach({
            target: first,
            pose: "saludo",
            text: "Elige un subprograma para ver sus submódulos. Luego abre un submódulo y registra evidencias.",
            autoCloseMs: 0,
          });
        }
      }
    }
  }

  // ============================================================
  // Error helper (401/403)
  // ============================================================
  function toastHttpError(e, context = "") {
    const status = e?.status;
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
        msg:
          (context ? `${context}. ` : "") +
          "El backend rechazó la operación por permisos. Revisa rol, token y que la IES activa sea la tuya.",
        ms: 8500,
      });
      return;
    }
    toastCompat({
      type: "danger",
      title: "Error",
      msg: (context ? `${context}. ` : "") + (e?.message || "Falló la operación."),
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

    // Si tengo id pero no slug: resolver consultando /ies/
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
          return A.state.ies;
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
    hideCoach(true);
    try {
      if (canvasEl) {
        canvasEl.style.visibility = "visible";
        canvasEl.removeAttribute("aria-hidden");
      }
      canvas?.show();
    } catch {}
  }

  // ============================================================
  // Endpoint helpers
  // ============================================================
  function evidenciasUrlForSubmodulo(submoduloId) {
    const slug = A.state.ies?.slug;
    if (!slug) throw new Error("Falta ies.slug para cargar evidencias.");
    return `/operacion/ies/${slug}/submodulos/${submoduloId}/evidencias`;
  }

  function resumenUrlForSubmodulo(submoduloId) {
    const iesId = A.state.ies?.id || (typeof A.getIesId === "function" ? A.getIesId() : null);
    if (!iesId) throw new Error("Falta ies_id para cargar resumen.");
    return `/api/resumen/submodulo/${iesId}/${submoduloId}`;
  }

  async function fetchEvidencias(submoduloId) {
    return await A.api(evidenciasUrlForSubmodulo(submoduloId));
  }

  async function fetchResumenSubmodulo(submoduloId) {
    return await A.api(resumenUrlForSubmodulo(submoduloId));
  }

  async function saveEvidenciaPatch(evidenciaId, payload) {
    return await A.api(`/operacion/evidencias/${evidenciaId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  }

  // ============================================================
  // Operativa (solo IES)
  // ============================================================
  async function openOperativa(submodulo) {
    hideCoach(true);

    if (!isIES()) {
      toastCompat ({ type: "warning", title: "Modo Admin", msg: "El Admin no llena operativa. Usa Resumen general.", ms: 4200 });
      return;
    }

    //  NUEVO: intenta resolver slug por ies_id antes de bloquear
    await ensureIESResolved();

    if (!A.state.ies?.slug) {
      toastCompat({
        type: "danger",
        title: "Sin IES (slug)",
        msg:
          "No pude resolver ies_slug (ni desde sesión/storage, ni consultando /ies/ con ies_id). " +
          "No puedo cargar evidencias todavía.",
        ms: 9500,
      });
      return;
    }

    A.state.activeSubm = submodulo;
    showOnly("operativa");
    forceCloseSubmodsDrawer();

    if (!operativaPanel) return;
    const iesName = A.state.ies?.nombre || A.state.ies?.slug || "—";

    operativaPanel.innerHTML = `...`;
  }
  // ============================================================
  // Resumen (submódulo)
  // ============================================================
  async function openResumenFromPlanner(submodulo) {
    hideCoach(true);

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
  // Resumen general (Admin + IES)  (tu código igual, sin cambios críticos)
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
    const out = new Array(items.length);
    let cursor = 0;

    const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (true) {
        const idx = cursor++;
        if (idx >= items.length) break;
        out[idx] = await mapper(items[idx], idx);
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
            <div class="text-secondary small">IES: ${escapeHtml(iesNombre)} ${iesId ? `· ID: ${escapeHtml(String(iesId))}` : ""}</div>
          </div>
          <div class="d-flex gap-2">
            <button id="btnBackRG" class="btn btn-outline-light btn-sm">${isIES() ? "Volver al mapa" : "Volver"}</button>
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
    hideCoach(true);

    if (!resumenPanel) return;

    if (isAdminLocked()) {
      toastCompat ({ type: "warning", title: "Falta IES", msg: "Selecciona una IES para abrir el Resumen general.", ms: 4200 });
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
          rows.push({ spId, spName, smId: sm.id, smName: sm.nombre || `Submódulo ${sm.id}` });
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

            const responsable = pickResponsable(registros);
            const evid = Number(data?.evidencias_total ?? 0);
            const av = Math.max(0, Math.min(100, Number(data?.avance_promedio ?? 0)));
            const lastUpd = fmtDate(pickLastUpdated(registros));

            return `
              <tr>
                <td style="opacity:.85;">${sp}</td>
                <td style="font-weight:700;">${sm}</td>
                <td class="text-secondary small">${escapeHtml(responsable)}</td>
                <td class="text-end">${evid}</td>
                <td class="text-end">${Math.round(av)}%</td>
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

    hideCoach(true);

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

    hideCoach(true);

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

    hideCoach(true);

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

    if (shouldAutoCoach()) {
      const first = field?.querySelector(".subp-node");
      if (first) {
        showCoach({
          target: first,
          pose: "saludo",
          text: "Elige un subprograma para ver sus submódulos. Luego abre un submódulo y registra evidencias.",
          autoCloseMs: 0,
        });
      }
    }
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
