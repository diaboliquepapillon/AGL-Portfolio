#!/usr/bin/env python3
"""
NEM Data Pipeline for Tableau
==============================
Pulls 27 years of Open Electricity data and outputs a star-schema ready
for Tableau Desktop, Tableau Prep, or Tableau Public.

Outputs  (./tableau_data/):
  fact_energy_fueltech.csv   monthly energy / emissions / market value by fueltech
  fact_market_nem.csv        monthly NEM-wide VWAP + emissions intensity
  fact_market_regional.csv   monthly price + renewables + demand by NEM region  (API)
  fact_market_hourly.csv     hourly price + renewables + demand, last 14 days   (API)
  dim_fueltech.csv           fueltech reference with colours and groupings
  dim_region.csv             NEM region reference

Usage:
  python3 pipeline.py

Optional Tableau Hyper output:
  pip install tableauhyperapi
  python3 pipeline.py --hyper
"""

import csv, json, os, sys, time, datetime, argparse
import urllib.request, urllib.error

# ── Config ────────────────────────────────────────────────────────────────────
API_KEY   = 'oe_PRMyNcCKbmA1FM6U3uDYnZ'
API_BASE  = 'https://api.openelectricity.org.au/v4'
_HERE     = os.path.dirname(os.path.abspath(__file__))
CSV_INPUT = os.path.join(_HERE, '..', '19981201 Open Electricity.csv')
OUT_DIR   = os.path.join(_HERE, 'tableau_data')

# ── Fueltech definitions ──────────────────────────────────────────────────────
# (id, group, name, is_renewable, energy_col, emissions_col, mv_col, hex_color)
FUELTECHS = [
    ('bat_charging',   'battery',   'Battery (Charging)',    0,
     'Battery (Charging) -  GWh',      None,
     'Battery (Charging) Market Value - AUD',     '#9c4fd9'),
    ('bat_discharging','battery',   'Battery (Discharging)', 0,
     'Battery (Discharging) -  GWh',   None,
     'Battery (Discharging) Market Value - AUD',  '#c77dff'),
    ('pumps',          'battery',   'Pumps',                 0,
     'Pumps -  GWh',                   None,
     'Pumps Market Value - AUD',                  '#7b2fff'),
    ('coal_brown',     'coal',      'Coal (Brown)',           0,
     'Coal (Brown) -  GWh',            'Coal (Brown) Emissions Vol - tCO₂e',
     'Coal (Brown) Market Value - AUD',            '#495063'),
    ('coal_black',     'coal',      'Coal (Black)',           0,
     'Coal (Black) -  GWh',            'Coal (Black) Emissions Vol - tCO₂e',
     'Coal (Black) Market Value - AUD',            '#6b7280'),
    ('bioenergy',      'bioenergy', 'Bioenergy (Biomass)',    1,
     'Bioenergy (Biomass) -  GWh',     'Bioenergy (Biomass) Emissions Vol - tCO₂e',
     'Bioenergy (Biomass) Market Value - AUD',     '#2f9e44'),
    ('distillate',     'gas',       'Distillate',             0,
     'Distillate -  GWh',              'Distillate Emissions Vol - tCO₂e',
     'Distillate Market Value - AUD',              '#dc2626'),
    ('gas_steam',      'gas',       'Gas (Steam)',            0,
     'Gas (Steam) -  GWh',             'Gas (Steam) Emissions Vol - tCO₂e',
     'Gas (Steam) Market Value - AUD',             '#e8590c'),
    ('gas_ccgt',       'gas',       'Gas (CCGT)',             0,
     'Gas (CCGT) -  GWh',              'Gas (CCGT) Emissions Vol - tCO₂e',
     'Gas (CCGT) Market Value - AUD',              '#f97316'),
    ('gas_ocgt',       'gas',       'Gas (OCGT)',             0,
     'Gas (OCGT) -  GWh',              'Gas (OCGT) Emissions Vol - tCO₂e',
     'Gas (OCGT) Market Value - AUD',              '#fb923c'),
    ('gas_recip',      'gas',       'Gas (Reciprocating)',    0,
     'Gas (Reciprocating) -  GWh',     'Gas (Reciprocating) Emissions Vol - tCO₂e',
     'Gas (Reciprocating) Market Value - AUD',     '#fdba74'),
    ('gas_wcm',        'gas',       'Gas (Waste Coal Mine)',  0,
     'Gas (Waste Coal Mine) -  GWh',   'Gas (Waste Coal Mine) Emissions Vol - tCO₂e',
     'Gas (Waste Coal Mine) Market Value - AUD',   '#fed7aa'),
    ('hydro',          'hydro',     'Hydro',                  1,
     'Hydro -  GWh',                   None,
     'Hydro Market Value - AUD',                   '#3b5bdb'),
    ('wind',           'wind',      'Wind',                   1,
     'Wind -  GWh',                    None,
     'Wind Market Value - AUD',                    '#20b2aa'),
    ('solar_utility',  'solar',     'Solar (Utility)',         1,
     'Solar (Utility) -  GWh',         None,
     'Solar (Utility) Market Value - AUD',         '#d08700'),
    ('solar_rooftop',  'solar',     'Solar (Rooftop)',         1,
     'Solar (Rooftop) -  GWh',         None,
     'Solar (Rooftop) Market Value - AUD',         '#fbbf24'),
]

