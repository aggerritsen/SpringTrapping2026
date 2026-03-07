# Calculator: Populatie- en kostenmodel Aziatische hoornaar

Deze pagina (`/calculator`) is een volledig client-side model (HTML/CSS/vanilla JS). Het simuleert 25 jaar (of een door jou gekozen duur) populatieontwikkeling en beheerkosten voor drie scenario’s:
1. Vroeg starten met beheer
2. Geen actief beheer (alleen passieve veiligheid)
3. Pas ingrijpen na verzadiging

## Model in het kort
- Draagkracht: `K = d_max * A`
- Gecorrigeerde verzadigingsdrempel: `D_verzadiging = s * K * (1 - p_passief)`
- Toegepaste verwijdering: `p_t = p_actief_t` als actief beheer aan staat, anders `p_t = p_passief`
- Jaarlijkse verwijdering: `V_t = p_t * N_t`
- Restpopulatie: `N_rest = (1 - p_t) * N_t`
- Volgend jaar: `N_(t+1) = (R_max * N_rest) / (1 + ((R_max - 1) / K) * N_rest)`
- Jaarlijkse kosten: `C_t = c * V_t`
- Cumulatieve kosten: som van `C_t`

Het kritische beheerpercentage is `p_kritisch = 1 - (1 / R_max)` en wordt expliciet weergegeven.

### Scenario-logica
- `p_passief` (standaard 0,30) wordt gebruikt in jaren zonder actief beheer.
- Scenario 1: vanaf `t_start` geldt actief beheer (`p_t = p_beheer`) in plaats van passieve ruiming.
- Scenario 2: geen actief beheer (`p_actief_t = 0`), dus alleen passieve ruiming.
- Scenario 3: actief beheer start pas als `N_t >= D_verzadiging`; vanaf dat moment geldt `p_t = p_beheer`.

## Bestanden
- `calculator/index.html`: UI en structuur
- `calculator/styles.css`: styling
- `calculator/app.js`: berekeningen, grafieken, tabellen, export
Externe libraries via CDN: Chart.js en jsPDF.

## UI-notities
- Grafieken zijn compacter gemaakt (lagere canvas-hoogte) voor betere leesbaarheid op scherm.
- Populatiegrafiek toont `N_(t+1)` (na reductie en Beverton-Holt groei), zodat groeidynamiek direct zichtbaar is.

## Export
- CSV-export bevat metadata, invoerparameters (incl. `p_passief`), scenario-samenvatting en detailresultaten.
- PDF-export bevat titel, datum, invoerparameters (incl. `p_passief`), kerncijfers, scenariovergelijking en grafieken.

## Uitbreiden
In `calculator/app.js` staan commentaarpunten waar je eenvoudig:
- extra schadeposten kunt toevoegen (bijv. extra kostencomponenten)
- gevoeligheidsanalyse kunt inbouwen (meerdere runs met variërende parameters)
