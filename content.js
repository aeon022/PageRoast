'use strict';

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.action !== 'scrape') return;

  const clone = document.body.cloneNode(true);

  // Remove noise
  ['script','style','nav','header','footer','aside',
   '[aria-hidden="true"]','.ad','.advertisement',
   '.cookie','[class*="cookie"]','[class*="banner"]',
   '[class*="popup"]','[class*="modal"]'].forEach(sel => {
    clone.querySelectorAll(sel).forEach(el => el.remove());
  });

  const title   = document.title.trim();
  const url     = location.href;
  const rawText = (clone.innerText || clone.textContent || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 1500);

  sendResponse({ title, url, text: rawText });
  return true;
});
