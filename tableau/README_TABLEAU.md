# Tableau Build Guide — NEM Insights

This guide walks through the exact steps to build three production-quality Tableau dashboards from the NEM pipeline data. Every calculated field, parameter, and action is specified with working Tableau syntax.

---

## Quick Start

```bash
# 1. Generate the data (from the project root)
cd tableau
python3 pipeline.py

# 2. Optional: also create a .hyper extract
pip install tableauhyperapi
python3 pipeline.py --hyper
```

Outputs land in `tableau/tableau_data/`.

---

## Data Files

| File | Grain | Rows (approx) | Source |
|------|-------|--------------|--------|
| `fact_energy_fueltech.csv` | month × fueltech | ~5,200 | Open Electricity CSV |
| `fact_market_nem.csv` | month (NEM-wide) | ~327 | Open Electricity CSV |
| `fact_market_regional.csv` | month × region | ~180 | API (last 36 months) |
| `fact_market_hourly.csv` | hour (NEM-wide) | ~336 | API (last 14 days) |
| `dim_fueltech.csv` | fueltech | 16 | Static |
| `dim_region.csv` | region | 6 | Static |

---

## Data Model in Tableau (Logical Layer)

Connect these files using **Relationships** (not joins) in Tableau's logical layer. This preserves row-level granularity across tables.

```
fact_energy_fueltech ─── dim_fueltech      (fueltech_id → fueltech_id)
fact_energy_fueltech ─── fact_market_nem   (date → date)
fact_market_regional ─── dim_region        (region_code → region_code)
fact_market_hourly   ─── (standalone — used for Dashboard 1 only)
```

**Why relationships, not joins?**  
Joining `fact_energy_fueltech` to `fact_market_nem` on date would repeat the NEM-wide price for every fueltech row (fanout), distorting aggregations. Relationships let Tableau query each table at the correct level of detail.

---

## Calculated Fields

### Core Measures

**Emissions Intensity (kgCO₂e/MWh)**
```
SUM([Emissions Tco2e]) / NULLIF(SUM(IF [Energy Gwh] > 0 THEN [Energy Gwh] ELSE 0 END), 0)
```
*Returns kgCO₂e/MWh. Note: tCO₂e ÷ GWh = tCO₂e/GWh = 1000 kgCO₂e/1000 MWh = kgCO₂e/MWh.*

**Renewables Share %**
```
SUM(IF [Is Renewable] = 1 AND [Energy Gwh] > 0 THEN [Energy Gwh] ELSE 0 END)
/
NULLIF(SUM(IF [Energy Gwh] > 0 THEN [Energy Gwh] ELSE 0 END), 0)
```

**Market Value (A$M)**
```
SUM([Market Value Aud]) / 1000000
```

**Revenue Intensity ($/MWh implied)**
```
SUM([Market Value Aud]) / NULLIF(SUM(IF [Energy Gwh] > 0 THEN [Energy Gwh] ELSE 0 END) * 1000, 0)
```
*Market value ÷ MWh generated = implied average dispatch price for that fuel.*

**Clean vs Fossil Revenue Split**
```
SUM(IF [Category] = 'Renewable' OR [Category] = 'Storage' THEN [Market Value Aud] ELSE 0 END)
/
NULLIF(SUM([Market Value Aud]), 0)
```

---

### Table Calculations (require correct addressing/partitioning)

**Rolling 12-Month Average Price**  
*(Apply to a line chart of monthly VWAP; address = Date)*
```
WINDOW_AVG(AVG([Vwap Aud Mwh]), -11, 0)
```

**Year-over-Year Price Change (%)**  
*(Addressing = Date, Partitioning = Region)*
```
(ZN(AVG([Vwap Aud Mwh])) - LOOKUP(ZN(AVG([Vwap Aud Mwh])), -12))
/
ABS(LOOKUP(ZN(AVG([Vwap Aud Mwh])), -12))
```

