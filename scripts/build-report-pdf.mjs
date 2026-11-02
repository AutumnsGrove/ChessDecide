#!/usr/bin/env node
/**
 * Build docs/BENCHMARK-REPORT.pdf from docs/BENCHMARK-REPORT.md: pandoc (Markdown to HTML) then headless
 * Chromium (HTML to PDF), so the PDF can never drift from the Markdown. Then copy it where the site serves it.
 *
 *   node scripts/build-report-pdf.mjs
 *
 * Needs pandoc on PATH. Chromium comes from the Playwright install in apps/web (`pnpm install`).
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const src = join(root, 'docs/BENCHMARK-REPORT.md');
const out = join(root, 'docs/BENCHMARK-REPORT.pdf');
const served = join(root, 'apps/web/static/chessdecide-benchmark-report.pdf');
const TITLE = 'ChessDecide: Benchmarking Decision Models at Chess';

const { chromium } = createRequire(join(root, 'apps/web/package.json'))('@playwright/test');
const dir = mkdtempSync(join(tmpdir(), 'report-pdf-'));
const html = join(dir, 'report.html');
try {
  execFileSync('pandoc', [
    src, '--from', 'gfm', '--to', 'html5', '--standalone', '--embed-resources',
    '--css', join(root, 'docs/report.css'), '--metadata', `pagetitle=${TITLE}`, '--output', html,
  ], { stdio: 'inherit' });

  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(`file://${html}`);
  const small = 'font-size:8px;color:#5d5a54;width:100%;padding:0 0.75in;font-family:-apple-system,Helvetica,Arial,sans-serif;';
  await page.pdf({
    path: out, format: 'Letter', printBackground: true, displayHeaderFooter: true,
    margin: { top: '0.85in', bottom: '0.85in', left: '0.8in', right: '0.8in' },
    headerTemplate: `<div style="${small}">${TITLE}</div>`,
    footerTemplate: `<div style="${small}text-align:right;">Page <span class="pageNumber"></span> of <span class="totalPages"></span></div>`,
  });
  await browser.close();
  copyFileSync(out, served);
  console.log(`wrote ${out} (${readFileSync(out).length} bytes) and ${served}`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
