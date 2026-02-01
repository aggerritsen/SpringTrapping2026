/* SpringTrapping2026 - app.js
   Expects ./data.csv with columns:
   WKT,latitude,longitude,street,postalcode,city,description
   - description currently holds the URL (waarneming.nl)
*/

(function () {
  // ---------- Helpers ----------
  function safeHtml(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  // Robust CSV parser (handles quoted fields + commas inside quotes)
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

  function normalizeSpaces(s) {
    return String(s ?? "")
      .replace(/\s+/g, " ")
      .trim();
  }

  // ---------- Map init ----------
  const map = L.map("map", { preferCanvas: true });

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors",
  }).addTo(map);

  const layer = L.featureGroup().addTo(map);

  // Rings: 100/200/300m
  const RINGS = [
    { radius: 100, color: "red", fillOpacity: 0.12, weight: 2 },
    { radius: 200, color: "green", fillOpacity: 0.10, weight: 2 },
    { radius: 300, color: "blue", fillOpacity: 0.08, weight: 2 },
  ];

  // Store all items for filtering + sidebar
  // items: { data:{...}, marker, rings:[circle,circle,circle] }
  let items = [];

  // ---------- UI elements (optional) ----------
  const listEl = document.getElementById("list");
  const filterEl = document.getElementById("filter");

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

  function isValidUrl(url) {
    try {
      const u = new URL(url);
      return u.protocol === "http:" || u.protocol === "https:";
    } catch {
      return false;
    }
  }

  function renderList(listItems) {
    if (!listEl) return;
    listEl.innerHTML = "";

    listItems.forEach(({ data, marker }) => {
      const div = document.createElement("div");
      div.className = "item";

      const title = data.street || "(no street)";
      const addressLine = buildAddress(data);
      const url = data.description || "";

      div.innerHTML = `
        <div class="name">${safeHtml(title)}</div>
        <div class="desc">${safeHtml(addressLine)}</div>
        ${
          url
            ? `<div class="small">${safeHtml(url)}</div>`
            : `<div class="small"></div>`
        }
      `;

      // Click: zoom + open popup
      div.addEventListener("click", () => {
        map.setView([data.lat, data.lng], Math.max(map.getZoom(), 16), {
          animate: true,
        });
        marker.openPopup();
      });

      // Hover: gentle pan
      div.addEventListener("mouseenter", () => {
        map.panTo([data.lat, data.lng], { animate: true });
      });

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
          ]
            .join(" ")
            .toLowerCase();
          return hay.includes(q);
        });

    renderList(filtered);

    // Dim non-matching markers/rings
    const filteredSet = new Set(filtered);
    const dim = !!q;

    items.forEach((x) => {
      const on = !dim || filteredSet.has(x);
      x.marker.setOpacity(on ? 1 : 0.25);

      x.rings.forEach((r) => {
        r.setStyle({
          opacity: on ? 1 : 0.15,
          fillOpacity: on ? r.options._baseFillOpacity : 0.02,
        });
      });
    });
  }

  if (filterEl) {
    filterEl.addEventListener("input", (e) => {
      applyFilter(e.target.value || "");
    });
  }

  // ---------- Data loading ----------
  async function loadData() {
    const res = await fetch("./data.csv", { cache: "no-store" });
    if (!res.ok) throw new Error(`Failed to load data.csv (${res.status})`);
    const text = await res.text();

    const data = parseCSV(text);

    items = [];

    data.forEach((d, idx) => {
      const lat = parseFloat(d.latitude);
      const lng = parseFloat(d.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

      const street = normalizeSpaces(d.street || "");
      const postalcode = normalizeSpaces(d.postalcode || "");
      const city = normalizeSpaces(d.city || "");
      const url = normalizeSpaces(d.description || ""); // your "description" = URL

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
          <div style="color:#666;font-size:12px">${lat.toFixed(
            5
          )}, ${lng.toFixed(5)}</div>
        </div>
      `;

      const marker = L.marker([lat, lng]).bindPopup(popupHtml);
      marker.addTo(layer);

      const rings = RINGS.map((cfg) => {
        const c = L.circle([lat, lng], {
          radius: cfg.radius,
          color: cfg.color,
          weight: cfg.weight,
          fillColor: cfg.color,
          fillOpacity: cfg.fillOpacity,
        }).addTo(layer);

        // store original fillOpacity for dimming logic
        c.options._baseFillOpacity = cfg.fillOpacity;
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
    } else {
      // fallback view (Netherlands-ish)
      map.setView([52.1, 5.1], 8);
    }

    renderList(items);
  }

  loadData().catch((err) => {
    console.error(err);
    alert(err.message || String(err));
  });
})();
