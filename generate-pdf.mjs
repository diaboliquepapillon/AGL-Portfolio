import puppeteer from 'puppeteer';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR   = path.join(__dirname, 'pdf-export');
const BASE_URL  = 'http://localhost:8080';

const PAGES = [
  { tab: 'home',         title: '01 — Home',           waitFor: '#kpi-years' },
  { tab: 'live',         title: '02 — This Week',       waitFor: '#chart-live-main' },
  { tab: 'transition',   title: '03 — Energy Mix',      waitFor: '#chart-mix' },
  { tab: 'prices',       title: '04 — Price Story',     waitFor: '#chart-price' },
  { tab: 'emissions',    title: '05 — Emissions',       waitFor: '#chart-intensity' },
  { tab: 'market-value', title: '06 — Market Value',    waitFor: '#chart-mv-bar' },
  { tab: 'sql',          title: '07 — SQL Showcase',    waitFor: '.sql-tab' },
  { tab: 'literacy',     title: '08 — Market Literacy', waitFor: '.literacy-card' },
];

fs.mkdirSync(OUT_DIR, { recursive: true });

async function capture(browser, tab, title, waitFor, index) {
  const page = await browser.newPage();

  // A4 landscape viewport — gives charts enough width
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1.5 });

  // Load page and activate the right tab
  await page.goto(BASE_URL, { waitUntil: 'networkidle2', timeout: 30000 });

  // Click the nav tab to switch to this section
  await page.evaluate((tabId) => {
    const link = document.querySelector(`.nav-links a[data-tab="${tabId}"]`);
    if (link) link.click();
  }, tab);

  // Wait for the section to be visible and its content to appear
  await page.waitForSelector(waitFor, { visible: true, timeout: 20000 });

  // Extra wait for charts to finish rendering
  await new Promise(r => setTimeout(r, 2500));

  // Scroll the section into full view for capture
  await page.evaluate(() => window.scrollTo(0, 0));
  await new Promise(r => setTimeout(r, 300));

  const filename = `${String(index + 1).padStart(2, '0')}_${tab}.pdf`;
  const filepath = path.join(OUT_DIR, filename);

  await page.pdf({
    path: filepath,
    format: 'A4',
    landscape: true,
    printBackground: true,
    margin: { top: '12mm', right: '12mm', bottom: '12mm', left: '12mm' },
    displayHeaderFooter: true,
    headerTemplate: `
      <div style="width:100%;font-family:sans-serif;font-size:9px;color:#6b7280;
                  display:flex;justify-content:space-between;padding:0 12mm;">
        <span>AGL Portfolio — NEM Insights | Aylin Vahabova</span>
        <span>${title}</span>
      </div>`,
    footerTemplate: `
      <div style="width:100%;font-family:sans-serif;font-size:8px;color:#9ca3af;
                  display:flex;justify-content:space-between;padding:0 12mm;">
        <span>Data: Open Electricity (CC BY-NC 4.0) · Dec 1998 – Feb 2026</span>
        <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
      </div>`,
  });

  console.log(`  ✓  ${filename}`);
  await page.close();
  return filepath;
}

function mergePDFs(files, output) {
  // Try Ghostscript first, then Python pypdf
  try {
    const gs = execSync('which gs 2>/dev/null').toString().trim();
    if (gs) {
      const cmd = `gs -dBATCH -dNOPAUSE -q -sDEVICE=pdfwrite -dPDFSETTINGS=/printer -sOutputFile="${output}" ${files.map(f => `"${f}"`).join(' ')}`;
      execSync(cmd);
      console.log(`\n  ✓  Combined PDF: ${output}`);
      return true;
    }
  } catch (_) {}
  try {
    const script = path.join(__dirname, 'merge-pdfs.py');
    execSync(`python3 "${script}" "${output}" ${files.map(f => `"${f}"`).join(' ')}`, { stdio: 'pipe' });
    console.log(`\n  ✓  Combined PDF: ${output}`);
    return true;
  } catch (_) {}
  return false;
}

(async () => {
  console.log('\nAGL Portfolio — PDF Export');
  console.log('='.repeat(40));
  console.log(`Output: ${OUT_DIR}\n`);

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security'],
    defaultViewport: null,
  });

  const files = [];
  for (let i = 0; i < PAGES.length; i++) {
    const { tab, title, waitFor } = PAGES[i];
    process.stdout.write(`  Capturing: ${title.padEnd(28, ' ')} `);
    try {
      const f = await capture(browser, tab, title, waitFor, i);
      files.push(f);
    } catch (err) {
      console.log(`  [error] ${tab}: ${err.message}`);
    }
  }

  await browser.close();

  // Attempt to merge into one PDF
  const combined = path.join(OUT_DIR, 'AGL_Portfolio_Aylin_Vahabova.pdf');
  const merged = mergePDFs(files, combined);

  console.log('\n' + '='.repeat(40));
  if (merged) {
    console.log(`Done! Open: ${combined}`);
  } else {
    console.log(`Done! Individual PDFs saved to: ${OUT_DIR}`);
    console.log(`To merge: install Ghostscript (brew install ghostscript) and re-run.`);
  }
  console.log('');
})();
