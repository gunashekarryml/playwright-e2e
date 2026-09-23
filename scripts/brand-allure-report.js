#!/usr/bin/env node
// Brands the generated static Allure report: a rainbow-gradient wordmark,
// an animated top bar, ambient floating particles, and a monogram favicon.
// Deliberately implemented as an overlay (fixed-position, pointer-events:
// none, its own DOM nodes) rather than restyling Allure's internal
// component classes (minified/versioned React app), so it keeps working
// across Allure upgrades instead of silently breaking, and never blocks
// clicks on the real report underneath.
const fs = require('fs');
const path = require('path');

const reportDir = process.argv[2] ?? 'allure-report';
const indexPath = path.join(reportDir, 'index.html');

if (!fs.existsSync(indexPath)) {
  console.log(`No ${indexPath} found, skipping report branding.`);
  process.exit(0);
}

const BRAND_NAME = process.env.ALLURE_BRAND_NAME ?? 'Code & Theory';
const ACCENT = process.env.ALLURE_BRAND_ACCENT ?? '#ff3cac';
const RAINBOW = ['#ff3cac', '#784ba0', '#2b86c5', '#2be0c5', '#fbc02d', '#ff3cac'].join(', ');

const faviconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="#111111"/><text x="32" y="41" font-family="Georgia, 'Times New Roman', serif" font-size="24" font-weight="700" fill="${ACCENT}" text-anchor="middle">C&amp;T</text></svg>`;
const faviconHref = `data:image/svg+xml,${encodeURIComponent(faviconSvg)}`;

const customDir = path.join(reportDir, 'custom');
fs.mkdirSync(customDir, { recursive: true });

const customCss = `
@import url('https://fonts.googleapis.com/css2?family=Baloo+2:wght@700;800&display=swap');

@keyframes ct-fade-in {
  from { opacity: 0; transform: translateY(-4px) scale(0.9); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes ct-wiggle {
  0%, 100% { rotate: -1.5deg; }
  50% { rotate: 1.5deg; }
}
@keyframes ct-gradient-shift {
  0% { background-position: 0% 50%; }
  100% { background-position: 300% 50%; }
}
@keyframes ct-rainbow-sweep {
  0% { background-position: 0% 50%; }
  100% { background-position: 200% 50%; }
}
@keyframes ct-float-up {
  0% { transform: translate(0, 0) rotate(0deg); opacity: 0; }
  10% { opacity: 0.4; }
  90% { opacity: 0.4; }
  100% { transform: translate(var(--ct-drift, 0px), -120vh) rotate(360deg); opacity: 0; }
}

body::after {
  content: "";
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 5px;
  z-index: 10002;
  background: linear-gradient(90deg, ${RAINBOW});
  background-size: 200% 100%;
  animation: ct-rainbow-sweep 6s linear infinite;
  pointer-events: none;
}

body::before {
  content: "${BRAND_NAME}";
  position: fixed;
  top: 7px;
  left: 18px;
  z-index: 10001;
  font-family: 'Baloo 2', Georgia, sans-serif;
  font-weight: 800;
  font-size: 12px;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  padding: 4px 12px;
  border-radius: 999px;
  color: #fff;
  background: linear-gradient(90deg, ${RAINBOW});
  background-size: 300% 100%;
  box-shadow: 0 2px 16px rgba(0, 0, 0, 0.25), 0 0 20px rgba(255, 60, 172, 0.35);
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
  transform-origin: center left;
  animation:
    ct-fade-in 0.5s ease-out,
    ct-gradient-shift 5s linear infinite,
    ct-wiggle 3.2s ease-in-out infinite;
  pointer-events: none;
}

.ct-particle {
  position: fixed;
  bottom: -10vh;
  z-index: 9990;
  opacity: 0;
  pointer-events: none;
  animation-name: ct-float-up;
  animation-timing-function: linear;
  animation-iteration-count: infinite;
  will-change: transform, opacity;
}

@media (prefers-reduced-motion: reduce) {
  body::before,
  body::after,
  .ct-particle {
    animation: none !important;
  }
}

::-webkit-scrollbar { width: 10px; height: 10px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb {
  background: linear-gradient(180deg, #ff3cac, #2b86c5, #2be0c5);
  border-radius: 6px;
  opacity: 0.7;
}
::-webkit-scrollbar-thumb:hover { opacity: 1; }
`;
fs.writeFileSync(path.join(customDir, 'custom.css'), `${customCss.trim()}\n`);

const particlesJs = `
(function () {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var emoji = ['\\u2728', '\\ud83c\\udf89', '\\ud83d\\ude80', '\\ud83c\\udf08', '\\ud83d\\udca5', '\\u2b50'];
  var count = 16;

  for (var i = 0; i < count; i++) {
    var el = document.createElement('span');
    el.className = 'ct-particle';
    el.textContent = emoji[Math.floor(Math.random() * emoji.length)];
    el.style.left = Math.random() * 100 + 'vw';
    el.style.fontSize = (14 + Math.random() * 14) + 'px';
    el.style.setProperty('--ct-drift', (Math.random() * 160 - 80) + 'px');

    var duration = 10 + Math.random() * 12;
    el.style.animationDuration = duration + 's';
    el.style.animationDelay = -(Math.random() * duration) + 's';

    document.body.appendChild(el);
  }
})();
`;
fs.writeFileSync(path.join(customDir, 'particles.js'), `${particlesJs.trim()}\n`);

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
  html = html.replace(
    '</head>',
    '  <link rel="stylesheet" href="custom/custom.css">\n  <script defer src="custom/particles.js"></script>\n</head>',
  );
}

html = /<link rel="icon"[^>]*>/i.test(html)
  ? html.replace(/<link rel="icon"[^>]*>/i, `<link rel="icon" type="image/svg+xml" href="${faviconHref}">`)
  : html.replace('</head>', `  <link rel="icon" type="image/svg+xml" href="${faviconHref}">\n</head>`);

html = html.replace(/<title>[^<]*<\/title>/i, `<title>${BRAND_NAME} — Playwright E2E Report</title>`);

fs.writeFileSync(indexPath, html);
console.log(`Branded ${indexPath} with the "${BRAND_NAME}" rainbow wordmark, animated top bar, floating particles, and a monogram favicon.`);
