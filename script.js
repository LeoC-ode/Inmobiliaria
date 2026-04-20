/* =========================================================
   CasaIdeal — Inmobiliaria
   Vanilla JS: carga JSON, filtros, detalle, leads, WhatsApp
========================================================= */

// URL del endpoint de Google Apps Script para guardar leads en Google Sheets.
// Reemplaza con tu URL desplegada: https://script.google.com/macros/s/XXXX/exec
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbw_QwIdk7HlN41qM6iVyU-TxUp5h2T9TlmADl5nDxnHhq13LbV8TRlKV3DqI72wutftNg/exec";

// Ruta al JSON con las propiedades
const DATA_URL = "data/propiedades.json";

// Estado global
const state = {
  propiedades: [],
  filtradas: [],
  propiedadActual: null,
};

// Cache de nodos
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

/* =========================================================
   INIT
========================================================= */
document.addEventListener("DOMContentLoaded", () => {
  $("#year").textContent = new Date().getFullYear();

  initNavToggle();
  initSearchForm();
  initLeadForm();
  initModalClosers();

  loadPropiedades();
});

/* =========================================================
   NAV MÓVIL
========================================================= */
function initNavToggle() {
  const toggle = $("#navToggle");
  const links = $("#navLinks");
  if (!toggle || !links) return;

  toggle.addEventListener("click", () => {
    links.classList.toggle("is-open");
  });

  links.querySelectorAll("a").forEach((a) => {
    a.addEventListener("click", () => links.classList.remove("is-open"));
  });
}

/* =========================================================
   CARGA DE DATOS
========================================================= */
async function loadPropiedades() {
  try {
    const res = await fetch(DATA_URL, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    state.propiedades = Array.isArray(data.propiedades) ? data.propiedades : [];
    state.filtradas = [...state.propiedades];

    populateUbicaciones();
    renderPropiedades(state.filtradas);
  } catch (err) {
    console.error("Error cargando propiedades:", err);
    const grid = $("#propertiesGrid");
    grid.innerHTML = `<p class="no-results">No se pudieron cargar las propiedades. Intenta recargar la página.</p>`;
  }
}

function populateUbicaciones() {
  const select = $("#fUbic");
  if (!select) return;
  const set = new Set(state.propiedades.map((p) => p.ubicacion).filter(Boolean));
  [...set].sort().forEach((u) => {
    const opt = document.createElement("option");
    opt.value = u;
    opt.textContent = u;
    select.appendChild(opt);
  });
}

/* =========================================================
   RENDER GRID
========================================================= */
function renderPropiedades(lista) {
  const grid = $("#propertiesGrid");
  const empty = $("#noResults");
  grid.innerHTML = "";

  if (!lista.length) {
    empty.hidden = false;
    return;
  }
  empty.hidden = true;

  const frag = document.createDocumentFragment();
  lista.forEach((p, i) => {
    const card = createCard(p, i);
    frag.appendChild(card);
  });
  grid.appendChild(frag);
}

function createCard(p, index) {
  const card = document.createElement("article");
  card.className = "prop-card";
  card.setAttribute("role", "button");
  card.setAttribute("tabindex", "0");
  card.style.animationDelay = `${Math.min(index, 10) * 0.05}s`;

  const img = (p.imagenes && p.imagenes[0]) || "";
  card.innerHTML = `
    <div class="prop-image">
      ${img ? `<img src="${escapeAttr(img)}" alt="${escapeAttr(p.titulo)}" loading="lazy" />` : ""}
      <span class="prop-badge">${escapeHtml(p.ubicacion || "")}</span>
    </div>
    <div class="prop-body">
      <div class="prop-price">${formatPrice(p.precio)}</div>
      <h3 class="prop-title">${escapeHtml(p.titulo || "")}</h3>
      <p class="prop-location">${iconPin()} ${escapeHtml(p.ubicacion || "")}</p>
      <div class="prop-specs">
        <span>${iconArea()} ${p.m2 || 0} m²</span>
        <span>${iconBed()} ${p.habitaciones || 0} hab</span>
        <span>${iconBath()} ${p.banos || 0} baños</span>
      </div>
    </div>
  `;

  const open = () => openDetailModal(p);
  card.addEventListener("click", open);
  card.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      open();
    }
  });

  return card;
}

