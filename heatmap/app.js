/* SpringTrapping2026 - heatmap/app.js
   URL support:
   - /heatmap/<dataset>
   - /heatmap/?dataset=<dataset>
   - /heatmap/index.html?dataset=<dataset> (legacy fallback)
*/

(function () {
  const DATASETS = {
    focus: { label: "Focus Gemeenten", file: "../data_focus_gemeenten.csv" },
    hotspot: { label: "Focus Hot Spots", file: "../data_hotspots.csv" },
    noord: { label: "Noord-Nederland", file: "../data_noord_nederland.csv" },
    midden: { label: "Midden-Nederland", file: "../data_midden_nederland.csv" },
    zh: { label: "Zuid-Holland", file: "../data_zuid_holland.csv" },
    zl: { label: "Zeeland", file: "../data_zeeland.csv" },
    nb: { label: "Noord-Brabant", file: "../data_noord_brabant.csv" },
    li: { label: "Limburg", file: "../data_limburg.csv" },
  };
  const DEFAULT_DATASET = "focus";

  const map = L.map("map", { preferCanvas: true });

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors",
  }).addTo(map);

  map.setView([52.1, 5.1], 8);

  const datasetEl = document.getElementById("datasetSelect");
  const radiusEl = document.getElementById("radiusRange");
  const blurEl = document.getElementById("blurRange");
  const countEl = document.getElementById("pointCount");
  const openClassicMapEl = document.getElementById("openClassicMap");

  const sidebarEl = document.getElementById("sidebar");
  const toggleBtn = document.getElementById("togglePanel");
  const IS_MOBILE_LAYOUT = () =>
    window.matchMedia && window.matchMedia("(max-width: 900px)").matches;

  let heatLayer = null;
  let heatPoints = [];
  let currentDatasetKey = DEFAULT_DATASET;

  function normalizeSpaces(s) {
    return String(s ?? "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function resolveDatasetKey(raw) {
    const k = normalizeSpaces(raw || "").toLowerCase();
    return DATASETS[k] ? k : DEFAULT_DATASET;
  }

  function getDatasetFromPath() {
    const parts = window.location.pathname.split("/").filter(Boolean);
    const idx = parts.lastIndexOf("heatmap");
    if (idx < 0 || idx + 1 >= parts.length) return null;

    const candidate = normalizeSpaces(parts[idx + 1]).toLowerCase();
    if (!candidate || candidate === "index.html") return null;
    return DATASETS[candidate] ? candidate : null;
  }

  function getDatasetFromQuery() {
    const u = new URL(window.location.href);
    return u.searchParams.get("dataset") || u.searchParams.get("region");
  }

  function getProjectRootPrefix() {
    const parts = window.location.pathname.split("/").filter(Boolean);
    const idx = parts.lastIndexOf("heatmap");
    if (idx < 0) return "";
    const prefix = parts.slice(0, idx).join("/");
    return prefix ? `/${prefix}` : "";
  }

  function datasetRoute(key) {
    const base = `${getProjectRootPrefix()}/heatmap/`.replace(/\/+/g, "/");
    return `${base}?dataset=${encodeURIComponent(key)}`;
  }

  function datasetClassicMapRoute(key) {
    const base = getProjectRootPrefix() || "";
    return `${base}/?region=${encodeURIComponent(key)}`;
  }

  function setDatasetUrl(key) {
    window.history.replaceState({}, "", datasetRoute(key));
  }

  function updateClassicMapLink(key) {
    if (openClassicMapEl) openClassicMapEl.href = datasetClassicMapRoute(key);
  }

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
        header.forEach((h, idx) => {
          obj[h] = (r[idx] ?? "").trim();
        });
        return obj;
      });
  }

  function safeInvalidate(force) {
    try {
      map.invalidateSize(!!force);
    } catch (_) {}
  }

  function setPanelOpen(open) {
    if (!sidebarEl || !toggleBtn) return;

    if (open) {
      sidebarEl.classList.add("open");
      toggleBtn.textContent = "Kaart";
    } else {
      sidebarEl.classList.remove("open");
      toggleBtn.textContent = "Paneel";
    }

    setTimeout(() => safeInvalidate(true), 220);
  }

  function getHeatOptions() {
    const radius = Math.max(8, parseInt(radiusEl?.value || "30", 10));
    const blur = Math.max(5, parseInt(blurEl?.value || "22", 10));

    return {
      radius,
      blur,
      maxZoom: 16,
      minOpacity: 0.34,
      gradient: {
        0.25: "#2c7bb6",
        0.45: "#abd9e9",
        0.62: "#ffffbf",
        0.78: "#fdae61",
        1.0: "#d7191c",
      },
    };
  }

  function renderHeat() {
    if (heatLayer) {
      try {
        map.removeLayer(heatLayer);
      } catch (_) {}
    }

    heatLayer = L.heatLayer(heatPoints, getHeatOptions()).addTo(map);

    if (countEl) {
      countEl.textContent = `${heatPoints.length} observations geladen voor "${DATASETS[currentDatasetKey].label}".`;
    }
  }

  async function loadDataset(datasetKey) {
    const ds = DATASETS[datasetKey] || DATASETS[DEFAULT_DATASET];
    currentDatasetKey = resolveDatasetKey(datasetKey);
    updateClassicMapLink(currentDatasetKey);

    const res = await fetch(ds.file, { cache: "no-store" });
    if (!res.ok) throw new Error(`Failed to load ${ds.file} (${res.status})`);

    const text = await res.text();
    const rows = parseCSV(text);

    heatPoints = rows
      .map((r) => {
        const lat = parseFloat(r.latitude);
        const lng = parseFloat(r.longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
        return [lat, lng, 1];
      })
      .filter(Boolean);

    renderHeat();

    if (heatPoints.length) {
      const bounds = L.latLngBounds(heatPoints.map((p) => [p[0], p[1]])).pad(0.15);
      map.fitBounds(bounds);
    } else {
      map.setView([52.1, 5.1], 8);
    }
  }

  if (datasetEl) {
    datasetEl.addEventListener("change", () => {
      const key = resolveDatasetKey(datasetEl.value);
      datasetEl.value = key;
      setDatasetUrl(key);
      loadDataset(key).catch((err) => {
        console.error(err);
        alert(err.message || String(err));
      });
    });
  }

  if (radiusEl) {
    radiusEl.addEventListener("input", () => renderHeat());
  }

  if (blurEl) {
    blurEl.addEventListener("input", () => renderHeat());
  }

  if (toggleBtn && sidebarEl) {
    toggleBtn.addEventListener("click", (e) => {
      e.preventDefault();
      const open = sidebarEl.classList.contains("open");
      setPanelOpen(!open);
    });
  }

  window.addEventListener("resize", () => safeInvalidate(false));
  setTimeout(() => safeInvalidate(true), 0);

  if (IS_MOBILE_LAYOUT()) setPanelOpen(true);

  const initialKey = resolveDatasetKey(getDatasetFromPath() || getDatasetFromQuery() || DEFAULT_DATASET);
  if (datasetEl) datasetEl.value = initialKey;
  setDatasetUrl(initialKey);
  updateClassicMapLink(initialKey);

  loadDataset(initialKey).catch((err) => {
    console.error(err);
    alert(err.message || String(err));
  });
})();
