/* ═══════════════════════════════════════════════════════════════════════════
   NEM Insights - Analytical SQL Queries
   Author  : Aylin Vahabova
   Data    : Open Electricity (CC BY-NC 4.0)
   Schema  : fact_market_timeseries, fact_network_kpis, dim_time, dim_fueltech
   Dialect : ANSI SQL (compatible with PostgreSQL / DuckDB / BigQuery)
   ═══════════════════════════════════════════════════════════════════════════

   STAR SCHEMA OVERVIEW
   ────────────────────
   fact_market_timeseries  (period_id FK, fueltech_id FK,
                            energy_gwh, emissions_tco2e, market_value_aud)

   fact_network_kpis       (period_id FK,
                            vwap_aud_mwh, emissions_intensity_kg_mwh)

   dim_time                (period_id PK, date, year, month,
                            quarter, financial_year)

   dim_fueltech            (fueltech_id PK, fueltech_name, fueltech_group,
                            is_renewable BOOLEAN, is_dispatchable BOOLEAN)
   ═══════════════════════════════════════════════════════════════════════════ */


/* ───────────────────────────────────────────────────────────────────────────
   Q1 · 12-MONTH ROLLING AVERAGE PRICE
   What does the structural price trend look like, independent of seasonal noise?
   Technique: window function with ROWS BETWEEN
   ─────────────────────────────────────────────────────────────────────────── */
SELECT
    t.date,
    n.vwap_aud_mwh                                              AS monthly_vwap,
    ROUND(
        AVG(n.vwap_aud_mwh) OVER (
            ORDER BY t.date
            ROWS BETWEEN 11 PRECEDING AND CURRENT ROW
        ), 2
    )                                                           AS rolling_12m_avg,
    ROUND(
        STDDEV(n.vwap_aud_mwh) OVER (
            ORDER BY t.date
            ROWS BETWEEN 11 PRECEDING AND CURRENT ROW
        ), 2
    )                                                           AS rolling_12m_stdev
FROM  fact_network_kpis n
JOIN  dim_time t ON n.period_id = t.period_id
ORDER BY t.date;


/* ───────────────────────────────────────────────────────────────────────────
   Q2 · TOP 10 PRICE SPIKE MONTHS + GENERATION CONTEXT
   Which months saw the highest prices - and what was the fuel mix at the time?
   Technique: CTEs, RANK(), NULLIF division guard
   ─────────────────────────────────────────────────────────────────────────── */
WITH price_ranked AS (
    SELECT
        n.period_id,
        t.date,
        n.vwap_aud_mwh,
        RANK() OVER (ORDER BY n.vwap_aud_mwh DESC)             AS price_rank
    FROM  fact_network_kpis n
    JOIN  dim_time t ON n.period_id = t.period_id
),
monthly_gen AS (
    SELECT
        f.period_id,
        SUM(CASE WHEN ft.is_renewable THEN f.energy_gwh ELSE 0 END)            AS renewable_gwh,
        SUM(CASE WHEN f.energy_gwh > 0 THEN f.energy_gwh ELSE 0 END)           AS total_gwh,
        SUM(CASE WHEN ft.fueltech_group = 'coal' THEN f.energy_gwh ELSE 0 END) AS coal_gwh,
        SUM(CASE WHEN ft.fueltech_group = 'gas'  THEN f.energy_gwh ELSE 0 END) AS gas_gwh
    FROM  fact_market_timeseries f
    JOIN  dim_fueltech ft ON f.fueltech_id = ft.fueltech_id
    GROUP BY f.period_id
)
SELECT
    pr.date,
    ROUND(pr.vwap_aud_mwh, 2)                                  AS vwap_aud_mwh,
    pr.price_rank,
    ROUND(mg.renewable_gwh / NULLIF(mg.total_gwh, 0) * 100, 1) AS renewable_pct,
    ROUND(mg.coal_gwh      / NULLIF(mg.total_gwh, 0) * 100, 1) AS coal_pct,
    ROUND(mg.gas_gwh       / NULLIF(mg.total_gwh, 0) * 100, 1) AS gas_pct,
    ROUND(mg.total_gwh, 0)                                      AS total_gwh
FROM  price_ranked  pr
JOIN  monthly_gen   mg ON pr.period_id = mg.period_id
WHERE pr.price_rank <= 10
ORDER BY pr.price_rank;


/* ───────────────────────────────────────────────────────────────────────────
   Q3 · ANNUAL RENEWABLE SHARE - TRACKING THE ENERGY TRANSITION
   How has the renewable % of NEM generation changed year by year?
   Technique: GROUP BY, CASE expressions, conditional aggregation
   ─────────────────────────────────────────────────────────────────────────── */
