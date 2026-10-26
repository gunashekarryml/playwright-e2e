#!/usr/bin/env node
// Removes the old "Code & Theory" branding (watermark stylesheet, C&T favicon, custom tab title) from an already
// generated Allure report. Reports generated now are never branded, but the full-regression report kept in the
// CI cache (and published at the site root) may predate that.
const fs = require('fs');
const path = require('path');

const reportDir = process.argv[2] ?? 'allure-report';
const indexPath = path.join(reportDir, 'index.html');
if (!fs.existsSync(indexPath)) process.exit(0);

const html = fs.readFileSync(indexPath, 'utf8');
const clean = html
  .replace(/\s*<link rel="stylesheet" href="custom\/custom\.css">/g, '')
  .replace(/\s*<link rel="icon"[^>]*C%26T[^>]*>/gi, '')
  .replace(/<title>[^<]*Playwright E2E Report<\/title>/i, '<title>Allure Report</title>');
if (clean !== html) {
  fs.writeFileSync(indexPath, clean);
  console.log(`Removed the old branding from ${indexPath}.`);
}
fs.rmSync(path.join(reportDir, 'custom'), { recursive: true, force: true });
