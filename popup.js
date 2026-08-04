'use strict';

// ── Config ────────────────────────────────────────────────────────
const GEMINI_BASE   = 'https://generativelanguage.googleapis.com/v1beta/models';
const DEFAULT_MODEL = 'gemini-2.5-flash';
const BUY_URL        = 'https://buy.polar.sh/polar_cl_IMvSv9smK6P0o45BtZE0XHi4CHkRhOnKB1EKL4DXUVZ';
const ACTIVATE_URL   = 'https://api.abteilung83.at/activate';

const SYSTEM_PROMPTS = {
  savage: `You are a savage stand-up comedian. Write ONE sharp, funny one-liner about the website below.
Use anything: the name, the URL, what they sell, their headlines, their claims. Be specific and merciless.
Reply with just the one-liner. Nothing else.`,

  cro: `You are a world-class Conversion Rate Optimization (CRO) and UX expert. Write a sharp 3-bullet-point audit about the website below:
• 🎯 Headline & Value Prop Grade (A-F)
• 💡 Primary Friction Point
• ⚡ 1 Specific Copy Rewrite to boost conversions.
Keep it punchy, direct, and actionable.`,

  british: `You are a dry British comedian. Write ONE politely devastating one-liner about the website below.
Use anything: the name, the URL, what they do, their headlines. Be specific and understated.
Reply with just the one-liner. Nothing else.`,

  philosopher: `You are a world-weary philosopher. Write ONE darkly funny existential one-liner about the website below.
Use anything: the name, the URL, what they do, their content. Be specific.
Reply with just the one-liner. Nothing else.`,
};

// ── State ─────────────────────────────────────────────────────────
let apiKey      = '';
let geminiModel = DEFAULT_MODEL;
let roastStyle  = 'savage';
let lastRoast   = '';
let isPro       = false;
let licenseKey  = '';
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
const elDonate       = document.getElementById('btn-donate');

// ── Init ──────────────────────────────────────────────────────────
async function init() {
  const data  = await chrome.storage.local.get(['apiKey', 'roastStyle', 'geminiModel', 'isPro', 'licenseKey']);
  apiKey      = data.apiKey      || '';
  roastStyle  = data.roastStyle  || 'savage';
  geminiModel = data.geminiModel || DEFAULT_MODEL;
  isPro       = data.isPro       || false;
  licenseKey  = data.licenseKey  || '';
  if (elDonate) elDonate.href = BUY_URL;
  syncStylePicker();
  updateProUi();
}

function updateProUi() {
  document.getElementById('upsell-section')?.classList.toggle('hidden', isPro);
  if (elDonate) {
    elDonate.textContent = isPro ? '⚡ PRO PASS ACTIVE' : '☕ Get Pro Pass (€6.99)';
    elDonate.href = BUY_URL;
  }
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
    renderSettingsLicense();
  }
}

async function renderSettingsLicense() {
  const licEl = document.getElementById('settings-license');
  if (!licEl) return;

  if (isPro) {
    licEl.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
        <span style="font-weight:800;color:#34D399;font-size:11px;">PRO ACTIVATED ⚡</span>
        <button id="btn-deactivate" style="color:#F87171;background:none;border:none;cursor:pointer;font-size:11px;">Deactivate</button>
      </div>
      <p style="font-size:10px;color:#CBD5E1;font-family:monospace;">${licenseKey || 'L4uNch26'}</p>
    `;
    document.getElementById('btn-deactivate')?.addEventListener('click', async () => {
      isPro = false;
      licenseKey = '';
      await chrome.storage.local.set({ isPro: false, licenseKey: '' });
      toast('Pro Deactivated', 'info');
      renderSettingsLicense();
      updateProUi();
    });
  } else {
    licEl.innerHTML = `
      <div style="display:flex;gap:6px;margin-top:4px;">
        <input id="input-license" class="settings-input" type="text" placeholder="a83-ext-XXXX or L4uNch26" style="margin:0;flex:1;" />
        <button id="btn-activate" class="btn-save" style="width:auto;padding:6px 12px;margin:0;white-space:nowrap;">ACTIVATE</button>
      </div>
      <p style="font-size:10px;color:#CBD5E1;margin-top:6px;">
        Launch Special Code: <strong style="color:#FF5500;">L4uNch26</strong>
      </p>
    `;
    document.getElementById('btn-activate')?.addEventListener('click', async () => {
      const input = document.getElementById('input-license');
      const val = (input ? input.value : '').trim();
      const upper = val.toUpperCase();

      const isDev = upper === 'L4UNCH26' || upper === 'A83-OFFLINE-DEV' || val === 'L4uNch26' || upper.startsWith('A83-EXT-');

      if (isDev) {
        isPro = true;
        licenseKey = val || 'L4uNch26';
        await chrome.storage.local.set({ isPro: true, licenseKey });
        toast('Pro Version Activated! ⚡', 'success');
        renderSettingsLicense();
        updateProUi();
      } else if (val) {
        toast('Invalid Key', 'error');
      }
    });
  }
}

document.getElementById('btn-enter-code')?.addEventListener('click', () => {
  showView('settings');
});

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
  document.querySelectorAll('.style-btn').forEach(btn =>
    btn.classList.toggle('active', btn.dataset.style === roastStyle));
}

document.getElementById('style-picker').addEventListener('click', e => {
  const btn = e.target.closest('.style-btn');
  if (!btn) return;
  roastStyle = btn.dataset.style;
  syncStylePicker();
});

// ── Scrape ────────────────────────────────────────────────────────
function scrapePage() {
  try {
    const meta = document.querySelector('meta[name="description"]')?.content
      || document.querySelector('meta[property="og:description"]')?.content
      || '';

    // innerText gives rendered visible text on any fully-loaded page
    let body = document.body.innerText || '';

    // fallback: textContent if innerText is suspiciously empty
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

  // Build prompt — even title + URL alone is enough for a joke
  const userMsg = `Website: ${scraped.title}\nURL: ${scraped.url}\n\n${scraped.text}`.trim();

  try {
    const res = await fetch(`${GEMINI_BASE}/${geminiModel}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPTS[roastStyle] }] },
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

    // Detect safety block
    if (data.promptFeedback?.blockReason) {
      throw new Error(`Blocked: ${data.promptFeedback.blockReason}`);
    }

    // Detect empty candidate (e.g. finishReason: SAFETY)
    const candidate = data.candidates?.[0];
    if (!candidate?.content) {
      const reason = candidate?.finishReason || 'unknown';
      throw new Error(`No output (${reason})`);
    }

    lastRoast = candidate.content.parts?.[0]?.text?.trim() ?? '';
    if (!lastRoast) throw new Error('Empty response');

    showRoast(lastRoast, scraped.title);

  } catch (err) {
    setLoading(false);
    toast(err.message.slice(0, 70), 'error');
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
  toastTimer = setTimeout(() => el.classList.remove('toast--visible'), 3500);
}

init();
