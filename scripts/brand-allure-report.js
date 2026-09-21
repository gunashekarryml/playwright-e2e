#!/usr/bin/env node
// Lightly brands the generated static Allure report: a wordmark watermark,
// a monogram favicon, and a custom tab title. Deliberately avoids touching
// Allure's internal component classes (minified/versioned React app) so
// this keeps working across Allure upgrades instead of silently breaking.
const fs = require('fs');
const path = require('path');

const reportDir = process.argv[2] ?? 'allure-report';
const indexPath = path.join(reportDir, 'index.html');

if (!fs.existsSync(indexPath)) {
  console.log(`No ${indexPath} found, skipping report branding.`);
  process.exit(0);
}

const BRAND_NAME = process.env.ALLURE_BRAND_NAME ?? 'Code & Theory';
const ACCENT = process.env.ALLURE_BRAND_ACCENT ?? '#c9a227';

const faviconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="#111111"/><text x="32" y="41" font-family="Georgia, 'Times New Roman', serif" font-size="24" font-weight="700" fill="${ACCENT}" text-anchor="middle">C&amp;T</text></svg>`;
const faviconHref = `data:image/svg+xml,${encodeURIComponent(faviconSvg)}`;

const customDir = path.join(reportDir, 'custom');
fs.mkdirSync(customDir, { recursive: true });

const customCss = `
@keyframes ct-fade-in {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes ct-shimmer {
  0% { background-position: -120px 0; }
  100% { background-position: 220px 0; }
}

body::before {
  content: "${BRAND_NAME}";
  position: fixed;
  top: 10px;
  left: 18px;
  z-index: 10000;
  font-family: Georgia, 'Times New Roman', serif;
  font-weight: 700;
  font-size: 13px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  padding: 4px 10px;
  color: #111;
  background: linear-gradient(90deg, #f4f4f4 0%, #ffffff 40%, #f4f4f4 80%);
  background-size: 200px 100%;
  border-bottom: 2px solid ${ACCENT};
  border-radius: 3px 3px 0 0;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
  animation: ct-fade-in 0.4s ease-out, ct-shimmer 6s ease-in-out infinite;
  pointer-events: none;
}

::-webkit-scrollbar { width: 10px; height: 10px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: ${ACCENT}; border-radius: 6px; opacity: 0.6; }
::-webkit-scrollbar-thumb:hover { opacity: 0.9; }
`;
fs.writeFileSync(path.join(customDir, 'custom.css'), `${customCss.trim()}\n`);

// A real logo drops in at assets/logo.(svg|png) and gets copied alongside
// the wordmark CSS above; wire it in by uncommenting an <img> in custom.css
// or extending this script once the file exists.
const repoLogo = ['svg', 'png'].map((ext) => path.join('assets', `logo.${ext}`)).find((p) => fs.existsSync(p));
if (repoLogo) {
  fs.copyFileSync(repoLogo, path.join(customDir, path.basename(repoLogo)));
  console.log(`Copied ${repoLogo} into ${customDir} (not yet referenced by custom.css).`);
}

let html = fs.readFileSync(indexPath, 'utf8');

if (!html.includes('custom/custom.css')) {
  html = html.replace('</head>', '  <link rel="stylesheet" href="custom/custom.css">\n</head>');
}

html = /<link rel="icon"[^>]*>/i.test(html)
  ? html.replace(/<link rel="icon"[^>]*>/i, `<link rel="icon" type="image/svg+xml" href="${faviconHref}">`)
  : html.replace('</head>', `  <link rel="icon" type="image/svg+xml" href="${faviconHref}">\n</head>`);

html = html.replace(/<title>[^<]*<\/title>/i, `<title>${BRAND_NAME} — Playwright E2E Report</title>`);

fs.writeFileSync(indexPath, html);
console.log(`Branded ${indexPath} with the "${BRAND_NAME}" wordmark, a monogram favicon, and a custom tab title.`);
