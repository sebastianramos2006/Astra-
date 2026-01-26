// /static/js/resumen.js
(function () {
  const A = window.ASTRA;
  if (!A) return;

  // =========================================================
  // Helpers
  // =========================================================
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

  function toNum(x) {
    const n = Number(x);
    return Number.isFinite(n) ? n : null;
  }

  function fmtPct(x, digits = 2) {
    const n = toNum(x);
    if (n === null) return "—";
    return `${n.toFixed(digits)}%`;
  }

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

  function computeValoracionBuckets(registros = []) {
    const buckets = { def: 0, poco: 0, cuasi: 0, satis: 0, sin: 0 };

    for (const r of registros) {
      const v = toNum(r?.valoracion);
      if (v === null) {
        buckets.sin += 1;
        continue;
      }
      if (v <= 0) buckets.def += 1;
      else if (v <= 35) buckets.poco += 1;
      else if (v <= 70) buckets.cuasi += 1;
      else buckets.satis += 1;
    }
    return buckets;
  }

  function escapeHtml(str) {
    return (str || "").replace(/[&<>"']/g, (m) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
    }[m]));
  }

  function ensureResumenPanelVisible() {
    const resumenPanel = document.getElementById("resumenPanel");
    const operativaPanel = document.getElementById("operativaPanel");
    const constellation = document.querySelector(".constellation");

    if (operativaPanel) operativaPanel.classList.add("hidden");
    if (constellation) constellation.classList.add("hidden");
    if (resumenPanel) resumenPanel.classList.remove("hidden");

    return resumenPanel;
  }

  function backToMap() {
    const resumenPanel = document.getElementById("resumenPanel");
    const operativaPanel = document.getElementById("operativaPanel");
    const constellation = document.querySelector(".constellation");

    if (resumenPanel) resumenPanel.classList.add("hidden");
    if (operativaPanel) operativaPanel.classList.add("hidden");
    if (constellation) constellation.classList.remove("hidden");
  }

  // API wrapper: usa A.api (mantiene Authorization como tú ya lo tienes)
  async function apiGET(url) {
    // A.api usualmente ya hace JSON + headers
    return await A.api(url);
  }

  // Concurrency limit para no matar el backend
  async function mapLimit(items, limit, mapper) {
    const out = new Array(items.length);
    let i = 0;

    const workers = new Array(Math.min(limit, items.length)).fill(0).map(async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await mapper(items[idx], idx);
      }
    });

    await Promise.all(workers);
    return out;
  }

  // =========================================================
  // Renderer de Submódulo (TU UI bonita)
  // =========================================================
  A.openResumenSubmodulo = function openResumenSubmodulo(rootEl, data, ctx = {}) {
    const {
      iesNombre = "—",
      submoduloNombre = "Submódulo",
      submoduloId = "—",
      onBack = null
    } = ctx;

    const total = toNum(data?.evidencias_total) ?? 0;

    const avanceProm = clamp(toNum(data?.avance_promedio) ?? 0, 0, 100);
    const donutDeg = Math.round((avanceProm / 100) * 360);

    const fechaInicio = fmtDate(data?.fecha_inicio_min);
    const fechaFin = fmtDate(data?.fecha_fin_max);
    const hoy = fmtDate(new Date().toISOString().slice(0, 10));

    const registros = Array.isArray(data?.registros) ? data.registros : [];
    const lastUpd = fmtDate(pickLastUpdated(registros));

    const val = computeValoracionBuckets(registros);
    const valItems = [
      { key: "def",  label: "Deficiente",      n: val.def,  tone: "def" },
      { key: "poco", label: "Poco satisfac",   n: val.poco, tone: "poco" },
      { key: "cuasi",label: "Cuasi satisfac",  n: val.cuasi,tone: "cuasi" },
      { key: "satis",label: "Satisfactorio",   n: val.satis,tone: "satis" },
    ];

    const ar = data?.avance_rangos || {};
    const avanceItems = [
      { key: "0_24",    label: "0% - 24%",   n: toNum(ar["0_24"]) ?? 0, tone: "def" },
      { key: "25_49",   label: "25% - 49%",  n: toNum(ar["25_49"]) ?? 0, tone: "poco" },
      { key: "50_74",   label: "50% - 74%",  n: toNum(ar["50_74"]) ?? 0, tone: "cuasi" },
      { key: "75_100",  label: "75% - 100%", n: toNum(ar["75_100"]) ?? 0, tone: "satis" },
      { key: "sin_dato",label: "Sin dato",   n: toNum(ar["sin_dato"]) ?? 0, tone: "sin" },
    ];

    function barHeight(n, maxN) {
      if (!maxN) return 0;
      return Math.round((n / maxN) * 100);
    }
    const maxVal = Math.max(1, ...valItems.map(x => x.n));
    const maxAv = Math.max(1, ...avanceItems.map(x => x.n));

    rootEl.innerHTML = `
      <div class="container-fluid mt-3 resumen-wrap">
        <div class="d-flex align-items-start justify-content-between gap-3 flex-wrap">
          <div>
            <div class="text-secondary small">RESUMEN</div>
            <h3 class="mb-1 text-light fw-bold">${escapeHtml(submoduloNombre)}</h3>
            <div class="text-secondary small">IES: ${escapeHtml(iesNombre)} · Submódulo #${escapeHtml(String(submoduloId))}</div>
          </div>
          <div class="d-flex gap-2">
            <button id="btnBackResumen" class="btn btn-outline-light btn-sm">Volver</button>
          </div>
        </div>

        <div class="row g-3 mt-2">
          <div class="col-12 col-md-3">
            <div class="card bg-transparent border-secondary-subtle resumen-card">
              <div class="card-body">
                <div class="text-secondary small">Fecha actual</div>
                <div class="fs-5 fw-bold text-light">${hoy}</div>
              </div>
            </div>
          </div>

          <div class="col-12 col-md-3">
            <div class="card bg-transparent border-secondary-subtle resumen-card">
              <div class="card-body">
                <div class="text-secondary small">Fecha de inicio</div>
                <div class="fs-5 fw-bold text-light">${fechaInicio}</div>
              </div>
            </div>
          </div>

          <div class="col-12 col-md-3">
            <div class="card bg-transparent border-secondary-subtle resumen-card">
              <div class="card-body">
                <div class="text-secondary small">Fecha de finalización</div>
                <div class="fs-5 fw-bold text-light">${fechaFin}</div>
              </div>
            </div>
          </div>

          <div class="col-12 col-md-3">
            <div class="card bg-transparent border-secondary-subtle resumen-card">
              <div class="card-body">
                <div class="text-secondary small">Total evidencias</div>
                <div class="fs-5 fw-bold text-light">${total}</div>
              </div>
            </div>
          </div>
        </div>

        <div class="row g-3 mt-2">
          <div class="col-12 col-lg-7">
            <div class="card bg-transparent border-secondary-subtle resumen-card">
              <div class="card-body d-flex align-items-center justify-content-between gap-3 flex-wrap">
                <div>
                  <div class="text-secondary small">Finalización del proyecto</div>
                  <div class="display-6 fw-bold text-light">${fmtPct(avanceProm, 2)}</div>
                  <div class="text-secondary small">Promedio de avance de evidencias.</div>
                </div>

                <div class="res-donut" style="--deg:${donutDeg}deg;">
                  <div class="res-donut-inner">
                    <div class="res-donut-big">${Math.round(avanceProm)}%</div>
                    <div class="res-donut-sub">avance</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="col-12 col-lg-5">
            <div class="card bg-transparent border-secondary-subtle resumen-card">
              <div class="card-body">
                <div class="text-secondary small">Última actualización</div>
                <div class="fs-4 fw-bold text-light">${lastUpd}</div>
                <div class="text-secondary small">Toma la más reciente del submódulo.</div>
              </div>
            </div>
          </div>
        </div>

        <div class="mt-4">
          <div class="text-secondary small fw-bold mb-2">VALORACIÓN</div>
          <div class="card bg-transparent border-secondary-subtle resumen-card">
            <div class="card-body">
              <div class="res-bars">
                ${valItems.map(item => `
                  <div class="res-barcol">
                    <div class="res-barhead">
                      <div class="res-barlabel">${item.label}</div>
                      <div class="res-barnum text-light fw-bold">${item.n}</div>
                    </div>
                    <div class="res-barbox">
                      <div class="res-bar res-tone-${item.tone}" style="height:${barHeight(item.n, maxVal)}%"></div>
                    </div>
                    <div class="text-secondary small mt-1">
                      ${total ? Math.round((item.n / total) * 100) : 0}% del total
                    </div>
                  </div>
                `).join("")}
              </div>
            </div>
          </div>
        </div>

        <div class="mt-4">
          <div class="text-secondary small fw-bold mb-2">FINALIZACIÓN DE LA TAREA</div>
          <div class="card bg-transparent border-secondary-subtle resumen-card">
            <div class="card-body">
              <div class="res-bars">
                ${avanceItems.map(item => `
                  <div class="res-barcol">
                    <div class="res-barhead">
                      <div class="res-barlabel">${item.label}</div>
                      <div class="res-barnum text-light fw-bold">${item.n}</div>
                    </div>
                    <div class="res-barbox">
                      <div class="res-bar res-tone-${item.tone}" style="height:${barHeight(item.n, maxAv)}%"></div>
                    </div>
                    <div class="text-secondary small mt-1">
                      ${total ? Math.round((item.n / total) * 100) : 0}% del total
                    </div>
                  </div>
                `).join("")}
              </div>
            </div>
          </div>
        </div>

        <div class="mt-4">
          <div class="text-secondary small fw-bold mb-2">CONFIGURACIÓN DE LA CATEGORÍA</div>
          <div class="card bg-transparent border-secondary-subtle resumen-card">
            <div class="card-body">
              <div class="table-responsive">
                <table class="table table-dark table-sm align-middle mb-0">
                  <thead>
                    <tr>
                      <th>Categoría</th>
                      <th class="text-end">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>SI</td>
                      <td class="text-end">${toNum(data?.categoria_si_no?.si) ?? 0}</td>
                    </tr>
                    <tr>
                      <td>No</td>
                      <td class="text-end">${toNum(data?.categoria_si_no?.no) ?? 0}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div class="text-secondary small mt-2">
                (Si no hay categoria_si_no, el backend lo aproxima con "presenta".)
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    const btn = rootEl.querySelector("#btnBackResumen");
    btn?.addEventListener("click", () => {
      if (typeof onBack === "function") onBack();
      else backToMap();
    });
  };

  // =========================================================
  // ✅ NUEVO: A.openResumen (controlador para submódulo)
  // =========================================================
  A.openResumen = async function openResumen(ctx = {}) {
    const resumenPanel = ensureResumenPanelVisible();
    if (!resumenPanel) return;

    const {
      submoduloId,
      submoduloNombre = "Submódulo",
      iesId,
      iesNombre = "—",
      onBack = null
    } = ctx;

    if (!submoduloId || !iesId) {
      resumenPanel.innerHTML = `
        <div class="p-3">
          <div class="alert alert-warning bg-transparent text-light border border-warning">
            Falta <b>iesId</b> o <b>submoduloId</b> para abrir el resumen.
          </div>
          <button class="btn btn-outline-light btn-sm" id="btnBackFail">Volver</button>
        </div>
      `;
      document.getElementById("btnBackFail")?.addEventListener("click", () => (onBack ? onBack() : backToMap()));
      return;
    }

    resumenPanel.innerHTML = `
      <div class="p-3">
        <div class="text-secondary small">Cargando resumen…</div>
      </div>
    `;

    try {
      const data = await apiGET(`/api/resumen/submodulo/${iesId}/${submoduloId}`);
      resumenPanel.innerHTML = `<div id="resumenRoot"></div>`;
      const rootEl = document.getElementById("resumenRoot");

      A.openResumenSubmodulo(rootEl, data, {
        iesNombre,
        submoduloNombre,
        submoduloId,
        onBack: typeof onBack === "function" ? onBack : backToMap
      });
    } catch (e) {
      console.error(e);
      resumenPanel.innerHTML = `
        <div class="p-3">
          <div class="alert alert-danger bg-transparent text-light border border-danger">
            No se pudo cargar el resumen del submódulo.<br/>
            <span class="small text-secondary">${escapeHtml(String(e?.message || e))}</span>
          </div>
          <button class="btn btn-outline-light btn-sm" id="btnBackErr">Volver</button>
        </div>
      `;
      document.getElementById("btnBackErr")?.addEventListener("click", () => (onBack ? onBack() : backToMap()));
    }
  };

  // =========================================================
  // ✅ NUEVO: A.openResumenGeneral (tabla compacta)
  // =========================================================
  A.openResumenGeneral = async function openResumenGeneral(ctx = {}) {
    const resumenPanel = ensureResumenPanelVisible();
    if (!resumenPanel) return;

    const {
      iesId,
      iesNombre = "—",
      onBack = null
    } = ctx;

    if (!iesId) {
      resumenPanel.innerHTML = `
        <div class="p-3">
          <div class="alert alert-warning bg-transparent text-light border border-warning">
            Falta <b>iesId</b> para construir el resumen general.
          </div>
          <button class="btn btn-outline-light btn-sm" id="btnBackRGFail">Volver</button>
        </div>
      `;
      document.getElementById("btnBackRGFail")?.addEventListener("click", () => (onBack ? onBack() : backToMap()));
      return;
    }

    // Skeleton
    resumenPanel.innerHTML = `
      <div class="container-fluid mt-3">
        <div class="d-flex align-items-start justify-content-between gap-3 flex-wrap">
          <div>
            <div class="text-secondary small">RESUMEN GENERAL</div>
            <h3 class="mb-1 text-light fw-bold">Subprogramas · Submódulos</h3>
            <div class="text-secondary small">IES: ${escapeHtml(iesNombre)} · IES ID: ${escapeHtml(String(iesId))}</div>
          </div>
          <div class="d-flex gap-2">
            <button id="btnBackRG" class="btn btn-outline-light btn-sm">Volver</button>
          </div>
        </div>

        <div class="mt-3 text-secondary small" id="rgProgress">
          Cargando catálogo…
        </div>

        <div class="mt-3 table-responsive">
          <table class="table table-dark table-sm align-middle">
            <thead>
              <tr>
                <th style="min-width:260px;">Subprograma</th>
                <th style="min-width:280px;">Submódulo</th>
                <th class="text-end" style="min-width:120px;">Evidencias</th>
                <th class="text-end" style="min-width:120px;">Avance</th>
                <th style="min-width:160px;">Últ. actualización</th>
                <th style="min-width:110px;"></th>
              </tr>
            </thead>
            <tbody id="rgTbody">
              <tr><td colspan="6" class="text-secondary">Cargando…</td></tr>
            </tbody>
          </table>
        </div>

        <div class="text-secondary small mt-2">
          Tip: clic en <b>Ver</b> para abrir el resumen bonito del submódulo.
        </div>
      </div>
    `;

    document.getElementById("btnBackRG")?.addEventListener("click", () => (onBack ? onBack() : backToMap()));

    const rgProgress = document.getElementById("rgProgress");
    const rgTbody = document.getElementById("rgTbody");

    try {
      // 1) subprogramas
      const subprogramas = await apiGET("/catalogo/subprogramas");
      if (!Array.isArray(subprogramas) || subprogramas.length === 0) {
        rgTbody.innerHTML = `<tr><td colspan="6" class="text-secondary">No hay subprogramas.</td></tr>`;
        return;
      }

      // 2) submódulos por subprograma
      rgProgress.textContent = "Cargando submódulos…";
      const allSubmods = [];
      for (const sp of subprogramas) {
        const spId = sp?.id;
        const spName = sp?.nombre || `Subprograma ${spId}`;
        if (!spId) continue;

        const subs = await apiGET(`/catalogo/subprogramas/${spId}/submodulos`);
        if (!Array.isArray(subs)) continue;

        for (const sm of subs) {
          const smId = sm?.id;
          if (!smId) continue;
          allSubmods.push({
            spId,
            spName,
            smId,
            smName: sm?.nombre || `Submódulo ${smId}`
          });
        }
      }

      if (allSubmods.length === 0) {
        rgTbody.innerHTML = `<tr><td colspan="6" class="text-secondary">No hay submódulos.</td></tr>`;
        return;
      }

      // 3) resumen por submódulo (limitado)
      let done = 0;
      const total = allSubmods.length;
      rgProgress.textContent = `Cargando resúmenes: 0/${total}…`;

      const results = await mapLimit(allSubmods, 4, async (row) => {
        try {
          const data = await apiGET(`/api/resumen/submodulo/${iesId}/${row.smId}`);
          return { ok: true, row, data };
        } catch (e) {
          return { ok: false, row, err: e };
        } finally {
          done++;
          if (rgProgress) rgProgress.textContent = `Cargando resúmenes: ${done}/${total}…`;
        }
      });

      // 4) pintar tabla
      rgProgress.textContent = `Listo ✓ (${total} submódulos)`;

      rgTbody.innerHTML = results.map(r => {
        const sp = escapeHtml(r.row.spName);
        const sm = escapeHtml(r.row.smName);

        if (!r.ok) {
          return `
            <tr>
              <td style="opacity:.85;">${sp}</td>
              <td>${sm}</td>
              <td class="text-end text-secondary">—</td>
              <td class="text-end text-secondary">—</td>
              <td class="text-secondary small">Error</td>
              <td class="text-end">
                <button class="btn btn-outline-light btn-sm rg-open" data-smid="${r.row.smId}" data-smname="${sm}">Ver</button>
              </td>
            </tr>
          `;
        }

        const data = r.data || {};
        const evid = toNum(data?.evidencias_total) ?? 0;
        const av = clamp(toNum(data?.avance_promedio) ?? 0, 0, 100);
        const registros = Array.isArray(data?.registros) ? data.registros : [];
        const lastUpd = fmtDate(pickLastUpdated(registros));

        return `
          <tr>
            <td style="opacity:.85;">${sp}</td>
            <td style="font-weight:700;">${sm}</td>
            <td class="text-end">${evid}</td>
            <td class="text-end">${Math.round(av)}%</td>
            <td class="text-secondary small">${lastUpd}</td>
            <td class="text-end">
              <button class="btn btn-outline-light btn-sm rg-open"
                      data-smid="${r.row.smId}"
                      data-smname="${escapeHtml(r.row.smName)}">Ver</button>
            </td>
          </tr>
        `;
      }).join("");

      // 5) click en "Ver" abre resumen bonito del submódulo
      rgTbody.addEventListener("click", async (ev) => {
        const btn = ev.target.closest(".rg-open");
        if (!btn) return;

        const smId = Number(btn.dataset.smid);
        const smName = btn.dataset.smname || "Submódulo";

        await A.openResumen({
          submoduloId: smId,
          submoduloNombre: smName,
          iesId,
          iesNombre,
          onBack: () => A.openResumenGeneral({ iesId, iesNombre, onBack: typeof onBack === "function" ? onBack : backToMap })
        });
      });

    } catch (e) {
      console.error(e);
      rgTbody.innerHTML = `
        <tr>
          <td colspan="6" class="text-danger small">
            No se pudo construir el resumen general.
            <span class="text-secondary">${escapeHtml(String(e?.message || e))}</span>
          </td>
        </tr>
      `;
      if (rgProgress) rgProgress.textContent = "Error.";
    }
  };

})();
