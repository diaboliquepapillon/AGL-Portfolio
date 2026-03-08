/* ═══════════════════════════════════════════════════════════════════════════
   AGL Portfolio: NEM Insights
   Data: Open Electricity CSV (Dec 1998 – Feb 2026)
   Author: Aylin Vahabova
   ═══════════════════════════════════════════════════════════════════════════ */

'use strict';

/* ── Column name map (exact CSV headers) ─────────────────────────────────── */
const C = {
  date:          'date',
  bat_charge:    'Battery (Charging) -  GWh',
  pumps:         'Pumps -  GWh',
  coal_brown:    'Coal (Brown) -  GWh',
  coal_black:    'Coal (Black) -  GWh',
  bioenergy:     'Bioenergy (Biomass) -  GWh',
  distillate:    'Distillate -  GWh',
  gas_steam:     'Gas (Steam) -  GWh',
  gas_ccgt:      'Gas (CCGT) -  GWh',
  gas_ocgt:      'Gas (OCGT) -  GWh',
  gas_recip:     'Gas (Reciprocating) -  GWh',
  gas_wcm:       'Gas (Waste Coal Mine) -  GWh',
  bat_discharge: 'Battery (Discharging) -  GWh',
  hydro:         'Hydro -  GWh',
  wind:          'Wind -  GWh',
  solar_util:    'Solar (Utility) -  GWh',
  solar_roof:    'Solar (Rooftop) -  GWh',

  em_coal_brown: 'Coal (Brown) Emissions Vol - tCO₂e',
  em_coal_black: 'Coal (Black) Emissions Vol - tCO₂e',
  em_bioenergy:  'Bioenergy (Biomass) Emissions Vol - tCO₂e',
  em_distillate: 'Distillate Emissions Vol - tCO₂e',
  em_gas_steam:  'Gas (Steam) Emissions Vol - tCO₂e',
  em_gas_ccgt:   'Gas (CCGT) Emissions Vol - tCO₂e',
  em_gas_ocgt:   'Gas (OCGT) Emissions Vol - tCO₂e',
  em_gas_recip:  'Gas (Reciprocating) Emissions Vol - tCO₂e',
  em_gas_wcm:    'Gas (Waste Coal Mine) Emissions Vol - tCO₂e',

  intensity:     'Emissions Intensity - kgCO₂e/MWh',
  price:         'Volume Weighted Price - AUD/MWh',

  mv_coal_brown:    'Coal (Brown) Market Value - AUD',
  mv_coal_black:    'Coal (Black) Market Value - AUD',
  mv_bioenergy:     'Bioenergy (Biomass) Market Value - AUD',
  mv_distillate:    'Distillate Market Value - AUD',
  mv_gas_steam:     'Gas (Steam) Market Value - AUD',
  mv_gas_ccgt:      'Gas (CCGT) Market Value - AUD',
  mv_gas_ocgt:      'Gas (OCGT) Market Value - AUD',
  mv_gas_recip:     'Gas (Reciprocating) Market Value - AUD',
  mv_gas_wcm:       'Gas (Waste Coal Mine) Market Value - AUD',
  mv_bat_discharge: 'Battery (Discharging) Market Value - AUD',
  mv_hydro:         'Hydro Market Value - AUD',
  mv_wind:          'Wind Market Value - AUD',
  mv_solar_util:    'Solar (Utility) Market Value - AUD',
  mv_solar_roof:    'Solar (Rooftop) Market Value - AUD',
};

/* ── Chart.js global defaults ────────────────────────────────────────────── */
Chart.defaults.color          = '#9ca3af';
Chart.defaults.borderColor    = '#e4e7f0';
Chart.defaults.font.family    = "'Inter', -apple-system, sans-serif";
Chart.defaults.font.size      = 11;
Chart.defaults.plugins.tooltip.backgroundColor = '#1a1d27';
Chart.defaults.plugins.tooltip.borderColor     = '#2d3348';
Chart.defaults.plugins.tooltip.borderWidth     = 1;
Chart.defaults.plugins.tooltip.padding         = 10;
Chart.defaults.plugins.tooltip.cornerRadius    = 8;
Chart.defaults.plugins.tooltip.titleColor      = '#f9fafb';
Chart.defaults.plugins.tooltip.bodyColor       = '#d1d5db';
Chart.defaults.plugins.legend.labels.boxWidth  = 10;
Chart.defaults.plugins.legend.labels.padding   = 12;
Chart.defaults.plugins.legend.labels.usePointStyle = true;

/* ── Global state ────────────────────────────────────────────────────────── */
let FULL_DATA = [];
const CHARTS  = {};

/* ── Helpers ─────────────────────────────────────────────────────────────── */
const n = (row, key) => parseFloat(row[key]) || 0;
const pos = v => Math.max(0, v);
const fmt = (v, d = 0) => v.toLocaleString('en-AU', { maximumFractionDigits: d, minimumFractionDigits: d });
const fmtB = v => `$${(v / 1e9).toFixed(1)}B`;
const fmtM = v => `$${(v / 1e6).toFixed(0)}M`;
const monthLabel = d => d.substring(0, 7); // YYYY-MM

function rollingAvg(arr, window) {
  return arr.map((_, i) => {
    if (i < window - 1) return null;
    const slice = arr.slice(i - window + 1, i + 1).filter(v => v != null && !isNaN(v));
    return slice.length ? slice.reduce((a, b) => a + b, 0) / slice.length : null;
  });
}