REGIONS = {
    'NSW1': ('New South Wales',            'NSW'),
    'QLD1': ('Queensland',                 'QLD'),
    'SA1':  ('South Australia',            'SA'),
    'TAS1': ('Tasmania',                   'TAS'),
    'VIC1': ('Victoria',                   'VIC'),
    'NEM':  ('National Electricity Market','NEM'),
}

# ── Date helpers ──────────────────────────────────────────────────────────────
def fin_year(year, month):
    """Australian financial year string, e.g. 'FY2026'."""
    return f'FY{year + 1}' if month >= 7 else f'FY{year}'

def fin_quarter(year, month):
    """Australian financial quarter string, e.g. 'FY2026 Q1'."""
    fy = fin_year(year, month)
    fq = ((month - 7) % 12) // 3 + 1
    return f'{fy} Q{fq}'

def cal_quarter(month):
    return (month - 1) // 3 + 1

def date_meta(date_str):
    """Returns dict of date dimension fields for a YYYY-MM-DD string."""
    y, m, d = int(date_str[:4]), int(date_str[5:7]), int(date_str[8:10])
    dt = datetime.date(y, m, d)
    return {
        'date':              date_str,
        'year':              y,
        'month':             m,
        'month_name':        dt.strftime('%B'),
        'quarter':           cal_quarter(m),
        'quarter_label':     f'Q{cal_quarter(m)} {y}',
        'financial_year':    fin_year(y, m),
        'financial_quarter': fin_quarter(y, m),
    }

def safe_float(val):
    try:
        f = float(val)
        return None if (f != f) else f   # filter NaN
    except (ValueError, TypeError):
        return None

# ── API helpers ───────────────────────────────────────────────────────────────
def api_get(path):
    url = API_BASE + path
    req = urllib.request.Request(url, headers={
        'Authorization': f'Bearer {API_KEY}',
        'Accept':        'application/json',
        'User-Agent':    'NEM-Tableau-Pipeline/1.0',
    })
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            data = json.loads(r.read())
        if not data.get('success'):
            raise ValueError(f"API error: {data.get('error')}")
        return data
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        raise RuntimeError(f"HTTP {e.code} at {url}\n{body}") from e

# ── Step 1: Parse historical CSV ──────────────────────────────────────────────
def parse_historical_csv():
    """
    Transforms the wide-format Open Electricity CSV into two long-format tables:
      - fact_energy_fueltech  (grain: month × fueltech)
      - fact_market_nem       (grain: month, NEM-wide)
    """
    print(f'  Reading {os.path.basename(CSV_INPUT)} … ', end='', flush=True)

    fact_energy, fact_market = [], []

    with open(CSV_INPUT, newline='', encoding='utf-8-sig') as f:  # utf-8-sig strips BOM
        reader = csv.DictReader(f)
        for row in reader:
            date_str = row.get('date', '').strip()
            if not date_str or len(date_str) < 8:
                continue

            meta = date_meta(date_str)

            # NEM-wide row (price + intensity)
            fact_market.append({
                **meta,
                'vwap_aud_mwh':               safe_float(row.get('Volume Weighted Price - AUD/MWh')),
                'emissions_intensity_kg_mwh': safe_float(row.get('Emissions Intensity - kgCO₂e/MWh')),
            })

            # Per-fueltech rows
            for (ft_id, ft_group, ft_name, is_renew,
                 e_col, em_col, mv_col, color) in FUELTECHS:
                energy    = safe_float(row.get(e_col))
                emissions = safe_float(row.get(em_col)) if em_col else None
                mv        = safe_float(row.get(mv_col)) if mv_col else None

                if energy is None:
                    continue

                fact_energy.append({
                    **meta,
                    'fueltech_id':      ft_id,
                    'fueltech_name':    ft_name,
                    'fueltech_group':   ft_group,
                    'is_renewable':     is_renew,
                    'energy_gwh':       energy,
                    'emissions_tco2e':  emissions,
                    'market_value_aud': mv,
                })

    print(f'{len(fact_energy):,} fueltech rows, {len(fact_market):,} NEM-wide rows')
    return fact_energy, fact_market