**Cumulative Market Value by Fueltech**  
*(Addressing = Date, Partitioning = Fueltech Group)*
```
RUNNING_SUM(SUM([Market Value Aud])) / 1e9
```

---

### LOD Expressions (Level of Detail)

**Daily Average Price, Regardless of Fueltech Filter**
```
{ FIXED [Date], [Region Code] : AVG([Vwap Aud Mwh]) }
```
*Use this when you want the price axis to stay stable even when a fueltech filter changes.*

**Price Spike Flag (p95 threshold)**
```
IF AVG([Vwap Aud Mwh]) >= { FIXED : PERCENTILE([Vwap Aud Mwh], 0.95) }
THEN "Spike (p95+)"
ELSE "Normal"
END
```

**Spike Count per Region**
```
{ FIXED [Region Code] :
  COUNTD(
    IF AVG([Vwap Aud Mwh]) >= { FIXED : PERCENTILE([Vwap Aud Mwh], 0.95) }
    THEN [Date]
    END
  )
}
```

**Annual Renewables Share (for reference line)**
```
{ FIXED [Year] :
  SUM(IF [Is Renewable] = 1 AND [Energy Gwh] > 0 THEN [Energy Gwh] ELSE 0 END) /
  NULLIF(SUM(IF [Energy Gwh] > 0 THEN [Energy Gwh] ELSE 0 END), 0)
}
```

---

### Parameters

**P1 — Region Selector**
- Type: String  
- Allowable values: List → NSW1, QLD1, SA1, TAS1, VIC1, All  
- Use: `IF [P1 Region] = 'All' OR [Region Code] = [P1 Region] THEN 1 ELSE 0 END` as a filter calc

**P2 — Spike Threshold**
- Type: Float  
- Current value: 300  
- Allowable values: Range 100–1000, step 50  
- Use: `AVG([Vwap Aud Mwh]) > [P2 Spike Threshold]`

**P3 — Financial Year**
- Type: String  
- Allowable values: List → pull from `[Financial Year]` field  
- Use: to filter a YoY comparison view

**P4 — Metric Selector (for Dashboard 2)**
- Type: String  
- Values: `Price ($/MWh)`, `Renewables (%)`, `Emissions Intensity (kg/MWh)`  
- Use: `CASE [P4 Metric] WHEN 'Price ($/MWh)' THEN AVG([Vwap Aud Mwh]) WHEN 'Renewables (%)' THEN [Renewables Share %] WHEN 'Emissions Intensity (kg/MWh)' THEN [Emissions Intensity (kgCO₂e/MWh)] END`

---

## Dashboard 1 — NEM Weekly Overview

**Data source:** `fact_market_hourly.csv`  
**Target audience:** Trading / market operations team

### Layout

```
┌─────────────────────────────────────────────────────────┐
│  KPI tiles: Avg Price | Peak Price | Renewables % | Demand│
├──────────────────────┬──────────────────────────────────┤
│  Price Heatmap       │  Price vs Renewables Scatter      │
│  (Hour × Weekday)    │  (with demand as size)            │
├──────────────────────┴──────────────────────────────────┤
│  Hourly Price Line + Renewables % (dual axis)           │
├─────────────────────────────────────────────────────────┤
│  Top 10 Spike Hours table (click → filter above charts) │
└─────────────────────────────────────────────────────────┘
```

### Sheet: Price Heatmap

- **Rows:** `HOUR([Datetime])` → Continuous
- **Columns:** `WEEKDAY([Datetime])` → Discrete
- **Color:** `AVG([Vwap Aud Mwh])` → sequential palette (white → orange → red)
- **Tooltip:** Avg price, Renewables %, Demand GWh

### Sheet: Price vs Renewables Scatter

