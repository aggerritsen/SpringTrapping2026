/* SpringTrapping2026 - app.js
   Expects CSV columns:
   WKT,latitude,longitude,street,postalcode,city,description
   - description currently holds the URL (waarneming.nl)

   URL:
   - ?dataset=focus|noord|midden|zh|zl|nb|li
*/

(function () {
  // =========================================================
  // DATASETS (keep in sync with index.html <option value="...">)
  // =========================================================
  const DATASETS = {
    focus:  { label: "Focus Gemeenten",  file: "./data_focus_gemeenten.csv" },
    noord:  { label: "Noord-Nederland",  file: "./data_noord_nederland.csv" },
    midden: { label: "Midden-Nederland", file: "./data_midden_nederland.csv" },
    zh:     { label: "Zuid-Holland",     file: "./data_zuid_holland.csv" },
    zl:     { label: "Zeeland",          file: "./data_zeeland.csv" },
    nb:     { label: "Noord-Brabant",    file: "./data_noord_brabant.csv" },
    li:     { label: "Limburg",          file: "./data_limburg.csv" },
  };
  const DEFAULT_DATASET = "focus";

  // Yellow for non-selected items (rings + marker)
  const DIM_COLOR = "#f0c419"; // warm yellow

  // =========================================================
  // MARKER ICONS (SVG data URI)
  // =========================================================
  function svgMarkerDataUri(fillHex) {
    const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="34" height="54" viewBox="0 0 34 54">
  <path d="M17 0C7.6 0 0 7.6 0 17c0 13 17 37 17 37s17-24 17-37C34 7.6 26.4 0 17 0z" fill="${fillHex}"/>
  <circle cx="17" cy="17" r="6.5" fill="#ffffff" fill-opacity="0.95"/>
</svg>`.trim();

    const encoded = encodeURIComponent(svg)
      .replace(/'/g, "%27")
      .replace(/"/g, "%22");

    return `data:image/svg+xml;charset=UTF-8,${encoded}`;
  }

  const NORMAL_MARKER_COLOR = "#2a81cb"; // Leaflet-ish blue

  const baseIcon = new L.Icon({
    iconUrl: svgMarkerDataUri(NORMAL_MARKER_COLOR),
    iconSize: [34, 54],
    iconAnchor: [17, 54],
    popupAnchor: [0, -50],
    shadowUrl: null,
  });

  const dimIcon = new L.Icon({
    iconUrl: svgMarkerDataUri(DIM_COLOR),
    iconSize: [34, 54],
    iconAnchor: [17, 54],
    popupAnchor: [0, -50],
    shadowUrl: null,
  });

  // =========================================================
  // HELPERS
  // =========================================================
  function safeHtml(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function normalizeSpaces(s) {
    return String(s ?? "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function isValidUrl(url) {
    try {
      const u = new URL(url);
      return u.protocol === "http:" || u.protocol === "https:";
    } catch {
      return false;
    }
  }

  function getQueryParam(name) {
    const u = new URL(window.location.href);
    return u.searchParams.get(name);
  }

  function setQueryParam(name, value) {
    const u = new URL(window.location.href);
    if (value == null || value === "") u.searchParams.delete(name);
    else u.searchParams.set(name, value);
    window.history.replaceState({}, "", u.toString());
  }

  function resolveDatasetKey(raw) {
    const k = normalizeSpaces(raw || "").toLowerCase();
    return DATASETS[k] ? k : DEFAULT_DATASET;
  }

  // =========================================================
  // CSV PARSER
  // =========================================================
  function parseCSV(text) {
    const rows = [];
    let row = [];
    let field = "";
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      const next = text[i + 1];

      if (c === '"' && inQuotes && next === '"') {
        field += '"';
        i++;
        continue;
      }
      if (c === '"') {
        inQuotes = !inQuotes;
        continue;
      }
      if (c === "," && !inQuotes) {
        row.push(field);
        field = "";
        continue;
      }
      if ((c === "\n" || c === "\r") && !inQuotes) {
        if (field.length || row.length) {
          row.push(field);
          rows.push(row);
        }
        field = "";
        row = [];
        if (c === "\r" && next === "\n") i++;
        continue;
      }
      field += c;
    }

    if (field.length || row.length) {
      row.push(field);
      rows.push(row);
    }

    if (!rows.length) return [];

    const header = rows.shift().map((h) => h.trim());
    return rows
      .filter((r) => r.some((x) => (x ?? "").trim() !== ""))
      .map((r) => {
        const obj = {};
        header.forEach((h, idx) => (obj[h] = (r[idx] ?? "").trim()));
        return obj;
      });
  }

  // =========================================================
  // MAP INIT
  // =========================================================
  const map = L.map("map", { preferCanvas: true });

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors",
  }).addTo(map);

  map.setView([52.1, 5.1], 8); // NL default

  const layer = L.featureGroup().addTo(map);

  function safeInvalidate(force) {
    try { map.invalidateSize(!!force); } catch (_) {}
  }

  setTimeout(() => safeInvalidate(true), 0);
  window.addEventListener("resize", () => safeInvalidate(false));

  const RINGS = [
    { radius: 100, color: "red",   fillOpacity: 0.12, weight: 2 },
    { radius: 200, color: "green", fillOpacity: 0.10, weight: 2 },
    { radius: 300, color: "blue",  fillOpacity: 0.08, weight: 2 },
  ];

  // =========================================================
  // STATE + UI
  // =========================================================
  let items = []; // { data, marker, rings[] }

  const listEl = document.getElementById("list");
  const filterEl = document.getElementById("filter");
  const datasetEl = document.getElementById("datasetSelect");

  // Mobile panel elements
  const sidebarEl = document.getElementById("sidebar");
  const toggleBtn = document.getElementById("togglePanel");
  const openListBtn = document.getElementById("openListBtn");

  // Only run hover pan on devices that actually support hover
  const CAN_HOVER = window.matchMedia && window.matchMedia("(hover: hover)").matches;
  const IS_MOBILE_LAYOUT = () =>
    window.matchMedia && window.matchMedia("(max-width: 900px)").matches;

  function setPanelOpen(open) {
    if (!sidebarEl || !toggleBtn) return;

    if (open) {
      sidebarEl.classList.add("open");
      document.body.classList.remove("panel-closed");
      toggleBtn.textContent = "Kaart";
    } else {
      sidebarEl.classList.remove("open");
      document.body.classList.add("panel-closed");
      toggleBtn.textContent = "Lijst";
    }

    // Give CSS transition time, then resize Leaflet
    setTimeout(() => safeInvalidate(true), 220);
  }

  // Wire the mobile button
  if (toggleBtn && sidebarEl) {
    toggleBtn.addEventListener("click", (e) => {
      e.preventDefault();
      const open = sidebarEl.classList.contains("open");
      setPanelOpen(!open);
    });
  }

  if (openListBtn) {
    openListBtn.addEventListener("click", (e) => {
      e.preventDefault();
      setPanelOpen(true);
    });
  }

  function buildAddress(d) {
    const street = normalizeSpaces(d.street || "");
    const postal = normalizeSpaces(d.postalcode || "");
    const city = normalizeSpaces(d.city || "");
    const parts = [];
    if (street) parts.push(street);
    const pcCity = normalizeSpaces(`${postal} ${city}`.trim());
    if (pcCity) parts.push(pcCity);
    return parts.join(", ");
  }

  function safeOpenPopup(item) {
    if (!item || !item.marker) return;

    if (!item.marker._map) {
      try { item.marker.addTo(layer); } catch (_) {}
    }

    map.whenReady(() => {
      safeInvalidate(false);
      setTimeout(() => {
        try { item.marker.openPopup(); } catch (_) {}
      }, 0);
    });
  }

  function renderList(listItems) {
    if (!listEl) return;
    listEl.innerHTML = "";

    listItems.forEach((item) => {
      const { data } = item;

      const div = document.createElement("div");
      div.className = "item";

      const title = data.street || "(geen adres)";
      const addressLine = buildAddress(data);
      const url = data.description || "";

      div.innerHTML = `
        <div class="name">${safeHtml(title)}</div>
        <div class="desc">${safeHtml(addressLine)}</div>
        ${url ? `<div class="small">${safeHtml(url)}</div>` : `<div class="small"></div>`}
      `;

      div.addEventListener("click", () => {
        map.setView([data.lat, data.lng], Math.max(map.getZoom(), 16), { animate: true });
        safeOpenPopup(item);

        // On mobile, collapse list after choosing a point (so user sees the map)
        if (IS_MOBILE_LAYOUT()) setPanelOpen(false);
      });

      if (CAN_HOVER) {
        div.addEventListener("mouseenter", () => {
          try { map.panTo([data.lat, data.lng], { animate: true }); } catch (_) {}
        });
      }

      listEl.appendChild(div);
    });
  }

  function applyFilter(query) {
    const q = normalizeSpaces(query).toLowerCase();

    const filtered = !q
      ? items
      : items.filter((x) => {
          const d = x.data;
          const hay = [
            d.street,
            d.postalcode,
            d.city,
            d.description,
            buildAddress(d),
          ].join(" ").toLowerCase();
          return hay.includes(q);
        });

    renderList(filtered);

    const filteredSet = new Set(filtered);
    const dim = !!q;

    items.forEach((x) => {
      const on = !dim || filteredSet.has(x);

      // Marker: base (blue) vs dim (yellow)
      try {
        x.marker.setIcon(on ? x.marker.options._baseIcon : dimIcon);
        x.marker.setOpacity(on ? 1 : 0.95);
      } catch (_) {}

      // Rings: restore originals or yellow
      x.rings.forEach((r) => {
        try {
          if (on) {
            r.setStyle({
              color: r.options._baseColor,
              fillColor: r.options._baseColor,
              opacity: 1,
              fillOpacity: r.options._baseFillOpacity,
            });
          } else {
            r.setStyle({
              color: DIM_COLOR,
              fillColor: DIM_COLOR,
              opacity: 0.9,
              fillOpacity: 0.06,
            });
          }
        } catch (_) {}
      });
    });
  }

  if (filterEl) {
    filterEl.addEventListener("input", (e) => {
      applyFilter(e.target.value || "");
    });
  }

  // =========================================================
  // DATASET LOADING
  // =========================================================
  function clearMapAndList() {
    try { layer.clearLayers(); } catch (_) {}
    items = [];
    if (listEl) listEl.innerHTML = "";
  }

  async function loadDataset(datasetKey) {
    clearMapAndList();
    if (filterEl) filterEl.value = "";

    const ds = DATASETS[datasetKey] || DATASETS[DEFAULT_DATASET];

    const res = await fetch(ds.file, { cache: "no-store" });
    if (!res.ok) throw new Error(`Failed to load ${ds.file} (${res.status})`);
    const text = await res.text();

    const data = parseCSV(text);

    data.forEach((d, idx) => {
      const lat = parseFloat(d.latitude);
      const lng = parseFloat(d.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

      const street = normalizeSpaces(d.street || "");
      const postalcode = normalizeSpaces(d.postalcode || "");
      const city = normalizeSpaces(d.city || "");
      const url = normalizeSpaces(d.description || "");

      const addressLine = buildAddress({ street, postalcode, city });
      const title = street || `Location ${idx + 1}`;

      const linkHtml =
        url && isValidUrl(url)
          ? `<a href="${safeHtml(url)}" target="_blank" rel="noopener">Open observation</a>`
          : url
          ? `<span>${safeHtml(url)}</span>`
          : "";

      const popupHtml = `
        <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;min-width:220px">
          <div style="font-weight:700;margin-bottom:6px">${safeHtml(title)}</div>
          <div style="margin-bottom:8px;color:#444">${safeHtml(addressLine)}</div>
          ${linkHtml ? `<div style="margin-bottom:8px">${linkHtml}</div>` : ""}
          <div style="color:#666;font-size:12px">${lat.toFixed(5)}, ${lng.toFixed(5)}</div>
        </div>
      `;

      // Marker uses our base icon; store it so we can restore after dimming
      const marker = L.marker([lat, lng], { icon: baseIcon }).bindPopup(popupHtml);
      marker.options._baseIcon = baseIcon;
      marker.addTo(layer);

      const rings = RINGS.map((cfg) => {
        const c = L.circle([lat, lng], {
          radius: cfg.radius,
          color: cfg.color,
          weight: cfg.weight,
          fillColor: cfg.color,
          fillOpacity: cfg.fillOpacity,
        }).addTo(layer);

        // Store originals so we can always restore after dimming
        c.options._baseFillOpacity = cfg.fillOpacity;
        c.options._baseColor = cfg.color;

        return c;
      });

      items.push({
        data: {
          WKT: d.WKT || "",
          lat,
          lng,
          street,
          postalcode,
          city,
          description: url,
        },
        marker,
        rings,
      });
    });

    if (items.length) {
      const bounds = layer.getBounds().pad(0.15);
      map.fitBounds(bounds);
      setTimeout(() => safeInvalidate(true), 0);
    }

    renderList(items);
    applyFilter(""); // reset styling

    // On mobile, start with panel open (so user can choose)
    if (IS_MOBILE_LAYOUT()) setPanelOpen(true);
  }

  // Wire dropdown => load dataset + update URL
  if (datasetEl) {
    datasetEl.addEventListener("change", () => {
      const key = resolveDatasetKey(datasetEl.value);
      setQueryParam("dataset", key);
      loadDataset(key).catch((err) => {
        console.error(err);
        alert(err.message || String(err));
      });
    });
  }

  // Initial dataset from URL
  const initialKey = resolveDatasetKey(getQueryParam("dataset"));
  if (datasetEl) datasetEl.value = initialKey;

  loadDataset(initialKey).catch((err) => {
    console.error(err);
    alert(err.message || String(err));
  });
})();