/* =========================================================
   FILTROS
========================================================= */
function initSearchForm() {
  const form = $("#searchForm");
  const rangeInput = $("#fPrecio");
  const rangeValue = $("#fPrecioValue");
  const btnReset = $("#btnReset");

  const updateRangeLabel = () => {
    rangeValue.textContent = formatPrice(Number(rangeInput.value));
  };
  updateRangeLabel();
  rangeInput.addEventListener("input", updateRangeLabel);

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    applyFilters();
    scrollToProperties();
  });

  btnReset.addEventListener("click", () => {
    form.reset();
    rangeInput.value = rangeInput.max;
    updateRangeLabel();
    state.filtradas = [...state.propiedades];
    renderPropiedades(state.filtradas);
  });
}

function applyFilters() {
  const precioMax = Number($("#fPrecio").value) || Infinity;
  const m2Min = Number($("#fM2").value) || 0;
  const habMin = Number($("#fHab").value) || 0;
  const ubic = $("#fUbic").value;

  state.filtradas = state.propiedades.filter((p) => {
    if (p.precio > precioMax) return false;
    if (p.m2 < m2Min) return false;
    if (habMin && (p.habitaciones || 0) < habMin) return false;
    if (ubic && p.ubicacion !== ubic) return false;
    return true;
  });

  renderPropiedades(state.filtradas);
}

function scrollToProperties() {
  const target = $("#propiedades");
  if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
}

/* =========================================================
   DETALLE MODAL
========================================================= */
function openDetailModal(p) {
  state.propiedadActual = p;
  const content = $("#detailContent");
  content.innerHTML = renderDetail(p);

  const modal = $("#detailModal");
  openModal(modal);

  wireGallery();
  wirePlano();
  wireDetailCTAs(p);
}