- **Columns:** `AVG([Renewable Pct])`
- **Rows:** `AVG([Vwap Aud Mwh])`
- **Size:** `AVG([Demand Gwh])`
- **Color:** Spike flag calculated field
- **Trend line:** Linear (right-click → Trend Lines → Show)
- **Tooltip:** Date, Hour, Price, Renewables %, Demand

### Sheet: Top 10 Spike Hours Table

- **Rows:** `[Datetime]`, `AVG([Vwap Aud Mwh])`, `AVG([Renewable Pct])`, `AVG([Demand Gwh])`
- **Sort:** Descending by `[Vwap Aud Mwh]`
- **Filter:** Top 10 by `AVG([Vwap Aud Mwh])`
- **Action:** Filter → this sheet is source → all other Dashboard 1 sheets are target

### Interactivity

1. **Highlight action:** Click hour on heatmap → highlight that hour on scatter
2. **Filter action:** Click row in spike table → filter line chart to that date
3. **Parameter action:** P2 spike threshold slider → updates spike flag colour on scatter

---

## Dashboard 2 — Region Comparison

**Data source:** `fact_market_regional.csv` + `dim_region.csv`  
**Target audience:** Strategy / commercial team

### Layout

```
┌──────────────────────────────────────────────────────────┐
│  Region selector (P1) + Metric selector (P4) parameters  │
├──────────┬──────────┬──────────┬──────────┬─────────────┤
│  NSW     │  QLD     │  SA      │  TAS     │  VIC        │
│  sparkline price line chart (small multiples)           │
├──────────────────────┬───────────────────────────────────┤
│  Bar: Avg Price      │  Bar: Renewables % by Region     │
│       by Region      │  (current period, sorted)        │
├──────────────────────┴───────────────────────────────────┤
│  Scatter: Renewables % vs Price (region as colour)       │
│  + demand as size + trendline                            │
└──────────────────────────────────────────────────────────┘
```

### Sheet: Small Multiples — Price by Region

- **Rows:** `[Region Name]`
- **Columns:** `MONTH([Date])` → Continuous
- **Mark type:** Line
- **Colour:** `[Region Code]` → custom palette matching dim_fueltech colours
- **Tick:** Edit Axis → Fixed → same scale for all regions (enables comparison)

### Sheet: Region Scatter — Renewables vs Price

- **Columns:** `AVG([Renewable Pct])`
- **Rows:** `AVG([Vwap Aud Mwh])`
- **Colour:** `[Region Code]`
- **Size:** `AVG([Demand Gwh])`
- **Detail:** `[Date]`
- **Label:** `[Region Code]` on the last data point (use LOD to get latest)
- **LOD for reference line:** `{ FIXED [Region Code] : AVG([Vwap Aud Mwh]) }` → add as reference line to Y axis

### Key LODs for Dashboard 2

```
// Highest-price month per region (for callout)
{ FIXED [Region Code] : MAX([Vwap Aud Mwh]) }

// Price volatility (std dev per region)
{ FIXED [Region Code] : STDEV([Vwap Aud Mwh]) }

// Renewable-price correlation direction
IF { FIXED [Region Code] :
  CORR(AVG([Renewable Pct]), AVG([Vwap Aud Mwh]))
} < -0.3
THEN "Price suppression (renewables dominant)"
ELSE "Weak relationship (demand or constraints dominant)"
END
```

---

## Dashboard 3 — Emissions & Energy Transition

**Data source:** `fact_energy_fueltech.csv` + `dim_fueltech.csv` + `fact_market_nem.csv`  
**Target audience:** Sustainability / strategy team

### Layout

```
┌─────────────────────────────────────────────────────────┐
│  KPIs: Intensity today | Intensity 1998 | % reduction   │
│        Coal share of emissions | Renewables share today  │
├──────────────────────────┬──────────────────────────────┤
│  Stacked area: Energy    │  Line: Emissions Intensity   │
│  mix by fueltech_group   │  + rolling 12m avg           │
│  (1998–2026)             │  + reference line: 2030 target│
├──────────────────────────┴──────────────────────────────┤
│  Donut: Market value by fueltech (latest 12 months)     │
│  + % annotation in tooltip                              │
├─────────────────────────────────────────────────────────┤
│  Small multiples: MV by category (Fossil/Renewable/     │
│  Storage) over time — shows the revenue crossover       │
└─────────────────────────────────────────────────────────┘
```

