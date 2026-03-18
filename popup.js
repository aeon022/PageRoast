'use strict';

// ── Config ────────────────────────────────────────────────────────
const GEMINI_BASE   = 'https://generativelanguage.googleapis.com/v1beta/models';
const DEFAULT_MODEL = 'gemini-2.5-flash';
const DONATION_URL  = 'https://buy.polar.sh/polar_cl_SLGA6JjOHJqu1vgwar0HrfXFkMMNZsKh1PMWP1zjO3P';

const SYSTEM_PROMPTS = {
  savage: `You are a savage stand-up comedian. Your job: roast the given website in ONE punchy, funny sentence.
Use the page title, URL, and content to make it specific and sharp. Be merciless but clever.
Output only the roast sentence — no intro, no explanation, no follow-up. Just one line.
Example output: "This site spent more on stock photos of laptops than on actual content."`,

  british: `You are a dry, deadpan British comedian. Your job: roast the given website in ONE sentence — politely devastating, slightly bored.
Use the page title, URL, and content to make it specific. Understated disdain only.
Output only the roast sentence — no intro, no explanation, no follow-up. Just one line.
Example output: "I've seen more personality in a tax return, but do carry on."`,

  philosopher: `You are a world-weary philosopher. Your job: roast the given website in ONE darkly funny existential sentence.
Use the page title, URL, and content. Reference Camus, Nietzsche, or Sartre only if it fits naturally.
Output only the roast sentence — no intro, no explanation, no follow-up. Just one line.
Example output: "Sisyphus had a boulder; this website has a newsletter sign-up pop-up — same thing, really."`,

  boomer: `You are a confused Baby Boomer who doesn't understand the internet. Your job: roast the given website in ONE baffled sentence.
Use the page title, URL, and content. Compare to the good old days.
Output only the roast sentence — no intro, no explanation, no follow-up. Just one line.
Example output: "Back in my day, if you wanted to read nothing useful, you'd at least have to drive to the library."`,
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
        const clone = document.body.cloneNode(true);
        ['script','style','nav','header','footer','aside',
         '[aria-hidden="true"]'].forEach(s =>
          clone.querySelectorAll(s).forEach(el => el.remove()));
        return {
          title: document.title.trim(),
          url:   location.href,
          text:  (clone.innerText || clone.textContent || '')
                   .replace(/\s+/g, ' ').trim().slice(0, 1500),
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
        generationConfig: { maxOutputTokens: 120 },
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