function renderDetail(p) {
  const imgs = Array.isArray(p.imagenes) ? p.imagenes : [];
  const main = imgs[0] || "";

  const thumbs = imgs
    .map(
      (src, i) => `
      <div class="gallery-thumb ${i === 0 ? "is-active" : ""}" data-index="${i}">
        <img src="${escapeAttr(src)}" alt="Vista ${i + 1}" loading="lazy" />
      </div>`
    )
    .join("");

  const amenidades = Array.isArray(p.amenidades) ? p.amenidades : [];
  const amenitiesHTML = amenidades
    .map(
      (a) => `
      <div class="amenity">
        ${amenityIcon(a)}
        <span>${escapeHtml(a)}</span>
      </div>`
    )
    .join("");

  const plano = p.plano;
  const planoHTML = plano && plano.imagen
    ? `
      <h3 class="detail-section-title">Plano interactivo</h3>
      <div class="plano-frame">
        <div class="plano-head">
          <div class="plano-brand">
            <span class="plano-slash">//</span>
            <strong>${escapeHtml((p.titulo || "").toUpperCase())}</strong>
            <span class="plano-zone">${escapeHtml(p.ubicacion || "")}</span>
          </div>
          <div class="plano-meta">
            <span class="plano-unit">${escapeHtml(plano.nivel || "NIVEL I")}</span>
            <span class="plano-divider">|</span>
            <span class="plano-area">${p.m2 || 0} m²</span>
          </div>
        </div>

        <div class="plano-wrap" id="planoWrap">
          <img src="${escapeAttr(plano.imagen)}" alt="Plano del inmueble" />
          ${(plano.puntos || [])
            .map(
              (pt, i) => `
            <button type="button" class="plano-point"
              style="left:${Number(pt.x) || 50}%; top:${Number(pt.y) || 50}%;"
              data-room-index="${i}"
              aria-label="Ver ${escapeAttr(pt.nombre || "ambiente")}">
              <span class="plano-dot"></span>
              <span class="plano-label">${escapeHtml(pt.nombre || "Zona")}</span>
            </button>
          `
            )
            .join("")}
        </div>

        <div class="plano-foot">
          <span>NIVEL I</span>
          <small>*Planos, acabados y medidas referenciales. Pueden variar según tipo de departamento.</small>
        </div>
      </div>
      <p class="plano-hint">Haz clic en los puntos para ver cada ambiente</p>
    `
    : "";

  return `
    <div class="detail-header">
      <h2 id="detailTitle" class="detail-title">${escapeHtml(p.titulo || "")}</h2>
      <div class="detail-location">${iconPin()} ${escapeHtml(p.ubicacion || "")}</div>
    </div>

    <div class="gallery">
      <div class="gallery-main">
        <img id="galleryMain" src="${escapeAttr(main)}" alt="${escapeAttr(p.titulo)}" />
      </div>
      <div class="gallery-thumbs">${thumbs}</div>
    </div>

    <div class="detail-price">${formatPrice(p.precio)}</div>

    <div class="detail-meta">
      <div class="meta-item"><span class="num">${p.m2 || 0}</span><span class="lbl">m²</span></div>
      <div class="meta-item"><span class="num">${p.habitaciones || 0}</span><span class="lbl">Habitaciones</span></div>
      <div class="meta-item"><span class="num">${p.banos || 0}</span><span class="lbl">Baños</span></div>
      <div class="meta-item"><span class="num">${escapeHtml(p.ubicacion || "-")}</span><span class="lbl">Distrito</span></div>
    </div>

    <p class="detail-description">${escapeHtml(p.descripcion || "")}</p>

    ${amenidades.length ? `
      <h3 class="detail-section-title">Amenidades</h3>
      <div class="amenities-grid">${amenitiesHTML}</div>
    ` : ""}

    ${planoHTML}

    <div class="detail-cta">
      <button type="button" class="btn-primary" id="detailLead">Solicitar información</button>
      <a class="btn-secondary" id="detailWhatsapp" target="_blank" rel="noopener">Consultar por WhatsApp</a>
    </div>
  `;
}

function wireGallery() {
  const main = $("#galleryMain");
  const thumbs = $$(".gallery-thumb");
  if (!main || !thumbs.length) return;

  thumbs.forEach((t) => {
    t.addEventListener("click", () => {
      const i = Number(t.dataset.index);
      const imgs = state.propiedadActual.imagenes || [];
      if (!imgs[i]) return;
      main.style.opacity = "0";
      setTimeout(() => {
        main.src = imgs[i];
        main.style.opacity = "1";
      }, 150);
      thumbs.forEach((x) => x.classList.remove("is-active"));
      t.classList.add("is-active");
    });
  });
}

function wirePlano() {
  const points = $$(".plano-point");
  const plano = state.propiedadActual && state.propiedadActual.plano;
  if (!points.length || !plano) return;

  points.forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const i = Number(btn.dataset.roomIndex);
      const room = plano.puntos[i];
      if (!room) return;
      openRoomModal(room);
    });
  });
}

function wireDetailCTAs(p) {
  const leadBtn = $("#detailLead");
  const wppLink = $("#detailWhatsapp");

  if (leadBtn) {
    leadBtn.addEventListener("click", () => openLeadModal(p));
  }
  if (wppLink) {
    const msg = `Hola, estoy interesado en "${p.titulo}" (${p.ubicacion}). ¿Podrían darme más información?`;
    wppLink.href = `https://wa.me/51999999999?text=${encodeURIComponent(msg)}`;
  }
}

function openRoomModal(room) {
  $("#roomTitle").textContent = room.nombre || "Ambiente";
  const img = $("#roomImage");
  img.src = room.imagen || "";
  img.alt = room.nombre || "Ambiente";
  openModal($("#roomModal"));
}

