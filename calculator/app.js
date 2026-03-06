/* SpringTrapping2026 - calculator/app.js
   Populatie- en kostenmodel Aziatische hoornaar
   Alle berekeningen client-side, geen backend.

   Opzet voor uitbreidingen:
   - Voeg extra schadeposten toe in `buildSummary` en `exportCSV`.
   - Voeg gevoeligheidsanalyse toe door `simulateScenario` in lussen aan te roepen
     en nieuwe tabellen/grafieken te renderen.
*/

(function () {
  "use strict";

  const DEFAULTS = {
    c: 300,
    d_max: 12,
    A: 30,
    N0: 15,
    R_max: 4.5,
    s: 0.95,
    p_passief: 0.3,
    p_beheer: 0.8,
    t_start: 3,
    T: 10,
  };

  const SCENARIOS = {
    scenario1: "Vroeg starten met beheer",
    scenario2: "Geen actief beheer (alleen passief)",
    scenario3: "Pas ingrijpen na verzadiging",
  };

  const elements = {
    validation: document.getElementById("validation"),
    summary: document.getElementById("summary"),
    messages: document.getElementById("messages"),
    scenarioTable: document.getElementById("scenarioTable"),
    detailTable: document.getElementById("detailTable"),
    btnReset: document.getElementById("btnReset"),
    btnCalc: document.getElementById("btnCalc"),
    btnCsv: document.getElementById("btnCsv"),
    btnPdf: document.getElementById("btnPdf"),
    tabs: Array.from(document.querySelectorAll(".tab")),
  };

  const inputMap = [
    { key: "c", range: "cRange", input: "cInput" },
    { key: "d_max", range: "dmaxRange", input: "dmaxInput" },
    { key: "A", range: "aRange", input: "aInput" },
    { key: "N0", range: "n0Range", input: "n0Input" },
    { key: "R_max", range: "rmaxRange", input: "rmaxInput" },
    { key: "s", range: "sRange", input: "sInput" },
    { key: "p_passief", range: "ppassiefRange", input: "ppassiefInput" },
    { key: "p_beheer", range: "pbeheerRange", input: "pbeheerInput" },
    { key: "t_start", range: "tstartRange", input: "tstartInput" },
    { key: "T", range: "tRange", input: "tInput" },
  ];

  const INPUT_RULES = {
    c: { min: 200, max: 500, integer: true },
    d_max: { min: 2, max: 25, integer: true },
    A: { min: 1, max: 150, integer: true },
    N0: { min: 1, max: 150, integer: true },
    R_max: { min: 1.1, max: 10, integer: false },
    s: { min: 0.5, max: 0.99, integer: false },
    p_passief: { min: 0, max: 1, integer: false },
    p_beheer: { min: 0, max: 1, integer: false },
    t_start: { min: 1, max: 25, integer: true },
    T: { min: 1, max: 50, integer: true },
  };

  const state = {
    params: { ...DEFAULTS },
    results: null,
    activeScenario: "scenario1",
    charts: {
      population: null,
      costs: null,
    },
  };

  const nf0 = new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 0 });
  const nf1 = new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 1 });
  const nf2 = new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 2 });
  const nfCurrency = new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  });

  function numberOrZero(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function sanitizeParam(key, value) {
    const rule = INPUT_RULES[key];
    let n = numberOrZero(value);
    if (!rule) return n;
    n = clamp(n, rule.min, rule.max);
    return rule.integer ? Math.round(n) : n;
  }

  function roundNestCount(value) {
    return Math.max(0, Math.round(value));
  }

  function syncInputs() {
    inputMap.forEach((item) => {
      const range = document.getElementById(item.range);
      const input = document.getElementById(item.input);
      if (!range || !input) return;

      const setValue = (value) => {
        const sanitized = sanitizeParam(item.key, value);
        range.value = String(sanitized);
        input.value = String(sanitized);
        state.params[item.key] = sanitized;
      };

      range.addEventListener("input", () => setValue(range.value));
      input.addEventListener("input", () => setValue(input.value));
    });
  }

  function setDefaults() {
    inputMap.forEach((item) => {
      const range = document.getElementById(item.range);
      const input = document.getElementById(item.input);
      if (!range || !input) return;
      const sanitized = sanitizeParam(item.key, DEFAULTS[item.key]);
      range.value = sanitized;
      input.value = sanitized;
    });
    state.params = Object.fromEntries(
      Object.keys(DEFAULTS).map((key) => [key, sanitizeParam(key, DEFAULTS[key])])
    );
  }

  function readParamsFromInputs() {
    const nextParams = {};

    inputMap.forEach((item) => {
      const range = document.getElementById(item.range);
      const input = document.getElementById(item.input);
      if (!range || !input) return;

      const rawValue = input.value !== "" ? input.value : range.value;
      const sanitized = sanitizeParam(item.key, rawValue);

      range.value = String(sanitized);
      input.value = String(sanitized);
      nextParams[item.key] = sanitized;
    });

    state.params = { ...state.params, ...nextParams };
  }

  function validateParams(p) {
    const messages = [];
    const warnings = [];

    if (p.A <= 0) messages.push("Oppervlakte (A) moet groter zijn dan 0.");
    if (p.A > 150) messages.push("Oppervlakte (A) mag maximaal 150 zijn.");
    if (p.N0 < 1) messages.push("Startpopulatie (N0) moet minimaal 1 zijn.");
    if (p.N0 > 150) messages.push("Startpopulatie (N0) mag maximaal 150 zijn.");
    if (p.R_max <= 1) warnings.push("R_max is ≤ 1: populatie groeit dan niet of krimpt.");
    if (p.d_max <= 0) messages.push("d_max moet groter zijn dan 0.");
    if (p.p_passief < 0 || p.p_passief > 1) messages.push("Passief ruimingspercentage moet tussen 0 en 1 liggen.");
    if (p.p_beheer < 0 || p.p_beheer > 1) messages.push("Actief beheerpercentage moet tussen 0 en 1 liggen.");

    const K = p.d_max * p.A;
    if (K <= 0) messages.push("Draagkracht K is <= 0. Controleer d_max en A.");

    return { messages, warnings };
  }

  function calcCarryCapacity(p) {
    return p.d_max * p.A;
  }

  function calcPKritisch(p) {
    return 1 - 1 / p.R_max;
  }

  function combineRemovalRates(passiveRate, activeRate) {
    return 1 - (1 - passiveRate) * (1 - activeRate);
  }

  function calcSaturationThreshold(params) {
    const correctedCarryCapacity = calcCarryCapacity(params) * (1 - params.p_passief);
    return roundNestCount(params.s * correctedCarryCapacity);
  }

  function findSaturationYear(params) {
    const K = calcCarryCapacity(params);
    const threshold = calcSaturationThreshold(params);

    let N = roundNestCount(params.N0);
    for (let t = 1; t <= params.T; t += 1) {
      if (N >= threshold) return t;

      const p_t = params.p_passief;
      const V = Math.min(N, roundNestCount(p_t * N));
      const N_rest = N - V;
      const N_next = roundNestCount((params.R_max * N_rest) / (1 + ((params.R_max - 1) / K) * N_rest));
      N = N_next;
    }
    return null;
  }

  function simulateScenario(params, scenarioType, saturationYear) {
    const K = calcCarryCapacity(params);
    const rows = [];
    const threshold = calcSaturationThreshold(params);

    let N = roundNestCount(params.N0);
    let cumulativeCost = 0;
    let totalRemoved = 0;
    let peakCost = 0;
    let saturationYearObserved = scenarioType === "scenario3" ? saturationYear : null;

    for (let t = 1; t <= params.T; t += 1) {
      if (saturationYearObserved == null && N >= threshold) {
        saturationYearObserved = t;
      }

      let p_actief_t = 0;

      if (scenarioType === "scenario1") {
        p_actief_t = t >= params.t_start ? params.p_beheer : 0;
      } else if (scenarioType === "scenario2") {
        p_actief_t = 0;
      } else if (scenarioType === "scenario3") {
        p_actief_t = saturationYear && t >= saturationYear ? params.p_beheer : 0;
      }

      const p_t = combineRemovalRates(params.p_passief, p_actief_t);
      const V = Math.min(N, roundNestCount(p_t * N));
      const N_rest = N - V;
      const N_next = roundNestCount((params.R_max * N_rest) / (1 + ((params.R_max - 1) / K) * N_rest));
      const cost = params.c * V;

      cumulativeCost += cost;
      totalRemoved += V;
      peakCost = Math.max(peakCost, cost);

      rows.push({
        year: t,
        scenario: scenarioType,
        N_t: N,
        p_t,
        p_passief_t: params.p_passief,
        p_actief_t,
        V_t: V,
        N_rest,
        N_next,
        cost,
        cumulativeCost,
      });

      N = N_next;
    }

    return {
      scenario: scenarioType,
      label: SCENARIOS[scenarioType],
      rows,
      totalCost: cumulativeCost,
      totalRemoved,
      endPopulation: rows.length ? rows[rows.length - 1].N_next : 0,
      peakCost,
      saturationYear: saturationYearObserved,
    };
  }

  function buildSummary(results, params, saturationYearScenario2, saturationYearScenario3) {
    const scenario1 = results.scenario1;
    const scenario2 = results.scenario2;
    const scenario3 = results.scenario3;

    const diffCosts = scenario1.totalCost - scenario3.totalCost;
    const diffRemoved = scenario1.totalRemoved - scenario3.totalRemoved;

    return {
      carryCapacity: calcCarryCapacity(params),
      saturationThreshold: calcSaturationThreshold(params),
      pkritisch: calcPKritisch(params),
      saturationYearScenario2,
      saturationYearScenario3,
      totalCosts: {
        scenario1: scenario1.totalCost,
        scenario2: scenario2.totalCost,
        scenario3: scenario3.totalCost,
      },
      totalRemoved: {
        scenario1: scenario1.totalRemoved,
        scenario2: scenario2.totalRemoved,
        scenario3: scenario3.totalRemoved,
      },
      diffCosts,
      diffRemoved,
    };
  }

  function renderSummary(summary, params) {
    const pEffectiefActief = combineRemovalRates(params.p_passief, params.p_beheer);
    const cards = [
      { label: "Draagkracht K", value: nf0.format(summary.carryCapacity) + " nesten" },
      { label: "Verzadigingsdrempel (met p_passief-correctie)", value: nf0.format(summary.saturationThreshold) + " nesten" },
      { label: "Kritisch beheerpercentage p_kritisch", value: nf2.format(summary.pkritisch) },
      { label: "Passieve ruiming p_passief", value: nf2.format(params.p_passief) },
      { label: "Totaal bij actief beheer (passief + actief)", value: nf2.format(pEffectiefActief) },
      { label: "Verzadigingsjaar scenario 2", value: summary.saturationYearScenario2 ? "Jaar " + summary.saturationYearScenario2 : "Niet bereikt" },
      { label: "Verzadigingsjaar scenario 3", value: summary.saturationYearScenario3 ? "Jaar " + summary.saturationYearScenario3 : "Niet bereikt" },
      { label: "Totale kosten scenario 1", value: nfCurrency.format(summary.totalCosts.scenario1) },
      { label: "Totale kosten scenario 2", value: nfCurrency.format(summary.totalCosts.scenario2) },
      { label: "Totale kosten scenario 3", value: nfCurrency.format(summary.totalCosts.scenario3) },
      { label: "Totale verwijderde nesten scenario 1", value: nf0.format(summary.totalRemoved.scenario1) },
      { label: "Totale verwijderde nesten scenario 2", value: nf0.format(summary.totalRemoved.scenario2) },
      { label: "Totale verwijderde nesten scenario 3", value: nf0.format(summary.totalRemoved.scenario3) },
      { label: "Verschil kosten (S1 - S3)", value: nfCurrency.format(summary.diffCosts) },
      { label: "Verschil verwijderingen (S1 - S3)", value: nf0.format(summary.diffRemoved) },
    ];

    elements.summary.innerHTML = cards
      .map((card) => {
        return `
          <div class="summary-card">
            <h4>${card.label}</h4>
            <p>${card.value}</p>
          </div>
        `;
      })
      .join("");

    const warnings = [];
    if (pEffectiefActief <= summary.pkritisch) {
      warnings.push("Het gecombineerde verwijderingspercentage (passief + actief) ligt niet boven het theoretische omslagpunt bij lage dichtheid.");
    }
    if (!summary.saturationYearScenario3) {
      warnings.push("Scenario 3 bereikt geen verzadiging binnen de simulatieduur; alleen passieve ruiming wordt toegepast.");
    }
    elements.messages.textContent = warnings.join(" ");
  }

  function chartDataset(label, data, color) {
    return {
      label,
      data,
      borderColor: color,
      backgroundColor: color + "33",
      tension: 0.2,
      pointRadius: 2,
    };
  }

  function renderCharts(results, params) {
    const labels = Array.from({ length: params.T }, (_, i) => `Jaar ${i + 1}`);

    const populationData = {
      labels,
      datasets: [
        chartDataset(results.scenario1.label, results.scenario1.rows.map((r) => r.N_next), "#0f5d3d"),
        chartDataset(results.scenario2.label, results.scenario2.rows.map((r) => r.N_next), "#6b4f1d"),
        chartDataset(results.scenario3.label, results.scenario3.rows.map((r) => r.N_next), "#1b4965"),
      ],
    };

    const costData = {
      labels,
      datasets: [
        chartDataset(results.scenario1.label, results.scenario1.rows.map((r) => r.cumulativeCost), "#0f5d3d"),
        chartDataset(results.scenario2.label, results.scenario2.rows.map((r) => r.cumulativeCost), "#6b4f1d"),
        chartDataset(results.scenario3.label, results.scenario3.rows.map((r) => r.cumulativeCost), "#1b4965"),
      ],
    };

    const options = (yLabel, formatter) => ({
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { position: "bottom" },
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.dataset.label}: ${formatter(ctx.parsed.y)}`,
          },
        },
      },
      scales: {
        x: { title: { display: true, text: "Jaar" } },
        y: { title: { display: true, text: yLabel } },
      },
    });

    if (state.charts.population) state.charts.population.destroy();
    if (state.charts.costs) state.charts.costs.destroy();

    state.charts.population = new Chart(
      document.getElementById("chartPopulation"),
      { type: "line", data: populationData, options: options("Populatie na reductie + BH-groei (N_(t+1))", (v) => nf0.format(v)) }
    );

    state.charts.costs = new Chart(
      document.getElementById("chartCosts"),
      { type: "line", data: costData, options: options("Cumulatieve kosten (€)", (v) => nfCurrency.format(v)) }
    );
  }

  function renderScenarioTable(results) {
    const rows = Object.values(results).map((r) => {
      return `
        <tr>
          <td class="left">${r.label}</td>
          <td>${nfCurrency.format(r.totalCost)}</td>
          <td>${nf0.format(r.totalRemoved)}</td>
          <td>${nf0.format(r.endPopulation)}</td>
          <td>${r.saturationYear ? "Jaar " + r.saturationYear : "Niet bereikt"}</td>
          <td>${nfCurrency.format(r.peakCost)}</td>
        </tr>
      `;
    }).join("");

    elements.scenarioTable.innerHTML = `
      <table class="table">
        <thead>
          <tr>
            <th>Scenario</th>
            <th>Totale kosten</th>
            <th>Totale verwijderde nesten</th>
            <th>Eindpopulatie</th>
            <th>Verzadigingsjaar</th>
            <th>Piekjaarkosten</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  }

  function renderDetailTable(results, scenarioKey) {
    const data = results[scenarioKey].rows;

    const rows = data.map((r) => {
      return `
        <tr>
          <td class="left">${r.year}</td>
          <td class="left">${SCENARIOS[r.scenario]}</td>
          <td>${nf0.format(r.N_t)}</td>
          <td>${nf2.format(r.p_t)}</td>
          <td>${nf0.format(r.V_t)}</td>
          <td>${nf0.format(r.N_rest)}</td>
          <td>${nf0.format(r.N_next)}</td>
          <td>${nfCurrency.format(r.cost)}</td>
          <td>${nfCurrency.format(r.cumulativeCost)}</td>
        </tr>
      `;
    }).join("");

    elements.detailTable.innerHTML = `
      <table class="table">
        <thead>
          <tr>
            <th>Jaar</th>
            <th>Scenario</th>
            <th>Beginpopulatie</th>
            <th>Verwijderingspercentage</th>
            <th>Verwijderde nesten</th>
            <th>Populatie na verwijdering</th>
            <th>Populatie volgend jaar</th>
            <th>Jaarlijkse kosten</th>
            <th>Cumulatieve kosten</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  }

  function buildCsv(results, params, summary) {
    const lines = [];
    const now = new Date();
    const timestamp = now.toLocaleString("nl-NL");

    lines.push("Metadata");
    lines.push(["Exportdatum", timestamp].join(";"));
    lines.push(["Modelnaam", "Populatie- en kostenmodel Aziatische hoornaar"].join(";"));
    lines.push(["Simulatieduur", params.T].join(";"));
    lines.push("");

    lines.push("Inputparameters");
    lines.push(["c", params.c].join(";"));
    lines.push(["d_max", params.d_max].join(";"));
    lines.push(["A", params.A].join(";"));
    lines.push(["N0", params.N0].join(";"));
    lines.push(["R_max", params.R_max].join(";"));
    lines.push(["s", params.s].join(";"));
    lines.push(["p_passief", params.p_passief].join(";"));
    lines.push(["p_beheer", params.p_beheer].join(";"));
    lines.push(["t_start", params.t_start].join(";"));
    lines.push(["T", params.T].join(";"));
    lines.push(["K", summary.carryCapacity].join(";"));
    lines.push(["verzadigingsdrempel_gecorrigeerd", summary.saturationThreshold].join(";"));
    lines.push(["p_kritisch", summary.pkritisch].join(";"));
    lines.push("");

    lines.push("Samenvatting per scenario");
    lines.push("Scenario;Totale kosten;Totale verwijderde nesten;Eindpopulatie;Verzadigingsjaar;Piekjaarkosten");
    Object.values(results).forEach((r) => {
      lines.push([
        r.label,
        r.totalCost.toFixed(2),
        r.totalRemoved.toFixed(0),
        r.endPopulation.toFixed(0),
        r.saturationYear ? r.saturationYear : "Niet bereikt",
        r.peakCost.toFixed(2),
      ].join(";"));
    });
    lines.push("");

    lines.push("Detailresultaten");
    lines.push("Jaar;Scenario;Beginpopulatie;Verwijderingspercentage;Verwijderde nesten;Populatie na verwijdering;Populatie volgend jaar;Jaarlijkse kosten;Cumulatieve kosten");
    Object.values(results).forEach((r) => {
      r.rows.forEach((row) => {
        lines.push([
          row.year,
          r.label,
          row.N_t.toFixed(0),
          row.p_t.toFixed(4),
          row.V_t.toFixed(0),
          row.N_rest.toFixed(0),
          row.N_next.toFixed(0),
          row.cost.toFixed(2),
          row.cumulativeCost.toFixed(2),
        ].join(";"));
      });
    });

    return lines.join("\n");
  }

  function exportCSV(results, params, summary) {
    const csv = buildCsv(results, params, summary);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "aziatische-hoornaar-model.csv";
    link.click();
    URL.revokeObjectURL(link.href);
  }

  async function exportPDF(results, params, summary) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const margin = 40;
    let y = margin;

    const addTitle = (text) => {
      doc.setFontSize(16);
      doc.text(text, margin, y);
      y += 22;
    };

    const addLine = (label, value) => {
      doc.setFontSize(10);
      doc.text(`${label}: ${value}`, margin, y);
      y += 14;
    };

    addTitle("Populatie- en kostenmodel Aziatische hoornaar");
    addLine("Exportdatum", new Date().toLocaleString("nl-NL"));
    y += 6;

    doc.setFontSize(12);
    doc.text("Invoerparameters", margin, y);
    y += 16;
    addLine("c (kostprijs per nest)", nfCurrency.format(params.c));
    addLine("d_max (max. dichtheid)", nf2.format(params.d_max));
    addLine("A (km²)", nf0.format(params.A));
    addLine("N0 (startpopulatie)", nf0.format(params.N0));
    addLine("R_max", nf2.format(params.R_max));
    addLine("s (verzadiging)", nf2.format(params.s));
    addLine("p_passief", nf2.format(params.p_passief));
    addLine("p_beheer (actief)", nf2.format(params.p_beheer));
    addLine("t_start", nf0.format(params.t_start));
    addLine("T", nf0.format(params.T));
    addLine("K (draagkracht)", nf0.format(summary.carryCapacity));
    addLine("Verzadigingsdrempel (gecorrigeerd)", nf0.format(summary.saturationThreshold));
    addLine("p_kritisch", nf2.format(summary.pkritisch));
    y += 8;

    doc.setFontSize(12);
    doc.text("Samenvatting per scenario", margin, y);
    y += 16;

    Object.values(results).forEach((r) => {
      addLine(
        r.label,
        `Kosten ${nfCurrency.format(r.totalCost)} | Verwijderd ${nf0.format(r.totalRemoved)} | Eindpop ${nf1.format(r.endPopulation)}`
      );
    });

    y += 6;

    const chartPop = document.getElementById("chartPopulation");
    const chartCost = document.getElementById("chartCosts");

    if (chartPop && chartCost) {
      const imgPop = chartPop.toDataURL("image/png", 1.0);
      const imgCost = chartCost.toDataURL("image/png", 1.0);

      const imgWidth = 500;
      const imgHeight = 220;

      if (y + imgHeight * 2 + 30 > doc.internal.pageSize.height) {
        doc.addPage();
        y = margin;
      }

      doc.setFontSize(12);
      doc.text("Grafieken", margin, y);
      y += 14;
      doc.addImage(imgPop, "PNG", margin, y, imgWidth, imgHeight);
      y += imgHeight + 12;
      doc.addImage(imgCost, "PNG", margin, y, imgWidth, imgHeight);
      y += imgHeight + 8;
    }

    // Kleine scenariovergelijkingstabel (samenvatting)
    if (y + 90 > doc.internal.pageSize.height) {
      doc.addPage();
      y = margin;
    }

    doc.setFontSize(12);
    doc.text("Scenariovergelijking", margin, y);
    y += 14;

    doc.setFontSize(10);
    const header = "Scenario | Totale kosten | Verwijderde nesten | Verzadigingsjaar";
    doc.text(header, margin, y);
    y += 12;

    Object.values(results).forEach((r) => {
      const line = `${r.label} | ${nfCurrency.format(r.totalCost)} | ${nf0.format(r.totalRemoved)} | ${r.saturationYear ? r.saturationYear : "Niet"}`;
      doc.text(line, margin, y);
      y += 12;
    });

    doc.save("aziatische-hoornaar-model.pdf");
  }

  function buildResults(params) {
    const saturationYearScenario2 = findSaturationYear(params);
    const saturationYearScenario3 = saturationYearScenario2;

    const results = {
      scenario1: simulateScenario(params, "scenario1", saturationYearScenario3),
      scenario2: simulateScenario(params, "scenario2", saturationYearScenario3),
      scenario3: simulateScenario(params, "scenario3", saturationYearScenario3),
    };

    const summary = buildSummary(results, params, saturationYearScenario2, saturationYearScenario3);

    return { results, summary };
  }

  function renderAll() {
    readParamsFromInputs();
    const params = { ...state.params };
    const validation = validateParams(params);

    if (validation.messages.length) {
      elements.validation.className = "validation error";
      elements.validation.textContent = validation.messages.join(" ");
      return;
    }

    if (validation.warnings.length) {
      elements.validation.className = "validation warn";
      elements.validation.textContent = validation.warnings.join(" ");
    } else {
      elements.validation.className = "validation";
      elements.validation.textContent = "";
    }

    const { results, summary } = buildResults(params);
    state.results = results;

    renderSummary(summary, params);
    renderCharts(results, params);
    renderScenarioTable(results);
    renderDetailTable(results, state.activeScenario);
  }

  function setupTabs() {
    elements.tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        elements.tabs.forEach((t) => t.classList.remove("active"));
        tab.classList.add("active");
        state.activeScenario = tab.dataset.scenario;
        if (state.results) renderDetailTable(state.results, state.activeScenario);
      });
    });
  }

  function bindActions() {
    elements.btnReset.addEventListener("click", () => {
      setDefaults();
      renderAll();
    });

    elements.btnCalc.addEventListener("click", () => {
      renderAll();
    });

    elements.btnCsv.addEventListener("click", () => {
      if (!state.results) return;
      const { summary } = buildResults(state.params);
      exportCSV(state.results, state.params, summary);
    });

    elements.btnPdf.addEventListener("click", () => {
      if (!state.results) return;
      const { summary } = buildResults(state.params);
      exportPDF(state.results, state.params, summary);
    });
  }

  syncInputs();
  setupTabs();
  bindActions();
  setDefaults();
  renderAll();
})();
