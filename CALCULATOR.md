# Calculator: Populatie- en kostenmodel Aziatische hoornaar

Deze pagina (`/calculator`) is een volledig client-side model (HTML/CSS/vanilla JS). Het simuleert 25 jaar (of een door jou gekozen duur) populatieontwikkeling en beheerkosten voor drie scenario’s:
1. Vroeg starten met beheer
2. Niets doen
3. Pas ingrijpen na verzadiging

## Model in het kort
- Draagkracht: `K = d_max * A`
- Jaarlijkse verwijdering: `V_t = p_t * N_t`
- Restpopulatie: `N_rest = (1 - p_t) * N_t`
- Volgend jaar: `N_(t+1) = (R_max * N_rest) / (1 + ((R_max - 1) / K) * N_rest)`
- Jaarlijkse kosten: `C_t = c * V_t`
- Cumulatieve kosten: som van `C_t`

Het kritische beheerpercentage is `p_kritisch = 1 - (1 / R_max)` en wordt expliciet weergegeven.

## Bestanden
- `calculator/index.html`: UI en structuur
- `calculator/styles.css`: styling
- `calculator/app.js`: berekeningen, grafieken, tabellen, export
Externe libraries via CDN: Chart.js en jsPDF.

## Export
- CSV-export bevat metadata, invoerparameters, scenario-samenvatting en detailresultaten.
- PDF-export bevat titel, datum, invoerparameters, kerncijfers, scenariovergelijking en grafieken.

## Uitbreiden
In `calculator/app.js` staan commentaarpunten waar je eenvoudig:
- extra schadeposten kunt toevoegen (bijv. extra kostencomponenten)
- gevoeligheidsanalyse kunt inbouwen (meerdere runs met variërende parameters)
