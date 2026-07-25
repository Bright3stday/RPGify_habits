// Builds a small styled static site from the repo's Markdown docs and writes it
// to an output dir (default: dist-site/). A dedicated workflow publishes it to
// the GitHub Pages root, so the project's docs render as a real website instead
// of the bare links page — while apk/ and updates/ are preserved (keep_files).
//
// Deliberately dependency-light: `marked` (a devDependency) for Markdown → HTML,
// everything else is a self-contained inline template (no external CSS/fonts/JS).

import { marked } from 'marked';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const OUT = process.argv[2] || 'dist-site';
mkdirSync(OUT, { recursive: true });

// Public pages (docs/README.md is an internal index — the landing page replaces it).
const PAGES = [
  { file: 'README.md', slug: 'overview', title: 'Overview' },
  { file: 'docs/HOW_IT_WORKS.md', slug: 'how-it-works', title: 'How It Works' },
  { file: 'docs/INSTALL_AND_UPDATE.md', slug: 'install', title: 'Install & Update' },
  { file: 'docs/SECURITY.md', slug: 'security', title: 'Is It Safe?' },
];

// Repo-only docs that aren't published as site pages link to the GitHub file.
const REPO = process.env.GITHUB_REPOSITORY || 'Bright3stday/RPGify_habits';
const GH = `https://github.com/${REPO}/blob/HEAD`;

// Rewrite inter-doc Markdown links to the site's page slugs (or GitHub for
// repo-only docs).
const LINK_MAP = {
  '../README.md': 'overview.html',
  'README.md': 'overview.html',
  'HOW_IT_WORKS.md': 'how-it-works.html',
  'docs/HOW_IT_WORKS.md': 'how-it-works.html',
  'INSTALL_AND_UPDATE.md': 'install.html',
  'docs/INSTALL_AND_UPDATE.md': 'install.html',
  'SECURITY.md': 'security.html',
  'docs/SECURITY.md': 'security.html',
  '../DEVELOPING.md': `${GH}/DEVELOPING.md`,
  'DEVELOPING.md': `${GH}/DEVELOPING.md`,
};
function rewriteLinks(html) {
  let out = html;
  for (const [from, to] of Object.entries(LINK_MAP)) {
    out = out.replaceAll(`href="${from}"`, `href="${to}"`);
  }
  return out;
}

const STYLE = `
  :root{--bg:#0e0e24;--panel:#171736;--ink:#e8e8ff;--dim:#9a9ac8;--line:#2a2a55;
        --purple:#b06af0;--gold:#f0c020;--blue:#48c8ff;--green:#6ad46a}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--ink);
       font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;
       line-height:1.6}
  a{color:var(--blue);text-decoration:none}a:hover{text-decoration:underline}
  code,pre{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
  header.top{position:sticky;top:0;z-index:10;background:rgba(14,14,36,.92);
    backdrop-filter:blur(6px);border-bottom:2px solid var(--line);
    display:flex;align-items:center;gap:16px;flex-wrap:wrap;padding:12px 20px}
  header.top .brand{font-weight:800;letter-spacing:1px;color:var(--gold)}
  header.top nav{display:flex;gap:14px;flex-wrap:wrap}
  header.top nav a{color:var(--dim);font-size:14px}
  header.top nav a.active,header.top nav a:hover{color:var(--ink)}
  .dl{margin-left:auto;background:var(--purple);color:#120a1f;font-weight:700;
      padding:8px 14px;border-radius:8px}
  .dl:hover{text-decoration:none;filter:brightness(1.08)}
  main{max-width:820px;margin:0 auto;padding:28px 20px 80px}
  .hero{text-align:center;padding:56px 16px 24px}
  .hero h1{font-size:40px;margin:0 0 8px;color:var(--gold)}
  .hero p{color:var(--dim);font-size:18px;max-width:640px;margin:0 auto}
  .cta{display:flex;gap:12px;justify-content:center;flex-wrap:wrap;margin:26px 0}
  .cta a{padding:10px 18px;border-radius:8px;font-weight:700}
  .cta .primary{background:var(--purple);color:#120a1f}
  .cta .ghost{border:2px solid var(--line);color:var(--ink)}
  .cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px;margin-top:10px}
  .card{background:var(--panel);border:2px solid var(--line);border-radius:10px;padding:16px 18px}
  .card h3{margin:0 0 6px;color:var(--purple)}.card p{margin:0;color:var(--dim);font-size:14px}
  article h1{color:var(--gold);border-bottom:2px solid var(--line);padding-bottom:8px}
  article h2{color:var(--purple);margin-top:34px}
  article h3{color:var(--blue)}
  article pre{background:#0a0a1c;border:1px solid var(--line);border-radius:8px;
    padding:14px;overflow:auto}
  article code{background:#0a0a1c;border:1px solid var(--line);border-radius:4px;padding:1px 5px}
  article pre code{background:none;border:0;padding:0}
  article table{border-collapse:collapse;width:100%;overflow:auto;display:block}
  article th,article td{border:1px solid var(--line);padding:8px 10px;text-align:left}
  article th{background:var(--panel)}
  article blockquote{border-left:3px solid var(--purple);margin:0;padding:4px 16px;color:var(--dim)}
  footer{border-top:2px solid var(--line);color:var(--dim);font-size:13px;
    text-align:center;padding:24px}
`;

