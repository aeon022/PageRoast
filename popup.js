'use strict';

// ── Config ────────────────────────────────────────────────────────
const GEMINI_BASE   = 'https://generativelanguage.googleapis.com/v1beta/models';
const DEFAULT_MODEL = 'gemini-2.5-flash';
const DONATION_URL  = 'https://buy.polar.sh/polar_cl_SLGA6JjOHJqu1vgwar0HrfXFkMMNZsKh1PMWP1zjO3P';

const SYSTEM_PROMPTS = {
  savage: `You are a savage stand-up comedian roasting websites.
Read the page content carefully. Find something specific — an actual claim, product, headline, phrase, or topic on this page — and write ONE sharp, funny joke about it.
The joke must reference something real from the content. No generic "this website" jokes.
Output only the joke. Nothing else.`,

  british: `You are a dry, deadpan British comedian roasting websites.
Read the page content carefully. Find something specific — an actual claim, product, headline, phrase, or topic on this page — and write ONE politely devastating sentence about it.
The joke must reference something real from the content. No generic "this website" jokes.
Output only the joke. Nothing else.`,

  philosopher: `You are a world-weary philosopher roasting websites.
Read the page content carefully. Find something specific — an actual claim, product, headline, phrase, or topic on this page — and write ONE darkly funny existential observation about it.
The joke must reference something real from the content. Reference a philosopher only if it fits naturally.
Output only the joke. Nothing else.`,

  boomer: `You are a confused Baby Boomer roasting websites.
Read the page content carefully. Find something specific — an actual claim, product, service, or topic on this page — and write ONE baffled, old-fashioned joke about it.
The joke must reference something real from the content. No generic "this website" jokes.
Output only the joke. Nothing else.`,
};

// ── State ─────────────────────────────────────────────────────────
let apiKey     = '';
let geminiModel = DEFAULT_MODEL;
let roastStyle = 'savage';
let lastRoast  = '';
let view       = 'main';

// ── DOM ───────────────────────────────────────────────────────────
const elRoastOutput  = document.getElementById('roast-output');
const elRoastMeta    = document.getElementById('roast-meta');
const elBtnRoast     = document.getElementById('btn-roast');
const elActionRow    = document.getElementById('action-row');
const elBtnCopy      = document.getElementById('btn-copy');
const elBtnAgain     = document.getElementById('btn-again');
const elBtnSettings  = document.getElementById('btn-settings');
const elBtnSave      = document.getElementById('btn-save-settings');
const elViewMain     = document.getElementById('view-main');
const elViewSettings = document.getElementById('view-settings');
const elApiKeyInput   = document.getElementById('input-apikey');
const elModelInput    = document.getElementById('input-model');
const elDonate       = document.getElementById('btn-donate');

// ── Init ──────────────────────────────────────────────────────────
async function init() {
  const data  = await chrome.storage.local.get(['apiKey', 'roastStyle', 'geminiModel']);
  apiKey      = data.apiKey      || '';
  roastStyle  = data.roastStyle  || 'savage';
  geminiModel = data.geminiModel || DEFAULT_MODEL;
  elDonate.href = DONATION_URL;
  syncStylePicker();
}

// ── Views ─────────────────────────────────────────────────────────
function showView(v) {
  view = v;
  elViewMain.classList.toggle('hidden', v !== 'main');
  elViewSettings.classList.toggle('hidden', v !== 'settings');
  if (v === 'settings') {
    elApiKeyInput.value = apiKey;
    elModelInput.value  = geminiModel;
    syncStylePicker();
  }
}

elBtnSettings.addEventListener('click', () => {
  showView(view === 'settings' ? 'main' : 'settings');
});

elBtnSave.addEventListener('click', async () => {
  apiKey      = elApiKeyInput.value.trim();
  geminiModel = elModelInput.value.trim() || DEFAULT_MODEL;
  await chrome.storage.local.set({ apiKey, roastStyle, geminiModel });
  showView('main');
  if (apiKey) toast('Settings saved');
  else toast('API key missing', 'error');
});

// ── Style picker ──────────────────────────────────────────────────
function syncStylePicker() {
  document.querySelectorAll('.style-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.style === roastStyle);
  });
}

