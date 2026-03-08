# AGL Portfolio — NEM Insights

A single-page data analytics portfolio built to demonstrate energy market analysis skills for a Data Analyst role at AGL.

**Author:** Aylin Vahabova  
**Data source:** [Open Electricity](https://openelectricity.org.au) — CC BY-NC 4.0  
**Coverage:** National Electricity Market (NEM) — December 1998 to February 2026

---

## What's inside

| Section | Key output |
|---------|-----------|
| **01 Energy Transition** | Stacked area chart of generation mix since 1998; renewable % growth line |
| **02 Price Story** | 27-year VWAP timeline with spike detection; price distribution; rolling 12-month average |
| **03 Emissions Scoreboard** | CO₂ intensity decline; emissions donut by source; coal vs gas stacked over time |
| **04 Market Value** | Revenue by fuel type (last 12 months); clean vs fossil value trend |
| **05 SQL Showcase** | 8 analytical queries with CTEs, window functions, and energy-domain logic |
| **06 Market Literacy** | AEMO concepts: dispatch, interconnectors, VWAP, duck curve, emissions methodology |

---

## How to run

The portfolio includes a Python proxy server (`server.py`) that both serves the static files **and** forwards live API calls to Open Electricity server-side — avoiding the browser CORS restriction that blocks direct API calls from `localhost`.

**Start the server (one command, no dependencies):**
```bash
cd "/Users/aylinvahabova/Documents/AGL Portfolio"
python3 server.py
```
Then open [http://localhost:8080](http://localhost:8080)

> **Why not `python3 -m http.server`?** The Open Electricity API blocks cross-origin browser requests (no `Access-Control-Allow-Origin` header). The custom `server.py` proxies all `/api/v4/...` requests server-side, so the browser only ever talks to `localhost`.

---

## File structure

```
AGL Portfolio/
├── index.html                        ← Single-page portfolio
├── 19981201 Open Electricity.csv     ← Source data (327 months)
├── assets/
│   ├── css/style.css                 ← Dark electric theme, responsive
│   └── js/app.js                     ← Data processing + 10 Chart.js charts
├── sql/
│   └── analysis_queries.sql          ← 8 analytical SQL queries
└── README.md
```

---

## Data notes

- All energy values are in **GWh/month** (NEM-wide, not per region)
- Price is the **Volume-Weighted Average Price (VWAP)** in AUD/MWh
- Emissions intensity is in **kgCO₂e/MWh** using NGA combustion factors
- Market value is in **AUD** (total for the month, all NEM regions)
- Curtailment (wind and solar) is recorded separately and excluded from generation totals
- Data licensed under **CC BY-NC 4.0** — attribution to Open Electricity required

---

## Key findings

- **Renewable share** grew from ~14% in 1999 to ~46% by early 2026, driven by large-scale wind (mid-2010s) and rooftop solar (2018–present)
- **Grid emissions intensity** has fallen by ~50% since peak levels in the early 2000s
- **Coal** still accounts for ~80%+ of NEM combustion emissions despite being ~50% of generation — due to its high carbon intensity vs gas
- **The 2022 energy crisis** produced the most extreme month-over-month price movements in NEM history
- **Battery storage** has gone from zero to a meaningful dispatch contributor since 2017, with market value now measurable
