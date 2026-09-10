import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const SITE_CONFIG_FILE = path.join(rootDir, 'site-config.json');
const DATA_DIR = path.join(rootDir, 'data');
const SITE_CONTENT_FILE = path.join(DATA_DIR, 'site-content.json');
const INDEX_HTML_FILE = path.join(rootDir, 'index.html');
const ASK_FLETCH_FILE = path.join(rootDir, 'ask-fletch.html');
const METADATA_FILE = path.join(rootDir, 'metadata.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function escapeHtmlEntities(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function loadConfig() {
  const paths = [SITE_CONFIG_FILE, SITE_CONTENT_FILE];
  for (const p of paths) {
    if (fs.existsSync(p)) {
      try {
        const raw = fs.readFileSync(p, 'utf-8');
        const data = JSON.parse(raw);
        if (data && (data.textElements || data.designElements)) {
          return data;
        }
      } catch (err) {
        console.warn(`Could not parse ${p}:`, err.message);
      }
    }
  }
  return null;
}

function applySiteContentToHtml(html, content) {
  if (!html || !content) return html;
  const t = content.textElements || {};
  const d = content.designElements || {};

  const brand = t.brandName || 'Ask Fletch';
  const tag = t.brandTag || 'New homes coaching from David R. Fletcher';
  const title = t.welcomeTitle || 'David R. Fletcher Coaching';
  const desc = t.welcomeDescription || 'Ask anything about new home sales, builder relationships, or overcoming buyer objections. Coaching draws directly from course materials.';
  const placeholder = t.inputPlaceholder || 'Ask about pricing, builder relationships, buyer objections...';

  const pageTitle = `${brand} — ${tag}`;
  html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtmlEntities(pageTitle)}</title>`);
  html = html.replace(/<meta\s+name=["']description["']\s+content=["'][\s\S]*?["']\s*\/?>/i, `<meta name="description" content="${escapeHtmlEntities(desc)}" />`);
  html = html.replace(/<meta\s+property=["']og:title["']\s+content=["'][\s\S]*?["']\s*\/?>/i, `<meta property="og:title" content="${escapeHtmlEntities(pageTitle)}" />`);
  html = html.replace(/<meta\s+property=["']og:description["']\s+content=["'][\s\S]*?["']\s*\/?>/i, `<meta property="og:description" content="${escapeHtmlEntities(desc)}" />`);

  if (d.brassColor) html = html.replace(/--brass:\s*[^;]+;/g, `--brass: ${d.brassColor};`);
  if (d.sandColor) html = html.replace(/--sand:\s*[^;]+;/g, `--sand: ${d.sandColor};`);
  if (d.paperColor) html = html.replace(/--paper:\s*[^;]+;/g, `--paper: ${d.paperColor};`);
  if (d.radius) html = html.replace(/--radius:\s*[^;]+;/g, `--radius: ${d.radius};`);

  html = html.replace(/<div class="name" id="brandName">[\s\S]*?<\/div>/i, `<div class="name" id="brandName">${escapeHtmlEntities(brand)}</div>`);
  html = html.replace(/<div class="tag" id="brandTag">[\s\S]*?<\/div>/i, `<div class="tag" id="brandTag">${escapeHtmlEntities(tag)}</div>`);
  html = html.replace(/<h2 id="welcomeTitle">[\s\S]*?<\/h2>/i, `<h2 id="welcomeTitle">${escapeHtmlEntities(title)}</h2>`);
  html = html.replace(/<p id="welcomeDescription">[\s\S]*?<\/p>/i, `<p id="welcomeDescription">${escapeHtmlEntities(desc)}</p>`);
  html = html.replace(/<textarea id="input"\s+placeholder="[\s\S]*?"/i, `<textarea id="input" placeholder="${escapeHtmlEntities(placeholder)}"`);

  if (Array.isArray(t.promptSuggestions) && t.promptSuggestions.length > 0) {
    const pillsHtml = t.promptSuggestions.map(p => {
      const cleanP = p.trim();
      const escapedJs = cleanP.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
      return `        <button class="prompt-pill" onclick="sendPrompt('${escapedJs}')">${escapeHtmlEntities(cleanP)}</button>`;
    }).join('\n');

    html = html.replace(
      /<div class="prompt-suggestions" id="promptSuggestions">[\s\S]*?<\/div>/i,
      `<div class="prompt-suggestions" id="promptSuggestions">\n${pillsHtml}\n      </div>`
    );
  }

  const jsStateRegex = /let currentSiteContent\s*=\s*\{[\s\S]*?\n\s*\};/;
  if (jsStateRegex.test(html)) {
    const replacementJs = `let currentSiteContent = ${JSON.stringify({ textElements: t, designElements: d }, null, 4)};`;
    html = html.replace(jsStateRegex, replacementJs);
  }

  return html;
}

const config = loadConfig();
if (config) {
  console.log('Synchronizing build files with saved configuration...');
  if (fs.existsSync(INDEX_HTML_FILE)) {
    const raw = fs.readFileSync(INDEX_HTML_FILE, 'utf-8');
    const updated = applySiteContentToHtml(raw, config);
    fs.writeFileSync(INDEX_HTML_FILE, updated, 'utf-8');
    if (fs.existsSync(ASK_FLETCH_FILE)) {
      fs.writeFileSync(ASK_FLETCH_FILE, updated, 'utf-8');
    }
  }

  if (fs.existsSync(METADATA_FILE)) {
    try {
      const meta = JSON.parse(fs.readFileSync(METADATA_FILE, 'utf-8'));
      if (config.textElements?.brandName) meta.name = config.textElements.brandName;
      if (config.textElements?.brandTag || config.textElements?.welcomeDescription) {
        meta.description = config.textElements.brandTag || config.textElements.welcomeDescription;
      }
      fs.writeFileSync(METADATA_FILE, JSON.stringify(meta, null, 2), 'utf-8');
    } catch (e) {}
  }

  if (!fs.existsSync(SITE_CONTENT_FILE)) {
    fs.writeFileSync(SITE_CONTENT_FILE, JSON.stringify(config, null, 2), 'utf-8');
  }
  if (!fs.existsSync(SITE_CONFIG_FILE)) {
    fs.writeFileSync(SITE_CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
  }
}
console.log('✓ Build file synchronization complete.');