# ── Step 2: Fetch regional monthly data ───────────────────────────────────────
def fetch_regional_monthly(months_back=24):  # API max = 732 days (~24 months) for 1M interval
    """
    GET /v4/market/network/NEM — monthly price, renewables, demand by NEM region.
    Covers last N months.
    """
    print('  Fetching regional monthly data (API) … ', end='', flush=True)

    end   = datetime.date.today().replace(day=1)
    start = (end.replace(day=1) - datetime.timedelta(days=months_back * 30)).replace(day=1)

    data = api_get(
        f'/market/network/NEM'
        f'?metrics=price&metrics=renewable_proportion&metrics=demand_energy'
        f'&interval=1M'
        f'&date_start={start}T00:00:00'
        f'&date_end={end}T00:00:00'
        f'&primary_grouping=network_region'
    )

    # Build {metric: {region: {timestamp: value}}}
    lookup = {}
    for item in data['data']:
        metric = item['metric']
        lookup[metric] = {}
        for result in item['results']:
            region = next(
                (code for code in REGIONS if result['name'].endswith(code)), None
            )
            if region:
                lookup[metric][region] = {
                    pts[0]: pts[1] for pts in result['data']
                }

    # Flatten to rows
    all_ts = set()
    for region_ts in lookup.get('price', {}).values():
        all_ts.update(region_ts.keys())

    rows = []
    for ts in sorted(all_ts):
        date_str = ts[:10]
        meta     = date_meta(date_str)
        for region_code, (region_name, state_code) in REGIONS.items():
            if region_code == 'NEM':
                continue
            price  = lookup.get('price',               {}).get(region_code, {}).get(ts)
            renew  = lookup.get('renewable_proportion', {}).get(region_code, {}).get(ts)
            demand = lookup.get('demand_energy',        {}).get(region_code, {}).get(ts)
            if price is None and renew is None:
                continue
            rows.append({
                **meta,
                'region_code':   region_code,
                'region_name':   region_name,
                'state_code':    state_code,
                'vwap_aud_mwh':  price,
                'renewable_pct': renew,
                'demand_gwh':    demand,
            })

    print(f'{len(rows):,} rows ({len(lookup.get("price", {})):,} regions)')
    return rows


# ── Step 3: Fetch hourly data ─────────────────────────────────────────────────
def fetch_hourly(days_back=14):
    """
    GET /v4/market/network/NEM — hourly NEM-wide price, renewables, demand.
    Covers last N days (max ~30 days at 1h interval without hitting rate limits).
    """
    print(f'  Fetching hourly data, last {days_back} days (API) … ', end='', flush=True)

    now   = datetime.datetime.utcnow().replace(minute=0, second=0, microsecond=0)
    start = now - datetime.timedelta(days=days_back)

    data = api_get(
        f'/market/network/NEM'
        f'?metrics=price&metrics=renewable_proportion&metrics=demand_energy'
        f'&interval=1h'
        f'&date_start={start.strftime("%Y-%m-%dT%H:%M:%S")}'
        f'&date_end={now.strftime("%Y-%m-%dT%H:%M:%S")}'
    )

    def extract(metric):
        block = next((d for d in data['data'] if d['metric'] == metric), None)
        if not block or not block['results']:
            return {}
        return {pts[0]: pts[1] for pts in block['results'][0]['data']}

    prices  = extract('price')
    renews  = extract('renewable_proportion')
    demands = extract('demand_energy')

    WEEKDAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']
    rows = []
    for ts in sorted(prices):
        # Parse ISO timestamp (may have timezone offset)
        dt_str = ts[:19]
        dt     = datetime.datetime.fromisoformat(dt_str)
        date_str = dt.strftime('%Y-%m-%d')
        meta     = date_meta(date_str)
        rows.append({
            **meta,
            'datetime':      dt_str,
            'hour':          dt.hour,
            'hour_label':    dt.strftime('%H:00'),
            'time_bucket':   f'{(dt.hour // 6) * 6:02d}:00–{min((dt.hour // 6 + 1) * 6, 24):02d}:00',
            'weekday':       WEEKDAYS[dt.weekday()],
            'weekday_num':   dt.weekday(),
            'is_weekend':    1 if dt.weekday() >= 5 else 0,
            'region_code':   'NEM',
            'vwap_aud_mwh':  prices.get(ts),
            'renewable_pct': renews.get(ts),
            'demand_gwh':    demands.get(ts),
        })

    print(f'{len(rows):,} records')
    return rows


