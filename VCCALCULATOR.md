# CALCULATOR

Files created/updated for calculator static site:
- calculator/index.html
- calculator/styles.css
- calculator/app.js
- CALCULATOR.md
- README.md

Key features implemented:
- Client-side model for 3 scenarios (vroeg beheer, niets doen, ingrijpen na verzadiging)
- Sliders + numeric inputs with defaults
- Summary panel with K, p_kritisch, saturation years, totals, differences
- Charts (Chart.js) for population and cumulative costs
- Scenario summary table + per-year detail table with tabs
- CSV export (metadata, inputs, scenario summary, detail block)
- PDF export (inputs, key metrics, scenario comparison, charts)

Notes:
- Scenario 3 uses saturation year from scenario 2 (first year N_t >= s*K with no management). If not reached within T, scenario 3 keeps p_t = 0 and summary warns.
- Validation prevents A <= 0, N0 < 1, K <= 0 and warns when R_max <= 1 or p_beheer <= p_kritisch.
- Comments in calculator/app.js indicate where to add sensitivity analysis or extra cost components.

CDNs:
- Chart.js 4.4.1
- jsPDF 2.5.1