SELECT
    t.year,
    ROUND(
        SUM(CASE WHEN ft.is_renewable THEN f.energy_gwh ELSE 0 END) /
        NULLIF(SUM(CASE WHEN f.energy_gwh > 0 THEN f.energy_gwh ELSE 0 END), 0) * 100, 1
    )                                                           AS renewable_pct,
    ROUND(SUM(CASE WHEN ft.is_renewable     THEN f.energy_gwh ELSE 0 END) / 1000, 1)
                                                                AS renewable_twh,
    ROUND(SUM(CASE WHEN f.energy_gwh > 0   THEN f.energy_gwh ELSE 0 END) / 1000, 1)
                                                                AS total_twh,
    ROUND(SUM(CASE WHEN ft.fueltech_group IN ('solar') AND ft.is_renewable
                        THEN f.energy_gwh ELSE 0 END) / 1000, 2)
                                                                AS solar_twh,
    ROUND(SUM(CASE WHEN ft.fueltech_group = 'wind'
                        THEN f.energy_gwh ELSE 0 END) / 1000, 2)
                                                                AS wind_twh,
    ROUND(SUM(CASE WHEN ft.fueltech_group = 'hydro'
                        THEN f.energy_gwh ELSE 0 END) / 1000, 2)
                                                                AS hydro_twh
FROM  fact_market_timeseries f
JOIN  dim_time     t  ON f.period_id   = t.period_id
JOIN  dim_fueltech ft ON f.fueltech_id = ft.fueltech_id
GROUP BY t.year
ORDER BY t.year;


/* ───────────────────────────────────────────────────────────────────────────
   Q4 · EMISSIONS INTENSITY WITH YEAR-OVER-YEAR CHANGE
   How fast is the grid decarbonising? (kg CO₂/MWh per year)
   Technique: CTE + LAG() window function for delta and % change
   ─────────────────────────────────────────────────────────────────────────── */
WITH annual_intensity AS (
    SELECT
        t.year,
        ROUND(AVG(n.emissions_intensity_kg_mwh), 1)            AS avg_intensity
    FROM  fact_network_kpis n
    JOIN  dim_time t ON n.period_id = t.period_id
    GROUP BY t.year
)
SELECT
    year,
    avg_intensity,
    LAG(avg_intensity) OVER (ORDER BY year)                    AS prev_year_intensity,
    ROUND(
        avg_intensity - LAG(avg_intensity) OVER (ORDER BY year), 1
    )                                                          AS yoy_change_kg,
    ROUND(
        (avg_intensity - LAG(avg_intensity) OVER (ORDER BY year)) /
        NULLIF(LAG(avg_intensity) OVER (ORDER BY year), 0) * 100, 1
    )                                                          AS yoy_pct_change
FROM  annual_intensity
ORDER BY year;


/* ───────────────────────────────────────────────────────────────────────────
   Q5 · MARKET VALUE BY FUEL TECHNOLOGY GROUP - LAST 12 MONTHS
   Who earned what in the NEM? Includes implied price per MWh.
   Technique: date filter, RANK() window function, conditional aggregation
   ─────────────────────────────────────────────────────────────────────────── */
SELECT
    ft.fueltech_group,
    ft.is_renewable,
    ROUND(SUM(f.market_value_aud) / 1e9, 2)                   AS market_value_bn_aud,
    ROUND(SUM(CASE WHEN f.energy_gwh > 0 THEN f.energy_gwh ELSE 0 END), 0)
                                                               AS generation_gwh,
    ROUND(
        SUM(f.market_value_aud) /
        NULLIF(SUM(CASE WHEN f.energy_gwh > 0 THEN f.energy_gwh * 1000 ELSE 0 END), 0), 2
    )                                                          AS implied_price_aud_mwh,
    RANK() OVER (ORDER BY SUM(f.market_value_aud) DESC)        AS revenue_rank
FROM  fact_market_timeseries f
JOIN  dim_fueltech ft ON f.fueltech_id = ft.fueltech_id
JOIN  dim_time     t  ON f.period_id   = t.period_id
WHERE t.date >= DATEADD('month', -12,
                  (SELECT MAX(date) FROM dim_time))
GROUP BY ft.fueltech_group, ft.is_renewable
ORDER BY market_value_bn_aud DESC;


/* ───────────────────────────────────────────────────────────────────────────
   Q6 · FINANCIAL YEAR KPI DASHBOARD
   One summary row per FY: price, renewables %, intensity, energy, emissions, revenue.
   Technique: multi-join, GROUP BY financial_year, multi-metric aggregation
   ─────────────────────────────────────────────────────────────────────────── */
