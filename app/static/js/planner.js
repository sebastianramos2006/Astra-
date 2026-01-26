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
  // Fallbacks IMPORTANTES para evitar “errores futuros”
  // - A.api: wrapper fetch JSON con token
  // - A.parseJwt: decodifica payload del JWT
  // - A.getRole / A.getRoleRaw: rol desde JWT si no existe función
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
      const base = "";
      const url = path.startsWith("http") ? path : `${base}${path}`;

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
  // ✅ TOASTS (alerts pequeños)
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
  // ✅ COACH / OVERLAY GRANDE (compatibilidad)
  // ============================================================
  function ensureCoach() {
    let host = document.getElementById("astraCoach");
    if (host) return host;

    host = document.createElement("div");
    host.id = "astraCoach";
    host.className = "astra-coach hidden";

    host.innerHTML = `
      <div class="astra-coach__backdrop"></div>

      <div class="astra-coach__card" role="dialog" aria-modal="true" aria-label="Guía Astra">
        <button class="astra-coach__close" aria-label="Cerrar">×</button>

        <div class="astra-coach__grid">
          <div class="astra-coach__img">
            <img src="/static/img/astra.png" alt="Astra">
          </div>

          <div class="astra-coach__body">
            <div class="astra-coach__title" id="astraCoachTitle">ASTRA</div>
            <div class="astra-coach__msg" id="astraCoachMsg"></div>

            <div class="astra-coach__footer">
              <label class="astra-coach__chk">
                <input type="checkbox" id="astraCoachDontShow">
                No mostrar nuevamente
              </label>

              <div class="astra-coach__actions">
                <button class="btn btn-outline-light btn-sm" id="astraCoachPrev">Atrás</button>
                <button class="btn btn-primary btn-sm" id="astraCoachNext">Siguiente</button>
                <button class="btn btn-light btn-sm" id="astraCoachOk">Entendido</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    const style = document.createElement("style");
    style.textContent = `
      .astra-coach.hidden { display:none; }
      .astra-coach { position:fixed; inset:0; z-index:9999; }
      .astra-coach__backdrop{
        position:absolute; inset:0;
        background:rgba(0,0,0,.55);
        backdrop-filter: blur(6px);
      }
      .astra-coach__card{
        position:absolute;
        left:50%; top:50%;
        transform:translate(-50%,-50%);
        width:min(980px, calc(100vw - 28px));
        border-radius:22px;
        background:rgba(10,14,28,.88);
        border:1px solid rgba(255,255,255,.14);
        box-shadow:0 25px 80px rgba(0,0,0,.55);
        overflow:hidden;
      }
      .astra-coach__close{
        position:absolute; right:14px; top:10px;
        width:38px; height:38px;
        border-radius:12px;
        border:1px solid rgba(255,255,255,.16);
        background:rgba(255,255,255,.06);
        color:#fff; font-size:22px;
      }
      .astra-coach__grid{
        display:grid;
        grid-template-columns: 360px 1fr;
        gap:0;
        min-height:420px;
      }
      @media (max-width: 860px){
        .astra-coach__grid{ grid-template-columns: 1fr; }
        .astra-coach__img{ min-height:240px; }
      }
      .astra-coach__img{
        display:flex;
        align-items:flex-end;
        justify-content:center;
        padding:18px;
        background:radial-gradient(60% 60% at 50% 40%, rgba(120,160,255,.18), transparent 70%);
      }
      .astra-coach__img img{
        width:min(340px, 90%);
        height:auto;
        filter: drop-shadow(0 20px 45px rgba(0,0,0,.55));
        transform: translateY(6px);
      }
      .astra-coach__body{
        padding:22px 22px 18px 22px;
        display:flex;
        flex-direction:column;
        gap:10px;
      }
      .astra-coach__title{
        font-weight:800;
        letter-spacing:.2px;
        font-size:1.25rem;
        color:rgba(255,255,255,.95);
      }
      .astra-coach__msg{
        font-size:1.02rem;
        line-height:1.4;
        color:rgba(255,255,255,.82);
        white-space:pre-line;
      }
      .astra-coach__footer{
        margin-top:auto;
        padding-top:12px;
        border-top:1px solid rgba(255,255,255,.10);
        display:flex;
        justify-content:space-between;
        align-items:center;
        gap:10px;
        flex-wrap:wrap;
      }
      .astra-coach__chk{
        display:flex;
        align-items:center;
        gap:8px;
        color:rgba(255,255,255,.70);
        font-size:.92rem;
      }
      .astra-coach__actions{
        display:flex;
        align-items:center;
        gap:8px;
      }
    `;
    document.head.appendChild(style);
    document.body.appendChild(host);

    const closeBtn = host.querySelector(".astra-coach__close");
    const backdrop = host.querySelector(".astra-coach__backdrop");

    const close = () => host.classList.add("hidden");
    closeBtn?.addEventListener("click", close);
    backdrop?.addEventListener("click", close);

    return host;
  }

  function getDisplayName() {
    const p = A.parseJwt?.();
    const raw = p?.nombre || p?.name || p?.usuario || p?.email || "";
    if (!raw) return "👋";
    const s = String(raw);
    if (s.includes("@")) return s.split("@")[0];
    return s;
  }

  A.coach = function ({ title = "ASTRA", msg = "", key = "coach_seen", force = false } = {}) {
    try {
      if (!force) {
        const seen = localStorage.getItem(key);
        if (seen === "1") return;
      }
    } catch {}

    const host = ensureCoach();
    const t = host.querySelector("#astraCoachTitle");
    const m = host.querySelector("#astraCoachMsg");
    const chk = host.querySelector("#astraCoachDontShow");

    const btnPrev = host.querySelector("#astraCoachPrev");
    const btnNext = host.querySelector("#astraCoachNext");
    const btnOk = host.querySelector("#astraCoachOk");

    btnPrev.style.display = "none";
    btnNext.style.display = "none";
    btnOk.style.display = "inline-flex";

    t.textContent = title;
    m.textContent = msg;

    btnOk.onclick = () => {
      try {
        if (chk?.checked) localStorage.setItem(key, "1");
      } catch {}
      host.classList.add("hidden");
    };

    host.classList.remove("hidden");
  };

  A.coachSteps = function ({ steps = [], key = "coach_steps_seen", force = false } = {}) {
    try {
      if (!force) {
        const seen = localStorage.getItem(key);
        if (seen === "1") return;
      }
    } catch {}

    if (!steps.length) return;

    const host = ensureCoach();
    const t = host.querySelector("#astraCoachTitle");
    const m = host.querySelector("#astraCoachMsg");
    const chk = host.querySelector("#astraCoachDontShow");

    const btnPrev = host.querySelector("#astraCoachPrev");
    const btnNext = host.querySelector("#astraCoachNext");
    const btnOk = host.querySelector("#astraCoachOk");

    btnPrev.style.display = "inline-flex";
    btnNext.style.display = "inline-flex";
    btnOk.style.display = "inline-flex";

    let i = 0;

    function paint() {
      const s = steps[i];
      t.textContent = s.title || "ASTRA";
      m.textContent = s.msg || "";

      btnPrev.disabled = i === 0;
      const last = i === steps.length - 1;
      btnNext.style.display = last ? "none" : "inline-flex";
      btnOk.textContent = last ? "Entendido" : "Cerrar";
    }

    btnPrev.onclick = () => {
      if (i > 0) {
        i--;
        paint();
      }
    };
    btnNext.onclick = () => {
      if (i < steps.length - 1) {
        i++;
        paint();
      }
    };

    btnOk.onclick = () => {
      try {
        if (chk?.checked) localStorage.setItem(key, "1");
      } catch {}
      host.classList.add("hidden");
    };

    paint();
    host.classList.remove("hidden");
  };

  // ============================================================
  // ✅ COACH MINIMAL (Astra + globo pequeño) + spotlight opcional
  // ============================================================
  function ensureCoachPointStyles() {
    const id = "astraPointStyles";
    if (document.getElementById(id)) return;

    const style = document.createElement("style");
    style.id = id;
    style.textContent = `
      .astra-point.hidden { display:none; }
      .astra-point{ position:fixed; inset:0; z-index:10000; pointer-events:none; }
      .astra-point__layer{ position:absolute; inset:0; pointer-events:none; }
      .astra-point__spot{
        position:absolute;
        border-radius: 16px;
        box-shadow:
          0 0 0 9999px rgba(0,0,0,.28),
          0 0 0 2px rgba(120,160,255,.25);
        opacity:.95;
        pointer-events:none;
      }
      .astra-point__card{
        position:absolute;
        display:flex;
        align-items:flex-end;
        gap:10px;
        max-width: min(520px, calc(100vw - 24px));
        pointer-events:auto;
      }
      .astra-point__img{
        width: 140px;
        flex: 0 0 140px;
        display:flex;
        align-items:flex-end;
        justify-content:center;
      }
      .astra-point__img img{
        width: 140px;
        height:auto;
        filter: drop-shadow(0 18px 40px rgba(0,0,0,.55));
      }
      .astra-point__bubble{
        position:relative;
        padding: 10px 12px;
        border-radius: 14px;
        background: rgba(10,14,28,.92);
        border: 1px solid rgba(255,255,255,.14);
        box-shadow: 0 18px 50px rgba(0,0,0,.55);
        min-width: 220px;
      }
      .astra-point__title{
        font-weight: 900;
        color: rgba(255,255,255,.95);
        margin-bottom: 3px;
        font-size: .98rem;
      }
      .astra-point__msg{
        color: rgba(255,255,255,.82);
        line-height: 1.3;
        white-space: pre-line;
        margin: 0;
        font-size: .94rem;
      }
      .astra-point__bubble:after{
        content:"";
        position:absolute;
        width: 0; height: 0;
        border: 10px solid transparent;
      }
      .astra-point__bubble.arrow-left:after{
        left: -18px; top: 18px;
        border-right-color: rgba(10,14,28,.92);
      }
      .astra-point__bubble.arrow-right:after{
        right: -18px; top: 18px;
        border-left-color: rgba(10,14,28,.92);
      }
      .astra-point__bubble.arrow-top:after{
        top: -18px; left: 24px;
        border-bottom-color: rgba(10,14,28,.92);
      }
      .astra-point__bubble.arrow-bottom:after{
        bottom: -18px; left: 24px;
        border-top-color: rgba(10,14,28,.92);
      }
      .astra-point__actions{
        margin-top: 8px;
        display:flex;
        gap:8px;
        justify-content:flex-end;
        flex-wrap:wrap;
      }
      .astra-point__btn{
        border-radius: 12px;
        border: 1px solid rgba(255,255,255,.14);
        background: rgba(255,255,255,.08);
        color: #fff;
        padding: 7px 10px;
        font-size: .90rem;
        cursor:pointer;
      }
      .astra-point__btn.primary{
        background: rgba(120,160,255,.22);
        border-color: rgba(120,160,255,.35);
      }
      .astra-point__btn:disabled{
        opacity:.55;
        cursor:not-allowed;
      }
      .astra-guide-btn{
        position:fixed;
        right:16px;
        bottom:16px;
        z-index:10001;
        border-radius:14px;
        padding:10px 12px;
        border:1px solid rgba(255,255,255,.16);
        background: rgba(10,14,28,.86);
        color:#fff;
        box-shadow: 0 18px 50px rgba(0,0,0,.45);
        cursor:pointer;
        display:flex;
        align-items:center;
        gap:8px;
        font-weight:800;
      }
      .astra-guide-btn:hover{ transform: translateY(-1px); }
    `;
    document.head.appendChild(style);
  }

  function ensureCoachPoint() {
    ensureCoachPointStyles();

    let host = document.getElementById("astraPoint");
    if (host) return host;

    host = document.createElement("div");
    host.id = "astraPoint";
    host.className = "astra-point hidden";

    host.innerHTML = `
      <div class="astra-point__layer" id="astraPointLayer">
        <div class="astra-point__spot" id="astraPointSpot"></div>

        <div class="astra-point__card" id="astraPointCard" role="dialog" aria-modal="true" aria-label="Guía Astra">
          <div class="astra-point__img">
            <img id="astraPointImg" src="/static/img/astra_saludo.png" onerror="this.src='/static/img/astra.png'" alt="Astra">
          </div>

          <div class="astra-point__bubble" id="astraPointBubble">
            <div class="astra-point__title" id="astraPointTitle">ASTRA</div>
            <p class="astra-point__msg" id="astraPointMsg"></p>

            <div class="astra-point__actions">
              <button class="astra-point__btn" id="astraPointPrev">Atrás</button>
              <button class="astra-point__btn primary" id="astraPointNext">Siguiente</button>
              <button class="astra-point__btn primary" id="astraPointOk">Entendido</button>
              <button class="astra-point__btn" id="astraPointDont">No mostrar</button>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(host);

    const layer = host.querySelector("#astraPointLayer");
    const bubble = host.querySelector("#astraPointBubble");
    layer?.addEventListener("click", (ev) => {
      if (!bubble) return;
      if (bubble.contains(ev.target)) return;
      host.classList.add("hidden");
    });

    if (!host.dataset.boundReposition) {
      host.dataset.boundReposition = "1";
      const rep = () => {
        if (host.classList.contains("hidden")) return;
        const fnName = host.dataset.repositionFn;
        const fn = fnName && A._repositionFns ? A._repositionFns[fnName] : null;
        if (typeof fn === "function") fn();
      };
      window.addEventListener("resize", rep, { passive: true });
      window.addEventListener("scroll", rep, { passive: true });
    }

    return host;
  }

  function safeRect(el) {
    try {
      const r = el.getBoundingClientRect();
      if (!r || !Number.isFinite(r.left)) return null;
      return r;
    } catch {
      return null;
    }
  }

  function placePoint(host, targetEl, prefer = "right") {
    const spot = host.querySelector("#astraPointSpot");
    const card = host.querySelector("#astraPointCard");
    const bubble = host.querySelector("#astraPointBubble");
    if (!spot || !card || !bubble) return;

    if (!targetEl) {
      spot.style.left = `-9999px`;
      spot.style.top = `-9999px`;
      spot.style.width = `0px`;
      spot.style.height = `0px`;

      bubble.classList.remove("arrow-left", "arrow-right", "arrow-top", "arrow-bottom");
      card.style.left = `${Math.max(12, window.innerWidth / 2 - 240)}px`;
      card.style.top = `${Math.max(12, window.innerHeight / 2 - 120)}px`;
      return;
    }

    const r = safeRect(targetEl);
    if (!r) return;

    const pad = 8;

    const left = Math.max(0, r.left - pad);
    const top = Math.max(0, r.top - pad);
    const width = Math.min(window.innerWidth - left, r.width + pad * 2);
    const height = Math.min(window.innerHeight - top, r.height + pad * 2);

    spot.style.left = `${left}px`;
    spot.style.top = `${top}px`;
    spot.style.width = `${width}px`;
    spot.style.height = `${height}px`;

    const spaceRight = window.innerWidth - r.right;
    const spaceLeft = r.left;
    const spaceBottom = window.innerHeight - r.bottom;
    const spaceTop = r.top;

    let side = prefer;

    if (side === "right" && spaceRight < 320 && spaceLeft > spaceRight) side = "left";
    if (side === "left" && spaceLeft < 320 && spaceRight > spaceLeft) side = "right";

    if ((side === "right" && spaceRight < 260) || (side === "left" && spaceLeft < 260)) {
      side = spaceBottom > spaceTop ? "bottom" : "top";
    }

    bubble.classList.remove("arrow-left", "arrow-right", "arrow-top", "arrow-bottom");

    const cardW = 520;
    const cardH = 220;

    let cx = 16;
    let cy = 16;

    if (side === "right") {
      cx = Math.min(window.innerWidth - 16, r.right + 16);
      cy = Math.max(16, Math.min(window.innerHeight - cardH - 16, r.top + r.height / 2 - cardH / 2));
      bubble.classList.add("arrow-left");
    } else if (side === "left") {
      cx = Math.max(16, r.left - cardW - 16);
      cy = Math.max(16, Math.min(window.innerHeight - cardH - 16, r.top + r.height / 2 - cardH / 2));
      bubble.classList.add("arrow-right");
    } else if (side === "bottom") {
      cx = Math.max(16, Math.min(window.innerWidth - cardW - 16, r.left));
      cy = Math.min(window.innerHeight - cardH - 16, r.bottom + 14);
      bubble.classList.add("arrow-top");
    } else {
      cx = Math.max(16, Math.min(window.innerWidth - cardW - 16, r.left));
      cy = Math.max(16, r.top - cardH - 14);
      bubble.classList.add("arrow-bottom");
    }

    card.style.left = `${cx}px`;
    card.style.top = `${cy}px`;
  }

  function setSeen(key) {
    try {
      localStorage.setItem(key, "1");
    } catch {}
  }
  function getSeen(key) {
    try {
      return localStorage.getItem(key) === "1";
    } catch {
      return false;
    }
  }

  A._repositionFns = A._repositionFns || {};

  function bindReposition(host, fn) {
    const name = `fn_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    A._repositionFns[name] = fn;
    host.dataset.repositionFn = name;
  }

  A.coachPoint = function ({
    target,
    title = "ASTRA",
    msg = "",
    key = "coach_point_seen",
    force = false,
    prefer = "right",
    img = "/static/img/astra_saludo.png",
  } = {}) {
    if (!force && getSeen(key)) return;

    const host = ensureCoachPoint();

    const t = host.querySelector("#astraPointTitle");
    const m = host.querySelector("#astraPointMsg");
    const imgEl = host.querySelector("#astraPointImg");

    const btnPrev = host.querySelector("#astraPointPrev");
    const btnNext = host.querySelector("#astraPointNext");
    const btnOk = host.querySelector("#astraPointOk");
    const btnDont = host.querySelector("#astraPointDont");

    if (btnPrev) btnPrev.style.display = "none";
    if (btnNext) btnNext.style.display = "none";
    if (btnOk) btnOk.style.display = "inline-flex";

    if (t) t.textContent = title;
    if (m) m.textContent = msg;

    if (imgEl) {
      imgEl.src = img || "/static/img/astra_saludo.png";
      imgEl.onerror = () => (imgEl.src = "/static/img/astra.png");
    }

    const resolveTarget = () => (typeof target === "string" ? document.querySelector(target) : target);

    host.classList.remove("hidden");
    placePoint(host, resolveTarget(), prefer);

    const close = () => host.classList.add("hidden");

    if (btnOk) btnOk.onclick = () => close();
    if (btnDont)
      btnDont.onclick = () => {
        setSeen(key);
        close();
      };

    bindReposition(host, () => placePoint(host, resolveTarget(), prefer));
  };

  A.coachPointSteps = function ({ steps = [], key = "coach_point_steps_seen", force = false } = {}) {
    if (!force && getSeen(key)) return;
    if (!steps.length) return;

    const host = ensureCoachPoint();

    const t = host.querySelector("#astraPointTitle");
    const m = host.querySelector("#astraPointMsg");
    const imgEl = host.querySelector("#astraPointImg");

    const btnPrev = host.querySelector("#astraPointPrev");
    const btnNext = host.querySelector("#astraPointNext");
    const btnOk = host.querySelector("#astraPointOk");
    const btnDont = host.querySelector("#astraPointDont");

    if (btnPrev) btnPrev.style.display = "inline-flex";
    if (btnNext) btnNext.style.display = "inline-flex";
    if (btnOk) btnOk.style.display = "inline-flex";

    let i = 0;

    const close = () => host.classList.add("hidden");

    const resolveTarget = (target) => (typeof target === "string" ? document.querySelector(target) : target);

    function paint() {
      const s = steps[i] || {};
      if (t) t.textContent = s.title || "ASTRA";
      if (m) m.textContent = s.msg || "";

      if (imgEl) {
        imgEl.src = s.img || "/static/img/astra_saludo.png";
        imgEl.onerror = () => (imgEl.src = "/static/img/astra.png");
      }

      const target = s.target || null;
      const prefer = s.prefer || "right";
      const el = resolveTarget(target);

      host.classList.remove("hidden");
      placePoint(host, el || null, prefer);

      if (btnPrev) btnPrev.disabled = i === 0;

      const last = i === steps.length - 1;
      if (btnNext) btnNext.style.display = last ? "none" : "inline-flex";
      if (btnOk) btnOk.textContent = last ? "Entendido" : "Cerrar";

      bindReposition(host, () => {
        const s2 = steps[i] || {};
        const el2 = resolveTarget(s2.target || null);
        placePoint(host, el2 || null, s2.prefer || "right");
      });
    }

    if (btnPrev)
      btnPrev.onclick = () => {
        if (i > 0) {
          i--;
          paint();
        }
      };

    if (btnNext)
      btnNext.onclick = () => {
        if (i < steps.length - 1) {
          i++;
          paint();
        }
      };

    if (btnOk) btnOk.onclick = () => close();

    if (btnDont)
      btnDont.onclick = () => {
        setSeen(key);
        close();
      };

    paint();
  };

  function showOnboardingOnce(key, runner) {
    if (getSeen(key)) return false;
    setSeen(key);
    try {
      runner?.();
      return true;
    } catch (e) {
      console.error("Onboarding falló:", e);
      return false;
    }
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
  // LOGOUT (una sola vez)
  // ============================================================
  if (btnLogout && !btnLogout.dataset.wired) {
    btnLogout.dataset.wired = "1";
    btnLogout.addEventListener("click", (ev) => {
      ev.preventDefault();
      if (typeof A.logout === "function") A.logout();
      else {
        try {
          localStorage.removeItem("access_token");
        } catch {}
        try {
          sessionStorage.removeItem("access_token");
        } catch {}
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

  const POS = [
    { left: "10%", top: "18%" },
    { left: "38%", top: "16%" },
    { left: "68%", top: "28%" },
    { left: "18%", top: "58%" },
    { left: "46%", top: "66%" },
    { left: "76%", top: "72%" },
  ];

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
    try {
      canvas?.hide();
    } catch {}
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

  function showOnly(panel) {
    if (isAdminLocked()) {
      resetLockedAdminUI();
      return;
    }

    const operativaIsVisible = panel === "operativa";
    const resumenIsVisible = panel === "resumen";

    setHidden(operativaPanel, !operativaIsVisible);
    setHidden(resumenPanel, !resumenIsVisible);

    if (constellation) setHidden(constellation, panel !== "home");
  }

  // ============================================================
  // ✅ Botón Guía (manual)
  // ============================================================
  function ensureGuideButton() {
    const existing = qs("#btnGuia") || qs("#btnGuide");
    if (existing && !existing.dataset.boundGuide) {
      existing.dataset.boundGuide = "1";
      existing.addEventListener("click", () => openGuideManual());
      return existing;
    }

    if (document.getElementById("astraGuideBtn")) return document.getElementById("astraGuideBtn");

    const b = document.createElement("button");
    b.id = "astraGuideBtn";
    b.className = "astra-guide-btn";
    b.type = "button";
    b.innerHTML = `Guía <span style="opacity:.85">Astra</span>`;
    b.addEventListener("click", () => openGuideManual());
    document.body.appendChild(b);
    return b;
  }

  function openGuideManual() {
    if (isAdminLocked()) {
      showAdminGateIfNeeded(true);
      return;
    }

    if (isIES()) {
      A.coachPointSteps({
        key: "onboarding_ies_point_v2",
        force: true,
        steps: [
          {
            title: `Hola ${getDisplayName()} 👋`,
            target: "#subprogramasField",
            prefer: "left",
            img: "/static/img/astra_saludo.png",
            msg: "Selecciona un subprograma aquí\npara ver los submódulos.",
          },
          {
            title: "Cómo llenar evidencias",
            target: "#btnResumenGlobal",
            prefer: "left",
            img: "/static/img/astra_checklist.png",
            msg: "En operativa completa: Responsable, Fechas,\nPresenta, Valoración y % Avance. Luego Guardar.",
          },
          {
            title: "Salir",
            target: "#btnLogout",
            prefer: "top",
            img: "/static/img/astra_exit.png",
            msg: "Cuando termines, cierra sesión desde aquí.",
          },
        ],
      });
    } else {
      A.coachPointSteps({
        key: "onboarding_admin_point_v2",
        force: true,
        steps: [
          {
            title: `Hola ${getDisplayName()} 👋`,
            target: "#subprogramasField",
            prefer: "left",
            img: "/static/img/astra_saludo.png",
            msg: "Selecciona un subprograma para abrir submódulos.",
          },
          {
            title: "Resumen general",
            target: "#btnResumenGlobal",
            prefer: "left",
            img: "/static/img/astra_checklist.png",
            msg: "Aquí ves el estado consolidado.\nPuedes abrir el resumen por submódulo.",
          },
          {
            title: "Salir",
            target: "#btnLogout",
            prefer: "top",
            img: "/static/img/astra_exit.png",
            msg: "Cuando termines, cierra sesión desde aquí.",
          },
        ],
      });
    }
  }

  // ============================================================
  // ✅ Admin gate
  // ============================================================
  let adminGateShown = false;

  function showAdminGateIfNeeded(forceCoach = false) {
    if (isAdmin() && !A.state.ies?.id) {
      resetLockedAdminUI();

      if (!adminGateShown || forceCoach) {
        if (!forceCoach) adminGateShown = true;

        if (iesSelect) {
          A.coachPoint({
            key: "onboarding_admin_gate_point_v2",
            target: "#iesSelect",
            prefer: "right",
            img: "/static/img/astra_saludo.png",
            title: `Hola ${getDisplayName()} 👋`,
            msg: "Primero selecciona una IES aquí.\nCada IES tiene su propia información, operativa y resúmenes.",
            force: !!forceCoach,
          });
        } else {
          A.coachSteps({
            key: "onboarding_admin_gate_v1",
            force: !!forceCoach,
            steps: [
              {
                title: `Hola ${getDisplayName()} 👋`,
                msg:
                  "Bienvenido al panel operativo administrativo de CEDEPRO.\n" +
                  "Antes de empezar, necesitamos seleccionar una institución (IES).",
              },
              {
                title: "Paso 1 · Selecciona una IES",
                msg: "Arriba en la barra superior elige una IES.\nCada IES tiene su propia información y resúmenes.",
              },
              {
                title: "Luego…",
                msg: "Cuando selecciones una IES, se habilitará el mapa de subprogramas.\nAhí podrás entrar a submódulos, operativa y resúmenes.",
              },
            ],
          });
        }
      }
      return true;
    }
    return false;
  }

  // ============================================================
  // CARDS / NODES
  // ============================================================
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

  function submItemHTML(sm) {
    return `
      <div class="subm-item" data-id="${sm.id}">
        <h4 class="subm-name">${escapeHtml(sm.nombre)}</h4>
        <p class="subm-hint">Abrir operativa (inputs) · o ver resumen</p>
      </div>
    `;
  }

  // ============================================================
  // LOADERS
  // ============================================================
  async function loadIESContext() {
    const p = A.parseJwt?.();
    enforceRoleUI();
    ensureGuideButton();

    if (isIES()) {
      const slug = p?.ies_slug || (p?.email ? String(p.email).split("@")[0] : "ies");
      const nombre = p?.ies_nombre || slug;
      const iesId = p?.ies_id ?? p?.iesId ?? p?.iesID ?? null;

      A.state.ies = { id: iesId, slug, nombre };
      setUserActive(`Institución activa: ${nombre}`, true);

      showOnboardingOnce("onboarding_ies_point_v2", () => {
        A.coachPointSteps({
          key: "onboarding_ies_point_v2",
          force: true,
          steps: [
            {
              title: `Hola ${getDisplayName()} 👋`,
              target: "#subprogramasField",
              prefer: "left",
              img: "/static/img/astra_saludo.png",
              msg: "Selecciona un subprograma aquí\npara ver los submódulos.",
            },
            {
              title: "Cómo llenar evidencias",
              target: "#btnResumenGlobal",
              prefer: "left",
              img: "/static/img/astra_checklist.png",
              msg: "En operativa completa: Responsable, Fechas,\nPresenta, Valoración y % Avance. Luego Guardar.",
            },
            {
              title: "Salir",
              target: "#btnLogout",
              prefer: "top",
              img: "/static/img/astra_exit.png",
              msg: "Cuando termines, cierra sesión desde aquí.",
            },
          ],
        });
      });

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

      iesSelect.addEventListener("change", () => {
        const id = Number(iesSelect.value);
        const found = A.state.iesList.find((x) => Number(x.id) === id) || null;
        A.state.ies = found;

        if (found) {
          setUserActive(`IES activa: ${found.nombre} (${found.slug})`, true);

          A.toast({
            type: "success",
            title: "IES activa",
            msg: `${found.nombre} (${found.slug}). Ya puedes navegar subprogramas y submódulos.`,
            ms: 4200,
          });

          showOnboardingOnce("onboarding_admin_point_v2", () => {
            A.coachPointSteps({
              key: "onboarding_admin_point_v2",
              force: true,
              steps: [
                {
                  title: `Hola ${getDisplayName()} 👋`,
                  target: "#subprogramasField",
                  prefer: "left",
                  img: "/static/img/astra_saludo.png",
                  msg: "IES activa ✅\nSelecciona un subprograma para abrir submódulos.",
                },
                {
                  title: "Resumen general",
                  target: "#btnResumenGlobal",
                  prefer: "left",
                  img: "/static/img/astra_checklist.png",
                  msg: "Aquí ves el estado consolidado.\nPuedes abrir el resumen por submódulo.",
                },
                {
                  title: "Salir",
                  target: "#btnLogout",
                  prefer: "top",
                  img: "/static/img/astra_exit.png",
                  msg: "Cuando termines, cierra sesión desde aquí.",
                },
              ],
            });
          });

          showOnly("home");
          if (constellation) setHidden(constellation, false);
          setHidden(operativaPanel, true);
          setHidden(resumenPanel, true);
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

  async function loadSubprogramas() {
    const data = await A.api("/catalogo/subprogramas");
    A.state.subprogramas = Array.isArray(data) ? data : [];
    renderSubprogramas();
  }

  function renderSubprogramas() {
    if (!field) return;

    if (isAdminLocked()) {
      field.innerHTML = "";
      if (constellation) setHidden(constellation, true);
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
    try {
      canvas?.show();
    } catch {}
  }

  // ============================================================
  // ENDPOINT HELPERS
  // ============================================================
  function evidenciasUrlForSubmodulo(submoduloId) {
    const slug = A.state.ies?.slug;
    if (!slug) return `/operacion/ies//submodulos/${submoduloId}/evidencias`;
    return `/operacion/ies/${slug}/submodulos/${submoduloId}/evidencias`;
  }

  // ✅ FIX: Admin e IES tienen rutas distintas en resumen.py
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
  // OPERATIVA UI
  // ============================================================
  function operativaShellHTML() {
    const sm = A.state.activeSubm;
    const iesName = A.state.ies?.nombre || A.state.ies?.slug || "—";

    return `
      <div class="container-fluid mt-3">
        <div class="d-flex align-items-start justify-content-between gap-3 flex-wrap">
          <div>
            <div class="text-secondary small">Operativa</div>
            <h4 class="mb-1">${escapeHtml(sm?.nombre || "Submódulo")}</h4>
            <div class="text-secondary small">IES: ${escapeHtml(iesName)} · Submódulo #${escapeHtml(
      String(sm?.id || "—")
    )}</div>
          </div>
          <div class="d-flex gap-2">
            <button id="btnBackToMap" class="btn btn-outline-light btn-sm">Volver al mapa</button>
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
  }

  function optionBool(v) {
    if (v === null || v === undefined) {
      return `
        <option value="" selected>—</option>
        <option value="1">SI</option>
        <option value="0">NO</option>
      `;
    }
    const yes = v === true;
    const no = v === false;
    return `
      <option value="1" ${yes ? "selected" : ""}>SI</option>
      <option value="0" ${no ? "selected" : ""}>NO</option>
    `;
  }

  function optionValoracion(v) {
    const levels = [
      { val: 0, label: "DEFICIENTE" },
      { val: 35, label: "POCO SATISFAC." },
      { val: 70, label: "CUASI SATISFAC." },
      { val: 100, label: "SATISFACTORIO" },
    ];
    return levels
      .map((x) => `<option value="${x.val}" ${Number(v) === x.val ? "selected" : ""}>${x.label}</option>`)
      .join("");
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

  async function openOperativa(submodulo) {
    if (isAdminLocked()) {
      showAdminGateIfNeeded();
      return;
    }

    A.state.activeSubm = submodulo;
    showOnly("operativa");
    forceCloseSubmodsDrawer();

    if (operativaPanel) operativaPanel.innerHTML = operativaShellHTML();
    setHidden(operativaPanel, false);

    const btnBackToMap = document.getElementById("btnBackToMap");
    const btnOpenResumen = document.getElementById("btnOpenResumen");
    const tbody = document.getElementById("opTbody");
    const opStatus = document.getElementById("opStatus");

    btnBackToMap?.addEventListener("click", () => showOnly("home"));
    btnOpenResumen?.addEventListener("click", async () => {
      await openResumenFromPlanner(submodulo);
    });

    try {
      if (opStatus) opStatus.textContent = "Cargando evidencias…";
      const rows = await fetchEvidencias(submodulo.id);

      if (tbody) {
        tbody.innerHTML =
          (rows || []).map(rowHTML).join("") ||
          `<tr><td colspan="8" class="text-secondary">No hay evidencias.</td></tr>`;
      }

      if (opStatus) opStatus.textContent = `Evidencias: ${(rows || []).length}`;

      // bind UNA SOLA VEZ (delegación)
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
            setTimeout(() => {
              btn.textContent = "Guardar";
              btn.disabled = false;
            }, 900);
          } catch (e) {
            console.error(e);
            btn.textContent = "Error";
            setTimeout(() => {
              btn.textContent = "Guardar";
              btn.disabled = false;
            }, 1200);
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
          onBack: () => showOnly("operativa"),
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
      document.getElementById("btnBackFallback")?.addEventListener("click", () => showOnly("operativa"));
    } catch (e) {
      console.error(e);
      resumenPanel.innerHTML = `
        <div class="container-fluid mt-3">
          <div class="text-danger small">No se pudo cargar el resumen.</div>
          <button id="btnBackErr" class="btn btn-outline-light btn-sm mt-2">Volver</button>
        </div>
      `;
      document.getElementById("btnBackErr")?.addEventListener("click", () => showOnly("operativa"));
    }
  }

  // ============================================================
  // RESUMEN GENERAL
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
            <div class="text-secondary small">IES: ${escapeHtml(iesNombre)} ${
      iesId ? `· ID: ${escapeHtml(String(iesId))}` : ""
    }</div>
          </div>
          <div class="d-flex gap-2">
            <button id="btnBackRG" class="btn btn-outline-light btn-sm">Volver al mapa</button>
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
      A.coachPoint({
        key: "admin_need_ies_for_rg_v2",
        target: "#iesSelect",
        prefer: "right",
        img: "/static/img/astra_saludo.png",
        title: "Falta IES",
        msg: "Selecciona una IES aquí para poder abrir el Resumen general.",
        force: true,
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
    document.getElementById("btnBackRG")?.addEventListener("click", () => showOnly("home"));

    const rgProgress = document.getElementById("rgProgress");
    const rgTbody = document.getElementById("rgTbody");

    try {
      if (rgProgress) rgProgress.textContent = "Cargando catálogo de subprogramas…";
      const subprogramas = await A.api("/catalogo/subprogramas");
      const sps = Array.isArray(subprogramas) ? subprogramas : [];

      if (!sps.length) {
        if (rgTbody) rgTbody.innerHTML = `<tr><td colspan="6" class="text-secondary">No hay subprogramas.</td></tr>`;
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
        if (rgTbody) rgTbody.innerHTML = `<tr><td colspan="6" class="text-secondary">No hay submódulos.</td></tr>`;
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
                <td class="text-secondary small">${escapeHtml(responsable)}</td>
                <td class="text-end">${evid}</td>
                <td class="text-end">${Math.round(av)}%</td>
                <td class="text-secondary small">${escapeHtml(lastUpd)}</td>
                <td class="text-end">
                  <button class="btn btn-outline-light btn-sm rg-open" data-smid="${r.row.smId}">Ver</button>
                </td>
              </tr>
            `;

            }

            const data = r.data || {};
            const evid = Number(data?.evidencias_total ?? 0);
            const av = Math.max(0, Math.min(100, Number(data?.avance_promedio ?? 0)));
            const lastUpd = fmtDate(pickLastUpdated(Array.isArray(data?.registros) ? data.registros : []));

            return `
              <tr>
                <td style="opacity:.85;">${sp}</td>
                <td style="font-weight:700;">${sm}</td>
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
            <td colspan="6" class="text-danger small">
              No se pudo construir el resumen general.
            </td>
          </tr>
        `;
      }
      if (rgProgress) rgProgress.textContent = "Error.";
    }
  }

  // ============================================================
  // EVENTS (MAP + DRAWER)
  // ============================================================
  field?.addEventListener("click", async (ev) => {
    if (isAdminLocked()) {
      showAdminGateIfNeeded();
      return;
    }

    const node = ev.target.closest(".subp-node");
    if (!node) return;

    const id = Number(node.dataset.id);
    setActiveSubp(id);

    if (submodulosList) submodulosList.innerHTML = `<div class="text-secondary small">Cargando submódulos…</div>`;
    openSubmodsDrawer();
    await loadSubmodulos(id);
  });

  searchSubp?.addEventListener("input", renderSubprogramas);
  searchSubm?.addEventListener("input", renderSubmodulos);

  submodulosList?.addEventListener("click", async (ev) => {
    if (isAdminLocked()) {
      showAdminGateIfNeeded();
      return;
    }

    const item = ev.target.closest(".subm-item");
    if (!item) return;

    const id = Number(item.dataset.id);
    const sm = A.state.submodulos.find((x) => x.id === id) || null;
    A.state.activeSubm = sm;

    if (btnVerResumen) btnVerResumen.disabled = !sm;
    if (sm) await openOperativa(sm);
  });

  btnVerResumen?.addEventListener("click", async () => {
    if (isAdminLocked()) {
      showAdminGateIfNeeded();
      return;
    }
    if (!A.state.activeSubm) return;
    await openResumenFromPlanner(A.state.activeSubm);
  });

  // Resumen General
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

    if (!showAdminGateIfNeeded()) showOnly("home");
  });

  // ============================================================
  // INIT
  // ============================================================
  try {
    enforceRoleUI();

    await loadIESContext();
    await loadSubprogramas();

    // ✅ si admin está locked, corta aquí (evita que se pinte algo)
    if (isAdminLocked()) {
      resetLockedAdminUI();
      showAdminGateIfNeeded();
      return;
    }

    if (!showAdminGateIfNeeded()) showOnly("home");

    renderSubprogramas();
    enforceRoleUI();
    ensureGuideButton();
  } catch (err) {
    console.error(err);
    if (field) field.innerHTML = `<div class="text-danger small">Error cargando subprogramas.</div>`;
    A.toast({
      type: "danger",
      title: "Error",
      msg: "No se pudo cargar el catálogo. Revisa consola/endpoint.",
      ms: 6500,
    });
  }
});
