import puppeteer from 'puppeteer';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const url = process.argv[2] || 'http://localhost:3000';
const label = process.argv[3]; // optional
const mode = process.argv[4] || 'desktop'; // desktop | mobile | full
const anchor = process.argv[5]; // optional — section id to scroll to (e.g. #problem)

const VIEWPORTS = {
  desktop: { width: 1440, height: 900, deviceScaleFactor: 2 },
  mobile:  { width: 390,  height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  full:    { width: 1440, height: 900, deviceScaleFactor: 2 },
};

const SHOT_DIR = path.join(__dirname, 'temporary screenshots');
await fs.mkdir(SHOT_DIR, { recursive: true });

// Find next available screenshot-N.png
const existing = await fs.readdir(SHOT_DIR);
const nums = existing
  .map(f => f.match(/^screenshot-(\d+)/))
  .filter(Boolean)
  .map(m => parseInt(m[1], 10));
const next = (nums.length ? Math.max(...nums) : 0) + 1;
const labelSuffix = label ? `-${label}` : '';
const filename = `screenshot-${next}${labelSuffix}.png`;
const outPath = path.join(SHOT_DIR, filename);

console.log(`Launching browser → ${url}`);
const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
});

try {
  const page = await browser.newPage();
  await page.setViewport(VIEWPORTS[mode]);
  await page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 });

  // Wait until any 3D scene loader fades out, or 5s, whichever comes first
  try {
    await page.waitForFunction(
      () => {
        const loaders = document.querySelectorAll('.scene-loader');
        if (!loaders.length) return true;
        return Array.from(loaders).every(l => !document.body.contains(l));
      },
      { timeout: 5000 }
    );
  } catch { /* fall through */ }

  await new Promise(r => setTimeout(r, 600));

  const fullPage = mode === 'full' || mode === 'desktop';
  // If label contains "viewport", force viewport-only
  const viewportOnly = label && label.includes('viewport');

  // Scroll to a specific anchor if provided
  if (anchor) {
    await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (el) el.scrollIntoView({ block: 'start', behavior: 'instant' });
    }, anchor.startsWith('#') ? anchor : '#' + anchor);
    await new Promise(r => setTimeout(r, 400));
  }

  await page.screenshot({
    path: outPath,
    fullPage: (viewportOnly || anchor) ? false : fullPage,
  });

  console.log(`Saved → temporary screenshots/${filename}`);
} finally {
  await browser.close();
}