# ── Step 4: Build dimensions ──────────────────────────────────────────────────
def build_dim_fueltech():
    CATEGORY = {
        'coal': 'Fossil', 'gas': 'Fossil',
        'hydro': 'Renewable', 'wind': 'Renewable',
        'solar': 'Renewable', 'bioenergy': 'Renewable',
        'battery': 'Storage',
    }
    DISPLAY_ORDER = {
        'coal': 1, 'gas': 2, 'bioenergy': 3,
        'hydro': 4, 'wind': 5, 'solar': 6, 'battery': 7,
    }
    rows = []
    seen = set()
    for ft_id, ft_group, ft_name, is_renew, _, _, _, color in FUELTECHS:
        rows.append({
            'fueltech_id':    ft_id,
            'fueltech_name':  ft_name,
            'fueltech_group': ft_group,
            'category':       CATEGORY.get(ft_group, 'Other'),
            'is_renewable':   is_renew,
            'is_fossil':      1 if ft_group in ('coal', 'gas') else 0,
            'display_order':  DISPLAY_ORDER.get(ft_group, 99),
            'color_hex':      color,
        })
    return rows


def build_dim_region():
    return [
        {'region_code': code, 'region_name': name, 'state_code': state,
         'is_nem': 1 if code == 'NEM' else 0}
        for code, (name, state) in REGIONS.items()
    ]


# ── Step 5: Write CSVs ────────────────────────────────────────────────────────
def write_csv(path, rows, fieldnames=None):
    if not rows:
        print(f'  [skip] {os.path.basename(path)} — no data')
        return
    if fieldnames is None:
        fieldnames = list(rows[0].keys())
    with open(path, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction='ignore')
        writer.writeheader()
        writer.writerows(rows)
    size_kb = os.path.getsize(path) / 1024
    print(f'  ✓  {os.path.basename(path):45s} {len(rows):>8,} rows  ({size_kb:,.0f} KB)')


