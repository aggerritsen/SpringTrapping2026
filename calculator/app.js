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
    c: 500,
    d_max: 12,
    A: 30,
    N0: 15,
    R_max: 5,
    s: 0.95,
    p_passief: 0.3,
    p_beheer: 0.8,
    t_start: 1,
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
    c: { min: 200, max: 1000, integer: true },
    d_max: { min: 2, max: 25, integer: true },
    A: { min: 1, max: 150, integer: true },
    N0: { min: 1, max: 500, integer: true },
    R_max: { min: 1.1, max: 10, integer: false },
    s: { min: 0.5, max: 0.99, integer: false },
    p_passief: { min: 0, max: 1, integer: false },
    p_beheer: { min: 0, max: 1, integer: false },
    t_start: { min: 1, max: 25, integer: true },
    T: { min: 1, max: 25, integer: true },
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
    if (p.N0 > 500) messages.push("Startpopulatie (N0) mag maximaal 500 zijn.");
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

  function pdfCreateLayout(doc) {
    return {
      left: 40,
      right: 40,
      top: 44,
      bottom: 34,
      pageWidth: doc.internal.pageSize.getWidth(),
      pageHeight: doc.internal.pageSize.getHeight(),
    };
  }

  function pdfEnsureSpace(doc, y, neededHeight, layout) {
    if (y + neededHeight > layout.pageHeight - layout.bottom) {
      doc.addPage();
      return layout.top;
    }
    return y;
  }

  function pdfAddSectionTitle(doc, text, y, layout) {
    y = pdfEnsureSpace(doc, y, 24, layout);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(20, 20, 20);
    doc.text(text, layout.left, y);
    return y + 16;
  }

  function pdfAddSubTitle(doc, text, y, layout) {
    y = pdfEnsureSpace(doc, y, 18, layout);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(25, 25, 25);
    doc.text(text, layout.left, y);
    return y + 14;
  }

  function pdfAddParagraph(doc, text, y, layout, options = {}) {
    const fontSize = options.fontSize || 10;
    const lineHeight = options.lineHeight || 13;
    const spacingAfter = options.spacingAfter == null ? 6 : options.spacingAfter;
    const maxWidth = options.maxWidth || (layout.pageWidth - layout.left - layout.right);
    const color = options.color || [40, 40, 40];

    doc.setFont("helvetica", "normal");
    doc.setFontSize(fontSize);
    doc.setTextColor(color[0], color[1], color[2]);
    const lines = doc.splitTextToSize(text, maxWidth);
    y = pdfEnsureSpace(doc, y, lines.length * lineHeight + spacingAfter + 2, layout);
    doc.text(lines, layout.left, y);
    return y + lines.length * lineHeight + spacingAfter;
  }

  function pdfFormatSaturationYear(value) {
    return value ? `Jaar ${value}` : "Niet bereikt";
  }

  function pdfBuildInsights(results) {
    const scenarioLabels = {
      scenario1: "Scenario 1 - vroeg beheer",
      scenario2: "Scenario 2 - geen beheer",
      scenario3: "Scenario 3 - beheer na verzadiging",
    };
    const s1 = results.scenario1;
    const s2 = results.scenario2;
    const s3 = results.scenario3;

    const scenarios = [
      { key: "scenario1", totalCost: s1.totalCost, endPopulation: s1.endPopulation },
      { key: "scenario2", totalCost: s2.totalCost, endPopulation: s2.endPopulation },
      { key: "scenario3", totalCost: s3.totalCost, endPopulation: s3.endPopulation },
    ];

    const cheapest = scenarios.reduce((min, cur) => (cur.totalCost < min.totalCost ? cur : min), scenarios[0]);
    const lowestEndPop = scenarios.reduce((min, cur) => (cur.endPopulation < min.endPopulation ? cur : min), scenarios[0]);

    const lines = [];
    if (s1.totalCost < s3.totalCost) {
      lines.push("Bij de gekozen parameters leidt vroeg beheer tot lagere cumulatieve kosten dan beheer na verzadiging.");
    } else if (s1.totalCost > s3.totalCost) {
      lines.push("Bij de gekozen parameters leidt beheer na verzadiging tot lagere cumulatieve kosten dan vroeg beheer.");
    } else {
      lines.push("Bij de gekozen parameters zijn de cumulatieve kosten van vroeg beheer en beheer na verzadiging vergelijkbaar.");
    }

    if (s3.endPopulation > s1.endPopulation) {
      lines.push("Uitstel van ingrijpen vergroot de populatiebasis waarop later moet worden beheerd.");
    } else {
      lines.push("De populatiebasis bij beheer na verzadiging blijft in deze run vergelijkbaar met of lager dan die bij vroeg beheer.");
    }

    lines.push("Het referentiescenario zonder actief beheer laat zien tot welk populatieniveau de populatie onder deze aannames kan doorgroeien.");
    lines.push(`${scenarioLabels[cheapest.key]} heeft in deze run de laagste totale kosten, terwijl ${scenarioLabels[lowestEndPop.key]} de laagste eindpopulatie oplevert.`);

    return lines.slice(0, 4);
  }

  function pdfRenderTableFallback(doc, cfg, layout) {
    const { head, body, startY } = cfg;
    const cellPadding = 3;
    const lineHeight = 10;
    const minRowHeight = 16;
    const colCount = head.length;
    const tableWidth = layout.pageWidth - layout.left - layout.right;
    const widths = Array.isArray(cfg.columnPercents) && cfg.columnPercents.length === colCount
      ? cfg.columnPercents.map((p) => p * tableWidth)
      : Array.from({ length: colCount }, () => tableWidth / colCount);

    let y = startY;

    const drawRow = (cells, isHeader) => {
      const wrapped = cells.map((cell, idx) => {
        const value = String(cell == null ? "" : cell);
        return doc.splitTextToSize(value, widths[idx] - cellPadding * 2);
      });
      const lineCount = Math.max(...wrapped.map((l) => l.length));
      const rowHeight = Math.max(minRowHeight, lineCount * lineHeight + 2);

      y = pdfEnsureSpace(doc, y, rowHeight + 2, layout);

      let x = layout.left;
      for (let i = 0; i < colCount; i += 1) {
        const explicitAlign = cfg.columnAlign && cfg.columnAlign[i];
        const isNumericColumn = Array.isArray(cfg.numericColumns) && cfg.numericColumns.includes(i);
        const align = explicitAlign || (isNumericColumn ? "right" : "left");

        if (isHeader) {
          doc.setFillColor(240, 240, 240);
          doc.rect(x, y, widths[i], rowHeight, "FD");
        } else {
          doc.rect(x, y, widths[i], rowHeight, "S");
        }
        doc.setFont("helvetica", isHeader ? "bold" : "normal");
        doc.setFontSize(8.5);
        doc.setTextColor(30, 30, 30);
        if (align === "right") {
          doc.text(wrapped[i], x + widths[i] - cellPadding, y + 10, { align: "right" });
        } else if (align === "center") {
          doc.text(wrapped[i], x + widths[i] / 2, y + 10, { align: "center" });
        } else {
          doc.text(wrapped[i], x + cellPadding, y + 10);
        }
        x += widths[i];
      }

      y += rowHeight;
    };

    drawRow(head, true);
    body.forEach((row) => drawRow(row, false));

    return y + 8;
  }

  function pdfRenderTable(doc, cfg, layout) {
    const autoColumnStyles = {};
    if (cfg.columnStyles) {
      Object.keys(cfg.columnStyles).forEach((key) => {
        autoColumnStyles[key] = { ...cfg.columnStyles[key] };
      });
    }
    if (Array.isArray(cfg.numericColumns)) {
      cfg.numericColumns.forEach((idx) => {
        autoColumnStyles[idx] = { ...(autoColumnStyles[idx] || {}), halign: "right" };
      });
    }
    if (cfg.columnAlign) {
      Object.keys(cfg.columnAlign).forEach((key) => {
        autoColumnStyles[key] = { ...(autoColumnStyles[key] || {}), halign: cfg.columnAlign[key] };
      });
    }

    if (typeof doc.autoTable === "function") {
      doc.autoTable({
        startY: cfg.startY,
        head: [cfg.head],
        body: cfg.body,
        theme: "grid",
        margin: { left: layout.left, right: layout.right },
        styles: {
          font: "helvetica",
          fontSize: 8.5,
          cellPadding: 3,
          lineColor: [190, 190, 190],
          lineWidth: 0.3,
          textColor: [28, 28, 28],
          overflow: "linebreak",
        },
        headStyles: {
          fillColor: [240, 240, 240],
          textColor: [20, 20, 20],
          fontStyle: "bold",
        },
        columnStyles: autoColumnStyles,
      });
      return (doc.lastAutoTable ? doc.lastAutoTable.finalY : cfg.startY) + 10;
    }
    return pdfRenderTableFallback(doc, cfg, layout);
  }

  function pdfAddPageNumbers(doc, layout) {
    const totalPages = doc.getNumberOfPages();
    for (let page = 1; page <= totalPages; page += 1) {
      doc.setPage(page);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(100, 100, 100);
      doc.text(`Pagina ${page} van ${totalPages}`, layout.pageWidth - layout.right, layout.pageHeight - 16, { align: "right" });
    }
  }

  async function exportPDF(results, params, summary) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const layout = pdfCreateLayout(doc);
    const modelVersion = "1.0";
    let y = layout.top;

    const scenarioRows = [
      ["Scenario 1 - vroeg beheer", nfCurrency.format(results.scenario1.totalCost), nf0.format(results.scenario1.totalRemoved), nf0.format(results.scenario1.endPopulation), pdfFormatSaturationYear(results.scenario1.saturationYear), nfCurrency.format(results.scenario1.peakCost)],
      ["Scenario 2 - geen beheer", nfCurrency.format(results.scenario2.totalCost), nf0.format(results.scenario2.totalRemoved), nf0.format(results.scenario2.endPopulation), pdfFormatSaturationYear(results.scenario2.saturationYear), nfCurrency.format(results.scenario2.peakCost)],
      ["Scenario 3 - beheer na verzadiging", nfCurrency.format(results.scenario3.totalCost), nf0.format(results.scenario3.totalRemoved), nf0.format(results.scenario3.endPopulation), pdfFormatSaturationYear(results.scenario3.saturationYear), nfCurrency.format(results.scenario3.peakCost)],
    ];

    const insights = pdfBuildInsights(results);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.setTextColor(12, 12, 12);
    doc.text("Populatie- en kostenmodel Aziatische hoornaar (Vespa velutina)", layout.left, y);
    y += 24;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(40, 40, 40);
    doc.text("Scenarioanalyse van populatieontwikkeling, nestverwijdering en kosten", layout.left, y);
    y += 18;

    doc.setFontSize(9);
    doc.setTextColor(70, 70, 70);
    doc.text(`Exportdatum en tijd: ${new Date().toLocaleString("nl-NL")}`, layout.left, y);
    y += 12;
    doc.text(`Modelversie: ${modelVersion}`, layout.left, y);
    y += 12;
    doc.text("Notitie: Automatisch gegenereerde scenarioanalyse", layout.left, y);
    y += 16;

    y = pdfAddParagraph(
      doc,
      "Dit rapport geeft een modelmatige vergelijking van drie beheerscenario's voor de Aziatische hoornaar. De uitkomsten zijn bedoeld voor scenarioanalyse en beleidsinterpretatie en niet als exacte voorspelling van toekomstige populatiegroottes.",
      y,
      layout,
      { fontSize: 10, lineHeight: 13, spacingAfter: 10 }
    );

    y = pdfAddSectionTitle(doc, "Managementsamenvatting", y, layout);
    y = pdfAddParagraph(doc, `Simulatieduur: ${nf0.format(params.T)} jaren`, y, layout, { fontSize: 9.5, lineHeight: 12, spacingAfter: 4 });
    y = pdfRenderTable(
      doc,
      {
        startY: y,
        head: ["Scenario", "Totale kosten", "Totaal verwijderde nesten", "Eindpopulatie", "Verzadigingsjaar", "Piekjaarkosten"],
        body: scenarioRows,
        numericColumns: [1, 2, 3, 5],
        columnStyles: {
          0: { cellWidth: 130 },
          1: { cellWidth: 72 },
          2: { cellWidth: 92 },
          3: { cellWidth: 62 },
          4: { cellWidth: 76 },
          5: { cellWidth: 72 },
        },
        columnPercents: [0.28, 0.14, 0.18, 0.12, 0.14, 0.14],
      },
      layout
    );

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(30, 30, 30);
    y = pdfEnsureSpace(doc, y, 16, layout);
    doc.text("Interpretatie:", layout.left, y);
    y += 12;
    insights.forEach((line) => {
      y = pdfAddParagraph(doc, `- ${line}`, y, layout, { fontSize: 9.5, lineHeight: 12, spacingAfter: 2 });
    });
    y += 4;

    y = pdfAddSectionTitle(doc, "Gebruikte modelparameters", y, layout);
    y = pdfRenderTable(
      doc,
      {
        startY: y,
        head: ["Parameter", "Symbool", "Waarde", "Eenheid", "Betekenis"],
        body: [
          ["Kostprijs per nestverwijdering", "c", nf0.format(params.c), "euro per nest", "Directe verwijderingskosten per nest."],
          ["Maximale nestdichtheid", "d_max", nf0.format(params.d_max), "nesten per km2", "Maximumdichtheid per oppervlakte-eenheid."],
          ["Oppervlakte gebied", "A", nf0.format(params.A), "km2", "Grootte van het gemodelleerde gebied."],
          ["Startpopulatie", "N0", nf0.format(params.N0), "nesten", "Beginaantal nesten in jaar 1."],
          ["Maximale groeifactor bij lage dichtheid", "R_max", nf2.format(params.R_max), "factor", "Groeidruk in vroege populatiefase."],
          ["Verzadigingsdrempel", "s", nf2.format(params.s), "fractie van K", "Drempel voor analytisch verzadigingsmoment."],
          ["Jaarlijks verwijderingspercentage actief", "p_beheer", nf2.format(params.p_beheer), "fractie", "Aandeel actief verwijderde nesten per jaar."],
          ["Jaarlijks verwijderingspercentage passief", "p_passief", nf2.format(params.p_passief), "fractie", "Aandeel passief verwijderde nesten per jaar."],
          ["Startjaar vroeg beheer", "t_start", nf0.format(params.t_start), "jaar", "Jaar waarin scenario 1 actief beheer start."],
          ["Simulatieduur", "T", nf0.format(params.T), "jaren", "Aantal gesimuleerde jaren."],
        ],
        numericColumns: [2],
        columnStyles: {
          0: { cellWidth: 136 },
          1: { cellWidth: 48 },
          2: { cellWidth: 58 },
          3: { cellWidth: 86 },
          4: { cellWidth: 194 },
        },
        columnPercents: [0.26, 0.09, 0.11, 0.16, 0.38],
      },
      layout
    );

    y = pdfAddParagraph(doc, "Afgeleide grootheid: K = d_max x A [S1, S7]", y, layout, { fontSize: 10, lineHeight: 12, spacingAfter: 4 });
    y = pdfAddParagraph(
      doc,
      "De draagkracht K geeft de theoretische maximale populatieomvang binnen het gemodelleerde gebied onder de gekozen aanname voor maximale nestdichtheid.",
      y,
      layout,
      { fontSize: 9.5, lineHeight: 12, spacingAfter: 8 }
    );

    y = pdfAddSubTitle(doc, "Empirische achtergrond voor maximale nestdichtheid (d_max)", y, layout);
    y = pdfAddParagraph(
      doc,
      "De parameter d_max representeert de maximale nestdichtheid van Vespa velutina die in een gebied kan voorkomen wanneer de populatie zich volledig heeft gevestigd. Veldstudies in Europa laten zien dat de dichtheid sterk varieert afhankelijk van landschap en urbanisatiegraad [B5, B6, B7].",
      y,
      layout,
      { fontSize: 9.4, lineHeight: 12, spacingAfter: 4 }
    );
    y = pdfAddParagraph(doc, "- ongeveer 5 nesten per km2 in landelijke gebieden", y, layout, { fontSize: 9.4, lineHeight: 12, spacingAfter: 1 });
    y = pdfAddParagraph(doc, "- ongeveer 10-12 nesten per km2 in stedelijke gebieden", y, layout, { fontSize: 9.4, lineHeight: 12, spacingAfter: 3 });
    y = pdfAddParagraph(
      doc,
      "In sommige lokale studies zijn nog hogere waarden waargenomen, met uitschieters tot ongeveer 19 nesten per km2 of meer in sterk verstedelijkte of voedselrijke landschappen. Deze waarden worden in dit model gebruikt als plausibele bandbreedte voor scenarioanalyse van populatieontwikkeling [B5, B6, B7].",
      y,
      layout,
      { fontSize: 9.4, lineHeight: 12, spacingAfter: 4 }
    );
    y = pdfAddParagraph(
      doc,
      "De gekozen waarde voor d_max heeft grote invloed op de lange-termijnpopulatie en daarmee op de potentiele omvang van latere beheermaatregelen. Lagere waarden vertegenwoordigen meer open of landelijke landschappen, terwijl hogere waarden passen bij stedelijke of voedselrijke gebieden waar Vespa velutina dichter kan voorkomen [S7].",
      y,
      layout,
      { fontSize: 9.4, lineHeight: 12, spacingAfter: 8 }
    );

    y = pdfAddSectionTitle(doc, "Model voor populatiedynamiek", y, layout);
    y = pdfAddParagraph(
      doc,
      "De populatieontwikkeling wordt gemodelleerd met een dichtheidsafhankelijk groeimodel van het Beverton-Holt-type [S2]. Dit betekent dat de populatie bij lage dichtheid snel kan toenemen, terwijl de groei afremt wanneer de populatie de draagkracht van het gebied benadert.",
      y,
      layout,
      { fontSize: 9.5, lineHeight: 12, spacingAfter: 6 }
    );
    y = pdfAddParagraph(doc, "V_t = p_t x N_t", y, layout, { fontSize: 10, lineHeight: 12, spacingAfter: 1 });
    y = pdfAddParagraph(doc, "N_rest = (1 - p_t) x N_t", y, layout, { fontSize: 10, lineHeight: 12, spacingAfter: 1 });
    y = pdfAddParagraph(doc, "N_(t+1) = (R_max x N_rest) / (1 + ((R_max - 1) / K) x N_rest)", y, layout, { fontSize: 10, lineHeight: 12, spacingAfter: 1 });
    y = pdfAddParagraph(doc, "C_t = c x V_t [S4]", y, layout, { fontSize: 10, lineHeight: 12, spacingAfter: 6 });
    y = pdfAddParagraph(doc, "N_t = aantal nesten aan het begin van jaar t", y, layout, { fontSize: 9.2, lineHeight: 11, spacingAfter: 1 });
    y = pdfAddParagraph(doc, "V_t = aantal verwijderde nesten in jaar t", y, layout, { fontSize: 9.2, lineHeight: 11, spacingAfter: 1 });
    y = pdfAddParagraph(doc, "N_rest = resterende populatie na verwijdering", y, layout, { fontSize: 9.2, lineHeight: 11, spacingAfter: 1 });
    y = pdfAddParagraph(doc, "N_(t+1) = populatie aan het begin van het volgende jaar", y, layout, { fontSize: 9.2, lineHeight: 11, spacingAfter: 1 });
    y = pdfAddParagraph(doc, "C_t = jaarlijkse verwijderingskosten", y, layout, { fontSize: 9.2, lineHeight: 11, spacingAfter: 8 });

    y = pdfAddSectionTitle(doc, "Interpretatie van modelparameters", y, layout);
    y = pdfAddSubTitle(doc, "R_max", y, layout);
    y = pdfAddParagraph(doc, "Bepaalt hoe snel de populatie groeit wanneer deze nog ver onder de draagkracht ligt. Hogere waarden leiden tot snellere uitbreiding in de vroege fase.", y, layout, { fontSize: 9.4, lineHeight: 12, spacingAfter: 3 });
    y = pdfAddSubTitle(doc, "d_max", y, layout);
    y = pdfAddParagraph(doc, "Bepaalt samen met de oppervlakte de potentiele maximale nestbezetting van het gebied. Hogere waarden leiden tot een hogere theoretische draagkracht [S1, S7]. Empirische studies rapporteren voor Vespa velutina vaak ordegroottes rond circa 5 nesten per km2 in landelijke contexten en circa 10-12 nesten per km2 in stedelijke contexten, met lokale maxima tot ongeveer 15-19 nesten per km2 [B5, B6, B7].", y, layout, { fontSize: 9.4, lineHeight: 12, spacingAfter: 3 });
    y = pdfAddSubTitle(doc, "A", y, layout);
    y = pdfAddParagraph(doc, "Grotere gebieden kunnen bij gelijke dichtheid meer nesten dragen. Daardoor nemen zowel potentiele populatieomvang als latere beheersinspanning toe [S1].", y, layout, { fontSize: 9.4, lineHeight: 12, spacingAfter: 3 });
    y = pdfAddSubTitle(doc, "p_beheer", y, layout);
    y = pdfAddParagraph(doc, "Geeft aan welk deel van de aanwezige nesten jaarlijks voor reproductie effectief wordt verwijderd. Dit is de belangrijkste beleidsmatige stuurvariabele in actieve scenario's [S3].", y, layout, { fontSize: 9.4, lineHeight: 12, spacingAfter: 3 });
    y = pdfAddSubTitle(doc, "c", y, layout);
    y = pdfAddParagraph(doc, "Beinvloedt niet de ecologische uitkomst van het model, maar wel de financiele gevolgen van beheer [S4].", y, layout, { fontSize: 9.4, lineHeight: 12, spacingAfter: 3 });
    y = pdfAddSubTitle(doc, "t_start", y, layout);
    y = pdfAddParagraph(doc, "Bepaalt hoe vroeg actief beheer start. Een vroeger startmoment verkleint doorgaans de kans op latere hoge beheerkosten [S6].", y, layout, { fontSize: 9.4, lineHeight: 12, spacingAfter: 3 });
    y = pdfAddSubTitle(doc, "s", y, layout);
    y = pdfAddParagraph(doc, "Geeft aan bij welk aandeel van de draagkracht in dit model wordt gesproken van verzadiging. Dit is een analytische drempel en geen absoluut ecologisch omslagpunt [S5].", y, layout, { fontSize: 9.4, lineHeight: 12, spacingAfter: 8 });

    y = pdfAddSectionTitle(doc, "Kritisch beheerpercentage", y, layout);
    y = pdfRenderTable(
      doc,
      {
        startY: y,
        head: ["Grootheid", "Waarde", "Toelichting"],
        body: [
          ["Kritisch beheerpercentage p_kritisch", nf2.format(summary.pkritisch), "Theoretische ondergrens bij lage dichtheid."],
          ["Gekozen beheerpercentage p_beheer", nf2.format(params.p_beheer), "Invoer voor actieve scenario's."],
          ["Conclusie", params.p_beheer >= summary.pkritisch ? "Boven p_kritisch" : "Onder p_kritisch", params.p_beheer >= summary.pkritisch ? "Structurele afremming in de vroege fase is volgens het model plausibel." : "Structurele krimp in de vroege fase is volgens het model minder waarschijnlijk."],
        ],
        columnStyles: {
          0: { cellWidth: 180 },
          1: { cellWidth: 80 },
          2: { cellWidth: 214 },
        },
        columnPercents: [0.38, 0.16, 0.46],
      },
      layout
    );
    y = pdfAddParagraph(
      doc,
      "Het kritische beheerpercentage is het theoretische minimumpercentage verwijdering dat bij lage dichtheid nodig is om populatiegroei af te remmen. Ligt het gekozen beheerpercentage daaronder, dan is structurele krimp in de vroege fase volgens het model minder waarschijnlijk.",
      y,
      layout,
      { fontSize: 9.4, lineHeight: 12, spacingAfter: 8 }
    );

    y = pdfAddSectionTitle(doc, "Resultaten per scenario", y, layout);

    const scenarioSections = [
      {
        title: "Scenario 1 - vroeg starten met beheer",
        description: "Vanaf jaar t_start wordt jaarlijks een fractie p_beheer van de nesten verwijderd.",
        result: results.scenario1,
      },
      {
        title: "Scenario 2 - geen beheer",
        description: "Er vindt geen actieve nestverwijdering plaats. Dit scenario fungeert als referentiescenario.",
        result: results.scenario2,
      },
      {
        title: "Scenario 3 - beheer na verzadiging",
        description: "Er wordt pas actief verwijderd zodra de populatie de gekozen verzadigingsdrempel bereikt.",
        result: results.scenario3,
      },
    ];

    scenarioSections.forEach((section) => {
      y = pdfAddSubTitle(doc, section.title, y, layout);
      y = pdfAddParagraph(doc, `${section.description} [S6]`, y, layout, { fontSize: 9.4, lineHeight: 12, spacingAfter: 4 });
      y = pdfRenderTable(
        doc,
        {
          startY: y,
          head: ["Totale kosten", "Totaal verwijderde nesten", "Eindpopulatie", "Verzadigingsjaar", "Piekjaarkosten"],
          body: [[
            nfCurrency.format(section.result.totalCost),
            nf0.format(section.result.totalRemoved),
            nf0.format(section.result.endPopulation),
            pdfFormatSaturationYear(section.result.saturationYear),
            nfCurrency.format(section.result.peakCost),
          ]],
          numericColumns: [0, 1, 2, 4],
          columnStyles: {
            0: { cellWidth: 108 },
            1: { cellWidth: 118 },
            2: { cellWidth: 82 },
            3: { cellWidth: 92 },
            4: { cellWidth: 92 },
          },
          columnPercents: [0.22, 0.24, 0.17, 0.19, 0.18],
        },
        layout
      );
      y = pdfAddParagraph(doc, "Volledige berekende tabel per jaar:", y, layout, { fontSize: 9.4, lineHeight: 12, spacingAfter: 2 });
      y = pdfRenderTable(
        doc,
        {
          startY: y,
          head: ["Jaar", "Beginpopulatie", "Verwijderingspercentage", "Verwijderde nesten", "Populatie na verwijdering", "Populatie volgend jaar", "Jaarlijkse kosten", "Cumulatieve kosten"],
          body: section.result.rows.map((row) => [
            nf0.format(row.year),
            nf0.format(row.N_t),
            nf2.format(row.p_t),
            nf0.format(row.V_t),
            nf0.format(row.N_rest),
            nf0.format(row.N_next),
            nfCurrency.format(row.cost),
            nfCurrency.format(row.cumulativeCost),
          ]),
          numericColumns: [0, 1, 2, 3, 4, 5, 6, 7],
          columnStyles: {
            0: { cellWidth: 32 },
            1: { cellWidth: 58 },
            2: { cellWidth: 58 },
            3: { cellWidth: 58 },
            4: { cellWidth: 58 },
            5: { cellWidth: 58 },
            6: { cellWidth: 86 },
            7: { cellWidth: 87 },
          },
          columnPercents: [0.06, 0.12, 0.12, 0.12, 0.12, 0.12, 0.17, 0.17],
        },
        layout
      );
      y += 4;
    });

    y = pdfAddSectionTitle(doc, "Grafieken", y, layout);

    const chartBlocks = [
      { id: "chartPopulation", title: "Populatieontwikkeling per scenario" },
      { id: "chartCosts", title: "Cumulatieve kosten per scenario" },
    ];

    chartBlocks.forEach((chart) => {
      y = pdfAddSubTitle(doc, chart.title, y, layout);
      const canvas = document.getElementById(chart.id);
      if (!canvas || typeof canvas.toDataURL !== "function") {
        y = pdfAddParagraph(doc, "Grafiek niet beschikbaar in deze exportsessie.", y, layout, { fontSize: 9.4, lineHeight: 12, spacingAfter: 5 });
        return;
      }

      let imgData = null;
      try {
        imgData = canvas.toDataURL("image/png", 1.0);
      } catch (e) {
        imgData = null;
      }

      if (!imgData) {
        y = pdfAddParagraph(doc, "Grafiek kon niet worden opgenomen in de PDF.", y, layout, { fontSize: 9.4, lineHeight: 12, spacingAfter: 5 });
        return;
      }

      const imgWidth = layout.pageWidth - layout.left - layout.right;
      const ratio = canvas.width > 0 ? canvas.height / canvas.width : 0.42;
      const imgHeight = Math.min(220, Math.max(140, imgWidth * ratio));
      y = pdfEnsureSpace(doc, y, imgHeight + 8, layout);
      doc.addImage(imgData, "PNG", layout.left, y, imgWidth, imgHeight, undefined, "FAST");
      y += imgHeight + 10;
    });

    y = pdfAddSectionTitle(doc, "Systematische verwijzingen", y, layout);
    const systematicRefs = [
      "[S1] Draagkracht: De berekende draagkracht K volgt rechtstreeks uit de aanname K = d_max x A.",
      "[S2] Populatiegroei: De jaarlijkse populatieontwikkeling volgt uit een dichtheidsafhankelijk Beverton-Holt-model met parameter R_max.",
      "[S3] Beheer: De omvang van nestverwijdering in actieve scenario's wordt bepaald door p_t en dus uiteindelijk door p_beheer en het gekozen scenario-regime.",
      "[S4] Kosten: De jaarlijkse kosten volgen lineair uit het aantal verwijderde nesten via C_t = c x V_t.",
      "[S5] Verzadiging: Het verzadigingsjaar is afhankelijk van de gekozen drempel s x K en is dus modelmatig gedefinieerd.",
      "[S6] Scenariovergelijking: Verschillen tussen scenario's komen uitsluitend voort uit verschillen in timing en intensiteit van beheer; overige modelaannames blijven gelijk.",
      "[S7] Maximale nestdichtheid: De parameter d_max bepaalt samen met de oppervlakte van het gemodelleerde gebied de draagkracht K van het systeem. Alle populatie-uitkomsten in het model zijn daarom direct afhankelijk van de gekozen aannames over maximale nestdichtheid.",
    ];
    systematicRefs.forEach((line) => {
      y = pdfAddParagraph(doc, line, y, layout, { fontSize: 9.3, lineHeight: 12, spacingAfter: 3 });
    });
    y += 4;

    y = pdfAddSectionTitle(doc, "Bronnen en wetenschappelijke achtergrond", y, layout);
    const sources = [
      "[B1] Beverton, R.J.H. en Holt, S.J. Klassieke grondslag voor dichtheidsafhankelijke populatiemodellen.",
      "[B2] Monceau, K. en Thiery, D. Studies naar nestdistributie en nestdichtheden van Vespa velutina op lokale schaal in Frankrijk.",
      "[B3] Europese veldstudies over Vespa velutina: literatuur waarin stedelijke en landelijke nestdichtheden van enkele tot meer dan tien nesten per km2 worden gerapporteerd.",
      "[B4] Beleidsmatige notitie: Dit model gebruikt wetenschappelijke inzichten als basis voor scenarioanalyse, maar vervangt geen lokale veldinventarisatie of operationele risicoanalyse.",
      "[B5] Monceau, K., Bonnard, O. en Thiery, D. Vespa velutina nest distribution at a local scale: an 8-year survey. Monitoringstudie van nestdichtheden in Zuidwest-Frankrijk (Arcachon / Andernos-les-Bains), met als belangrijke bevinding circa 10 nesten per km2 in stedelijke zones.",
      "[B6] Veldstudies en monitoringprogramma's in Portugal en Frankrijk rapporteren gemiddelde stedelijke dichtheden van circa 5 +/- 3 nesten per km2 en hogere lokale maxima.",
      "[B7] Europese monitoringrapporten over Vespa velutina tonen dat lokale dichtheden sterk kunnen varieren afhankelijk van voedselbeschikbaarheid, urbanisatie en detectie-inspanning, met gemelde maxima tot circa 15-19 nesten per km2.",
    ];
    sources.forEach((line) => {
      y = pdfAddParagraph(doc, line, y, layout, { fontSize: 9.3, lineHeight: 12, spacingAfter: 3 });
    });

    y = pdfAddParagraph(
      doc,
      "De bronverwijzingen geven de wetenschappelijke achtergrond van de gekozen modelstructuur en de orde van grootte van gebruikte dichtheidsaannames. De concrete scenario-uitkomsten in dit rapport zijn volledig afhankelijk van de door de gebruiker ingevoerde parameters.",
      y,
      layout,
      { fontSize: 9.3, lineHeight: 12, spacingAfter: 4 }
    );

    pdfAddPageNumbers(doc, layout);
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