/* =========================================================
   LEAD MODAL + ENVÍO A GOOGLE SHEETS
========================================================= */
function openLeadModal(p) {
  $("#lPropiedad").value = p ? `${p.titulo} — ${p.ubicacion}` : "";
  $("#leadSub").textContent = p
    ? `Te contactaremos por: ${p.titulo}`
    : "Déjanos tus datos y un asesor te contactará pronto.";
  $("#leadStatus").textContent = "";
  $("#leadStatus").className = "form-status";
  openModal($("#leadModal"));
}

function initLeadForm() {
  const form = $("#leadForm");
  const status = $("#leadStatus");
  const submit = $("#leadSubmit");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const nombre = $("#lNombre");
    const telefono = $("#lTelefono");
    const email = $("#lEmail");
    const mensaje = $("#lMensaje");
    const propiedad = $("#lPropiedad").value || "Consulta general";

    [nombre, telefono, email].forEach((i) => i.classList.remove("invalid"));

    let ok = true;
    if (!nombre.value.trim()) { nombre.classList.add("invalid"); ok = false; }
    if (!telefono.value.trim() || telefono.value.trim().length < 6) { telefono.classList.add("invalid"); ok = false; }
    if (!isValidEmail(email.value)) { email.classList.add("invalid"); ok = false; }

    if (!ok) {
      status.textContent = "Revisa los campos marcados.";
      status.className = "form-status error";
      return;
    }

    const payload = {
      nombre: nombre.value.trim(),
      telefono: telefono.value.trim(),
      email: email.value.trim(),
      mensaje: mensaje.value.trim(),
      propiedad,
      fecha: new Date().toISOString(),
    };

    submit.disabled = true;
    const originalText = submit.textContent;
    submit.textContent = "Enviando...";
    status.textContent = "";
    status.className = "form-status";

    try {
      if (!SCRIPT_URL || SCRIPT_URL.startsWith("PEGA_AQUI")) {
        // Modo demo: no hay endpoint configurado todavía
        console.warn("SCRIPT_URL no configurado. Lead capturado localmente:", payload);
        await new Promise((r) => setTimeout(r, 600));
        status.textContent = "¡Solicitud recibida! Te contactaremos pronto.";
        status.className = "form-status success";
      } else {
        // Envío real al Apps Script.
        // Usamos text/plain para evitar preflight CORS con Apps Script.
        await fetch(SCRIPT_URL, {
          method: "POST",
          mode: "no-cors",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify(payload),
        });
        status.textContent = "¡Gracias! Tu solicitud fue enviada correctamente.";
        status.className = "form-status success";
      }

      form.reset();
      setTimeout(() => closeModal($("#leadModal")), 1600);
    } catch (err) {
      console.error(err);
      status.textContent = "Hubo un error al enviar. Intenta nuevamente.";
      status.className = "form-status error";
    } finally {
      submit.disabled = false;
      submit.textContent = originalText;
    }
  });
}

/* =========================================================
   MODALES — CONTROL GENÉRICO
========================================================= */
function openModal(modal) {
  if (!modal) return;
  modal.classList.add("is-open");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
}

function closeModal(modal) {
  if (!modal) return;
  modal.classList.remove("is-open");
  modal.setAttribute("aria-hidden", "true");
  // Solo quitar bloqueo si no hay ningún modal abierto
  if (!document.querySelector(".modal.is-open")) {
    document.body.classList.remove("modal-open");
  }
}

function initModalClosers() {
  const detailModal = $("#detailModal");
  const roomModal = $("#roomModal");
  const leadModal = $("#leadModal");

  detailModal.querySelectorAll("[data-close]").forEach((el) =>
    el.addEventListener("click", () => closeModal(detailModal))
  );
  roomModal.querySelectorAll("[data-close-room]").forEach((el) =>
    el.addEventListener("click", () => closeModal(roomModal))
  );
  leadModal.querySelectorAll("[data-close-lead]").forEach((el) =>
    el.addEventListener("click", () => closeModal(leadModal))
  );

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (roomModal.classList.contains("is-open")) return closeModal(roomModal);
    if (leadModal.classList.contains("is-open")) return closeModal(leadModal);
    if (detailModal.classList.contains("is-open")) return closeModal(detailModal);
  });
}