function percentile(sorted, p) {
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

/* ── Process raw CSV rows ────────────────────────────────────────────────── */
function processRows(raw) {
  return raw.map(r => {
    const coal    = pos(n(r, C.coal_brown)) + pos(n(r, C.coal_black));
    const gas     = pos(n(r, C.gas_steam))  + pos(n(r, C.gas_ccgt))  +
                    pos(n(r, C.gas_ocgt))   + pos(n(r, C.gas_recip)) + pos(n(r, C.gas_wcm));
    const hydro   = pos(n(r, C.hydro));
    const bio     = pos(n(r, C.bioenergy));
    const wind    = pos(n(r, C.wind));
    const solarU  = pos(n(r, C.solar_util));
    const solarR  = pos(n(r, C.solar_roof));
    const solar   = solarU + solarR;
    const dist    = pos(n(r, C.distillate));
    const batD    = pos(n(r, C.bat_discharge));
    const renewables = wind + solar + hydro + bio;
    const total      = coal + gas + renewables + dist + batD;
    const renewPct   = total > 0 ? (renewables / total) * 100 : 0;
    const coalPct    = total > 0 ? (coal / total) * 100 : 0;

    const emCoalBrown = pos(n(r, C.em_coal_brown));
    const emCoalBlack = pos(n(r, C.em_coal_black));
    const emCoal      = emCoalBrown + emCoalBlack;
    const emGas       = pos(n(r, C.em_gas_steam)) + pos(n(r, C.em_gas_ccgt)) +
                        pos(n(r, C.em_gas_ocgt))  + pos(n(r, C.em_gas_recip)) + pos(n(r, C.em_gas_wcm));
    const emOther     = pos(n(r, C.em_distillate)) + pos(n(r, C.em_bioenergy));
    const emTotal     = emCoal + emGas + emOther;

    const mvCoal    = pos(n(r, C.mv_coal_brown)) + pos(n(r, C.mv_coal_black));
    const mvGas     = pos(n(r, C.mv_gas_steam))  + pos(n(r, C.mv_gas_ccgt))  +
                      pos(n(r, C.mv_gas_ocgt))   + pos(n(r, C.mv_gas_recip)) + pos(n(r, C.mv_gas_wcm));
    const mvWind    = pos(n(r, C.mv_wind));
    const mvSolar   = pos(n(r, C.mv_solar_util)) + pos(n(r, C.mv_solar_roof));
    const mvHydro   = pos(n(r, C.mv_hydro));
    const mvBio     = pos(n(r, C.mv_bioenergy));
    const mvBat     = pos(n(r, C.mv_bat_discharge));
    const mvClean   = mvWind + mvSolar + mvHydro + mvBio + mvBat;
    const mvFossil  = mvCoal + mvGas;

    return {
      dateStr:    r[C.date],
      date:       new Date(r[C.date]),
      year:       new Date(r[C.date]).getFullYear(),

      coal, gas, wind, solar, solarU, solarR, hydro, bio, dist, batD,
      renewables, total, renewPct, coalPct,

      emCoalBrown, emCoalBlack, emCoal, emGas, emOther, emTotal,
      intensity: n(r, C.intensity),
      price:     n(r, C.price),

      mvCoal, mvGas, mvWind, mvSolar, mvHydro, mvBio, mvBat, mvClean, mvFossil,
    };
  });
}

/* ══════════════════════════════════════════════════════════════════════════
   HERO KPI STATS
   ══════════════════════════════════════════════════════════════════════════ */
function animateCounter(el, target, suffix = '', prefix = '', decimals = 0) {
  const duration = 1800;
  const start    = performance.now();
  function step(now) {
    const t = Math.min((now - start) / duration, 1);
    const ease = 1 - Math.pow(1 - t, 4);
    el.textContent = prefix + fmt(ease * target, decimals) + suffix;
    if (t < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

function updateHeroKPIs(data) {
  const last  = data[data.length - 1];
  const first = data[0];
  const totalTWh = data.reduce((s, d) => s + d.total, 0) / 1000;

  // Years = months of data / 12 (data runs Dec 1998 – Feb 2026 ≈ 27 years)
  const totalYears = Math.round(data.length / 12);
  animateCounter(document.getElementById('kpi-years'), totalYears, ' yrs');
  animateCounter(document.getElementById('kpi-twh'),    totalTWh, ' TWh', '', 0);
  // Latest month renewable %: clearly labelled in the KPI tile
  animateCounter(document.getElementById('kpi-renew'),  last.renewPct, '%', '', 1);
  animateCounter(document.getElementById('kpi-intensity'), last.intensity, ' kg', '', 0);
}

/* ══════════════════════════════════════════════════════════════════════════
   NARRATIVE BUILDER: writes analyst-grade story text into each section
   ══════════════════════════════════════════════════════════════════════════ */
function bullets(items) {
  return items.map(t => `<li>${t}</li>`).join('');
}

function buildNarratives(data) {
  const first12 = data.slice(0, 12);
  const last12  = data.slice(-12);
  const last    = data[data.length - 1];
  const first   = data[0];

  /* ── helpers ─────────────────────────────────────── */
  const avg12 = key => last12.reduce((s, d) => s + d[key], 0) / 12;
  const sum12 = key => last12.reduce((s, d) => s + d[key], 0);

  /* ══ SECTION 01: ENERGY TRANSITION ══════════════════════════════════════ */
  const renewFirst = first12.reduce((s, d) => s + d.renewPct, 0) / 12;
  const renewLast  = avg12('renewPct');
  const coalFirst  = first12.reduce((s, d) => s + d.coalPct, 0) / 12;
  const coalLast   = avg12('coalPct');
  const batLast12  = sum12('batD');
  const solarLast12 = sum12('solar');

  // Find when renewables first crossed 20% and 30%
  const cross20 = data.find(d => d.renewPct >= 20);
  const cross30 = data.find(d => d.renewPct >= 30);

  // Wind growth: avg first 24 months with wind vs last 12
  const windEarly = data.filter(d => d.wind > 0).slice(0, 12);
  const windEarlyAvg = windEarly.length ? windEarly.reduce((s, d) => s + d.wind, 0) / windEarly.length : 0;
  const windLateAvg  = last12.reduce((s, d) => s + d.wind, 0) / 12;

  document.getElementById('kf-01').innerHTML =
    `Renewables now supply <strong>${renewLast.toFixed(0)}%</strong> of NEM generation: up from <strong>${renewFirst.toFixed(0)}%</strong> when the market opened in 1998. The transition accelerated sharply after 2015 as utility-scale solar reached cost parity and rooftop installations surged.`;

  document.getElementById('sb-01').innerHTML = bullets([
    `Coal's share of generation fell from <strong>${coalFirst.toFixed(0)}%</strong> in the late 1990s to <strong>${coalLast.toFixed(0)}%</strong> today. It still runs most of the NEM's baseload: but its role is shrinking every year as plant retirements accelerate.`,
    cross20 ? `Renewables crossed <strong>20% of generation</strong> for the first time in <strong>${cross20.dateStr.substring(0,7)}</strong>${cross30 ? `, and 30% in <strong>${cross30.dateStr.substring(0,7)}</strong>` : ''}: milestones that mark the structural shift rather than incremental change.` : '',
    windEarlyAvg > 0 ? `Wind output grew from roughly <strong>${fmt(windEarlyAvg, 0)} GWh/month</strong> when it first appeared on the grid to <strong>${fmt(windLateAvg, 0)} GWh/month</strong> today: a <strong>${(windLateAvg / windEarlyAvg).toFixed(0)}× increase</strong>.` : '',
    `Solar (utility + rooftop combined) generated <strong>${fmt(solarLast12 / 12, 0)} GWh/month</strong> on average over the past year. A decade ago, this technology was statistically insignificant in the NEM mix.`,
    batLast12 > 0 ? `Battery storage discharged <strong>${fmt(batLast12, 0)} GWh</strong> into the NEM over the past 12 months: a technology that barely registered in the data before 2018.` : '',
  ].filter(Boolean));

  document.getElementById('st-01').innerHTML =
    `<strong>So what?</strong> The direction of travel is clear. What isn't settled is the pace: coal still provides ${coalLast.toFixed(0)}% of generation, and any accelerated retirement scenario requires equivalent dispatchable replacement capacity. Understanding how the fuel mix shifts hour-by-hour: and what that means for price and reliability: is the central analytical challenge in today's NEM.`;

  /* ══ SECTION 02: PRICE STORY ════════════════════════════════════════════ */
  const prices   = data.map(d => d.price).filter(p => p > 0);
  const sorted   = [...prices].sort((a, b) => a - b);
  const p95      = percentile(sorted, 95);
  const maxPrice = Math.max(...prices);
  const maxMonth = data.find(d => d.price === maxPrice);
  const avg5yrFirst = data.slice(0, 60).reduce((s, d) => s + d.price, 0) / 60;
  const avg5yrLast  = data.slice(-60).reduce((s, d) => s + d.price, 0) / 60;
  const spikesFirst60 = data.slice(0, 60).filter(d => d.price > p95).length;
  const spikesLast60  = data.slice(-60).filter(d => d.price > p95).length;

  // Find 2022 crisis (Jun–Sep 2022 is known worst period)
  const crisis2022 = data.filter(d => d.year === 2022);
  const avgCrisis  = crisis2022.length ? crisis2022.reduce((s, d) => s + d.price, 0) / crisis2022.length : null;

  document.getElementById('kf-02').innerHTML =
    `The NEM's average electricity price rose from <strong>$${fmt(avg5yrFirst, 0)}/MWh</strong> in the early 2000s to <strong>$${fmt(avg5yrLast, 0)}/MWh</strong> over the past five years. But the average obscures the real shift: the frequency and severity of price spikes has increased significantly as the fuel mix becomes more variable.`;

  document.getElementById('sb-02').innerHTML = bullets([
    `The highest monthly price on record is <strong>$${fmt(maxPrice, 0)}/MWh</strong> in <strong>${maxMonth?.dateStr?.substring(0,7)}</strong>: <strong>${(maxPrice / avg5yrFirst).toFixed(1)}×</strong> the average price of the early NEM. These extremes reflect just how fast supply can tighten when demand peaks and generation is constrained.`,
    avgCrisis ? `The 2022 energy crisis averaged <strong>$${fmt(avgCrisis, 0)}/MWh</strong> across the year: the most sustained period of high prices in NEM history, driven by coal plant outages, gas supply constraints, and La Niña disrupting hydro conditions simultaneously.` : '',
    `Over the past five years, <strong>${spikesLast60}</strong> months exceeded the 95th percentile price threshold ($${p95.toFixed(0)}/MWh): compared to just <strong>${spikesFirst60}</strong> in the NEM's first five years. The market is not just more expensive; it's more volatile.`,
    `Rolling 12-month average prices peaked in 2022 and have been declining since, as new renewable capacity compressed wholesale prices during daylight hours: a direct quantification of the "merit order effect."`,
  ].filter(Boolean));

  document.getElementById('st-02').innerHTML =
    `<strong>So what?</strong> Higher average prices and greater volatility create both commercial risk and analytical opportunity. Being able to explain *why* a month's prices spiked: which fuel wasn't available, which demand event occurred, what the renewable mix looked like: is the core competency of an energy market analyst. Every chart in this section is the output of that kind of question.`;

  /* ══ SECTION 03: EMISSIONS ══════════════════════════════════════════════ */
  const intFirst = first12.reduce((s, d) => s + d.intensity, 0) / 12;
  const intLast  = avg12('intensity');
  const intDrop  = ((intFirst - intLast) / intFirst * 100);

  const coalEmLast12  = sum12('emCoal');
  const totalEmLast12 = sum12('emTotal');
  const coalEmShare   = (coalEmLast12 / totalEmLast12) * 100;
  const coalGenShare  = coalLast;
  const emMultiple    = coalEmShare / coalGenShare;

  // Total annual emissions latest 12m vs peak
  const annualEmByYear = {};
  data.forEach(d => {
    if (!annualEmByYear[d.year]) annualEmByYear[d.year] = 0;
    annualEmByYear[d.year] += d.emTotal;
  });
  const peakEmYear   = Object.entries(annualEmByYear).sort((a, b) => b[1] - a[1])[0];
  const latestEmYear = Object.entries(annualEmByYear).sort((a, b) => b[0] - a[0])[0];
  const emReduction  = ((peakEmYear[1] - latestEmYear[1]) / peakEmYear[1] * 100);

  // Lowest intensity month ever
  const cleanest = data.reduce((b, d) => d.intensity < b.intensity ? d : b);

  document.getElementById('kf-03').innerHTML =
    `The NEM's carbon intensity has fallen <strong>${intDrop.toFixed(0)}%</strong> since 1998: from <strong>${fmt(intFirst, 0)} kg</strong> to <strong>${fmt(intLast, 0)} kgCO₂e/MWh</strong>. Real progress. But coal's disproportionate emissions footprint means the final phase of decarbonisation: actual coal retirement: will drive the majority of remaining abatement.`;

  document.getElementById('sb-03').innerHTML = bullets([
    `Coal generates <strong>${coalLast.toFixed(0)}%</strong> of NEM electricity but causes <strong>${coalEmShare.toFixed(0)}%</strong> of NEM emissions: its carbon intensity is <strong>${emMultiple.toFixed(1)}×</strong> its generation share. Displacing the last coal plant has far more emissions impact than adding an equivalent volume of gas.`,
    peakEmYear ? `Annual NEM emissions peaked in <strong>${peakEmYear[0]}</strong> at approximately <strong>${(peakEmYear[1] / 1e6).toFixed(0)} Mt CO₂e</strong> and have since fallen by <strong>${emReduction.toFixed(0)}%</strong>: almost entirely due to reduced coal generation and rising renewables.` : '',
    `The lowest monthly intensity on record was <strong>${fmt(cleanest.intensity, 0)} kgCO₂e/MWh</strong> in <strong>${cleanest.dateStr?.substring(0,7)}</strong>: reflecting peak renewable output conditions, likely during spring when solar and wind coincide with mild demand.`,
    `At the current average pace of intensity reduction, reaching <strong>200 kgCO₂e/MWh</strong>: roughly the level consistent with a 50% renewables share: would require approximately <strong>${Math.round((intLast - 200) / ((intFirst - intLast) / 27))} more years</strong> without policy acceleration.`,
  ].filter(Boolean));

  document.getElementById('st-03').innerHTML =
    `<strong>So what?</strong> Emissions intensity is the metric that links energy data to climate commitments. An analyst who can connect fuel mix changes to scope 2 emissions outcomes, explain why intensity doesn't fall linearly with renewables growth, and model future trajectories under different coal retirement scenarios is exactly what the industry needs right now.`;

  /* ══ SECTION 04: MARKET VALUE ═══════════════════════════════════════════ */
  const mv12Coal  = sum12('mvCoal');
  const mv12Gas   = sum12('mvGas');
  const mv12Wind  = sum12('mvWind');
  const mv12Solar = sum12('mvSolar');
  const mv12Hydro = sum12('mvHydro');
  const mv12Bat   = sum12('mvBat');
  const mv12Clean = mv12Wind + mv12Solar + mv12Hydro + sum12('mvBio') + mv12Bat;
  const mv12Total = mv12Coal + mv12Gas + mv12Clean;
  const cleanShare = (mv12Clean / mv12Total * 100);

  // Battery per MWh implied revenue
  const batMWh12  = sum12('batD');
  const batImplied = batMWh12 > 0 ? mv12Bat / (batMWh12 * 1000) : null;  // AUD/MWh

  document.getElementById('kf-04').innerHTML =
    `Clean generation captured <strong>${cleanShare.toFixed(0)}%</strong> of NEM market revenue in the past 12 months: worth <strong>${fmtB(mv12Clean)}</strong> out of a total NEM market of <strong>${fmtB(mv12Total)}</strong>. Wind and solar combined now out-earn gas, a commercial shift that would have seemed implausible a decade ago.`;

  document.getElementById('sb-04').innerHTML = bullets([
    `Coal earned <strong>${fmtB(mv12Coal)}</strong> in the past 12 months: still significant, but declining as plant retirements reduce output and merchant risk increases. When a coal plant retires, its revenue doesn't disappear; it transfers to whatever dispatchable capacity replaces it.`,
    `Wind earned <strong>${fmtB(mv12Wind)}</strong> and solar <strong>${fmtB(mv12Solar)}</strong>: combined, <strong>${fmtB(mv12Wind + mv12Solar)}</strong>, compared to gas at <strong>${fmtB(mv12Gas)}</strong>. This is the commercial signal driving investment decisions in the current NEM.`,
    batImplied ? `Battery storage earned <strong>${fmtM(mv12Bat)}</strong> over the past 12 months, at an implied value of <strong>$${fmt(batImplied, 0)}/MWh</strong> discharged: roughly <strong>${(batImplied / avg12('price')).toFixed(1)}×</strong> the average grid price. Batteries earn a premium by discharging precisely when prices spike.` : '',
    `Market value concentration is a key NEM feature: a small number of high-price intervals drive a disproportionate share of total revenue. Identifying and predicting these windows is the basis of battery dispatch strategy, gas peaker operation, and forward contract pricing.`,
  ].filter(Boolean));

  document.getElementById('st-04').innerHTML =
    `<strong>So what?</strong> Market value data tells you more than generation data alone. A fuel technology's share of revenue: and whether that share is above or below its share of generation: reveals its pricing power and market position. An analyst who can build this view from raw generation and price data, and explain the commercial logic behind it, is working at the level that matters to trading, strategy, and investment teams.`;
}

/* ══════════════════════════════════════════════════════════════════════════
   CHART 1: ENERGY MIX (Stacked Area)
   ══════════════════════════════════════════════════════════════════════════ */
function chartEnergyMix(data) {
  const labels = data.map(d => monthLabel(d.dateStr));

  CHARTS.mix     = new Chart(document.getElementById('chart-mix'), {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'Coal',      data: data.map(d => d.coal.toFixed(0)),
          backgroundColor: 'rgba(73,80,99,0.82)',    borderColor: '#495063', borderWidth: 0, fill: true, tension: 0.3, pointRadius: 0 },
        { label: 'Gas',       data: data.map(d => d.gas.toFixed(0)),
          backgroundColor: 'rgba(232,89,12,0.72)',   borderColor: '#e8590c', borderWidth: 0, fill: true, tension: 0.3, pointRadius: 0 },
        { label: 'Hydro',     data: data.map(d => d.hydro.toFixed(0)),
          backgroundColor: 'rgba(59,91,219,0.68)',   borderColor: '#3b5bdb', borderWidth: 0, fill: true, tension: 0.3, pointRadius: 0 },
        { label: 'Wind',      data: data.map(d => d.wind.toFixed(0)),
          backgroundColor: 'rgba(32,178,170,0.68)',  borderColor: '#20b2aa', borderWidth: 0, fill: true, tension: 0.3, pointRadius: 0 },
        { label: 'Solar',     data: data.map(d => d.solar.toFixed(0)),
          backgroundColor: 'rgba(208,135,0,0.78)',   borderColor: '#d08700', borderWidth: 0, fill: true, tension: 0.3, pointRadius: 0 },
        { label: 'Bioenergy', data: data.map(d => d.bio.toFixed(0)),
          backgroundColor: 'rgba(47,158,68,0.68)',   borderColor: '#2f9e44', borderWidth: 0, fill: true, tension: 0.3, pointRadius: 0 },
        { label: 'Battery',   data: data.map(d => d.batD.toFixed(0)),
          backgroundColor: 'rgba(156,79,217,0.68)',  borderColor: '#9c4fd9', borderWidth: 0, fill: true, tension: 0.3, pointRadius: 0 },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'bottom' },
        tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.dataset.label}: ${Number(ctx.raw).toLocaleString()} GWh`,
          },
        },
      },
      scales: {
        x: { stacked: true, ticks: { maxTicksLimit: 14, maxRotation: 0 } },
        y: { stacked: true, ticks: { callback: v => `${(v/1000).toFixed(0)}k` },
             title: { display: true, text: 'GWh / month', color: '#6b7280' } },
      },
    },
  });
}

/* ── CHART 2: RENEWABLE % LINE ─────────────────────────────────────────── */
function chartRenewPct(data) {
  const labels   = data.map(d => monthLabel(d.dateStr));
  const renewPct = data.map(d => d.renewPct.toFixed(1));
  const rolling  = rollingAvg(data.map(d => d.renewPct), 12);

  CHARTS.renewPct = new Chart(document.getElementById('chart-renew-pct'), {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'Monthly renewable %',
          data: renewPct, borderColor: 'rgba(47,158,68,0.35)', backgroundColor: 'transparent',
          borderWidth: 1, pointRadius: 0, tension: 0.2 },
        { label: '12-month rolling avg',
          data: rolling,  borderColor: '#2f9e44', backgroundColor: 'rgba(47,158,68,0.08)',
          borderWidth: 2, pointRadius: 0, tension: 0.4, fill: true },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { position: 'bottom' } },
      scales: {
        x: { ticks: { maxTicksLimit: 14, maxRotation: 0 } },
        y: { min: 0, ticks: { callback: v => v + '%' },
             title: { display: true, text: '% of generation', color: '#6b7280' } },
      },
    },
  });
}

/* ── CHART 3: PRICE TIMELINE ───────────────────────────────────────────── */
function chartPrice(data) {
  const labels   = data.map(d => monthLabel(d.dateStr));
  const prices   = data.map(d => d.price);
  const p95      = percentile([...prices].sort((a, b) => a - b), 95);
  const pointBg  = prices.map(p => p > p95 ? '#f87171' : 'rgba(56,189,248,0.0)');

  CHARTS.price   = new Chart(document.getElementById('chart-price'), {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'VWAP (AUD/MWh)',
          data: prices, borderColor: '#1d4ed8', backgroundColor: 'rgba(29,78,216,0.06)',
          borderWidth: 1.5, pointRadius: 0, pointHoverRadius: 4, tension: 0.25, fill: true },
        { label: `Spike (> p95 = $${p95.toFixed(0)})`,
          data: prices.map(p => p > p95 ? p : NaN),
          borderColor: '#dc2626', backgroundColor: 'rgba(220,38,38,0.15)',
          borderWidth: 2, pointRadius: 3, pointBackgroundColor: '#dc2626', tension: 0.2, fill: true },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { position: 'bottom' } },
      scales: {
        x: { ticks: { maxTicksLimit: 18, maxRotation: 0 } },
        y: { ticks: { callback: v => `$${v}` },
             title: { display: true, text: 'AUD / MWh', color: '#6b7280' } },
      },
    },
  });
}

/* ── CHART 4: PRICE DISTRIBUTION (Histogram) ───────────────────────────── */
function chartPriceHist(data) {
  const prices  = data.map(d => d.price).filter(p => p >= 0 && p < 500);
  const bins    = [0,20,40,60,80,100,125,150,200,250,300,400,500];
  const counts  = Array(bins.length - 1).fill(0);
  prices.forEach(p => {
    const i = bins.findIndex((b, j) => j < bins.length - 1 && p >= b && p < bins[j + 1]);
    if (i >= 0) counts[i]++;
  });
  const labels = bins.slice(0, -1).map((b, i) => `$${b}–${bins[i+1]}`);

  CHARTS.priceHist = new Chart(document.getElementById('chart-price-hist'), {
    type: 'bar',
    data: {
      labels,
      datasets: [{ label: 'Months',
        data: counts,
        backgroundColor: counts.map((_, i) =>
          i > 8 ? 'rgba(220,38,38,0.65)' : 'rgba(29,78,216,0.55)'),
        borderColor: counts.map((_, i) =>
          i > 8 ? '#dc2626' : '#1d4ed8'),
        borderWidth: 1 }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { maxRotation: 45, font: { size: 10 } } },
        y: { title: { display: true, text: 'Number of months', color: '#6b7280' } },
      },
    },
  });
}

/* ── CHART 5: ROLLING 12M PRICE ────────────────────────────────────────── */
function chartPriceRolling(data) {
  const labels   = data.map(d => monthLabel(d.dateStr));
  const rolling  = rollingAvg(data.map(d => d.price), 12);

  CHARTS.priceRolling = new Chart(document.getElementById('chart-price-rolling'), {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Rolling 12-month avg (AUD/MWh)',
        data: rolling, borderColor: '#ea580c', backgroundColor: 'rgba(234,88,12,0.07)',
        borderWidth: 2, pointRadius: 0, tension: 0.4, fill: true,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom' } },
      scales: {
        x: { ticks: { maxTicksLimit: 14, maxRotation: 0 } },
        y: { ticks: { callback: v => `$${v}` },
             title: { display: true, text: 'AUD / MWh', color: '#6b7280' } },
      },
    },
  });
}

/* ── CHART 6: EMISSIONS INTENSITY LINE ─────────────────────────────────── */
function chartIntensity(data) {
  const labels    = data.map(d => monthLabel(d.dateStr));
  const intensity = data.map(d => d.intensity);
  const rolling   = rollingAvg(intensity, 12);

  CHARTS.intensity = new Chart(document.getElementById('chart-intensity'), {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'Monthly intensity',
          data: intensity, borderColor: 'rgba(220,38,38,0.3)', backgroundColor: 'transparent',
          borderWidth: 1, pointRadius: 0, tension: 0.2 },
        { label: '12-month rolling avg',
          data: rolling,   borderColor: '#dc2626', backgroundColor: 'rgba(220,38,38,0.06)',
          borderWidth: 2,  pointRadius: 0, tension: 0.4, fill: true },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { position: 'bottom' } },
      scales: {
        x: { ticks: { maxTicksLimit: 14, maxRotation: 0 } },
        y: { ticks: { callback: v => `${v} kg` },
             title: { display: true, text: 'kgCO₂e / MWh', color: '#6b7280' } },
      },
    },
  });
}

/* ── CHART 7: EMISSIONS DONUT (last 12m) ───────────────────────────────── */
function chartEmissionsDonut(data) {
  chartEmissionsDonut_slice(data.slice(-12));
}

/* ── CHART 8: EMISSIONS STACKED (Coal vs Gas) ──────────────────────────── */
function chartEmissionsStacked(data) {
  const labels = data.map(d => monthLabel(d.dateStr));

  CHARTS.emStacked = new Chart(document.getElementById('chart-em-stacked'), {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'Coal (Brown)',
          data: data.map(d => (d.emCoalBrown / 1e6).toFixed(3)),
          backgroundColor: 'rgba(71, 85, 105, 0.85)', borderColor: '#475569',
          borderWidth: 0, fill: true, tension: 0.3, pointRadius: 0 },
        { label: 'Coal (Black)',
          data: data.map(d => (d.emCoalBlack / 1e6).toFixed(3)),
          backgroundColor: 'rgba(100, 116, 139, 0.8)', borderColor: '#64748b',
          borderWidth: 0, fill: true, tension: 0.3, pointRadius: 0 },
        { label: 'Gas',
          data: data.map(d => (d.emGas / 1e6).toFixed(3)),
          backgroundColor: 'rgba(234, 88, 12, 0.65)', borderColor: '#ea580c',
          borderWidth: 0, fill: true, tension: 0.3, pointRadius: 0 },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { position: 'bottom' } },
      scales: {
        x: { stacked: true, ticks: { maxTicksLimit: 18, maxRotation: 0 } },
        y: { stacked: true, ticks: { callback: v => `${v} Mt` },
             title: { display: true, text: 'Mt CO₂e / month', color: '#6b7280' } },
      },
    },
  });
}


/* ── CHART 9: MARKET VALUE BAR (last 12m) ──────────────────────────────── */
function chartMvBar(data) {
  chartMvBar_slice(data.slice(-12));
}

/* ── CHART 10: MARKET VALUE TREND: CLEAN vs FOSSIL ─────────────────────── */
function chartMvTrend(data) {
  const rolling12_clean  = rollingAvg(data.map(d => d.mvClean  / 1e6), 12);
  const rolling12_fossil = rollingAvg(data.map(d => d.mvFossil / 1e6), 12);
  const labels = data.map(d => monthLabel(d.dateStr));

  CHARTS.mvTrend = new Chart(document.getElementById('chart-mv-trend'), {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'Clean (12m rolling avg)',
          data: rolling12_clean,  borderColor: '#2f9e44', backgroundColor: 'rgba(47,158,68,0.08)',
          borderWidth: 2, pointRadius: 0, tension: 0.4, fill: true },
        { label: 'Fossil (12m rolling avg)',
          data: rolling12_fossil, borderColor: '#dc2626', backgroundColor: 'rgba(220,38,38,0.06)',
          borderWidth: 2, pointRadius: 0, tension: 0.4, fill: true },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { position: 'bottom' } },
      scales: {
        x: { ticks: { maxTicksLimit: 14, maxRotation: 0 } },
        y: { ticks: { callback: v => `$${v}M` },
             title: { display: true, text: 'A$ Million / month (rolling)', color: '#6b7280' } },
      },
    },
  });
}

/* ══════════════════════════════════════════════════════════════════════════
   SQL TAB SYSTEM
   ══════════════════════════════════════════════════════════════════════════ */
const SQL_QUERIES = [
  {
    tab: 'Rolling Avg Price',
    desc: `<strong>12-Month Rolling Average Price.</strong> Uses a window function (<code>ROWS BETWEEN 11 PRECEDING AND CURRENT ROW</code>) to smooth month-to-month volatility and expose structural price trends: exactly the output shown in the "Rolling 12-Month Average" chart above.`,
    sql: `-- Rolling 12-month volume-weighted average price
-- Demonstrates: window functions, ORDER BY within OVER()

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
ORDER BY t.date;`,
  },
  {
    tab: 'Price Spikes',
    desc: `<strong>Top 10 Price Spike Months with Generation Context.</strong> Identifies months where VWAP exceeded the 95th percentile, then joins the generation mix to explain <em>why</em> the spike occurred: low renewables? High demand? A great interview talking point.`,
    sql: `-- Price spikes: top 10 months + renewable / fossil context at the time
-- Demonstrates: CTEs, RANK() window function, PERCENTILE_CONT

WITH price_ranked AS (
    SELECT
        t.date,
        n.vwap_aud_mwh,
        RANK() OVER (ORDER BY n.vwap_aud_mwh DESC)             AS price_rank
    FROM fact_network_kpis n
    JOIN dim_time t ON n.period_id = t.period_id
),
monthly_gen AS (
    SELECT
        f.period_id,
        SUM(CASE WHEN ft.is_renewable THEN f.energy_gwh ELSE 0 END)            AS renewable_gwh,
        SUM(CASE WHEN f.energy_gwh > 0 THEN f.energy_gwh ELSE 0 END)           AS total_gwh,
        SUM(CASE WHEN ft.fueltech_group = 'coal' THEN f.energy_gwh ELSE 0 END) AS coal_gwh
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
    ROUND(mg.total_gwh, 0)                                      AS total_gwh
FROM  price_ranked  pr
JOIN  monthly_gen   mg ON pr.period_id = mg.period_id  -- assume period_id propagated
WHERE pr.price_rank <= 10
ORDER BY pr.price_rank;`,
  },
  {
    tab: 'Renewables Share',
    desc: `<strong>Annual Renewable Share: Tracking the Energy Transition.</strong> Aggregates generation by year and computes the % from renewables. Shows the step-change in the mid-2010s as large-scale wind and rooftop solar hit critical mass.`,
    sql: `-- Annual renewable share: tracking the NEM energy transition
-- Demonstrates: GROUP BY, CASE expressions, NULLIF division guard

SELECT
    t.year,
    ROUND(
        SUM(CASE WHEN ft.is_renewable THEN f.energy_gwh ELSE 0 END) /
        NULLIF(SUM(CASE WHEN f.energy_gwh > 0 THEN f.energy_gwh ELSE 0 END), 0) * 100, 1
    )                                                           AS renewable_pct,
    ROUND(
        SUM(CASE WHEN ft.is_renewable      THEN f.energy_gwh ELSE 0 END) / 1000, 0
    )                                                           AS renewable_twh,
    ROUND(
        SUM(CASE WHEN f.energy_gwh > 0    THEN f.energy_gwh ELSE 0 END) / 1000, 0
    )                                                           AS total_twh,
    ROUND(
        SUM(CASE WHEN ft.fueltech_group = 'solar' AND ft.is_renewable
                 THEN f.energy_gwh ELSE 0 END) / 1000, 1
    )                                                           AS solar_twh,
    ROUND(
        SUM(CASE WHEN ft.fueltech_group = 'wind'
                 THEN f.energy_gwh ELSE 0 END) / 1000, 1
    )                                                           AS wind_twh
FROM  fact_market_timeseries f
JOIN  dim_time     t  ON f.period_id   = t.period_id
JOIN  dim_fueltech ft ON f.fueltech_id = ft.fueltech_id
GROUP BY t.year
ORDER BY t.year;`,
  },
  {
    tab: 'Intensity YoY',
    desc: `<strong>Emissions Intensity with Year-over-Year Change.</strong> Uses <code>LAG()</code> to compute the prior year's value and calculate the annual decarbonisation rate: a direct measure of grid progress that AEMO publishes in its ISP reporting.`,
    sql: `-- Annual grid emissions intensity with year-over-year change
-- Demonstrates: CTE, LAG() window function, derived % change

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
ORDER BY year;`,
  },
  {
    tab: 'Market Value',
    desc: `<strong>Market Value by Fuel Technology Group: Last 12 Months.</strong> Computes revenue captured per fuel category, an implied price ($/MWh), and ranks by total revenue: directly replicating the bar chart in Section 04.`,
    sql: `-- Market value by fuel technology: last 12 months
-- Demonstrates: aggregation + CASE grouping, RANK(), date filter

SELECT
    ft.fueltech_group,
    ft.is_renewable,
    ROUND(SUM(f.market_value_aud) / 1e9, 2)                   AS market_value_bn_aud,
    ROUND(SUM(CASE WHEN f.energy_gwh > 0 THEN f.energy_gwh ELSE 0 END), 0)
                                                               AS generation_gwh,
    ROUND(
        SUM(f.market_value_aud) /
        NULLIF(SUM(CASE WHEN f.energy_gwh > 0 THEN f.energy_gwh * 1000 ELSE 0 END), 0),
        2
    )                                                          AS implied_price_aud_mwh,
    RANK() OVER (ORDER BY SUM(f.market_value_aud) DESC)        AS revenue_rank
FROM  fact_market_timeseries f
JOIN  dim_fueltech ft ON f.fueltech_id = ft.fueltech_id
JOIN  dim_time     t  ON f.period_id   = t.period_id
WHERE t.date >= DATEADD('month', -12,
                  (SELECT MAX(date) FROM dim_time))
GROUP BY ft.fueltech_group, ft.is_renewable
ORDER BY market_value_bn_aud DESC;`,
  },
  {
    tab: 'FY KPI Dashboard',
    desc: `<strong>Financial Year KPI Summary.</strong> One row per financial year with price, renewables %, intensity, and total energy: the kind of table you'd populate a Power BI or Tableau dashboard from. Demonstrates multi-join aggregation across fact and dimension tables.`,
    sql: `-- Financial year KPI dashboard: one row per FY
-- Demonstrates: multi-table joins, GROUP BY financial_year, multi-metric aggregation

SELECT
    t.financial_year,
    COUNT(DISTINCT t.period_id)                                 AS months,
    ROUND(AVG(n.vwap_aud_mwh), 2)                              AS avg_vwap,
    ROUND(MAX(n.vwap_aud_mwh), 2)                              AS peak_vwap,
    ROUND(MIN(n.vwap_aud_mwh), 2)                              AS min_vwap,
    ROUND(AVG(n.emissions_intensity_kg_mwh), 0)                AS avg_intensity_kg_mwh,
    ROUND(
        SUM(CASE WHEN ft.is_renewable THEN f.energy_gwh ELSE 0 END) /
        NULLIF(SUM(CASE WHEN f.energy_gwh > 0 THEN f.energy_gwh ELSE 0 END), 0) * 100,
        1
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
ORDER BY t.financial_year;`,
  },
  {
    tab: 'MoM Price Moves',
    desc: `<strong>Largest Month-over-Month Price Movements.</strong> Uses <code>LAG()</code> to find the biggest price jumps and falls: useful for event detection and for understanding which market shocks caused structural repricing (e.g., 2022 energy crisis, gas supply tightness).`,
    sql: `-- Top 15 month-over-month price movements (absolute change)
-- Demonstrates: LAG() for delta calculation, ABS(), ORDER BY derived column

WITH mom AS (
    SELECT
        t.date,
        n.vwap_aud_mwh                                         AS price,
        LAG(n.vwap_aud_mwh) OVER (ORDER BY t.date)            AS prev_month,
        n.vwap_aud_mwh - LAG(n.vwap_aud_mwh) OVER (ORDER BY t.date)
                                                               AS mom_change,
        ROUND(
            (n.vwap_aud_mwh - LAG(n.vwap_aud_mwh) OVER (ORDER BY t.date)) /
            NULLIF(LAG(n.vwap_aud_mwh) OVER (ORDER BY t.date), 0) * 100, 1
        )                                                      AS mom_pct_change
    FROM  fact_network_kpis n
    JOIN  dim_time t ON n.period_id = t.period_id
)
SELECT
    date,
    ROUND(price, 2)             AS price,
    ROUND(prev_month, 2)        AS prev_month_price,
    ROUND(mom_change, 2)        AS mom_change,
    mom_pct_change,
    CASE WHEN mom_change > 0 THEN 'UP' ELSE 'DOWN' END         AS direction
FROM  mom
WHERE mom_change IS NOT NULL
ORDER BY ABS(mom_change) DESC
LIMIT 15;`,
  },
  {
    tab: 'Emissions Mix',
    desc: `<strong>Annual Emissions Mix: % by Source.</strong> Shows how coal, gas, and other fuels' share of NEM emissions has shifted over time. Uses a two-CTE pattern (per-fuel totals, then annual totals) to compute proportions cleanly.`,
    sql: `-- Annual emissions mix by fuel source (% of total)
-- Demonstrates: two-level CTE, proportion calculation, pivoting via CASE

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
ORDER BY ae.year, ae.total_tco2e DESC;`,
  },
  {
    tab: 'Spike Detection',
    desc: `<strong>Percentile-based price spike detection (p95 / p99).</strong> Defines spikes using the distribution of the data itself rather than a fixed threshold: making the definition portable across different market conditions. Shows the renewable proportion and demand context at each spike to explain the driver.`,
    sql: `-- Percentile-based spike detection with renewable + demand context
-- Demonstrates: PERCENTILE_CONT, CASE for spike classification, CTE chaining

WITH price_pcts AS (
    SELECT
        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY n.vwap_aud_mwh) AS p95,
        PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY n.vwap_aud_mwh) AS p99
    FROM  fact_network_kpis n
),
monthly_mix AS (
    SELECT
        f.period_id,
        SUM(CASE WHEN ft.is_renewable THEN f.energy_gwh ELSE 0 END) /
            NULLIF(SUM(CASE WHEN f.energy_gwh > 0 THEN f.energy_gwh ELSE 0 END), 0) * 100
                                                                AS renewable_pct,
        SUM(CASE WHEN f.energy_gwh > 0 THEN f.energy_gwh ELSE 0 END) AS total_gwh
    FROM  fact_market_timeseries f
    JOIN  dim_fueltech ft ON f.fueltech_id = ft.fueltech_id
    GROUP BY f.period_id
)
SELECT
    t.date,
    ROUND(n.vwap_aud_mwh, 2)                                    AS price,
    CASE
        WHEN n.vwap_aud_mwh >= pp.p99 THEN 'EXTREME (p99+)'
        WHEN n.vwap_aud_mwh >= pp.p95 THEN 'HIGH (p95–p99)'
        ELSE 'NORMAL'
    END                                                         AS price_tier,
    ROUND(mm.renewable_pct, 1)                                  AS renewable_pct_at_spike,
    ROUND(mm.total_gwh, 0)                                      AS total_gwh,
    ROUND(n.vwap_aud_mwh / NULLIF(pp.p95, 0), 2)               AS multiples_of_p95
FROM  fact_network_kpis  n
JOIN  dim_time           t  ON n.period_id = t.period_id
JOIN  monthly_mix        mm ON n.period_id = mm.period_id
CROSS JOIN price_pcts    pp
WHERE n.vwap_aud_mwh >= pp.p95
ORDER BY n.vwap_aud_mwh DESC;`,
  },
  {
    tab: 'Regional KPIs',
    desc: `<strong>Regional KPI comparison: price, renewables, and emissions by NEM region.</strong> The NEM has five interconnected regions with very different fuel mixes. This query surfaces the key metrics per region, revealing the price and decarbonisation spread that interconnectors partially arbitrage away.`,
    sql: `-- Regional KPI comparison for the last 12 months
-- Demonstrates: GROUP BY region, multi-metric aggregation, RANK within result set

WITH regional_gen AS (
    SELECT
        f.period_id,
        f.network_region,
        SUM(CASE WHEN ft.is_renewable THEN f.energy_gwh ELSE 0 END)  AS renewable_gwh,
        SUM(CASE WHEN f.energy_gwh > 0 THEN f.energy_gwh ELSE 0 END) AS total_gwh,
        SUM(f.emissions_tco2e)                                        AS total_tco2e
    FROM  fact_market_timeseries f
    JOIN  dim_fueltech ft ON f.fueltech_id = ft.fueltech_id
    JOIN  dim_time     t  ON f.period_id   = t.period_id
    WHERE t.date >= DATEADD('month', -12, (SELECT MAX(date) FROM dim_time))
    GROUP BY f.period_id, f.network_region
),
regional_price AS (
    SELECT
        n.network_region,
        AVG(n.vwap_aud_mwh)              AS avg_vwap,
        MAX(n.vwap_aud_mwh)              AS peak_vwap,
        STDDEV(n.vwap_aud_mwh)           AS price_volatility
    FROM  fact_network_kpis_regional n   -- regional price fact table
    JOIN  dim_time t ON n.period_id = t.period_id
    WHERE t.date >= DATEADD('month', -12, (SELECT MAX(date) FROM dim_time))
    GROUP BY n.network_region
)
SELECT
    rp.network_region,
    ROUND(rp.avg_vwap, 2)                                        AS avg_vwap,
    ROUND(rp.peak_vwap, 2)                                       AS peak_vwap,
    ROUND(rp.price_volatility, 2)                                AS price_volatility,
    ROUND(SUM(rg.renewable_gwh) /
          NULLIF(SUM(rg.total_gwh), 0) * 100, 1)                AS renewable_pct,
    ROUND(SUM(rg.total_tco2e) /
          NULLIF(SUM(rg.total_gwh) * 1000, 0), 0)               AS intensity_kg_mwh,
    RANK() OVER (ORDER BY rp.avg_vwap)                           AS price_rank_cheapest
FROM  regional_gen rg
JOIN  regional_price rp USING (network_region)
GROUP BY rp.network_region, rp.avg_vwap, rp.peak_vwap, rp.price_volatility
ORDER BY rp.avg_vwap;`,
  },
  {
    tab: 'Fueltech Revenue Share',
    desc: `<strong>Market value share by fuel technology group over time.</strong> Shows how the revenue split between fossil and clean generation has shifted year by year: the commercial story of the energy transition expressed in dollars. Pairs cleanly with the Market Value section charts.`,
    sql: `-- Market value share by fueltech_group over time (annual)
-- Demonstrates: window functions for proportion, CASE for clean/fossil grouping

WITH annual_mv AS (
    SELECT
        t.year,
        ft.fueltech_group,
        CASE
            WHEN ft.is_renewable                      THEN 'Clean'
            WHEN ft.fueltech_group IN ('coal','gas')  THEN 'Fossil'
            ELSE 'Other'
        END                                                      AS category,
        SUM(f.market_value_aud)                                  AS mv_aud
    FROM  fact_market_timeseries f
    JOIN  dim_time     t  ON f.period_id   = t.period_id
    JOIN  dim_fueltech ft ON f.fueltech_id = ft.fueltech_id
    WHERE f.market_value_aud > 0
    GROUP BY t.year, ft.fueltech_group, category
),
year_totals AS (
    SELECT year, SUM(mv_aud) AS year_total
    FROM   annual_mv
    GROUP  BY year
)
SELECT
    am.year,
    am.fueltech_group,
    am.category,
    ROUND(am.mv_aud / 1e6, 1)                                   AS mv_million_aud,
    ROUND(am.mv_aud / NULLIF(yt.year_total, 0) * 100, 1)        AS pct_of_year_total,
    -- Running cumulative revenue per fueltech
    ROUND(SUM(am.mv_aud) OVER (
        PARTITION BY am.fueltech_group
        ORDER BY am.year
        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    ) / 1e9, 2)                                                  AS cumulative_revenue_bn,
    RANK() OVER (PARTITION BY am.year ORDER BY am.mv_aud DESC)   AS rank_within_year
FROM  annual_mv am
JOIN  year_totals yt ON am.year = yt.year
ORDER BY am.year, am.mv_aud DESC;`,
  },
];

function initSqlTabs() {
  const tabBar = document.getElementById('sql-tabs');
  const panels = document.getElementById('sql-panels');

  SQL_QUERIES.forEach((q, i) => {
    // Tab button
    const btn = document.createElement('button');
    btn.className = 'sql-tab' + (i === 0 ? ' active' : '');
    btn.textContent = q.tab;
    btn.dataset.tab = i;
    tabBar.appendChild(btn);

    // Panel
    const panel = document.createElement('div');
    panel.className = 'sql-panel' + (i === 0 ? ' active' : '');
    panel.innerHTML = `
      <div class="sql-panel-desc">${q.desc}</div>
      <pre><code class="language-sql">${escapeHtml(q.sql)}</code></pre>`;
    panels.appendChild(panel);
  });

  // Syntax highlight all code blocks
  document.querySelectorAll('pre code').forEach(block => hljs.highlightElement(block));

  // Tab switching
  tabBar.addEventListener('click', e => {
    const btn = e.target.closest('.sql-tab');
    if (!btn) return;
    document.querySelectorAll('.sql-tab').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.sql-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    panels.children[+btn.dataset.tab].classList.add('active');
  });
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/* ══════════════════════════════════════════════════════════════════════════
   LOADING OVERLAY
   ══════════════════════════════════════════════════════════════════════════ */
function showLoading() {
  const overlay = document.createElement('div');
  overlay.className = 'loading-overlay';
  overlay.id = 'loading-overlay';
  overlay.innerHTML = `
    <div class="loading-spinner"></div>
    <div class="loading-text">Loading NEM data…</div>`;
  document.body.prepend(overlay);
}

function hideLoading() {
  const overlay = document.getElementById('loading-overlay');
  if (overlay) {
    overlay.classList.add('hidden');
    setTimeout(() => overlay.remove(), 600);
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   MAIN ENTRY POINT
   ══════════════════════════════════════════════════════════════════════════ */
function main(data) {
  FULL_DATA = data;
  updateHeroKPIs(data);
  buildNarratives(data);
  buildFilterBar(data);

  chartEnergyMix(data);
  chartRenewPct(data);
  chartPrice(data);
  chartPriceHist(data);
  chartPriceRolling(data);
  chartIntensity(data);
  chartEmissionsDonut(data);
  chartEmissionsStacked(data);
  chartMvBar(data);
  chartMvTrend(data);

  initSqlTabs();
  hideLoading();
}

showLoading();

Papa.parse('./19981201 Open Electricity.csv', {
  download:        true,
  header:          true,
  dynamicTyping:   false,
  skipEmptyLines:  true,
  complete: results => {
    const data = processRows(results.data.filter(r => r[C.date]));
    main(data);
  },
  error: err => {
    hideLoading();
    console.error('CSV load failed:', err);
    document.getElementById('hero-kpis').innerHTML =
      `<div style="color:#f87171;grid-column:1/-1;padding:16px">
        Could not load data. Please serve this folder via a local web server.<br>
        <code>python3 -m http.server 8080</code> then open <a href="http://localhost:8080">localhost:8080</a>
      </div>`;
  },
});

/* ══════════════════════════════════════════════════════════════════════════
   FILTER BAR: build UI + update all charts on range change
   ══════════════════════════════════════════════════════════════════════════ */
function buildFilterBar(data) {
  const years = [...new Set(data.map(d => d.year))].sort((a, b) => a - b);
  const startSel = document.getElementById('filter-start-yr');
  const endSel   = document.getElementById('filter-end-yr');
  if (!startSel || !endSel) return;

  years.forEach(y => {
    startSel.insertAdjacentHTML('beforeend', `<option value="${y}">${y}</option>`);
    endSel.insertAdjacentHTML('beforeend',   `<option value="${y}">${y}</option>`);
  });
  startSel.value = years[0];
  endSel.value   = years[years.length - 1];

  const onSelectChange = () => {
    const s = +startSel.value, e = +endSel.value;
    if (s > e) return;
    // Clear preset highlight
    document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
    applyFilter(s, e);
  };

  startSel.addEventListener('change', onSelectChange);
  endSel.addEventListener('change',   onSelectChange);

  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const s = +btn.dataset.start, e = +btn.dataset.end;
      startSel.value = Math.max(s, years[0]);
      endSel.value   = Math.min(e, years[years.length - 1]);
      applyFilter(s, e);
    });
  });
}

function applyFilter(startYear, endYear) {
  const filtered = FULL_DATA.filter(d => d.year >= startYear && d.year <= endYear);
  if (filtered.length < 2) return;
  refreshAllCharts(filtered);
  updateHeroKPIs(filtered);
}

function refreshAllCharts(data) {
  const labels    = data.map(d => monthLabel(d.dateStr));
  const prices    = data.map(d => d.price);
  const priceSorted = [...prices].filter(p => p > 0).sort((a, b) => a - b);
  const p95       = priceSorted.length ? percentile(priceSorted, 95) : 300;
  const intensity = data.map(d => d.intensity);

  // ── Energy mix ──────────────────────────────────────────────────────────
  if (CHARTS.mix) {
    CHARTS.mix.data.labels = labels;
    const keys = ['coal','gas','hydro','wind','solar','bio','batD'];
    keys.forEach((k, i) => {
      CHARTS.mix.data.datasets[i].data = data.map(d => +d[k].toFixed(0));
    });
    CHARTS.mix.update('active');
  }

  // ── Renewable % ──────────────────────────────────────────────────────────
  if (CHARTS.renewPct) {
    CHARTS.renewPct.data.labels = labels;
    CHARTS.renewPct.data.datasets[0].data = data.map(d => +d.renewPct.toFixed(1));
    CHARTS.renewPct.data.datasets[1].data = rollingAvg(data.map(d => d.renewPct), 12);
    CHARTS.renewPct.update('active');
  }

  // ── Price timeline ────────────────────────────────────────────────────────
  if (CHARTS.price) {
    CHARTS.price.data.labels = labels;
    CHARTS.price.data.datasets[0].data = prices;
    CHARTS.price.data.datasets[1].data = prices.map(p => p > p95 ? p : NaN);
    CHARTS.price.update('active');
  }

  // ── Price rolling ─────────────────────────────────────────────────────────
  if (CHARTS.priceRolling) {
    CHARTS.priceRolling.data.labels = labels;
    CHARTS.priceRolling.data.datasets[0].data = rollingAvg(prices, 12);
    CHARTS.priceRolling.update('active');
  }

  // ── Price histogram ───────────────────────────────────────────────────────
  if (CHARTS.priceHist) {
    const bins   = [0,20,40,60,80,100,125,150,200,250,300,400,500];
    const counts = Array(bins.length - 1).fill(0);
    prices.filter(p => p >= 0 && p < 500).forEach(p => {
      const i = bins.findIndex((b, j) => j < bins.length - 1 && p >= b && p < bins[j + 1]);
      if (i >= 0) counts[i]++;
    });
    CHARTS.priceHist.data.datasets[0].data = counts;
    CHARTS.priceHist.update('active');
  }

  // ── Emissions intensity ───────────────────────────────────────────────────
  if (CHARTS.intensity) {
    CHARTS.intensity.data.labels = labels;
    CHARTS.intensity.data.datasets[0].data = intensity;
    CHARTS.intensity.data.datasets[1].data = rollingAvg(intensity, 12);
    CHARTS.intensity.update('active');
  }

  // ── Emissions stacked ─────────────────────────────────────────────────────
  if (CHARTS.emStacked) {
    CHARTS.emStacked.data.labels = labels;
    CHARTS.emStacked.data.datasets[0].data = data.map(d => +(d.emCoalBrown/1e6).toFixed(3));
    CHARTS.emStacked.data.datasets[1].data = data.map(d => +(d.emCoalBlack/1e6).toFixed(3));
    CHARTS.emStacked.data.datasets[2].data = data.map(d => +(d.emGas/1e6).toFixed(3));
    CHARTS.emStacked.update('active');
  }

  // ── Market value trend ────────────────────────────────────────────────────
  if (CHARTS.mvTrend) {
    CHARTS.mvTrend.data.labels = labels;
    CHARTS.mvTrend.data.datasets[0].data = rollingAvg(data.map(d => d.mvClean/1e6), 12);
    CHARTS.mvTrend.data.datasets[1].data = rollingAvg(data.map(d => d.mvFossil/1e6), 12);
    CHARTS.mvTrend.update('active');
  }

  // ── Last-12m charts: destroy & recreate with filtered slice ──────────────
  const last12 = data.slice(-12);

  if (CHARTS.emDonut) {
    CHARTS.emDonut.destroy();
    CHARTS.emDonut = null;
    chartEmissionsDonut_slice(last12);
  }

  if (CHARTS.mvBar) {
    CHARTS.mvBar.destroy();
    CHARTS.mvBar = null;
    chartMvBar_slice(last12);
  }
}

/* Extracted "last 12" chart builders so they can be called on filter change */
function chartEmissionsDonut_slice(last12) {
  const totals = {
    'Coal (Brown)': last12.reduce((s, d) => s + d.emCoalBrown, 0),
    'Coal (Black)': last12.reduce((s, d) => s + d.emCoalBlack, 0),
    'Gas':          last12.reduce((s, d) => s + d.emGas,       0),
    'Other':        last12.reduce((s, d) => s + d.emOther,     0),
  };
  const labels = Object.keys(totals).filter(k => totals[k] > 0);
  const values = labels.map(k => (totals[k] / 1e6).toFixed(2));
  CHARTS.emDonut = new Chart(document.getElementById('chart-em-donut'), {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{ data: values,
        backgroundColor: ['#495063','#6b7280','#e8590c','#2f9e44'],
        borderColor: 'rgba(240,242,248,.6)', borderWidth: 3 }],
    },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '62%',
      plugins: {
        legend: { position: 'right', labels: { padding: 16 } },
        tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${ctx.raw} Mt CO₂e` } },
      },
    },
  });
}

function chartMvBar_slice(last12) {
  const fuels = {
    Coal: last12.reduce((s,d) => s+d.mvCoal,0), Gas: last12.reduce((s,d) => s+d.mvGas,0),
    Wind: last12.reduce((s,d) => s+d.mvWind,0), Solar: last12.reduce((s,d) => s+d.mvSolar,0),
    Hydro: last12.reduce((s,d) => s+d.mvHydro,0), Bioenergy: last12.reduce((s,d) => s+d.mvBio,0),
    Battery: last12.reduce((s,d) => s+d.mvBat,0),
  };
  const sorted = Object.entries(fuels).sort((a,b) => b[1]-a[1]);
  const labels = sorted.map(([k]) => k);
  const values = sorted.map(([,v]) => (v/1e9).toFixed(2));
  const clrs   = { Coal:'#495063', Gas:'#e8590c', Wind:'#20b2aa', Solar:'#d08700', Hydro:'#3b5bdb', Bioenergy:'#2f9e44', Battery:'#9c4fd9' };
  CHARTS.mvBar = new Chart(document.getElementById('chart-mv-bar'), {
    type: 'bar',
    data: {
      labels,
      datasets: [{ label: 'Market value (A$B)', data: values,
        backgroundColor: labels.map(l => clrs[l]+'bb'),
        borderColor: labels.map(l => clrs[l]),
        borderWidth: 1, borderRadius: 5 }],
    },
    options: {
      responsive: true, maintainAspectRatio: false, indexAxis: 'y',
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ` $${ctx.raw}B AUD` } } },
      scales: {
        x: { ticks: { callback: v => `$${v}B` }, title: { display: true, text: 'A$ Billion', color: '#9ca3af' } },
        y: { ticks: { color: '#4b5563' } },
      },
    },
  });
}

/* ── Navbar scroll effect ────────────────────────────────────────────────── */
window.addEventListener('scroll', () => {
  document.getElementById('navbar')?.classList.toggle('scrolled', window.scrollY > 40);
}, { passive: true });

/* ══════════════════════════════════════════════════════════════════════════
   LIVE DATA: Open Electricity API
   Fetches last 7 days of hourly NEM data: price, renewable_proportion, demand
   ══════════════════════════════════════════════════════════════════════════ */

// Requests go to /api/v4/... which server.py proxies to api.openelectricity.org.au
const API_BASE = '/api/v4';

async function apiFetch(path) {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new Error(`Proxy ${res.status}: ${path}`);
  const json = await res.json();
  if (!json.success) throw new Error(json.error || 'API error');
  return json;
}

/* Parse the [[timestamp, value], …] data array into {ts, val} objects */
function parseSeries(result) {
  return (result?.data ?? []).map(([ts, val]) => ({
    ts:  new Date(ts),
    val: val ?? null,
  }));
}

/* Find a result object by metric name match */
function findResult(apiData, metric, nameFrag) {
  const block = apiData.data.find(d => d.metric === metric);
  if (!block) return [];
  const result = block.results.find(r => r.name.includes(nameFrag)) ?? block.results[0];
  return parseSeries(result);
}

/* ── Multi-variable OLS: price ~ a + b*renewables + c*demand ─────────────
   Uses normal equations: β = (XᵀX)⁻¹Xᵀy for 2 predictors + intercept.
   Returns { b_renew, b_demand, r2, n }: coefficients + R² + sample size.
   ─────────────────────────────────────────────────────────────────────────── */
function multiVarRegression(priceArr, renewArr, demandArr) {
  const tsMap_r = new Map(renewArr.map(p  => [p.ts.toISOString(), p.val]));
  const tsMap_d = new Map(demandArr.map(p => [p.ts.toISOString(), p.val]));

  const obs = priceArr
    .map(p => ({
      y: p.val,
      x1: tsMap_r.get(p.ts.toISOString()),
      x2: tsMap_d.get(p.ts.toISOString()),
    }))
    .filter(o => o.y != null && o.x1 != null && o.x2 != null);

  if (obs.length < 5) return null;
  const n = obs.length;

  // Build sums for normal equations (intercept + 2 predictors)
  let Sy=0, Sx1=0, Sx2=0, Sx1y=0, Sx2y=0, Sx1x2=0, Sx1x1=0, Sx2x2=0;
  obs.forEach(({ y, x1, x2 }) => {
    Sy+=y; Sx1+=x1; Sx2+=x2; Sx1y+=x1*y; Sx2y+=x2*y;
    Sx1x2+=x1*x2; Sx1x1+=x1*x1; Sx2x2+=x2*x2;
  });

  // 3×3 normal equations: solved via Cramer's rule (small system)
  // [n    Sx1   Sx2 ] [a]   [Sy  ]
  // [Sx1  Sx1x1 Sx1x2] [b] = [Sx1y]
  // [Sx2  Sx1x2 Sx2x2] [c]   [Sx2y]
  // Use simple iterative approach (Gaussian elimination)
  const A = [
    [n,    Sx1,   Sx2,   Sy  ],
    [Sx1,  Sx1x1, Sx1x2, Sx1y],
    [Sx2,  Sx1x2, Sx2x2, Sx2y],
  ];
  // Forward elimination
  for (let col = 0; col < 3; col++) {
    let pivot = A[col][col];
    if (Math.abs(pivot) < 1e-10) continue;
    for (let row = col + 1; row < 3; row++) {
      const f = A[row][col] / pivot;
      for (let k = col; k <= 3; k++) A[row][k] -= f * A[col][k];
    }
  }
  // Back substitution
  const coef = [0, 0, 0];
  for (let i = 2; i >= 0; i--) {
    coef[i] = A[i][3];
    for (let j = i + 1; j < 3; j++) coef[i] -= A[i][j] * coef[j];
    coef[i] /= A[i][i];
  }
  const [a, b_renew, b_demand] = coef;

  // R²
  const yMean = Sy / n;
  let ssTot = 0, ssRes = 0;
  obs.forEach(({ y, x1, x2 }) => {
    const yHat = a + b_renew * x1 + b_demand * x2;
    ssTot += (y - yMean) ** 2;
    ssRes += (y - yHat) ** 2;
  });
  const r2 = 1 - ssRes / ssTot;

  return { a, b_renew, b_demand, r2, n };
}

/* ── Region comparison (last 12 months, monthly) ────────────────────────── */
async function loadRegionData() {
  const end   = new Date(); end.setDate(1); end.setHours(0,0,0,0);
  const start = new Date(end); start.setFullYear(start.getFullYear() - 1);
  const toISO = d => d.toISOString().slice(0, 10) + 'T00:00:00';

  const data = await apiFetch(
    `/market/network/NEM?metrics=price&metrics=renewable_proportion` +
    `&interval=1M&date_start=${toISO(start)}&date_end=${toISO(end)}` +
    `&primary_grouping=network_region`
  );

  // Extract per-region averages
  const REGIONS = ['NSW1','QLD1','SA1','TAS1','VIC1'];
  const LABELS  = ['NSW',  'QLD',  'SA',  'TAS',  'VIC'];

  function regionAvg(metric, regionCode) {
    const block  = data.data.find(d => d.metric === metric);
    if (!block) return null;
    const result = block.results.find(r => r.name.includes(regionCode));
    if (!result || !result.data.length) return null;
    const vals = result.data.map(([, v]) => v).filter(v => v !== null);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  }

  const prices = REGIONS.map(r => regionAvg('price', r));
  const renews = REGIONS.map(r => regionAvg('renewable_proportion', r));

  chartRegionPrice(LABELS, prices);
  chartRegionRenew(LABELS, renews);
}

function chartRegionPrice(labels, prices) {
  const clrs = ['#3b5bdb','#e8590c','#9c4fd9','#20b2aa','#2f9e44'];
  new Chart(document.getElementById('chart-region-price'), {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Avg VWAP (AUD/MWh)',
        data: prices.map(v => v?.toFixed(2) ?? null),
        backgroundColor: clrs.map(c => c + 'cc'),
        borderColor: clrs, borderWidth: 1, borderRadius: 5,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => ` $${ctx.raw}/MWh` } },
      },
      scales: {
        x: { ticks: { color: '#4b5563' } },
        y: { ticks: { callback: v => `$${v}` },
             title: { display: true, text: 'AUD / MWh', color: '#9ca3af' } },
      },
    },
  });
}

function chartRegionRenew(labels, renews) {
  const clrs = ['#3b5bdb','#e8590c','#9c4fd9','#20b2aa','#2f9e44'];
  new Chart(document.getElementById('chart-region-renew'), {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Avg renewables %',
        data: renews.map(v => v?.toFixed(1) ?? null),
        backgroundColor: clrs.map(c => c + 'cc'),
        borderColor: clrs, borderWidth: 1, borderRadius: 5,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => ` ${ctx.raw}%` } },
      },
      scales: {
        x: { ticks: { color: '#4b5563' } },
        y: { min: 0, max: 100,
             ticks: { callback: v => `${v}%` },
             title: { display: true, text: '% of generation', color: '#9ca3af' } },
      },
    },
  });
}

/* ── Load 7-day hourly data ─────────────────────────────────────────────── */
async function loadLiveData() {
  const now    = new Date();
  const end    = new Date(now);
  end.setMinutes(0, 0, 0);
  const start7 = new Date(end);
  start7.setDate(start7.getDate() - 7);
  const start14 = new Date(end);
  start14.setDate(start14.getDate() - 14);

  const toISO = d => d.toISOString().slice(0, 19);

  // Fetch last 14 days so we can compare this-week vs last-week
  const [mktData] = await Promise.all([
    apiFetch(
      `/market/network/NEM` +
      `?metrics=price&metrics=renewable_proportion&metrics=demand_energy` +
      `&interval=1h` +
      `&date_start=${toISO(start14)}` +
      `&date_end=${toISO(end)}`
    ),
  ]);

  const allPrice  = findResult(mktData, 'price',                'price_total');
  const allRenew  = findResult(mktData, 'renewable_proportion', 'renewable_proportion_total');
  const allDemand = findResult(mktData, 'demand_energy',        'demand_energy_total');

  // Split into this-week vs last-week
  const thisWeek  = p => p.ts >= start7;
  const lastWeek  = p => p.ts >= start14 && p.ts < start7;

  const avg = arr => arr.length ? arr.reduce((s, p) => s + p.val, 0) / arr.length : null;

  const priceThis  = allPrice.filter(thisWeek).filter(p => p.val !== null);
  const priceLast  = allPrice.filter(lastWeek).filter(p => p.val !== null);
  const renewThis  = allRenew.filter(thisWeek).filter(p => p.val !== null);
  const renewLast  = allRenew.filter(lastWeek).filter(p => p.val !== null);
  const demandThis = allDemand.filter(thisWeek).filter(p => p.val !== null);

  const avgPriceThis  = avg(priceThis);
  const avgPriceLast  = avg(priceLast);
  const avgRenewThis  = avg(renewThis);
  const avgRenewLast  = avg(renewLast);
  const avgDemandThis = avg(demandThis);
  const peakPrice     = priceThis.length ? Math.max(...priceThis.map(p => p.val)) : null;

  updateLiveKPIs({ avgPriceThis, avgPriceLast, avgRenewThis, avgRenewLast, avgDemandThis, peakPrice });

  // Multi-variable regression: price ~ a + b*renewables + c*demand
  const demandThis = allDemand.filter(thisWeek).filter(p => p.val !== null);
  const mvReg = multiVarRegression(priceThis, renewThis, demandThis);

  updateLiveInsights({ priceThis, renewThis, avgPriceThis, avgPriceLast, avgRenewThis, peakPrice, mvReg });
  chartLiveMain(allPrice.filter(thisWeek), allRenew.filter(thisWeek));
  chartLiveScatter(priceThis, renewThis, mvReg);
  chartLiveHourly(priceThis);
}

/* ── Live KPI cards ─────────────────────────────────────────────────────── */
function liveKpiHTML(value, label, change, changeLabel) {
  const dir   = change === null ? 'flat' : (change > 0 ? 'up' : 'down');
  const arrow = change === null ? '' : (change > 0 ? '▲' : '▼');
  const chStr = change !== null ? `${arrow} ${Math.abs(change).toFixed(1)} ${changeLabel} vs last week` : '';
  return `
    <div class="kpi-card">
      <div class="live-kpi-value" style="color:var(--blue)">${value}</div>
      <div class="live-kpi-change ${dir}">${chStr}</div>
      <div class="kpi-label">${label}</div>
    </div>`;
}

function updateLiveKPIs({ avgPriceThis, avgPriceLast, avgRenewThis, avgRenewLast, avgDemandThis, peakPrice }) {
  const container = document.getElementById('live-kpis');
  container.innerHTML =
    liveKpiHTML(`$${avgPriceThis?.toFixed(0) ?? '...'}/MWh`, 'Avg Price (7 days)',
                avgPriceLast ? avgPriceThis - avgPriceLast : null, '$/MWh') +
    liveKpiHTML(`${avgRenewThis?.toFixed(1) ?? '...'}%`, 'Avg Renewables',
                avgRenewLast ? avgRenewThis - avgRenewLast : null, 'pp') +
    liveKpiHTML(`$${peakPrice?.toFixed(0) ?? '...'}/MWh`, 'Peak Hourly Price',
                null, '') +
    liveKpiHTML(`${avgDemandThis ? avgDemandThis.toFixed(1) : '...'} GWh/h`,
                'Avg Hourly Demand', null, '');
}

/* ── Live narrative ──────────────────────────────────────────────────────── */
function updateLiveInsights({ priceThis, renewThis, avgPriceThis, avgPriceLast, avgRenewThis, peakPrice, mvReg }) {
  // Pearson correlation between price and renewable proportion
  const tsMap  = new Map(renewThis.map(p => [p.ts.toISOString(), p.val]));
  const paired = priceThis
    .map(p => ({ price: p.val, renew: tsMap.get(p.ts.toISOString()) }))
    .filter(p => p.renew != null);

  let corr = null;
  if (paired.length > 2) {
    const n     = paired.length;
    const meanP = paired.reduce((s, p) => s + p.price, 0) / n;
    const meanR = paired.reduce((s, p) => s + p.renew, 0) / n;
    const cov   = paired.reduce((s, p) => s + (p.price - meanP) * (p.renew - meanR), 0) / n;
    const sdP   = Math.sqrt(paired.reduce((s, p) => s + (p.price - meanP) ** 2, 0) / n);
    const sdR   = Math.sqrt(paired.reduce((s, p) => s + (p.renew - meanR) ** 2, 0) / n);
    corr        = sdP * sdR > 0 ? cov / (sdP * sdR) : null;
  }

  // Find the highest-price hour and its renewable context
  const peakHour  = priceThis.reduce((b, p) => (p.val > (b?.val ?? 0) ? p : b), null);
  const peakRenew = peakHour ? tsMap.get(peakHour.ts.toISOString()) : null;
  const peakTimeStr = peakHour
    ? peakHour.ts.toLocaleString('en-AU', { weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false })
    : null;

  // Hours with price > $200
  const spikeHours = priceThis.filter(p => p.val > 200).length;

  // Price change direction
  const pricePct = avgPriceLast
    ? ((avgPriceThis - avgPriceLast) / avgPriceLast * 100)
    : null;

  // Key finding text
  const changeText = pricePct !== null
    ? `<strong>${Math.abs(pricePct).toFixed(0)}% ${pricePct > 0 ? 'higher' : 'lower'}</strong> than the previous week`
    : 'compared to the prior week';

  const mvLine = mvReg && mvReg.r2 > 0
    ? ` A two-variable model (price ~ renewables + demand) gives <strong>R² = ${mvReg.r2.toFixed(2)}</strong>: holding demand constant, each +1% of renewables is associated with <strong>${mvReg.b_renew.toFixed(1)} $/MWh</strong> in price.`
    : corr !== null
    ? ` Renewables–price correlation this week: <strong>r = ${corr.toFixed(2)}</strong>.`
    : '';

  document.getElementById('kf-live-text').innerHTML =
    `Average NEM price this week: <strong>$${avgPriceThis?.toFixed(0)}/MWh</strong>: ${changeText}. Renewables supplied <strong>${avgRenewThis?.toFixed(0)}%</strong> of generation on average.` + mvLine;

  document.getElementById('sb-live').innerHTML = bullets([
    peakTimeStr ? `The highest hourly price was <strong>$${peakHour.val.toFixed(0)}/MWh</strong> at <strong>${peakTimeStr}</strong>${peakRenew !== null ? `, when renewables were supplying just <strong>${peakRenew.toFixed(0)}%</strong> of generation` : ''}. This pattern: low renewables at evening peak → gas and coal set the marginal price: is the core NEM dispatch mechanism.` : '',
    spikeHours > 0 ? `<strong>${spikeHours} hours</strong> exceeded $200/MWh this week. These intervals are where battery storage and gas peakers earn disproportionate revenue: a key consideration for AGL's dispatch strategy.` : `No hours exceeded $200/MWh this week: adequate dispatchable supply or above-average renewables kept the market calm.`,
    mvReg && mvReg.b_demand != null ? `Demand contribution: each additional GWh of operational demand is associated with <strong>$${mvReg.b_demand.toFixed(1)}/MWh</strong> in price (holding renewables constant). ${Math.abs(mvReg.b_demand) > Math.abs(mvReg.b_renew) ? 'This week demand is the stronger price driver.' : 'This week renewables are the stronger price driver.'}` : '',
    `The regional charts below show why NEM-wide averages can mislead: SA's high renewables (mostly wind) create very different price dynamics from coal-heavy QLD, with interconnectors acting as a partial price equaliser.`,
  ].filter(Boolean));

  document.getElementById('st-live').innerHTML =
    `<strong>Correlation vs causation:</strong> The two-variable model (price ~ renewables + demand) is a more defensible framing than a simple r value: it isolates the renewables effect holding demand constant. The R² shows how much of this week's price variance is explained by these two factors alone. What it misses: fuel costs, plant outages, and interconnector constraints, which are the "residual" in any price model.`;
}

/* ── Chart: Dual-axis price + renewable proportion line ─────────────────── */
function chartLiveMain(priceData, renewData) {
  const labels     = priceData.map(p => p.ts.toLocaleString('en-AU', { weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }));
  const priceVals  = priceData.map(p => p.val?.toFixed(2) ?? null);
  const renewVals  = renewData.map(p => p.val?.toFixed(1) ?? null);

  new Chart(document.getElementById('chart-live-main'), {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'Price (AUD/MWh)',
          data: priceVals, borderColor: '#1d4ed8', backgroundColor: 'rgba(29,78,216,0.05)',
          borderWidth: 1.5, pointRadius: 0, tension: 0.2, fill: true, yAxisID: 'y' },
        { label: 'Renewable % (right axis)',
          data: renewVals, borderColor: '#2f9e44', backgroundColor: 'rgba(22,163,74,0.06)',
          borderWidth: 1.5, pointRadius: 0, tension: 0.2, fill: true, yAxisID: 'y1' },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { position: 'bottom' } },
      scales: {
        x: { ticks: { maxTicksLimit: 14, maxRotation: 0, font: { size: 10 } } },
        y: { position: 'left',  ticks: { callback: v => `$${v}` },
             title: { display: true, text: 'AUD / MWh', color: '#1d4ed8' } },
        y1:{ position: 'right', grid: { drawOnChartArea: false },
             ticks: { callback: v => `${v}%` },
             title: { display: true, text: 'Renewable %', color: '#16a34a' } },
      },
    },
  });
}

