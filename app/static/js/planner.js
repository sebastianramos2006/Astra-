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
  // Sincroniza sesión (si existe en core.js)
  // ============================================================
  try {
    if (typeof A.refreshSession === "function") {
      await A.refreshSession();
    }
  } catch (e) {
    console.warn("refreshSession fallo:", e);
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
  // Coach Astra (V4.3) - FIX: highlight functions + robust images
  // + Pose config EXACTA (exit/checklist/point) como en tu Chrome
  // ============================================================
  (function AstraCoachV43() {
    if (window.__astraCoachV4) return;
    window.__astraCoachV4 = true;

    const A = (window.ASTRA = window.ASTRA || {});
    const COACH_KEY = "astra_onboarding_v2_done";

    try {
      document.querySelectorAll(".astra-coach").forEach((n) => n.remove());
      document.querySelectorAll(".astra-virtual-target").forEach((n) => n.remove());
      document.querySelectorAll(".astra-target-ring").forEach((n) => n.remove());
    } catch {}

    let coach = null;
    let coachTimer = null;
    let coachStep = 0;
    let coachLastTarget = null;

    function qsLocal(sel) { return document.querySelector(sel); }

    function isVisible(el) {
      if (!el) return false;

      if (el.classList && el.classList.contains("astra-virtual-target")) {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      }

      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden") return false;
      if (cs.opacity === "0") return false;

      const rects = el.getClientRects();
      return rects && rects.length > 0;
    }

    function pickTarget(candidates = []) {
      for (const c of candidates) {
        const el = typeof c === "string" ? qsLocal(c) : c;
        if (el && isVisible(el)) return el;
      }
      return null;
    }

    function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

    function scrollIntoViewSmart(el) {
      try { el.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" }); } catch {}
    }

    function getRoleSafe() {
      try {
        if (typeof A.getRole === "function") {
          const r = String(A.getRole() || "").toLowerCase().trim();
          if (r) return r;
        }
      } catch {}
      const role = String(A?.state?.user?.role || A?.state?.role || "").toLowerCase().trim();
      return role || "ies";
    }

    function ensureVirtualTarget(id, rect) {
      let el = document.getElementById(id);
      if (!el) {
        el = document.createElement("div");
        el.id = id;
        el.className = "astra-virtual-target";
        el.style.position = "fixed";
        el.style.zIndex = "9997";
        el.style.pointerEvents = "none";
        el.style.opacity = "0.001";
        el.style.borderRadius = "14px";
        document.body.appendChild(el);
      }

      const vw = window.innerWidth || 1200;
      const vh = window.innerHeight || 800;

      const px = (val, total) => {
        if (typeof val === "string" && val.trim().endsWith("%")) {
          const p = parseFloat(val);
          return (total * (Number.isFinite(p) ? p : 0)) / 100;
        }
        const n = Number(val);
        return Number.isFinite(n) ? n : 0;
      };

      const left = px(rect.left, vw);
      const top = px(rect.top, vh);
      const width = px(rect.width, vw);
      const height = px(rect.height, vh);

      el.style.left = `${left}px`;
      el.style.top = `${top}px`;
      el.style.width = `${Math.max(60, width)}px`;
      el.style.height = `${Math.max(60, height)}px`;
      return el;
    }

    // -------- Highlight FIX (no depende de z-index del target) --------
    function getRing() {
      let ring = document.querySelector(".astra-target-ring");
      if (!ring) {
        ring = document.createElement("div");
        ring.className = "astra-target-ring";
        ring.style.position = "fixed";
        ring.style.zIndex = "999998";
        ring.style.pointerEvents = "none";
        ring.style.borderRadius = "16px";
        ring.style.boxShadow =
          "0 0 0 2px rgba(140,160,255,.65), 0 0 0 10px rgba(140,160,255,.14)";
        ring.style.opacity = "0";
        ring.style.transition = "opacity 120ms ease";
        document.body.appendChild(ring);
      }
      return ring;
    }

    function applyCoachTargetHighlight(target) {
      try {
        document
          .querySelectorAll(".astra-coach--target")
          .forEach((n) => n.classList.remove("astra-coach--target"));
      } catch {}

      if (!target) return;

      try { target.classList.add("astra-coach--target"); } catch {}

      const ring = getRing();
      try {
        const r = target.getBoundingClientRect();
        const pad = 6;
        ring.style.left = `${Math.max(0, r.left - pad)}px`;
        ring.style.top = `${Math.max(0, r.top - pad)}px`;
        ring.style.width = `${Math.max(24, r.width + pad * 2)}px`;
        ring.style.height = `${Math.max(24, r.height + pad * 2)}px`;
        ring.style.opacity = "1";
      } catch {
        ring.style.opacity = "0";
      }
    }

    function clearCoachTargetHighlight() {
      try {
        document
          .querySelectorAll(".astra-coach--target")
          .forEach((n) => n.classList.remove("astra-coach--target"));
      } catch {}
      try {
        const ring = document.querySelector(".astra-target-ring");
        if (ring) ring.style.opacity = "0";
      } catch {}
    }

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
        currentPose: "point",
      };

      return coach;
    }

    // ============================================================
    // POSE CONFIG (EXACTA como en Chrome Elements)
    // Se aplica SOLO en pantallas grandes para que no se rompa móvil.
    // ============================================================
    const POSE_OVERRIDE_MIN_VW = 980; // >= 980px aplica EXACTO
    const POSE_OVERRIDES = {
      exit:      { width: 260, left: 700,  top: 78 },
      checklist: { width: 200, left: 520,  top: 441.284 },
      point:     { width: 260, left: 80,   top: 390.37 },
    };

    function getPoseOverride(pose) {
      const vw = window.innerWidth || 1200;
      if (vw < POSE_OVERRIDE_MIN_VW) return null;
      return POSE_OVERRIDES[pose] || null;
    }

    // -------- Poses / assets --------
    function setCoachPose(pose = "point") {
      const c = ensureCoach();
      c.currentPose = pose;

      const poseCandidates = {
        saludo: [
          "/static/img/astra_saludo.png",
          "/static/img/astra_saludo.PNG",
          "/static/img/astra_saludo.webp",
          "/static/img/astra_saludo.jpg",
          "/static/img/astra_saludo.jpeg",
          "/static/img/astra_hello.png",
        ],
        point: [
          "/static/img/astra_point.png",
          "/static/img/astra_point.PNG",
          "/static/img/astra_point.webp",
          "/static/img/astra_point.jpg",
          "/static/img/astra_point.jpeg",
          "/static/img/astra_pointer.png",
        ],
        checklist: [
          "/static/img/astra_checklist.png",
          "/static/img/astra_checklist.PNG",
          "/static/img/astra_checklist.webp",
          "/static/img/astra_checklist.jpg",
          "/static/img/astra_checklist.jpeg",
          "/static/img/astra_lista.png",
        ],
        exit: [
          "/static/img/astra_exit.png",
          "/static/img/astra_exit.PNG",
          "/static/img/astra_exit.webp",
          "/static/img/astra_exit.jpg",
          "/static/img/astra_exit.jpeg",
          "/static/img/astra_salida.png",
          "/static/img/astra_out.png",
          "/static/img/astra_bye.png",
        ],
      };

      const fallbacks = [
        "/static/img/astra.png",
        "/static/img/astra.webp",
        "/static/img/astra.jpg",
        "/static/img/astra_point.png",
      ];

      const list = [...(poseCandidates[pose] || poseCandidates.point), ...fallbacks];
      let i = 0;

      c.img.onerror = null;
      c.img.onload = null;

      const tryNext = () => {
        i += 1;
        if (i >= list.length) return;
        c.img.src = list[i];
      };

      c.img.onload = () => {
        try {
          if (coachLastTarget && c?.root?.style?.display === "block") {
            requestAnimationFrame(() => positionCoachToTarget(coachLastTarget));
          }
        } catch {}
      };

      c.img.onerror = () => tryNext();
      c.img.src = list[i];

      // Tamaño por pose (checklist 200, resto 260)
      const ov = getPoseOverride(pose);
      const vw = Math.max(320, window.innerWidth || 1200);

      let size = vw < 520 ? 190 : vw < 900 ? 230 : 260;
      if (ov?.width) size = ov.width;

      c.img.style.width = `${size}px`;
      c.img.style.maxWidth = `260px`;   // lo que viste en tu style
      c.img.style.maxHeight = "46vh";
      c.img.style.height = "auto";
      c.img.style.objectFit = "contain";
      c.img.style.display = "block";
      c.img.style.opacity = "1";
    }

    function positionCoachToTarget(targetEl) {
      const c = ensureCoach();
      const pad = 12;
      if (!targetEl || !isVisible(targetEl)) return;

      coachLastTarget = targetEl;

      const r = targetEl.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;

      // medir burbuja
      c.bubble.style.visibility = "hidden";
      c.bubble.style.left = `${pad}px`;
      c.bubble.style.top = `${pad}px`;
      const bw = c.bubble.offsetWidth || 320;
      const bh = c.bubble.offsetHeight || 150;
      c.bubble.style.visibility = "visible";

      // posicion burbuja
      const preferLeft = cx > (window.innerWidth || 1200) * 0.58;
      const candidates = preferLeft
        ? [
            { name: "left", x: r.left - bw - 14, y: cy - bh / 2 },
            { name: "right", x: r.right + 14, y: cy - bh / 2 },
            { name: "bottom", x: cx - bw / 2, y: r.bottom + 14 },
            { name: "top", x: cx - bw / 2, y: r.top - bh - 14 },
          ]
        : [
            { name: "right", x: r.right + 14, y: cy - bh / 2 },
            { name: "left", x: r.left - bw - 14, y: cy - bh / 2 },
            { name: "bottom", x: cx - bw / 2, y: r.bottom + 14 },
            { name: "top", x: cx - bw / 2, y: r.top - bh - 14 },
          ];

      const fits = (x, y) =>
        x >= pad &&
        y >= pad &&
        x + bw <= (window.innerWidth || 1200) - pad &&
        y + bh <= (window.innerHeight || 800) - pad;

      const chosen = candidates.find((o) => fits(o.x, o.y)) || candidates[0];

      const bx = clamp(chosen.x, pad, (window.innerWidth || 1200) - bw - pad);
      const by = clamp(chosen.y, pad, (window.innerHeight || 800) - bh - pad);

      c.bubble.style.left = `${bx}px`;
      c.bubble.style.top = `${by}px`;

      // lado real de burbuja vs target (para exit/opuesto)
      const bubbleCenterX = bx + bw / 2;
      const bubbleCenterY = by + bh / 2;

      const dxB = bubbleCenterX - cx;
      const dyB = bubbleCenterY - cy;

      let bubbleSide = "right";
      if (Math.abs(dxB) >= Math.abs(dyB)) bubbleSide = dxB < 0 ? "left" : "right";
      else bubbleSide = dyB < 0 ? "top" : "bottom";

      // dot y linea
      c.dot.style.left = `${cx - 5}px`;
      c.dot.style.top = `${cy - 5}px`;

      const bcx = bx + bw / 2;
      const bcy = by + bh / 2;
      const dx = cx - bcx;
      const dy = cy - bcy;
      const ang = Math.atan2(dy, dx);
      const len = Math.max(45, Math.hypot(dx, dy) - 18);

      c.line.style.left = `${bcx}px`;
      c.line.style.top = `${bcy}px`;
      c.line.style.width = `${len}px`;
      c.line.style.transform = `rotate(${ang}rad)`;

      // ===== Astra placement =====
      const imgW = parseFloat(getComputedStyle(c.img).width) || 260;
      const imgH = imgW * 1.05;

      let ax = cx;
      let ay = cy;

      // 1) si hay override (pantalla grande), usa EXACTO
      const ov = getPoseOverride(c.currentPose);
      if (ov && Number.isFinite(ov.left) && Number.isFinite(ov.top)) {
        ax = ov.left;
        ay = ov.top;
      } else {
        // 2) fallback calculado (responsivo)
        if (c.currentPose === "point") {
          ax = cx - (imgW * 0.95);
          ay = cy + (imgH * 0.10);
        } else if (c.currentPose === "checklist") {
          const cons = document.querySelector(".constellation") || document.getElementById("subprogramasField");
          if (cons && isVisible(cons)) {
            const cr = cons.getBoundingClientRect();
            const ccx = cr.left + cr.width * 0.52;
            const ccy = cr.top + cr.height * 0.58;
            ax = ccx - (imgW * 0.88);
            ay = ccy - (imgH * 0.25);
          } else {
            ax = cx - (imgW * 0.95);
            ay = cy - (imgH * 0.10);
          }
        } else if (c.currentPose === "saludo") {
          ax = cx - (imgW * 0.90);
          ay = cy + (imgH * 0.08);
        } else if (c.currentPose === "exit") {
          // EXIT: Astra SIEMPRE al lado contrario de la burbuja
          const offX = imgW * 1.10;
          const offY = imgH * 0.10;

          if (bubbleSide === "left") {
            ax = cx + offX;
            ay = cy + offY;
          } else if (bubbleSide === "right") {
            ax = cx - offX;
            ay = cy + offY;
          } else if (bubbleSide === "top") {
            ax = cx - imgW * 0.15;
            ay = cy + imgH * 0.85;
          } else {
            ax = cx - imgW * 0.15;
            ay = cy - imgH * 0.55;
          }
        } else {
          const offX = imgW * 1.05;
          const offY = imgH * 0.20;

          if (chosen.name === "left")  { ax = cx + offX; ay = cy + offY; }
          if (chosen.name === "right") { ax = cx - offX; ay = cy + offY; }
          if (chosen.name === "top")   { ax = cx - imgW * 0.20; ay = cy + imgH * 0.70; }
          if (chosen.name === "bottom"){ ax = cx - imgW * 0.20; ay = cy - imgH * 0.40; }
        }
      }

      // Clamp real (que no se vaya fuera)
      ax = clamp(ax, 10, (window.innerWidth || 1200) - imgW - 10);
      ay = clamp(ay, 10, (window.innerHeight || 800) - imgH - 10);

      c.img.style.left = `${ax}px`;
      c.img.style.top = `${ay}px`;

      // ring update
      applyCoachTargetHighlight(targetEl);
    }

    function showCoach({ target, text, pose = "point", step = 1, total = 4, autoCloseMs = 0 } = {}) {
      const c = ensureCoach();

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

      if (!target.classList?.contains("astra-virtual-target")) {
        scrollIntoViewSmart(target);
      }

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

    A.showCoach = showCoach;
    A.hideCoach = hideCoach;
    A.shouldAutoCoach = shouldAutoCoach;

    window.showCoach = showCoach;
    window.hideCoach = hideCoach;
    window.shouldAutoCoach = shouldAutoCoach;

    // --------------------------
    // TOUR
    // --------------------------
    function getTourSteps() {
      const role = getRoleSafe();

      const field = document.getElementById("subprogramasField");
      const firstSubp = field ? field.querySelector(".subp-node") : null;

      const adminBar = document.getElementById("adminIesBar");
      const iesSelect = document.getElementById("iesSelect");

      const btnResumenGlobal = document.getElementById("btnResumenGlobal");
      const btnReset = document.getElementById("btnReset");
      const btnGuide = document.getElementById("btnGuide");
      const btnVerResumen = document.getElementById("btnVerResumen");

      const safeHomeTarget = () =>
        pickTarget([firstSubp, "#subprogramasField", ".constellation", ".astra-brand"]) ||
        document.querySelector(".astra-brand") ||
        document.body;

      const safeBtnTarget = () =>
        pickTarget([btnReset, "#btnReset", btnGuide, "#btnGuide", ".astra-brand"]) ||
        document.querySelector(".astra-brand") ||
        document.body;

      const rightPanelAnchor = () =>
        ensureVirtualTarget("astraVirtualRightPanel", {
          left: "76%",
          top: "42%",
          width: "20%",
          height: "30%",
        });

      if (role === "admin") {
        return [
          {
            pose: "saludo",
            text: "Hola 👋 Soy Astra. Guia rapida en 4 pasos.",
            target: () => pickTarget([iesSelect, "#iesSelect", adminBar, "#adminIesBar", ".astra-brand"]) || safeBtnTarget(),
          },
          {
            pose: "point",
            text: "Paso 1: selecciona una IES (arriba) para ver su informacion.",
            target: () => pickTarget([iesSelect, "#iesSelect", adminBar, "#adminIesBar"]) || safeBtnTarget(),
          },
          {
            pose: "checklist",
            text: "Paso 2: entra a Resumen general para ver avances y evidencias.",
            target: () => pickTarget([btnResumenGlobal, "#btnResumenGlobal"]) || safeBtnTarget(),
          },
          {
            pose: "exit",
            text: "Listo. Si quieres ver esta guia otra vez, usa el boton Guia.",
            target: () => pickTarget([btnGuide, "#btnGuide", btnResumenGlobal, ".astra-brand"]) || safeBtnTarget(),
          },
        ];
      }

      return [
        {
          pose: "saludo",
          text: "Hola 👋 Soy Astra. Te muestro como usar ASTRA rapido.",
          target: () => safeHomeTarget(),
        },
        {
          pose: "point",
          text: "Paso 1: haz clic en un subprograma para ver sus submodulos.",
          target: () => pickTarget([firstSubp, "#subprogramasField .subp-node", field]) || safeHomeTarget(),
        },
        {
          pose: "checklist",
          text: "Paso 2: cuando se abra el panel derecho, elige un submodulo para registrar evidencias.",
          target: () => pickTarget(["#submodsCanvas.show", "#submodulosList"]) || rightPanelAnchor(),
        },
        {
          pose: "exit",
          text: "Paso 3: luego usa 'Ver resumen' para revisar el avance cuando quieras.",
          target: () => pickTarget([btnVerResumen, "#btnVerResumen", btnReset, "#btnReset", btnGuide, "#btnGuide"]) || safeBtnTarget(),
        },
      ];
    }

    function renderTourStep() {
      const steps = getTourSteps();
      const total = steps.length;
      const idx = Math.max(0, Math.min(coachStep, total - 1));
      const s = steps[idx];

      setTimeout(() => {
        const target = (typeof s.target === "function") ? s.target() : s.target;
        const fallback = document.querySelector(".astra-brand") || document.body;

        showCoach({
          target: target || fallback,
          pose: s.pose,
          text: s.text,
          step: idx + 1,
          total,
        });
      }, 60);
    }

    function tourStart() { coachStep = 0; renderTourStep(); }

    function tourNext() {
      const steps = getTourSteps();
      if (coachStep >= steps.length - 1) { hideCoach(true); return; }
      coachStep += 1;
      renderTourStep();
    }

    function tourPrev() {
      if (coachStep <= 0) return;
      coachStep -= 1;
      renderTourStep();
    }

    A.openGuide = function () { tourStart(); };

    const btnGuideEl = document.getElementById("btnGuide");
    if (btnGuideEl && !btnGuideEl.dataset.wiredGuide) {
      btnGuideEl.dataset.wiredGuide = "1";
      btnGuideEl.addEventListener("click", (ev) => {
        ev.preventDefault();
        tourStart();
      });
    }

    function autoStartIfNeeded() {
      if (!shouldAutoCoach()) return;
      setTimeout(() => { try { tourStart(); } catch {} }, 350);
    }
    autoStartIfNeeded();
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
  // showOnly (no revienta si coach no existe)
  // ============================================================
  function safeHideCoach() {
    try { window.hideCoach?.(false); } catch {}
  }

  function showOnly(panel) {
    safeHideCoach();

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

      forceCloseSubmodsDrawer();
      return;
    }

    const operativaIsVisible = panel === "operativa";
    const resumenIsVisible = panel === "resumen";
    const homeIsVisible = panel === "home";

    setHidden(operativaPanel, !operativaIsVisible);
    setHidden(resumenPanel, !resumenIsVisible);

    if (constellation) setHidden(constellation, !homeIsVisible);

    if (homeIsVisible) {
      renderSubprogramas();
      forceCloseSubmodsDrawer();
    }
  }

  // ============================================================
  // Error helpers
  // ============================================================
  function getHttpStatus(e) {
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
    const detail = getHttpDetail(e) || "Fallo la operacion.";

    if (status === 401) {
      toastCompat({
        type: "warning",
        title: "Sesion",
        msg: "Tu sesion expiro o no es valida. Vuelve a iniciar sesion.",
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
    return e?.evidencia_id ?? e?.id ?? e?.evidenciaId ?? null;
  }

  // ============================================================
  // Valoracion por niveles
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
  // API try helper (si un endpoint no existe, intenta otro)
  // ============================================================
  async function apiTry(paths = [], opts = {}) {
    let lastErr = null;
    for (const p of paths) {
      try {
        return await A.api(p, opts);
      } catch (e) {
        lastErr = e;
        const st = getHttpStatus(e);
        // solo fallback en 404/405
        if (st !== 404 && st !== 405) throw e;
      }
    }
    throw lastErr || new Error("No se pudo completar la solicitud.");
  }

  // ============================================================
  // Render tabla operativa
  // ============================================================
  function buildOperativaTableHTML(evidencias, submoduloNombre, iesNombre) {
    const rows = (Array.isArray(evidencias) ? evidencias : []).map((e, idx) => {
      const evidId = evidenciaIdOf(e);

      const titulo = e?.titulo ?? `Evidencia ${idx + 1}`;
      const responsable = e?.responsable ?? "";

      const valoracionNum = clamp01_100(e?.valoracion ?? 0);

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

      const catVal = (() => {
        const v = e?.categoria_si_no;
        if (v === true) return "SI";
        if (v === false) return "NO";
        const s = (v ?? "").toString().trim().toUpperCase();
        return (s === "SI" || s === "NO") ? s : "";
      })();

      const canSave = !!evidId;

      return `
        <tr data-evid="${escapeHtml(String(evidId ?? ""))}">
          <td style="width:40px;" class="text-secondary">${idx + 1}</td>

          <td style="min-width:340px;">
            <div class="fw-semibold">${escapeHtml(titulo)}</div>
            <div class="text-secondary small">
              Evidencia #${escapeHtml(String(evidId ?? "—"))}
              · Submodulo #${escapeHtml(String(e?.submodulo_id ?? ""))}
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
            <div class="text-secondary small mt-1">Valoracion</div>
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
              <option value="" ${catVal === "" ? "selected" : ""}>—</option>
              <option value="SI" ${catVal === "SI" ? "selected" : ""}>SI</option>
              <option value="NO" ${catVal === "NO" ? "selected" : ""}>NO</option>
            </select>
            <div class="text-secondary small mt-1">Categoria</div>
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
            <h4 class="mb-1">${escapeHtml(submoduloNombre || "Submodulo")}</h4>
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
                <th class="text-end">Valoracion</th>
                <th class="text-end">Avance</th>
                <th>Fecha inicio</th>
                <th>Fecha fin</th>
                <th>Categoria</th>
                <th class="text-end">Accion</th>
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

  async function wireOperativaTableHandlers(rootEl, saveFn) {
    const tbody = rootEl.querySelector("#opTbody");
    if (!tbody) return;

    tbody.onclick = async (ev) => {
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

      const nivelKey = tr.querySelector(".js-valoracion-nivel")?.value || "deficiente";

      const catRaw = (tr.querySelector(".js-categoria")?.value || "")
        .toString()
        .trim()
        .toUpperCase();

      const catBool = catRaw === "SI" ? true : catRaw === "NO" ? false : null;

      const payload = {
        responsable: tr.querySelector(".js-responsable")?.value?.trim() || "",
        presenta: !!tr.querySelector(".js-presenta")?.checked,
        valoracion: scoreFromNivel(nivelKey),
        extra_data: {
          valoracion_nivel: nivelKey,
          valoracion_label: labelFromNivel(nivelKey),
        },
        avance_pct: clamp01_100(tr.querySelector(".js-avance")?.value),
        fecha_inicio: tr.querySelector(".js-fecha-inicio")?.value || null,
        fecha_fin: tr.querySelector(".js-fecha-fin")?.value || null,
        categoria_si_no: catBool,
      };

      try {
        btn.disabled = true;
        setStatus("Guardando…", "secondary");
        await saveFn(evidId, payload);
        setStatus("Guardado ✓", "success");
        toastCompat({ type: "success", title: "Operativa", msg: "Fila guardada.", ms: 1800 });
      } catch (e) {
        console.error(e);
        toastHttpError(e, "No se pudo guardar");
        setStatus("Error al guardar", "danger");
      } finally {
        btn.disabled = false;
        setTimeout(() => setStatus(""), 2500);
      }
    };
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
  // IES context resolver
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

  async function ensureIESResolved() {
    if (A.state?.ies?.slug) return A.state.ies;

    const ctx = resolveIESContextFromCoreAndJwt();
    A.state.ies = ctx;

    if (isIES()) return A.state.ies;

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

      if (!ctx.slug) {
        setUserActive("Institucion activa: (sin slug)", true);
        toastCompat({
          type: "warning",
          title: "Falta IES (slug)",
          msg:
            "No tengo ies_slug en sesion. Igual cargo el catalogo. " +
            "Al abrir Operativa usare endpoints sin slug o intentare fallback.",
          ms: 8000,
        });
        return;
      }

      setUserActive(`Institucion activa: ${ctx.nombre || ctx.slug}`, true);
      return;
    }

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
  // Subprogramas/submodulos (IES)
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
            <p class="subp-desc">Entra para ver submodulos y registrar evidencias.</p>
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
    if (submodsMeta) submodsMeta.textContent = `Subprograma #${sp.id} · elige un submodulo`;
    if (btnVerResumen) btnVerResumen.disabled = true;
  }

  function openSubmodsDrawer() {
    safeHideCoach();
    try {
      if (canvasEl) {
        canvasEl.style.visibility = "visible";
        canvasEl.removeAttribute("aria-hidden");
      }
      canvas?.show();
    } catch {}
  }

  // ============================================================
  // Endpoint helpers + fallbacks
  // ============================================================
  function evidenciasPathsForSubmodulo(submoduloId) {
    const slug = A.state.ies?.slug;
    if (isIES()) {
      // primero sin slug, luego fallback con slug si existe
      const arr = [
        `/operacion/submodulos/${submoduloId}/evidencias`,
      ];
      if (slug) arr.push(`/operacion/ies/${slug}/submodulos/${submoduloId}/evidencias`);
      return arr;
    }
    // admin: requiere slug
    if (!slug) throw new Error("Falta ies.slug para cargar evidencias (Admin).");
    return [`/operacion/ies/${slug}/submodulos/${submoduloId}/evidencias`];
  }

  function resumenPathsForSubmodulo(submoduloId) {
    if (isIES()) {
      // endpoint mio (y fallback al admin si tu backend no tiene /mio)
      const iesId = A.state.ies?.id;
      const arr = [
        `/api/resumen/mio/submodulo/${submoduloId}`,
      ];
      if (iesId) arr.push(`/api/resumen/submodulo/${iesId}/${submoduloId}`);
      return arr;
    }

    const iesId =
      A.state.ies?.id ||
      (typeof A.getIesId === "function" ? A.getIesId() : null);

    if (!iesId) throw new Error("Falta ies_id para cargar resumen (Admin).");
    return [`/api/resumen/submodulo/${iesId}/${submoduloId}`];
  }

  async function fetchEvidencias(submoduloId) {
    return await apiTry(evidenciasPathsForSubmodulo(submoduloId));
  }

  async function fetchResumenSubmodulo(submoduloId) {
    return await apiTry(resumenPathsForSubmodulo(submoduloId));
  }

  async function saveEvidenciaPatch(evidenciaId, payload) {
    const slug = A.state.ies?.slug;

    if (isIES()) {
      const paths = [
        `/operacion/evidencias/${evidenciaId}`,
      ];
      if (slug) paths.push(`/operacion/ies/${slug}/evidencias/${evidenciaId}`);
      return await apiTry(paths, { method: "PATCH", body: JSON.stringify(payload) });
    }

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
    safeHideCoach();

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

    operativaPanel.innerHTML = `
      <div class="container-fluid mt-3">
        <div class="text-secondary small">OPERATIVA</div>
        <h4 class="mb-1">${escapeHtml(submodulo?.nombre || "Submodulo")}</h4>
        <div class="text-secondary small">IES: ${escapeHtml(iesName)}</div>
        <hr class="my-2" />
        <div class="text-secondary small">Cargando evidencias…</div>
      </div>
    `;

    try {
      const evidencias = await fetchEvidencias(submodulo.id);
      const arr = Array.isArray(evidencias) ? evidencias : (evidencias?.items || []);

      operativaPanel.innerHTML = buildOperativaTableHTML(
        arr,
        submodulo?.nombre || "Submodulo",
        iesName
      );

      await wireOperativaTableHandlers(operativaPanel, saveEvidenciaPatch);
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
  // Resumen (submodulo)
  // ============================================================
  async function openResumenFromPlanner(submodulo) {
    safeHideCoach();

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
        <h4 class="mb-1">${escapeHtml(submodulo?.nombre || "Submodulo")}</h4>
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
              <h4 class="mb-1">${escapeHtml(submodulo?.nombre || "Submodulo")}</h4>
              <div class="text-secondary small">
                IES: ${escapeHtml(A.state.ies?.nombre || A.state.ies?.slug || "—")}
                · Submodulo #${escapeHtml(String(submodulo?.id || "—"))}
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
            <h4 class="mb-1">Subprogramas · Submodulos</h4>
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
                <th style="min-width:320px;">Submodulo</th>
                <th style="min-width:190px;">Responsable</th>
                <th class="text-end" style="min-width:110px;">Evidencias</th>
                <th class="text-end" style="min-width:90px;">Avance</th>
                <th style="min-width:150px;">Ult. actualizacion</th>
                <th style="min-width:110px;"></th>
              </tr>
            </thead>
            <tbody id="rgTbody">
              <tr><td colspan="7" class="text-secondary">Cargando…</td></tr>
            </tbody>
          </table>
        </div>

        <div class="text-secondary small mt-2">
          Abre un submodulo con <b>Ver</b> para revisar su resumen completo.
        </div>
      </div>
    `;
  }

  async function openResumenGeneral() {
    safeHideCoach();

    if (!resumenPanel) return;

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
      showOnly("home");
    });

    const rgProgress = document.getElementById("rgProgress");
    const rgTbody = document.getElementById("rgTbody");

    try {
      if (rgProgress) rgProgress.textContent = "Cargando catalogo de subprogramas…";
      const subprogramas = await A.api("/catalogo/subprogramas");
      const sps = Array.isArray(subprogramas) ? subprogramas : [];

      if (!sps.length) {
        if (rgTbody) rgTbody.innerHTML = `<tr><td colspan="7" class="text-secondary">No hay subprogramas.</td></tr>`;
        if (rgProgress) rgProgress.textContent = "Listo.";
        return;
      }

      if (rgProgress) rgProgress.textContent = "Cargando submodulos…";
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
            smName: sm.nombre || `Submodulo ${sm.id}`,
          });
        }
      }

      if (!rows.length) {
        if (rgTbody) rgTbody.innerHTML = `<tr><td colspan="7" class="text-secondary">No hay submodulos.</td></tr>`;
        if (rgProgress) rgProgress.textContent = "Listo.";
        return;
      }

      let done = 0;
      if (rgProgress) rgProgress.textContent = `Cargando resumenes: 0/${rows.length}…`;

      const results = await mapLimit(rows, 4, async (row) => {
        try {
          const data = await fetchResumenSubmodulo(row.smId);
          return { ok: true, row, data };
        } catch (e) {
          console.error("Resumen submodulo fallo:", row.smId, e);
          return { ok: false, row, err: e };
        } finally {
          done++;
          if (rgProgress) rgProgress.textContent = `Cargando resumenes: ${done}/${rows.length}…`;
        }
      });

      if (rgProgress) rgProgress.textContent = `Listo ✓ (${rows.length} submodulos)`;

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

    safeHideCoach();

    const id = Number(node.dataset.id);
    setActiveSubp(id);

    if (submodulosList) submodulosList.innerHTML = `<div class="text-secondary small">Cargando submodulos…</div>`;
    openSubmodsDrawer();

    try {
      await loadSubmodulos(id);
    } catch (e) {
      console.error(e);
      toastHttpError(e, "No se pudieron cargar submodulos");
      if (submodulosList) submodulosList.innerHTML = `<div class="text-danger small">Error cargando submodulos.</div>`;
    }
  });

  searchSubp?.addEventListener("input", () => { if (isIES()) renderSubprogramas(); });
  searchSubm?.addEventListener("input", () => { if (isIES()) renderSubmodulos(); });

  submodulosList?.addEventListener("click", async (ev) => {
    if (!isIES()) return;

    const item = ev.target.closest(".subm-item");
    if (!item) return;

    safeHideCoach();

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

    safeHideCoach();

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
    safeHideCoach();

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

    showOnly("home");
    renderSubprogramas();
  } catch (err) {
    console.error(err);
    if (field) field.innerHTML = `<div class="text-danger small">Error cargando catalogo.</div>`;
    toastCompat({
      type: "danger",
      title: "Error",
      msg: "No se pudo cargar el catalogo. Revisa consola/endpoint.",
      ms: 6500,
    });
  }
});
