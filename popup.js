'use strict';

// ── Config ────────────────────────────────────────────────────────
const GEMINI_BASE   = 'https://generativelanguage.googleapis.com/v1beta/models';
const DEFAULT_MODEL = 'gemini-2.0-flash';
const FALLBACK_MODELS = ['gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash'];

const SYSTEM_PROMPTS = {
  savage: `You are a savage stand-up comedian. Write a sharp, funny, creative roast about the website or article below.
Use anything: the title, URL, headline, or content. Be specific and hilarious.
CRITICAL INSTRUCTION: You MUST complete every sentence fully and end with proper punctuation (. ! or ?). Never leave an unfinished sentence.`,

  cro: `You are a world-class Conversion Rate Optimization (CRO) and UX expert. Write a sharp 3-bullet-point audit about the website or article below:
• 🎯 Headline & Value Prop Grade (A-F)
• 💡 Primary Friction / Readability Point
• ⚡ 1 Specific Fix / Copy Rewrite to improve engagement.
CRITICAL INSTRUCTION: You MUST complete every sentence fully and end with proper punctuation (. ! or ?). Never leave an unfinished sentence.`,

  british: `You are a dry British comedian. Write a politely devastating one-liner or short paragraph about the website below.
Use anything: the name, the URL, what they do, their headlines. Be specific and understated.
CRITICAL INSTRUCTION: You MUST complete every sentence fully and end with proper punctuation (. ! or ?). Never leave an unfinished sentence.`,

  philosopher: `You are a world-weary philosopher. Write a darkly funny existential roast about the website below.
Use anything: the name, the URL, what they do, their content. Be specific.
CRITICAL INSTRUCTION: You MUST complete every sentence fully and end with proper punctuation (. ! or ?). Never leave an unfinished sentence.`,
};

// ── State ─────────────────────────────────────────────────────────
let apiKey      = '';
let geminiModel = DEFAULT_MODEL;
let roastStyle  = 'savage';
let lastRoast   = '';
let view        = 'main';

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
const elApiKeyInput  = document.getElementById('input-apikey');
const elModelInput   = document.getElementById('input-model');

// ── Init ──────────────────────────────────────────────────────────
async function init() {
  const data  = await chrome.storage.local.get(['apiKey', 'roastStyle', 'geminiModel']);
  apiKey      = data.apiKey      || '';
  roastStyle  = data.roastStyle  || 'savage';
  geminiModel = data.geminiModel || DEFAULT_MODEL;
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

elBtnSettings.addEventListener('click', () => showView(view === 'settings' ? 'main' : 'settings'));

elBtnSave.addEventListener('click', async () => {
  apiKey      = elApiKeyInput.value.trim();
  geminiModel = elModelInput.value.trim() || DEFAULT_MODEL;
  await chrome.storage.local.set({ apiKey, roastStyle, geminiModel });
  showView('main');
  toast(apiKey ? 'Settings saved' : 'API key missing', apiKey ? 'success' : 'error');
});

// ── Style picker ──────────────────────────────────────────────────
function syncStylePicker() {
  document.querySelectorAll('.style-tab, .style-btn').forEach(btn =>
    btn.classList.toggle('active', btn.dataset.style === roastStyle));
}

document.getElementById('style-tabs')?.addEventListener('click', async e => {
  const btn = e.target.closest('.style-tab');
  if (!btn) return;
  roastStyle = btn.dataset.style;
  syncStylePicker();
  await chrome.storage.local.set({ roastStyle });
});

// ── Scrape ────────────────────────────────────────────────────────
function scrapePage() {
  try {
    const meta = document.querySelector('meta[name="description"]')?.content
      || document.querySelector('meta[property="og:description"]')?.content
      || '';

    let body = document.body.innerText || '';

    if (body.trim().length < 100) {
      const clone = document.body.cloneNode(true);
      clone.querySelectorAll('script, style, noscript').forEach(el => el.remove());
      body = clone.textContent || '';
    }

    const text = (meta + '\n' + body)
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/\n{4,}/g, '\n\n')
      .trim()
      .slice(0, 5000);

    return { title: document.title || '', url: location.href, text };
  } catch (e) {
    return { title: document.title || '', url: location.href, text: '' };
  }
}

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

  // Scrape page via content script
  let scraped = null;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: scrapePage,
    });
    scraped = results?.[0]?.result ?? null;
  } catch (e) {
    setLoading(false);
    toast('Cannot read this page', 'error');
    return;
  }

  if (!scraped || !scraped.url) {
    setLoading(false);
    toast('Cannot read this page', 'error');
    return;
  }

  // Build prompt
  const userMsg = `Website Title: ${scraped.title}\nURL: ${scraped.url}\n\nContent:\n${scraped.text}`.trim();
  const promptText = SYSTEM_PROMPTS[roastStyle] || SYSTEM_PROMPTS.savage;

  const modelsToTry = [geminiModel, ...FALLBACK_MODELS.filter(m => m !== geminiModel)];
  let lastError = null;

  for (const model of modelsToTry) {
    try {
      const res = await fetch(`${GEMINI_BASE}/${model}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: promptText }] },
          contents: [{ parts: [{ text: userMsg }] }],
          generationConfig: { maxOutputTokens: 2000, temperature: 0.7 },
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
      const candidate = data.candidates?.[0];
      const text = candidate?.content?.parts?.[0]?.text?.trim();

      if (text) {
        lastRoast = ensureCompleteSentence(text);
        showRoast(lastRoast, scraped.title);
        return;
      }

      if (candidate?.finishReason) {
        throw new Error(`Gemini status: ${candidate.finishReason}`);
      }
    } catch (err) {
      lastError = err;
    }
  }

  setLoading(false);
  toast(lastError?.message?.slice(0, 70) || 'Failed to generate roast', 'error');
}

function ensureCompleteSentence(text) {
  if (!text) return '';
  const trimmed = text.trim();

  // If text ends cleanly with punctuation or quote mark, return as is
  if (/[.!?”"]$/.test(trimmed)) return trimmed;

  // Find last valid sentence-ending punctuation
  const lastIndex = Math.max(
    trimmed.lastIndexOf('.'),
    trimmed.lastIndexOf('!'),
    trimmed.lastIndexOf('?')
  );

  if (lastIndex > 20) {
    return trimmed.slice(0, lastIndex + 1);
  }

  return trimmed + '.';
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
  toastTimer = setTimeout(() => el.classList.remove('toast--visible'), 3500);
}

init();
