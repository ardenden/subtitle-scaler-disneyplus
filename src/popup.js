'use strict';

const DEFAULTS = {
  enabled: true,
  scale: 4.6,
  minPx: 14,
  maxPx: 140,
  bgOpacity: 35,
  shadow: true,
};

const RANGES = ['scale', 'bgOpacity'];
const CHECKS = ['enabled', 'shadow'];

const FORMAT = {
  scale: (v) => `${(+v).toFixed(1)}%`,
  bgOpacity: (v) => (+v === 0 ? 'off' : `${v}%`),
};

const $ = (id) => document.getElementById(id);

function render(settings) {
  for (const key of RANGES) {
    $(key).value = settings[key];
    $(`${key}-out`).textContent = FORMAT[key](settings[key]);
  }
  for (const key of CHECKS) $(key).checked = settings[key];
}

/**
 * chrome.storage.sync allows 120 writes/minute. Writing on every `input` event
 * blows that within one slider drag, and once the quota is gone *every*
 * subsequent write fails silently — so unrelated controls appear broken.
 *
 * So: push changes straight to the content script for instant preview (no
 * quota), and persist on a trailing debounce.
 */
const PERSIST_DELAY = 400;
let persistTimer = null;
let pending = {};

async function preview(partial) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  chrome.tabs.sendMessage(tab.id, { type: 'subscale:preview', settings: partial }, () => {
    void chrome.runtime.lastError; // no content script on this tab; harmless
  });
}

function persist() {
  const payload = pending;
  pending = {};
  chrome.storage.sync.set(payload, () => {
    if (chrome.runtime.lastError) {
      // Quota hit anyway — keep the values queued for the next attempt so the
      // setting isn't silently lost.
      Object.assign(pending, payload);
      clearTimeout(persistTimer);
      persistTimer = setTimeout(persist, 60_000);
    }
  });
}

function save(partial) {
  Object.assign(pending, partial);
  preview(partial);
  clearTimeout(persistTimer);
  persistTimer = setTimeout(persist, PERSIST_DELAY);
}

for (const key of RANGES) {
  $(key).addEventListener('input', (e) => {
    const value = Number(e.target.value);
    $(`${key}-out`).textContent = FORMAT[key](value);
    save({ [key]: value });
  });
}

for (const key of CHECKS) {
  $(key).addEventListener('change', (e) => save({ [key]: e.target.checked }));
}

$('reset').addEventListener('click', () => {
  render(DEFAULTS);
  save(DEFAULTS);
});

chrome.storage.sync.get(DEFAULTS, render);

/* Diagnostics — which rendering path the player handed us, and what we found.
   Saves a DevTools trip when a Disney+ deploy shifts the caption markup. */
let lastReport = null;

$('copy').addEventListener('click', async () => {
  await navigator.clipboard.writeText(JSON.stringify(lastReport, null, 2));
  $('copy').textContent = 'Copied';
  setTimeout(() => ($('copy').textContent = 'Copy report'), 1500);
});

async function showStatus() {
  const el = $('status');
  const copy = $('copy');
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab?.url?.includes('disneyplus.com')) {
    el.textContent = 'Open a Disney+ video';
    copy.hidden = true;
    return;
  }

  chrome.tabs.sendMessage(tab.id, { type: 'subscale:status' }, (res) => {
    if (chrome.runtime.lastError || !res) {
      el.textContent = 'No player detected';
      el.className = 'status';
      copy.hidden = true;
      return;
    }
    lastReport = res;
    copy.hidden = false; // useful even when detection works — see snapshot()
    if (res.error) {
      el.textContent = `Error: ${res.error.slice(0, 40)}`;
      el.className = 'status warn';
    } else if (res.path === 'dom') {
      el.textContent = `${res.cueCount} cue${res.cueCount === 1 ? '' : 's'} · ${res.fontPx}px · ${res.videoBox}`;
      el.className = 'status ok';
    } else if (res.path === 'native') {
      el.textContent = `Native cues · ${res.fontPx}px`;
      el.className = 'status ok';
    } else {
      el.textContent = 'Waiting for captions…';
      el.className = 'status warn';
    }
  });
}

showStatus();
setInterval(showStatus, 1000);