### Sheet: Stacked Area — Energy Mix

- **Columns:** `MONTH([Date])` → Continuous
- **Rows:** `SUM([Energy Gwh])`
- **Colour:** `[Fueltech Group]` → custom palette from `dim_fueltech.color_hex`
- **Mark type:** Area → Stack marks
- **Sort:** `[Display Order]` from `dim_fueltech`

### Sheet: Emissions Intensity Line

- **Columns:** `MONTH([Date])`
- **Rows:** `[Emissions Intensity (kgCO₂e/MWh)]` (calculated field)
- **Dual axis:** `WINDOW_AVG(...)` rolling 12m avg
- **Reference line:** Constant = 200 (approx net-zero grid level), labelled "Net-zero grid target"
- **Viz in Tooltip:** Add a mini bar chart showing fueltech emissions breakdown for the hovered month

### Sheet: Market Value Donut (latest 12 months)

- **Filter:** Date = last 12 months (relative date filter)
- **Columns:** `SUM([Market Value Aud M])`
- **Rows:** `[Fueltech Group]`
- **Mark type:** Pie → angle = `SUM([Market Value Aud M])`
- **Colour + Label:** `[Fueltech Group]`

### Calculated Field: Clean vs Fossil Revenue Trend

```
// % of total revenue from clean generation
SUM(IF [Category] = 'Renewable' OR [Category] = 'Storage'
    THEN [Market Value Aud] ELSE 0 END)
/
NULLIF(SUM([Market Value Aud]), 0)
```
Plot this as a line over time to show the revenue crossover point.

---

## Publishing to Tableau Public

1. **File → Save to Tableau Public As** → log in with your Tableau Public account
2. Before publishing, use **Data → Extract Data** to create a `.tde`/`.hyper` extract — Tableau Public dashboards must use extracts
3. Set the view to "Visible to all" and copy the embed URL for your portfolio site

**Recommended views to feature on your portfolio:**
- Dashboard 1 (interactive — shows real-time data)
- The small multiples region comparison
- The emissions intensity line with the net-zero reference line

---

## Skills Checklist (for your portfolio notes)

| Skill | Where demonstrated |
|-------|--------------------|
| Data model (relationships, not joins) | 3-table logical model |
| LOD expressions | Spike detection, region avg, correlation |
| Table calculations | Rolling avg, YoY %, cumulative |
| Parameters | Region, spike threshold, metric selector |
| Actions | Highlight, filter, URL |
| Viz in Tooltip | Mini emissions breakdown on hover |
| Dual axis | Intensity + rolling avg |
| Small multiples | Region sparklines, category revenue |
| Extract + publish | Tableau Public workflow |
| Custom colour palette | Matching dim_fueltech.color_hex |

---

## Method Notes (for interview challenges)

| Metric | Definition |
|--------|-----------|
| Energy (GWh) | Scheduled + semi-scheduled NEM dispatch; excludes behind-the-meter rooftop solar |
| Emissions intensity | NGA combustion factors per fueltech; combustion only (not lifecycle) |
| VWAP | Volume-weighted average dispatch price; intervals weighted by demand at each 5-min dispatch |
| Renewables % | Renewable energy ÷ operational demand (not total consumption — excludes rooftop) |
| Market value | Dispatch price × dispatched energy at each settlement interval |
| "Clean" | Wind + utility solar + rooftop solar + hydro + bioenergy + battery (discharge) |
| Financial year | Australian: July 1 – June 30; FY2026 = July 2025 – June 2026 |