document.getElementById('style-picker').addEventListener('click', e => {
  const btn = e.target.closest('.style-btn');
  if (!btn) return;
  roastStyle = btn.dataset.style;
  syncStylePicker();
});

// ── Roast ─────────────────────────────────────────────────────────
elBtnRoast.addEventListener('click', doRoast);
elBtnAgain.addEventListener('click', doRoast);

async function doRoast() {
  if (!apiKey) {
    showView('settings');
    toast('Add your API key first', 'error');
    return;
  }

  setLoading(true);
  elActionRow.classList.add('hidden');

  // Scrape page
  let scraped;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    [scraped]   = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const txt = el => (el?.innerText || el?.textContent || '').replace(/\s+/g, ' ').trim();

        // Meta description
        const metaDesc = document.querySelector('meta[name="description"]')?.content
          || document.querySelector('meta[property="og:description"]')?.content
          || '';

        // All headings (great for news homepages — many article titles)
        const headings = [...document.querySelectorAll('h1, h2, h3')]
          .map(el => txt(el)).filter(Boolean).join(' | ');

        // For article pages: grab article body paragraphs
        const articleText = [...document.querySelectorAll('article p, main p, [role="main"] p')]
          .map(el => txt(el)).filter(t => t.length > 40).slice(0, 20).join(' ');

        // Fallback: full body minus pure noise
        const clone = document.body.cloneNode(true);
        ['script','style','noscript','nav','footer','aside',
         '[aria-hidden="true"]','[role="navigation"]','[role="banner"]',
         '.cookie','[class*="cookie"]','[class*="consent"]','[class*="banner"]',
         '[class*="newsletter"]','[class*="paywall"]'].forEach(s =>
          clone.querySelectorAll(s).forEach(el => el.remove()));
        const body = txt(clone);

        // Combine: meta + headings + article paragraphs (or body fallback)
        const combined = [metaDesc, headings, articleText || body]
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 4000);

        return {
          title: document.title.trim(),
          url:   location.href,
          text:  combined,
        };
      },
    });
    scraped = scraped.result;
  } catch {
    setLoading(false);
    toast('Could not read this page', 'error');
    return;
  }

  // Build prompt
  const userMsg = `Title: ${scraped.title}\nURL: ${scraped.url}\n\nContent:\n${scraped.text}`;

  try {
    const res  = await fetch(`${GEMINI_BASE}/${geminiModel}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPTS[roastStyle] ?? SYSTEM_PROMPTS.savage }] },
        contents: [{ parts: [{ text: userMsg }] }],
        generationConfig: { maxOutputTokens: 150 },
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message ?? `HTTP ${res.status}`);
    }

    const data = await res.json();
    lastRoast  = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? '';
    showRoast(lastRoast, scraped.title);

  } catch (err) {
    setLoading(false);
    toast(err.message.slice(0, 60), 'error');
  }
}

function showRoast(text, pageTitle) {
  setLoading(false);
  elRoastOutput.classList.remove('roast-output--empty', 'roast-output--loading');
  elRoastOutput.textContent = text;
  elRoastMeta.textContent   = `🔥 ${pageTitle.slice(0, 50)}`;
  elRoastMeta.classList.remove('hidden');
  elActionRow.classList.remove('hidden');
}

function setLoading(on) {
  elBtnRoast.disabled = on;
  if (on) {
    elRoastOutput.classList.add('roast-output--loading');
    elRoastOutput.classList.remove('roast-output--empty');
    elRoastOutput.textContent = '';
    elRoastMeta.classList.add('hidden');
  }
}

// ── Copy ──────────────────────────────────────────────────────────
elBtnCopy.addEventListener('click', async () => {
  if (!lastRoast) return;
  try {
    await navigator.clipboard.writeText(lastRoast);
    toast('Copied!');
  } catch {
    toast('Clipboard error', 'error');
  }
});

// ── Toast ─────────────────────────────────────────────────────────
let toastTimer = null;
function toast(msg, type = 'success') {
  let el = document.querySelector('.toast');
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast';
    document.getElementById('app').appendChild(el);
  }
  el.textContent = msg;
  el.className   = `toast toast--${type} toast--visible`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('toast--visible'), 2200);
}

init();