/* ── Chart: Price vs Renewable scatter ──────────────────────────────────── */
function chartLiveScatter(priceData, renewData, mvReg) {
  const tsMap  = new Map(renewData.map(p => [p.ts.toISOString(), p.val]));
  const points = priceData
    .map(p => ({ x: tsMap.get(p.ts.toISOString()), y: p.val }))
    .filter(p => p.x != null && p.y != null);

  // Simple linear regression for trend line
  const n    = points.length;
  const sumX = points.reduce((s, p) => s + p.x, 0);
  const sumY = points.reduce((s, p) => s + p.y, 0);
  const sumXY = points.reduce((s, p) => s + p.x * p.y, 0);
  const sumXX = points.reduce((s, p) => s + p.x * p.x, 0);
  const slope  = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;
  const xMin = Math.min(...points.map(p => p.x));
  const xMax = Math.max(...points.map(p => p.x));
  const trendLine = [
    { x: xMin, y: slope * xMin + intercept },
    { x: xMax, y: slope * xMax + intercept },
  ];

  // Color by price level
  const colors = points.map(p =>
    p.y > 200 ? 'rgba(220,38,38,0.7)' :
    p.y > 100 ? 'rgba(234,88,12,0.65)' :
    p.y < 20  ? 'rgba(22,163,74,0.7)' :
                'rgba(29,78,216,0.45)');

  // Build regression label
  let regLabel = 'Trend (simple regression)';
  if (mvReg && mvReg.r2 > 0) {
    regLabel = `2-var model (R²=${mvReg.r2.toFixed(2)}): each +1% renewables ≈ ${mvReg.b_renew.toFixed(1)} $/MWh`;
  }

  new Chart(document.getElementById('chart-live-scatter'), {
    type: 'scatter',
    data: {
      datasets: [
        { label: 'Hourly intervals',
          data: points, pointBackgroundColor: colors, pointBorderColor: 'transparent',
          pointRadius: 4, pointHoverRadius: 6 },
        { label: regLabel,
          data: trendLine, type: 'line',
          borderColor: 'rgba(107,114,128,0.7)', backgroundColor: 'transparent',
          borderWidth: 2, borderDash: [5, 4], pointRadius: 0 },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom', labels: { font: { size: 10 } } } },
      scales: {
        x: { title: { display: true, text: 'Renewable proportion (%)', color: '#2f9e44' },
             ticks: { callback: v => `${v}%` } },
        y: { title: { display: true, text: 'Price (AUD/MWh)', color: '#3b5bdb' },
             ticks: { callback: v => `$${v}` } },
      },
    },
  });
}

/* ── Chart: Average price by hour of day ───────────────────────────────── */
function chartLiveHourly(priceData) {
  const byHour = Array.from({ length: 24 }, () => []);
  priceData.forEach(p => {
    if (p.val !== null) byHour[p.ts.getHours()].push(p.val);
  });
  const avgByHour = byHour.map(vals => vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null);
  const labels    = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}:00`);
  const overall   = avgByHour.filter(v => v !== null).reduce((a, b, _, arr) => a + b / arr.length, 0);
  const colors    = avgByHour.map(v => v === null ? 'transparent' :
    v > overall * 1.4 ? 'rgba(220,38,38,0.7)' :
    v > overall * 1.1 ? 'rgba(234,88,12,0.65)' :
    v < overall * 0.7 ? 'rgba(22,163,74,0.7)' :
                        'rgba(29,78,216,0.55)');

  new Chart(document.getElementById('chart-live-hourly'), {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Avg price (AUD/MWh)',
        data: avgByHour.map(v => v?.toFixed(2) ?? null),
        backgroundColor: colors,
        borderColor: colors.map(c => c.replace('0.8', '1').replace('0.65', '1')),
        borderWidth: 1,
        borderRadius: 3,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => ` Avg: $${ctx.raw}/MWh` } },
      },
      scales: {
        x: { title: { display: true, text: 'Hour of day (local time)', color: '#6b7280' } },
        y: { ticks: { callback: v => `$${v}` },
             title: { display: true, text: 'AUD / MWh', color: '#6b7280' } },
      },
    },
  });
}

/* ── Start live data loading (independent of CSV) ───────────────────────── */
loadRegionData().catch(err => console.warn('Region data failed:', err));
loadLiveData().catch(err => {
  console.error('Live data load failed:', err);
  const insEl = document.getElementById('ins-live-status');
  if (insEl) insEl.textContent = 'Live data unavailable: check API key or network connection.';
  document.getElementById('live-kpis').innerHTML =
    '<div class="insight-chip chip-red" style="grid-column:1/-1"><span class="chip-icon">⚠️</span><span>API connection failed. Historical data below still loads from CSV.</span></div>';
});
