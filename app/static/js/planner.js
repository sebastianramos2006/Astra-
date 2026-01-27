// /static/js/planner.js
document.addEventListener("DOMContentLoaded", async () => {
  // ============================================================
  // ASTRA namespace (single source of truth)
  // ============================================================
  const A = (window.ASTRA = window.ASTRA || {});

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
      return localStorage.getItem("access_token") || sessionStorage.getItem("access_token") || "";
    } catch {
      return "";
    }
  }

  function isJwtLike(t) {
    return !!(t && String(t).split(".").length === 3);
  }

  // ============================================================
  // Auth gate (respeta tu A.requireAuth si existe)
  // ============================================================
  if (A?.requireAuth && !A.requireAuth()) return;

  // ============================================================
  // Fallbacks IMPORTANTES (NO pisan si ya existen en core.js)
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
      return A.getRoleRaw?.() || "";
    };
  }

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
  // ✅ TOASTS (si core.js ya trae A.toast, no lo piso)
  // ============================================================
  function ensureToasts() {
    const wrapId = "astraToasts";
    let wrap = document.getElementById(wrapId);
    if (!wrap) {
      wrap = document.createElement("div");
      wrap.id = wrapId;
      wrap.className = "astra-toasts";
      wrap.setAttribute("aria-live", "polite");
      wrap.setAttribute("aria-atomic", "true");
      document.body.appendChild(wrap);
    }
    return wrap;
  }

  function toast({ title = "ASTRA", msg = "", type = "info", ms = 5200 } = {}) {
    const wrap = ensureToasts();
    const el = document.createElement("div");
    el.className = "astra-toast";

    const borderByType = {
      info: "rgba(120,160,255,.40)",
      success: "rgba(120,255,170,.35)",
      warning: "rgba(255,220,120,.35)",
      danger: "rgba(255,120,120,.40)",
    };
    el.style.borderColor = borderByType[type] || borderByType.info;

    const imgSrc = "/static/img/astra_saludo.png";

    el.innerHTML = `
      <div class="astra-toast__row">
        <div class="astra-toast__img">
          <img src="${imgSrc}" onerror="this.src='/static/img/astra.png'" alt="Astra">
        </div>
        <div class="astra-toast__txt">
          <div class="astra-toast__title">${escapeHtml(title)}</div>
          <p class="astra-toast__msg">${escapeHtml(msg)}</p>
        </div>
        <div class="astra-toast__actions">
          <button class="astra-toast__close" aria-label="Cerrar">×</button>
        </div>
      </div>
    `;

    const close = () => {
      el.style.opacity = "0";
      el.style.transform = "translateY(6px)";
      setTimeout(() => el.remove(), 180);
    };

    el.querySelector(".astra-toast__close")?.addEventListener("click", close);

    el.style.opacity = "0";
    el.style.transform = "translateY(6px)";
    wrap.appendChild(el);
    requestAnimationFrame(() => {
      el.style.transition = "all .18s ease";
      el.style.opacity = "1";
      el.style.transform = "translateY(0px)";
    });

    if (ms && ms > 0) setTimeout(close, ms);
  }

  A.toast = A.toast || toast;

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
  // LOGOUT (una sola vez)
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
  // STATE
  // ============================================================
  A.state = A.state || {};
  A.state.subprogramas = Array.isArray(A.state.subprogramas) ? A.state.subprogramas : [];
  A.state.submodulos = Array.isArray(A.state.submodulos) ? A.state.submodulos : [];
  A.state.activeSubp = A.state.activeSubp || null;
  A.state.activeSubm = A.state.activeSubm || null;

  A.state.ies = A.state.ies || null;
  A.state.iesList = Array.isArray(A.state.iesList) ? A.state.iesList : [];

  // ============================================================
  // ROLE
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
  // ✅ ADMIN LOCK (sin IES)
  // ============================================================
  const isAdminLocked = () => isAdmin() && !A.state?.ies?.id;

  function setHidden(el, hidden) {
    if (!el) return;
    el.classList.toggle("hidden", !!hidden);
    el.style.display = hidden ? "none" : "";
  }

  function forceCloseSubmodsDrawer() {
    try { canvas?.hide(); } catch {}
    if (canvasEl) {
      canvasEl.classList.remove("show");
      canvasEl.style.visibility = "hidden";
      canvasEl.setAttribute("aria-hidden", "true");
    }
    document.querySelectorAll(".offcanvas-backdrop").forEach((b) => b.remove());
    document.body.classList.remove("modal-open");
    document.body.style.overflow = "";
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

  // ✅ PATCH: Admin nunca muestra home con subprogramas
  function showOnly(panel) {
    if (isAdminLocked()) {
      resetLockedAdminUI();
      return;
    }

    // Admin: solo trabaja con resumen (general o por submódulo desde RG)
    if (isAdmin()) {
      // ocultar todo lo de módulos
      if (constellation) setHidden(constellation, true);
      if (field) field.innerHTML = "";
      if (searchSubp) searchSubp.value = "";
      setHidden(operativaPanel, true);

      const resumenIsVisible = panel === "resumen";
      setHidden(resumenPanel, !resumenIsVisible);
      return;
    }

    // IES normal
    const operativaIsVisible = panel === "operativa";
    const resumenIsVisible = panel === "resumen";

    setHidden(operativaPanel, !operativaIsVisible);
    setHidden(resumenPanel, !resumenIsVisible);

    if (constellation) setHidden(constellation, panel !== "home");
  }

  // ============================================================
  // Admin gate
  // ============================================================
  let adminGateShown = false;

  function getDisplayName() {
    const p = A.parseJwt?.();
    const raw = p?.nombre || p?.name || p?.usuario || p?.email || "";
    if (!raw) return "👋";
    const s = String(raw);
    if (s.includes("@")) return s.split("@")[0];
    return s;
  }

  function showAdminGateIfNeeded() {
    if (isAdmin() && !A.state.ies?.id) {
      resetLockedAdminUI();
      if (!adminGateShown) {
        adminGateShown = true;
        A.toast({
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
  // LOADERS
  // ============================================================
  async function loadIESContext() {
    const p = A.parseJwt?.();
    enforceRoleUI();

    if (isIES()) {
      const slug = p?.ies_slug || (p?.email ? String(p.email).split("@")[0] : "ies");
      const nombre = p?.ies_nombre || slug;
      const iesId = p?.ies_id ?? p?.iesId ?? p?.iesID ?? null;

      A.state.ies = { id: iesId, slug, nombre };
      setUserActive(`Institución activa: ${nombre}`, true);
      return;
    }

    // Admin
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
        A.state.ies = found;

        if (found) {
          setUserActive(`IES activa: ${found.nombre} (${found.slug})`, true);
          A.toast({
            type: "success",
            title: "IES activa",
            msg: `${found.nombre} (${found.slug}). Abriendo Resumen general…`,
            ms: 3200,
          });

          // ✅ PATCH: En Admin, al seleccionar IES abrimos directamente el Resumen General
          try { await openResumenGeneral(); } catch {}
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

  // ✅ PATCH: Subprogramas SOLO para IES (admin no los usa)
  async function loadSubprogramas() {
    if (!isIES()) {
      A.state.subprogramas = [];
      if (field) {
        field.innerHTML = `<div class="text-secondary small">
          <b>Modo Admin:</b> aquí no se navegan subprogramas/submódulos.<br>
          Selecciona una IES y usa <b>Resumen general</b>.
        </div>`;
      }
      if (constellation) setHidden(constellation, true);
      return;
    }

    const data = await A.api("/catalogo/subprogramas");
    A.state.subprogramas = Array.isArray(data) ? data : [];
    renderSubprogramas();
  }

  function renderSubprogramas() {
    if (!field) return;

    // ✅ PATCH: Admin nunca renderiza subprogramas
    if (!isIES()) {
      if (constellation) setHidden(constellation, true);
      field.innerHTML = `<div class="text-secondary small">
        <b>Modo Admin:</b> usa el selector de IES y <b>Resumen general</b>.
      </div>`;
      return;
    }

    const q = normalize(searchSubp?.value);
    const list = A.state.subprogramas.filter((sp) => !q || normalize(sp.nombre).includes(q));

    // Mantengo tu HTML original de nodos (no toco estética)
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
              <p class="subp-desc">Explorar submódulos y gestionar evidencias.</p>
            </div>
            <div class="subp-chip">#${idx + 1}</div>
          </div>
        </div>
      `;
    }

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
    submodulosList.innerHTML = list
      .map((sm) => `
        <div class="subm-item" data-id="${sm.id}">
          <h4 class="subm-name">${escapeHtml(sm.nombre)}</h4>
          <p class="subm-hint">Abrir operativa (inputs) · o ver resumen</p>
        </div>
      `)
      .join("");
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
    try { canvas?.show(); } catch {}
  }

  // ============================================================
  // ENDPOINT HELPERS
  // ============================================================
  function evidenciasUrlForSubmodulo(submoduloId) {
    const slug = A.state.ies?.slug;
    if (!slug) throw new Error("Falta ies.slug para cargar evidencias.");
    return `/operacion/ies/${slug}/submodulos/${submoduloId}/evidencias`;
  }

  function resumenUrlForSubmodulo(submoduloId) {
    if (isIES()) return `/api/resumen/submodulo/${submoduloId}`;
    const iesId = A.state.ies?.id;
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
  // OPERATIVA (solo IES)
  // ============================================================
  async function openOperativa(submodulo) {
    // ✅ PATCH: Admin NO entra a operativa
    if (!isIES()) {
      A.toast({ type: "warning", title: "Modo Admin", msg: "El Admin no llena operativa. Usa Resumen general.", ms: 4200 });
      return;
    }

    A.state.activeSubm = submodulo;
    showOnly("operativa");
    forceCloseSubmodsDrawer();

    if (!operativaPanel) return;
    const iesName = A.state.ies?.nombre || A.state.ies?.slug || "—";

    operativaPanel.innerHTML = `
      <div class="container-fluid mt-3">
        <div class="d-flex align-items-start justify-content-between gap-3 flex-wrap">
          <div>
            <div class="text-secondary small">Operativa</div>
            <h4 class="mb-1">${escapeHtml(submodulo?.nombre || "Submódulo")}</h4>
            <div class="text-secondary small">IES: ${escapeHtml(iesName)} · Submódulo #${escapeHtml(String(submodulo?.id || "—"))}</div>
          </div>
          <div class="d-flex gap-2">
            <button id="btnBackToMap" class="btn btn-outline-light btn-sm">Volver</button>
            <button id="btnOpenResumen" class="btn btn-primary btn-sm">Ver resumen</button>
          </div>
        </div>

        <div class="mt-3 card bg-transparent border-secondary-subtle">
          <div class="card-body">
            <div class="d-flex align-items-center justify-content-between gap-2 flex-wrap">
              <div class="fw-bold">Evidencias</div>
              <div class="text-secondary small" id="opStatus">Cargando…</div>
            </div>

            <div class="table-responsive mt-3">
              <table class="table table-sm table-dark align-middle">
                <thead>
                  <tr>
                    <th style="min-width:340px;">Evidencia</th>
                    <th style="min-width:120px;">Presenta</th>
                    <th style="min-width:140px;">Valoración</th>
                    <th style="min-width:180px;">Responsable</th>
                    <th style="min-width:140px;">Inicio</th>
                    <th style="min-width:140px;">Fin</th>
                    <th style="min-width:120px;">% Avance</th>
                    <th style="min-width:110px;"></th>
                  </tr>
                </thead>
                <tbody id="opTbody">
                  <tr><td colspan="8" class="text-secondary">Cargando…</td></tr>
                </tbody>
              </table>
            </div>

            <div class="text-secondary small mt-2">
              Cambia valores y presiona <b>Guardar</b> por fila.
            </div>
          </div>
        </div>
      </div>
    `;
    setHidden(operativaPanel, false);

    const btnBackToMap = document.getElementById("btnBackToMap");
    const btnOpenResumen = document.getElementById("btnOpenResumen");
    const tbody = document.getElementById("opTbody");
    const opStatus = document.getElementById("opStatus");

    btnBackToMap?.addEventListener("click", () => showOnly("home"));
    btnOpenResumen?.addEventListener("click", async () => { await openResumenFromPlanner(submodulo); });

    function optionBool(v) {
      if (v === null || v === undefined) {
        return `<option value="" selected>—</option><option value="1">SI</option><option value="0">NO</option>`;
      }
      const yes = v === true;
      const no = v === false;
      return `<option value="1" ${yes ? "selected" : ""}>SI</option><option value="0" ${no ? "selected" : ""}>NO</option>`;
    }

    function optionValoracion(v) {
      const levels = [
        { val: 0, label: "DEFICIENTE" },
        { val: 35, label: "POCO SATISFAC." },
        { val: 70, label: "CUASI SATISFAC." },
        { val: 100, label: "SATISFACTORIO" },
      ];
      return levels.map((x) => `<option value="${x.val}" ${Number(v) === x.val ? "selected" : ""}>${x.label}</option>`).join("");
    }

    function rowHTML(r) {
      const evidenciaId = r.id ?? r.evidencia_id ?? r.evid_id;
      const titulo = r.titulo ?? r.evidencia ?? r.nombre ?? "—";

      const presenta = r.presenta === null || r.presenta === undefined ? null : !!r.presenta;
      const valoracion = Number(r.valoracion ?? 0);
      const responsable = (r.responsable ?? "").toString();
      const inicio = (r.fecha_inicio ?? "").toString().slice(0, 10);
      const fin = (r.fecha_fin ?? "").toString().slice(0, 10);
      const avance = Number(r.avance_pct ?? 0);

      return `
        <tr data-eid="${escapeHtml(String(evidenciaId ?? ""))}">
          <td class="small">${escapeHtml(titulo)}</td>
          <td>
            <select class="form-select form-select-sm bg-transparent text-light border-secondary op-presenta">
              ${optionBool(presenta)}
            </select>
          </td>
          <td>
            <select class="form-select form-select-sm bg-transparent text-light border-secondary op-valoracion">
              ${optionValoracion(valoracion)}
            </select>
          </td>
          <td>
            <input class="form-control form-control-sm bg-transparent text-light border-secondary op-responsable"
                   value="${escapeHtml(responsable)}" placeholder="Responsable">
          </td>
          <td>
            <input type="date" class="form-control form-control-sm bg-transparent text-light border-secondary op-inicio"
                   value="${escapeHtml(inicio)}">
          </td>
          <td>
            <input type="date" class="form-control form-control-sm bg-transparent text-light border-secondary op-fin"
                   value="${escapeHtml(fin)}">
          </td>
          <td>
            <input type="number" min="0" max="100" step="1"
                   class="form-control form-control-sm bg-transparent text-light border-secondary op-avance"
                   value="${isNaN(avance) ? 0 : avance}">
          </td>
          <td class="text-end">
            <button class="btn btn-outline-light btn-sm op-save">Guardar</button>
          </td>
        </tr>
      `;
    }

    try {
      if (opStatus) opStatus.textContent = "Cargando evidencias…";
      const rows = await fetchEvidencias(submodulo.id);

      if (tbody) {
        tbody.innerHTML =
          (rows || []).map(rowHTML).join("") ||
          `<tr><td colspan="8" class="text-secondary">No hay evidencias.</td></tr>`;
      }

      if (opStatus) opStatus.textContent = `Evidencias: ${(rows || []).length}`;

      // delegación (una sola vez)
      if (tbody && !tbody.dataset.bound) {
        tbody.dataset.bound = "1";
        tbody.addEventListener("click", async (ev) => {
          const btn = ev.target.closest(".op-save");
          if (!btn) return;

          const tr = ev.target.closest("tr");
          const eid = tr?.dataset?.eid;
          if (!eid) return;

          btn.disabled = true;
          btn.textContent = "Guardando…";

          const presentaVal = tr.querySelector(".op-presenta")?.value;
          const payload = {
            presenta: presentaVal === "" ? null : presentaVal === "1",
            valoracion: Number(tr.querySelector(".op-valoracion")?.value || 0),
            responsable: tr.querySelector(".op-responsable")?.value || "",
            fecha_inicio: tr.querySelector(".op-inicio")?.value || null,
            fecha_fin: tr.querySelector(".op-fin")?.value || null,
            avance_pct: Math.max(0, Math.min(100, Number(tr.querySelector(".op-avance")?.value || 0))),
          };

          try {
            await saveEvidenciaPatch(eid, payload);
            btn.textContent = "Listo ✓";
            setTimeout(() => { btn.textContent = "Guardar"; btn.disabled = false; }, 900);
          } catch (e) {
            console.error(e);
            btn.textContent = "Error";
            setTimeout(() => { btn.textContent = "Guardar"; btn.disabled = false; }, 1200);
          }
        });
      }
    } catch (e) {
      console.error(e);
      if (opStatus) opStatus.textContent = "Error cargando evidencias.";
      if (tbody) tbody.innerHTML = `<tr><td colspan="8" class="text-danger small">No se pudo cargar evidencias.</td></tr>`;
    }
  }

  // ============================================================
  // RESUMEN (submódulo)
  // ============================================================
  async function openResumenFromPlanner(submodulo) {
    if (isAdminLocked()) {
      showAdminGateIfNeeded();
      return;
    }
    if (!resumenPanel) return;

    const renderer = A.openResumenSubmodulo;

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
              <div class="text-secondary small">IES: ${escapeHtml(A.state.ies?.nombre || A.state.ies?.slug || "—")}
                · Submódulo #${escapeHtml(String(submodulo?.id || "—"))}</div>
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
  // RESUMEN GENERAL (Admin + IES)
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

  // ✅ PATCH: responsable (primer no vacío)
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
          Tip: presiona <b>Ver</b> para abrir el resumen completo del submódulo.
        </div>
      </div>
    `;
  }

  async function openResumenGeneral() {
    if (!resumenPanel) return;

    if (isAdminLocked()) {
      A.toast({
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
      if (isIES()) showOnly("home");
      else showOnly("home"); // admin home = solo bar, sin módulos
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

            // ✅ PATCH: branch !ok ya no usa variables inexistentes
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
  // EVENTS (MAP + DRAWER) — SOLO IES
  // ============================================================
  field?.addEventListener("click", async (ev) => {
    if (!isIES()) return; // ✅ PATCH: admin no navega
    const node = ev.target.closest(".subp-node");
    if (!node) return;

    const id = Number(node.dataset.id);
    setActiveSubp(id);

    if (submodulosList) submodulosList.innerHTML = `<div class="text-secondary small">Cargando submódulos…</div>`;
    openSubmodsDrawer();
    await loadSubmodulos(id);
  });

  searchSubp?.addEventListener("input", () => { if (isIES()) renderSubprogramas(); });
  searchSubm?.addEventListener("input", () => { if (isIES()) renderSubmodulos(); });

  submodulosList?.addEventListener("click", async (ev) => {
    if (!isIES()) return;
    const item = ev.target.closest(".subm-item");
    if (!item) return;

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

  // Resumen General (Admin + IES)
  let rgBusy = false;
  btnResumenGlobal?.addEventListener("click", async () => {
    if (rgBusy) return;
    rgBusy = true;

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

    if (isAdmin()) {
      showAdminGateIfNeeded();
      showOnly("home");
    } else {
      showOnly("home");
    }
  });

  // ============================================================
  // INIT
  // ============================================================
  try {
    enforceRoleUI();
    await loadIESContext();

    // Subprogramas SOLO si IES
    await loadSubprogramas();

    if (isAdminLocked()) {
      resetLockedAdminUI();
      showAdminGateIfNeeded();
      return;
    }

    // Admin: home es solo barra + botón resumen (sin constelación)
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
    A.toast({
      type: "danger",
      title: "Error",
      msg: "No se pudo cargar el catálogo. Revisa consola/endpoint.",
      ms: 6500,
    });
  }
});