SELECT
    t.financial_year,
    COUNT(DISTINCT t.period_id)                                 AS months,
    ROUND(AVG(n.vwap_aud_mwh), 2)                              AS avg_vwap,
    ROUND(MAX(n.vwap_aud_mwh), 2)                              AS peak_vwap,
    ROUND(MIN(n.vwap_aud_mwh), 2)                              AS min_vwap,
    ROUND(AVG(n.emissions_intensity_kg_mwh), 0)                AS avg_intensity_kg_mwh,
    ROUND(
        SUM(CASE WHEN ft.is_renewable THEN f.energy_gwh ELSE 0 END) /
        NULLIF(SUM(CASE WHEN f.energy_gwh > 0 THEN f.energy_gwh ELSE 0 END), 0) * 100, 1
    )                                                           AS renewable_pct,
    ROUND(SUM(CASE WHEN f.energy_gwh > 0 THEN f.energy_gwh ELSE 0 END) / 1000, 0)
                                                                AS total_twh,
    ROUND(SUM(f.emissions_tco2e) / 1e6, 1)                     AS total_em_mt_co2e,
    ROUND(SUM(CASE WHEN ft.fueltech_group = 'coal'
              THEN f.market_value_aud ELSE 0 END) / 1e9, 1)    AS coal_revenue_bn,
    ROUND(SUM(CASE WHEN ft.is_renewable
              THEN f.market_value_aud ELSE 0 END) / 1e9, 1)    AS clean_revenue_bn
FROM  fact_market_timeseries f
JOIN  dim_fueltech   ft ON f.fueltech_id = ft.fueltech_id
JOIN  dim_time        t ON f.period_id   = t.period_id
JOIN  fact_network_kpis n ON n.period_id = t.period_id
GROUP BY t.financial_year
ORDER BY t.financial_year;


/* ───────────────────────────────────────────────────────────────────────────
   Q7 · LARGEST MONTH-OVER-MONTH PRICE MOVEMENTS
   Which months saw the biggest price jumps or falls? What caused them?
   Technique: LAG(), ABS(), ORDER BY derived column, LIMIT/TOP
   ─────────────────────────────────────────────────────────────────────────── */
WITH mom AS (
    SELECT
        t.date,
        n.vwap_aud_mwh                                         AS price,
        LAG(n.vwap_aud_mwh) OVER (ORDER BY t.date)            AS prev_month,
        n.vwap_aud_mwh -
            LAG(n.vwap_aud_mwh) OVER (ORDER BY t.date)        AS mom_change,
        ROUND(
            (n.vwap_aud_mwh - LAG(n.vwap_aud_mwh) OVER (ORDER BY t.date)) /
            NULLIF(LAG(n.vwap_aud_mwh) OVER (ORDER BY t.date), 0) * 100, 1
        )                                                      AS mom_pct_change
    FROM  fact_network_kpis n
    JOIN  dim_time t ON n.period_id = t.period_id
)
SELECT
    date,
    ROUND(price, 2)                                            AS price,
    ROUND(prev_month, 2)                                       AS prev_month_price,
    ROUND(mom_change, 2)                                       AS mom_change,
    mom_pct_change,
    CASE WHEN mom_change > 0 THEN '▲ UP' ELSE '▼ DOWN' END    AS direction
FROM  mom
WHERE mom_change IS NOT NULL
ORDER BY ABS(mom_change) DESC
LIMIT 15;


/* ───────────────────────────────────────────────────────────────────────────
   Q8 · ANNUAL EMISSIONS MIX - % BY FUEL SOURCE
   How has the composition of NEM emissions changed over 27 years?
   Technique: two-level CTE, proportion calculation, RANK within partition
   ─────────────────────────────────────────────────────────────────────────── */
WITH annual_em AS (
    SELECT
        t.year,
        ft.fueltech_group,
        SUM(f.emissions_tco2e)                                  AS total_tco2e
    FROM  fact_market_timeseries f
    JOIN  dim_time     t  ON f.period_id   = t.period_id
    JOIN  dim_fueltech ft ON f.fueltech_id = ft.fueltech_id
    WHERE f.emissions_tco2e > 0
    GROUP BY t.year, ft.fueltech_group
),
year_totals AS (
    SELECT year, SUM(total_tco2e) AS year_total
    FROM   annual_em
    GROUP  BY year
)
SELECT
    ae.year,
    ae.fueltech_group,
    ROUND(ae.total_tco2e / 1e6, 2)                             AS em_mt_co2e,
    ROUND(ae.total_tco2e / NULLIF(yt.year_total, 0) * 100, 1)  AS pct_of_annual_total,
    RANK() OVER (PARTITION BY ae.year ORDER BY ae.total_tco2e DESC)
                                                                AS rank_within_year
FROM  annual_em   ae
JOIN  year_totals yt ON ae.year = yt.year
ORDER BY ae.year, ae.total_tco2e DESC;


/* ═══════════════════════════════════════════════════════════════════════════
   END OF ANALYSIS QUERIES
   Data: Open Electricity (openelectricity.org.au) - CC BY-NC 4.0
   ═══════════════════════════════════════════════════════════════════════════ */