/* =========================================================
   HELPERS
========================================================= */
function formatPrice(n) {
  if (typeof n !== "number") return "-";
  return "$" + n.toLocaleString("en-US");
}

function isValidEmail(v) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((v || "").trim());
}

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[ch]));
}

function escapeAttr(str) {
  return escapeHtml(str);
}

/* ICONOS SVG */
function iconPin() {
  return `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>`;
}
function iconArea() {
  return `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 3v18"/></svg>`;
}
function iconBed() {
  return `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 17v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5M2 17h20M6 10V7a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v3"/></svg>`;
}
function iconBath() {
  return `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12h16v3a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4v-3ZM7 12V6a2 2 0 0 1 4 0"/></svg>`;
}

function amenityIcon(name) {
  const n = (name || "").toLowerCase();
  const stroke = `fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"`;
  if (n.includes("piscin")) {
    return `<svg class="amenity-icon" viewBox="0 0 24 24" ${stroke}><path d="M2 18c2 0 2-1 4-1s2 1 4 1 2-1 4-1 2 1 4 1 2-1 4-1M6 14V6a2 2 0 0 1 4 0M14 14V6a2 2 0 0 1 4 0"/></svg>`;
  }
  if (n.includes("gim")) {
    return `<svg class="amenity-icon" viewBox="0 0 24 24" ${stroke}><path d="M6 6v12M18 6v12M3 9v6M21 9v6M6 12h12"/></svg>`;
  }
  if (n.includes("parrilla") || n.includes("asador")) {
    return `<svg class="amenity-icon" viewBox="0 0 24 24" ${stroke}><path d="M4 7h16l-2 7a4 4 0 0 1-4 3h-4a4 4 0 0 1-4-3L4 7ZM8 7V4M16 7V4M12 7V3"/></svg>`;
  }
  if (n.includes("segur")) {
    return `<svg class="amenity-icon" viewBox="0 0 24 24" ${stroke}><path d="M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6l8-3Z"/></svg>`;
  }
  if (n.includes("cocher") || n.includes("parking") || n.includes("estacion")) {
    return `<svg class="amenity-icon" viewBox="0 0 24 24" ${stroke}><path d="M5 17h14M6 13l2-6h8l2 6M7 17v2M17 17v2"/><circle cx="8" cy="17" r="1.5"/><circle cx="16" cy="17" r="1.5"/></svg>`;
  }
  if (n.includes("jard")) {
    return `<svg class="amenity-icon" viewBox="0 0 24 24" ${stroke}><path d="M12 21v-6M8 21h8M12 15c-3 0-5-2-5-5s2-5 5-5 5 2 5 5-2 5-5 5Z"/></svg>`;
  }
  if (n.includes("ascens")) {
    return `<svg class="amenity-icon" viewBox="0 0 24 24" ${stroke}><rect x="5" y="3" width="14" height="18" rx="1"/><path d="M12 8l-2 2h4l-2-2ZM12 16l2-2h-4l2 2Z"/></svg>`;
  }
  if (n.includes("terraz") || n.includes("balcon")) {
    return `<svg class="amenity-icon" viewBox="0 0 24 24" ${stroke}><path d="M3 21h18M5 21V10h14v11M9 21v-6h6v6M12 10V3"/></svg>`;
  }
  if (n.includes("jacuzz") || n.includes("spa")) {
    return `<svg class="amenity-icon" viewBox="0 0 24 24" ${stroke}><path d="M4 12h16v5a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3v-5ZM8 8c0-2 2-2 2-4M14 8c0-2 2-2 2-4"/></svg>`;
  }
  if (n.includes("vista")) {
    return `<svg class="amenity-icon" viewBox="0 0 24 24" ${stroke}><circle cx="12" cy="12" r="3"/><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7Z"/></svg>`;
  }
  // Genérico
  return `<svg class="amenity-icon" viewBox="0 0 24 24" ${stroke}><circle cx="12" cy="12" r="9"/><path d="M9 12l2 2 4-4"/></svg>`;
}