function shell(title, activeSlug, bodyHtml) {
  const nav = PAGES.map((p) =>
    `<a href="${p.slug}.html" class="${p.slug === activeSlug ? 'active' : ''}">${p.title}</a>`).join('');
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} · RPGify Habits</title><style>${STYLE}</style></head>
<body>
<header class="top">
  <a class="brand" href="index.html">RPGify Habits</a>
  <nav>${nav}</nav>
  <a class="dl" href="apk/rpgify-latest.apk">Download APK</a>
</header>
${bodyHtml}
<footer>Offline-first habit RPG · built in public · <a href="security.html">how to verify it's safe</a></footer>
</body></html>`;
}

// Landing page.
const landing = `
<div class="hero">
  <h1>RPGify Habits</h1>
  <p>An offline-first habit tracker gamified as a Final Fantasy character sheet. Real
     habits train six attributes, level your hero, and grow a self-authored mastery tree —
     neglect makes it visibly decay.</p>
  <div class="cta">
    <a class="primary" href="apk/rpgify-latest.apk">Download the APK</a>
    <a class="ghost" href="how-it-works.html">How it works</a>
    <a class="ghost" href="security.html">Is it safe?</a>
  </div>
</div>
<main>
  <div class="cards">
    <div class="card"><h3>Overview</h3><p>What the app is, the screens, and the design.
      <a href="overview.html">Read →</a></p></div>
    <div class="card"><h3>How It Works</h3><p>Every system explained, example by example.
      <a href="how-it-works.html">Read →</a></p></div>
    <div class="card"><h3>Install &amp; Update</h3><p>Get it on your phone; over-the-air updates.
      <a href="install.html">Read →</a></p></div>
    <div class="card"><h3>Is It Safe?</h3><p>Permissions, data flow, and verifying the build.
      <a href="security.html">Read →</a></p></div>
  </div>
  <p style="color:var(--dim);margin-top:24px;font-size:14px">Updates:
    <a href="updates/latest.json">OTA manifest</a> · the installed app checks this on launch.</p>
</main>`;

writeFileSync(join(OUT, 'index.html'), shell('Home', null, landing));

for (const p of PAGES) {
  const md = readFileSync(p.file, 'utf8');
  const body = `<main><article>${rewriteLinks(marked.parse(md))}</article></main>`;
  writeFileSync(join(OUT, `${p.slug}.html`), shell(p.title, p.slug, body));
  console.log(`built ${p.slug}.html from ${p.file}`);
}
console.log(`Docs site written to ${OUT}/`);