# ── Step 6: Optional Tableau Hyper extract ────────────────────────────────────
def create_hyper(out_dir, tables):
    """
    Creates a Tableau .hyper extract from the in-memory data.
    Requires:  pip install tableauhyperapi
    """
    from tableauhyperapi import (
        HyperProcess, Connection, TableDefinition, TableName,
        SqlType, Telemetry, Inserter, CreateMode, NOT_NULLABLE, NULLABLE,
    )

    hyper_path = os.path.join(out_dir, 'nem_insights.hyper')

    schema_defs = {
        'fact_market_nem': [
            ('date',                       SqlType.date()),
            ('year',                       SqlType.int()),
            ('month',                      SqlType.int()),
            ('quarter',                    SqlType.int()),
            ('financial_year',             SqlType.text()),
            ('financial_quarter',          SqlType.text()),
            ('vwap_aud_mwh',              SqlType.double()),
            ('emissions_intensity_kg_mwh', SqlType.double()),
        ],
        'fact_energy_fueltech': [
            ('date',               SqlType.date()),
            ('year',               SqlType.int()),
            ('month',              SqlType.int()),
            ('quarter',            SqlType.int()),
            ('financial_year',     SqlType.text()),
            ('financial_quarter',  SqlType.text()),
            ('fueltech_id',        SqlType.text()),
            ('fueltech_group',     SqlType.text()),
            ('is_renewable',       SqlType.int()),
            ('energy_gwh',         SqlType.double()),
            ('emissions_tco2e',    SqlType.double()),
            ('market_value_aud',   SqlType.double()),
        ],
        'fact_market_hourly': [
            ('datetime',           SqlType.timestamp()),
            ('date',               SqlType.date()),
            ('year',               SqlType.int()),
            ('hour',               SqlType.int()),
            ('hour_label',         SqlType.text()),
            ('weekday',            SqlType.text()),
            ('weekday_num',        SqlType.int()),
            ('is_weekend',         SqlType.int()),
            ('vwap_aud_mwh',      SqlType.double()),
            ('renewable_pct',      SqlType.double()),
            ('demand_gwh',         SqlType.double()),
        ],
    }

    with HyperProcess(telemetry=Telemetry.DO_NOT_SEND_USAGE_DATA_TO_TABLEAU) as hp:
        with Connection(hp.endpoint, hyper_path, CreateMode.CREATE_AND_REPLACE) as conn:
            conn.catalog.create_schema_if_not_exists('Extract')
            for table_name, col_defs in schema_defs.items():
                tdef = TableDefinition(
                    TableName('Extract', table_name),
                    [TableDefinition.Column(n, t, NULLABLE) for n, t in col_defs]
                )
                conn.catalog.create_table(tdef)
                rows = tables.get(table_name, [])
                if rows:
                    cols = [c[0] for c in col_defs]
                    with Inserter(conn, tdef) as ins:
                        for row in rows:
                            ins.add_row([row.get(c) for c in cols])
                        ins.execute()
                print(f'    {table_name}: {len(rows):,} rows')

    print(f'  ✓  nem_insights.hyper  →  {hyper_path}')


# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description='NEM Data Pipeline for Tableau')
    parser.add_argument('--hyper', action='store_true',
                        help='Also create a Tableau .hyper extract (requires tableauhyperapi)')
    parser.add_argument('--months', type=int, default=24,
                        help='Months of regional history to fetch (default: 24, API max ~24)')
    parser.add_argument('--days', type=int, default=14,
                        help='Days of hourly history to fetch (default: 14)')
    args = parser.parse_args()

    os.makedirs(OUT_DIR, exist_ok=True)

    print(f'\nNEM Data Pipeline  →  Tableau\n{"="*44}')
    print(f'Output directory: {OUT_DIR}\n')

    print('Step 1  Parse historical CSV (1998–2026)')
    fact_energy, fact_market = parse_historical_csv()

    print('Step 2  Fetch API data')
    fact_regional = fetch_regional_monthly(months_back=args.months)
    time.sleep(0.5)
    fact_hourly   = fetch_hourly(days_back=args.days)

    print('Step 3  Build dimension tables')
    dim_fueltech = build_dim_fueltech()
    dim_region   = build_dim_region()
    print(f'  dim_fueltech: {len(dim_fueltech)} rows  |  dim_region: {len(dim_region)} rows')

    print('Step 4  Write CSV files')
    p = lambda name: os.path.join(OUT_DIR, name)
    write_csv(p('fact_energy_fueltech.csv'),  fact_energy)
    write_csv(p('fact_market_nem.csv'),       fact_market)
    write_csv(p('fact_market_regional.csv'),  fact_regional)
    write_csv(p('fact_market_hourly.csv'),    fact_hourly)
    write_csv(p('dim_fueltech.csv'),          dim_fueltech)
    write_csv(p('dim_region.csv'),            dim_region)

    if args.hyper:
        print('Step 5  Create Tableau .hyper extract')
        try:
            create_hyper(OUT_DIR, {
                'fact_energy_fueltech': fact_energy,
                'fact_market_nem':      fact_market,
                'fact_market_hourly':   fact_hourly,
            })
        except ImportError:
            print('  [error] tableauhyperapi not installed.')
            print('  Run:  pip install tableauhyperapi')
    else:
        print('Step 5  [skip] Add --hyper flag to also generate .hyper extract')

    print(f'\n{"="*44}')
    print('Done. Connect Tableau to:')
    print(f'  {OUT_DIR}/')
    print('\nSee README_TABLEAU.md for:')
    print('  → Data model relationships')
    print('  → Calculated fields (LOD, table calcs, params)')
    print('  → Dashboard 1/2/3 build guides\n')


if __name__ == '__main__':
    main()
