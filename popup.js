'use strict';

// ── Config ────────────────────────────────────────────────────────
const GEMINI_BASE   = 'https://generativelanguage.googleapis.com/v1beta/models';
const DEFAULT_MODEL = 'gemini-2.5-flash';
const DONATION_URL  = 'https://buy.polar.sh/polar_cl_SLGA6JjOHJqu1vgwar0HrfXFkMMNZsKh1PMWP1zjO3P';

const SYSTEM_PROMPTS = {
  savage: `You are a savage stand-up comedian writing one-liner jokes about websites.
You will receive a page title, URL, and whatever content is available.
Write ONE sharp, funny sentence about this specific website — use the title, URL, content, or any combination.
Even if content is minimal, the URL and title alone are enough for a great joke.
Output only the joke. No intro, no explanation.`,

  british: `You are a dry, deadpan British comedian writing one-liner jokes about websites.
You will receive a page title, URL, and whatever content is available.
Write ONE politely devastating sentence about this specific website — use the title, URL, content, or any combination.
Even if content is minimal, the URL and title alone are enough for a great joke.
Output only the joke. No intro, no explanation.`,

  philosopher: `You are a world-weary philosopher writing one-liner jokes about websites.
You will receive a page title, URL, and whatever content is available.
Write ONE darkly funny existential sentence about this specific website — use the title, URL, content, or any combination.
Even if content is minimal, the URL and title alone are enough for a great joke.
Output only the joke. No intro, no explanation.`,

  boomer: `You are a confused Baby Boomer writing one-liner jokes about websites.
You will receive a page title, URL, and whatever content is available.
Write ONE baffled, old-fashioned sentence about this specific website — use the title, URL, content, or any combination.
Even if content is minimal, the URL and title alone are enough for a great joke.
Output only the joke. No intro, no explanation.`,
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
      func: async () => {
        const clean = s => (s || '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();

        const metaDesc = document.querySelector('meta[name="description"]')?.content
          || document.querySelector('meta[property="og:description"]')?.content
          || '';

        // Level 1: innerText — respects CSS, works for fully rendered pages
        let bodyText = clean(document.body.innerText);

        // Level 2: textContent with noise stripped — catches CSS-hidden content
        if (bodyText.length < 400) {
          const clone = document.body.cloneNode(true);
          clone.querySelectorAll('script,style,noscript,svg,canvas').forEach(el => el.remove());
          bodyText = clean(clone.textContent) || bodyText;
        }

        // Level 3: fetch the raw HTML and parse it — catches SPA shells where DOM is sparse
        if (bodyText.length < 400) {
          try {
            const res  = await fetch(location.href);
            const html = await res.text();
            const doc  = new DOMParser().parseFromString(html, 'text/html');
            doc.querySelectorAll('script,style,noscript').forEach(el => el.remove());
            bodyText = clean(doc.body?.innerText || doc.body?.textContent) || bodyText;
          } catch {}
        }

        const combined = (metaDesc ? metaDesc + '\n\n' : '') + bodyText;
        return {
          title: document.title.trim(),
          url:   location.href,
          text:  combined.slice(0, 5000),
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
        safetySettings: [
          { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_ONLY_HIGH' },
          { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_ONLY_HIGH' },
          { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
          { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
        ],
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message ?? `HTTP ${res.status}`);
    }

    const data = await res.json();
    console.log('[PageRoast] scraped length:', scraped.text.length, '| Gemini response:', JSON.stringify(data).slice(0, 300));

    const blocked = data.promptFeedback?.blockReason;
    if (blocked) throw new Error(`Blocked: ${blocked}`);

    lastRoast = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? '';
    if (!lastRoast) throw new Error('No response from model');
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
