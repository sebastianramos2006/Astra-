// /static/js/admin.js
document.addEventListener("DOMContentLoaded", async () => {
  const A = window.ASTRA;
  if (!A?.requireAuth || !A.requireAuth()) return;

  const role = (A.getRole?.() || "").toLowerCase();
  if (role !== "admin") return;

  // --------------------------
  // DOM
  // --------------------------
  const adminBar = document.getElementById("adminIesBar");
  const iesSelect = document.getElementById("iesSelect");
  const iesSearch = document.getElementById("iesSearch");
  const btnAddIES = document.getElementById("btnAddIES");
  const btnDeleteIES = document.getElementById("btnDeleteIES");

  const modalEl = document.getElementById("modalAddIES");
  const inputNombre = document.getElementById("newIesNombre");
  const inputSlug = document.getElementById("newIesSlug");
  const inputEmail = document.getElementById("newIesEmail");
  const inputPassword = document.getElementById("newIesPassword");
  const msgBox = document.getElementById("createIesMsg");
  const btnCreate = document.getElementById("btnCreateIES");

  adminBar?.classList.remove("hidden");

  const modal = modalEl && window.bootstrap ? new bootstrap.Modal(modalEl) : null;

  // --------------------------
  // Utils
  // --------------------------
  function normalize(s) {
    return (s || "")
      .toString()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
  }

  function slugify(s) {
    return normalize(s)
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
  }

  function must(v, label) {
    const ok = !!(v && String(v).trim());
    if (!ok) throw new Error(`Falta: ${label}`);
    return String(v).trim();
  }

  function setMsg(text, kind = "muted") {
    if (!msgBox) return;
    const colors = {
      muted: "text-secondary",
      ok: "text-success",
      warn: "text-warning",
      err: "text-danger",
    };
    msgBox.className = `small mt-2 ${colors[kind] || colors.muted}`;
    msgBox.textContent = text || "";
  }

  function genTempPassword() {
    // simple y claro (puedes hacerlo más fuerte cuando quieras)
    return "Temp123*";
  }

  // --------------------------
  // State
  // --------------------------
  let iesList = [];

  // --------------------------
  // API wrappers
  // --------------------------
  async function listIES() {
    const data = await A.api("/ies/");
    return Array.isArray(data) ? data : [];
  }

  async function createIES({ nombre, slug }) {
    return await A.api("/ies/", {
      method: "POST",
      body: JSON.stringify({ nombre, slug }),
    });
  }

  async function deleteIES(iesId) {
    return await A.api(`/admin/ies/${encodeURIComponent(iesId)}`, { method: "DELETE" });
  }

  async function seedOperativo(slug) {
    return await A.api(`/seed-operativo/ies/${encodeURIComponent(slug)}`, { method: "POST" });
  }

  async function seedIesUser(payload) {
    return await A.api("/seed/ies-user", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  // --------------------------
  // Render
  // --------------------------
  function setActiveIESById(id) {
    const idNum = Number(id);
    A.state = A.state || {};
    A.state.iesList = iesList;
    A.state.ies = iesList.find((x) => Number(x.id) === idNum) || null;
  }

  function renderSelect(list, selectedId = null) {
    if (!iesSelect) return;

    iesSelect.innerHTML = (list || [])
      .map((i) => `<option value="${i.id}">${i.nombre} (${i.slug})</option>`)
      .join("");

    if (selectedId != null && list.some((x) => String(x.id) === String(selectedId))) {
      iesSelect.value = String(selectedId);
    } else if (list[0]?.id != null) {
      iesSelect.value = String(list[0].id);
    }

    if (iesSelect.value) setActiveIESById(iesSelect.value);
  }

  async function refreshIES(selectId = null) {
    iesList = await listIES();

    if (!iesList.length) {
      if (iesSelect) iesSelect.innerHTML = "";
      A.state.iesList = [];
      A.state.ies = null;
      return;
    }

    renderSelect(iesList, selectId);
  }

  function applySearchFilter() {
    if (!iesSearch || !iesSelect) return;
    const knownSelected = A.state?.ies?.id ?? null;

    const q = normalize(iesSearch.value);
    const filtered = !q
      ? iesList
      : iesList.filter((i) => normalize(`${i.nombre} ${i.slug} ${i.id}`).includes(q));

    renderSelect(filtered, knownSelected);
  }

  // --------------------------
  // Events
  // --------------------------
  iesSelect?.addEventListener("change", () => {
    setActiveIESById(iesSelect.value);
    A.toast({
      type: "info",
      title: "IES activa",
      message: `${A.state.ies?.nombre || ""} (${A.state.ies?.slug || ""})`,
      timeout: 3000,
    });
  });

  iesSearch?.addEventListener("input", applySearchFilter);

  btnAddIES?.addEventListener("click", () => {
    if (inputNombre) inputNombre.value = "";
    if (inputSlug) inputSlug.value = "";
    if (inputEmail) inputEmail.value = "";
    if (inputPassword) inputPassword.value = "";
    setMsg("");
    modal?.show();
  });

  inputNombre?.addEventListener("input", () => {
    if (!inputSlug) return;
    if (normalize(inputSlug.value)) return;
    inputSlug.value = slugify(inputNombre.value);
  });

  btnCreate?.addEventListener("click", async () => {
    if (!btnCreate) return;

    const old = btnCreate.textContent;
    btnCreate.disabled = true;
    btnCreate.textContent = "Creando…";
    setMsg("Creando IES…", "muted");

    try {
      const nombre = must(inputNombre?.value, "Nombre");
      let slug = inputSlug?.value ? slugify(inputSlug.value) : slugify(nombre);
      slug = must(slug, "Slug");

      // 1) Crear IES
      const created = await createIES({ nombre, slug });
      const newId = created?.id ?? created?.ies_id ?? null;
      const newSlug = created?.slug ?? slug;

      setMsg("Seed operativo…", "muted");

      // 2) Seed operativo (para que no te salga “No hay evidencias…”)
      try {
        await seedOperativo(newSlug);
      } catch (e) {
        // no detenemos el flujo
      }

      // 3) Crear usuario IES (evita 422: email + password son obligatorios en /seed/ies-user)
      let email = normalize(inputEmail?.value || "");
      if (!email) email = `${newSlug}@astra.cedepro.com`; // default
      const password = (inputPassword?.value || "").trim() || genTempPassword();

      setMsg("Creando usuario IES…", "muted");

      let creds = null;
      try {
        creds = await seedIesUser({
          ies_slug: newSlug,
          email,
          password,
          rol: "ies",
          username: email.split("@")[0],
        });
      } catch (e) {
        // si está deshabilitado en prod o falla, igual dejamos IES creada
        A.toast({
          type: "warn",
          title: "IES creada, pero sin usuario",
          message: "No pude crear el usuario IES (revisa /seed/ies-user o ENV).",
          timeout: 6000,
        });
      }

      // 4) Refresh lista y seleccionar
      await refreshIES(newId);

      modal?.hide();

      // 5) Toast final con credenciales (no bloquea la página)
      const outEmail = creds?.email || email;
      const outPass = password;

      A.toastCreds({
        email: outEmail,
        password: outPass,
        title: "IES creada ✓",
      });

      setMsg("");
    } catch (e) {
      setMsg(e?.message || String(e), "err");
      A.toast({
        type: "error",
        title: "No se pudo crear la IES",
        message: e?.message || String(e),
        timeout: 7000,
      });
    } finally {
      btnCreate.disabled = false;
      btnCreate.textContent = old || "Crear";
    }
  });

  // Eliminar IES
  btnDeleteIES?.addEventListener("click", async () => {
    const active = A.state?.ies;
    if (!active?.id) {
      A.toast({ type: "warn", title: "Atención", message: "Selecciona una IES primero." });
      return;
    }

    const ok = confirm(`¿Eliminar la IES "${active.nombre}" (${active.slug})?`);
    if (!ok) return;

    const old = btnDeleteIES.textContent;
    btnDeleteIES.disabled = true;
    btnDeleteIES.textContent = "Eliminando…";

    try {
      await deleteIES(active.id);
      await refreshIES(null);
      A.toast({ type: "success", title: "Listo", message: "IES eliminada ✓" });
    } catch (e) {
      A.toast({
        type: "error",
        title: "No se pudo eliminar",
        message: e?.message || String(e),
        timeout: 7000,
      });
    } finally {
      btnDeleteIES.disabled = false;
      btnDeleteIES.textContent = old || "Eliminar";
    }
  });

  // INIT
  try {
    await refreshIES();
  } catch (e) {
    A.toast({ type: "error", title: "Admin", message: "No pude cargar /ies/." });
  }
});
