'use strict';

/**
 * Subtitle Scaler for Disney+ — content script.
 *
 * Disney+ renders captions as DOM text with inline `font-size` in px, recomputed
 * on every cue swap and on resize. We don't fight that imperatively; we stamp our
 * own data-attributes on the cue elements and let an author stylesheet with
 * `!important` beat the inline styles. Sizing is driven by CSS custom properties
 * recomputed from the *rendered video box* (not the viewport), so letterboxed
 * content doesn't overshoot.
 *
 * Cue elements are located structurally, never by class name — Disney+ class
 * names are obfuscated and churn between deploys.
 */
(() => {
  const CUE_ATTR = 'data-subscale-cue';
  const REGION_ATTR = 'data-subscale-region';
  const BG_ATTR = 'data-subscale-bg';
  const CLEAR_ATTR = 'data-subscale-clear';
  const BOX_ATTR = 'data-subscale-box';

  const DEFAULTS = {
    enabled: true,
    scale: 4.6, // % of rendered video height
    minPx: 14,
    maxPx: 140,
    bgOpacity: 35, // %
    shadow: true,
    maxWidth: 92, // % of the video's displayed width
  };

  let settings = { ...DEFAULTS };
  let video = null;
  let stamped = new Set();
  let regionEl = null;
  let cueRoot = null;
  let cleared = new Set();
  let boxed = new Set();
  let rootsCache = null;
  let rootsCachedAt = 0;
  let lastFullScan = 0;
  let nativeStyleEl = null;
  let resizeObserver = null;
  let sweepQueued = false;

  const status = {
    path: 'none', // 'dom' | 'native' | 'none'
    cueCount: 0,
    sample: '',
    videoBox: '',
    intrinsic: '',
    elementBox: '',
    aspect: '',
    fontPx: 0,
    rejects: [],
    error: null,
  };

  const clamp = (lo, v, hi) => Math.max(lo, Math.min(v, hi));

  const ROOTS_TTL_MS = 500; // shadow-root memo lifetime
  const FULL_SCAN_MS = 1000; // floor between full-document cue sweeps
  const MAX_CUE_LINES = 5; // more than this isn't a caption, it's a panel

  /**
   * Only act on a playback page. The Disney+ homepage autoplays a hero trailer,
   * which is a perfectly good <video> as far as detection is concerned — so
   * without this the surrounding UI text gets treated as captions.
   */
  function onWatchPage() {
    return /\/(watch|video|play)(\/|$)/.test(location.pathname);
  }

  /* ---------------------------------------------------------------- video */

  function findVideo() {
    const vids = [];
    for (const root of collectRoots()) {
      vids.push(...root.querySelectorAll('video'));
    }
    const visible = vids.filter((v) => {
      const r = v.getBoundingClientRect();
      return r.width > 200 && r.height > 100;
    });
    visible.sort((a, b) => {
      const ra = a.getBoundingClientRect();
      const rb = b.getBoundingClientRect();
      return rb.width * rb.height - ra.width * ra.height;
    });
    return visible[0] || null;
  }

  /** The cached element while it's still valid — findVideo() is a full-document
   *  search and doesn't need to run once per frame. */
  function currentVideo() {
    if (video?.isConnected) {
      const r = video.getBoundingClientRect();
      if (r.width > 200 && r.height > 100) return video;
    }
    return findVideo();
  }

  /**
   * The rendered image box inside the <video> element. With object-fit:contain
   * (the player default) a 2.39:1 film in a 16:9 window leaves large bars, and
   * sizing text off the element height would make captions far too big.
   */
  function contentBox(v) {
    const r = v.getBoundingClientRect();
    if (!v.videoWidth || !v.videoHeight || !r.width || !r.height) {
      return { left: r.left, top: r.top, w: r.width, h: r.height };
    }
    const arVideo = v.videoWidth / v.videoHeight;
    const arBox = r.width / r.height;
    let w, h;
    if (arVideo > arBox) {
      w = r.width;
      h = r.width / arVideo;
    } else {
      h = r.height;
      w = r.height * arVideo;
    }
    return { left: r.left + (r.width - w) / 2, top: r.top + (r.height - h) / 2, w, h };
  }

  /* --------------------------------------------------------- shadow roots */

  function walkRoots(from, acc) {
    acc.add(from);
    const walker = document.createTreeWalker(
      from === document ? document.documentElement : from,
      NodeFilter.SHOW_ELEMENT
    );
    let n = walker.currentNode;
    while (n) {
      if (n.shadowRoot && !acc.has(n.shadowRoot)) walkRoots(n.shadowRoot, acc);
      n = walker.nextNode();
    }
    return acc;
  }

  /**
   * Walking every element in the document looking for shadow roots is the
   * single most expensive thing here, and both callers used to run it on every
   * sweep. Memoised on a short TTL: long enough that one sweep does the walk
   * once instead of twice, short enough that a newly attached shadow root is
   * picked up promptly.
   */
  function collectRoots() {
    const now = performance.now();
    if (rootsCache && now - rootsCachedAt < ROOTS_TTL_MS) return rootsCache;
    rootsCache = walkRoots(document, new Set());
    rootsCachedAt = now;
    return rootsCache;
  }

  /* ------------------------------------------------------- cue discovery */

  const TIMECODE = /^\s*-?\d{1,2}:\d{2}(:\d{2})?\s*$/;
  const INTERACTIVE = 'button,input,select,textarea,a[href],video,svg,[role="button"],[role="slider"]';
  const CHROME_HINT = '[class*="control" i],[class*="Control"],[role="toolbar"],[class*="scrubber" i]';

  function hasOwnText(el) {
    for (const n of el.childNodes) {
      if (n.nodeType === Node.TEXT_NODE && n.nodeValue.trim()) return true;
    }
    return false;
  }

  /**
   * Player chrome — control bar, skip buttons, title overlays.
   *
   * Asking whether an *ancestor* contains any interactive element anywhere in
   * its subtree is useless here: a few levels up from a caption you reach the
   * player overlay, which contains every button on screen. So check direct
   * children only. A control bar directly holds its buttons; a caption's
   * ancestors hold layout divs.
   */
  function isPlayerChrome(el, levels = 4) {
    if (el.matches?.(INTERACTIVE) || el.querySelector?.(INTERACTIVE)) return true;
    let node = el;
    for (let i = 0; i < levels && node && node !== document.body; i++) {
      if (node.matches?.(CHROME_HINT)) return true;
      for (const child of node.children) {
        if (child.matches(INTERACTIVE)) return true;
      }
      node = node.parentElement;
    }
    return false;
  }

  /**
   * Returns null if `el` looks like a caption, otherwise a short reason string
   * (surfaced in the popup's diagnostics when detection comes up empty).
   *
   * `box` is the video *element* rect, not the image box — a letterboxed title
   * can legitimately place captions down in the black bar.
   */
  function cueRejection(el, box) {
    if (!el.isConnected) return 'detached';
    if (!hasOwnText(el)) return 'no-own-text';

    const text = el.textContent.trim();
    if (!text) return 'empty';
    if (text.length > 300) return 'too-long';
    if (TIMECODE.test(text)) return 'timecode';

    const cs = getComputedStyle(el);
    if (cs.display === 'none') return 'display-none';
    if (cs.visibility === 'hidden') return 'visibility-hidden';
    if (parseFloat(cs.opacity) === 0) return 'opacity-0';

    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return 'zero-size';
    if (r.height > box.height * 0.5) return 'too-tall';

    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    if (cx < box.left || cx > box.right) return 'outside-x';
    if (cy < box.top + box.height * 0.4) return 'above-caption-zone';
    if (cy > box.bottom) return 'below-video';

    if (isPlayerChrome(el)) return 'player-chrome';
    // Last, because it's the most expensive check and by here few candidates
    // remain. Captions never scroll; episode lists and detail panels do.
    if (inScrollable(el)) return 'scrollable';
    return null;
  }

  /** Overlay panels — the episodes pull-up, details — scroll. Captions don't. */
  function inScrollable(el, levels = 6) {
    let node = el;
    for (let i = 0; i < levels && node && node !== document.body; i++) {
      const cs = getComputedStyle(node);
      if (/auto|scroll/.test(cs.overflowY) || /auto|scroll/.test(cs.overflowX)) return true;
      node = node.parentElement;
    }
    return false;
  }

  function describe(el, reason) {
    const r = el.getBoundingClientRect();
    return {
      reason,
      tag: el.tagName.toLowerCase(),
      cls: (el.getAttribute('class') || '').slice(0, 60),
      text: el.textContent.trim().slice(0, 60),
      rect: [r.left, r.top, r.width, r.height].map(Math.round).join(','),
    };
  }

  function overlaps(r, box) {
    return r.right > box.left && r.left < box.right && r.bottom > box.top && r.top < box.bottom;
  }

  function textWalker(start) {
    return document.createTreeWalker(start, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) =>
        n.nodeValue && n.nodeValue.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT,
    });
  }

  /**
   * True if no other carrier contains this one. Only these get the background
   * box — one box per line rather than one per nested span.
   *
   * Note we deliberately stamp *every* carrier, including wrappers that contain
   * other carriers: a cue like `<span>NAME: <i>dialogue</i></span>` holds the
   * speaker label as a direct text node of the wrapper, and skipping wrappers
   * left that label at the player's original size.
   */
  function isOutermost(el, all) {
    return !all.some((other) => other !== el && other.contains(el));
  }

  /**
   * The caption renderer root: the highest ancestor that still contains no
   * interactive elements at all. The player overlay holds every button on
   * screen; the caption renderer holds only text — so walking up until a button
   * would come into scope lands exactly on the caption layer.
   */
  function findCueRoot(el) {
    let best = null;
    let node = el.parentElement;
    for (let i = 0; i < 8 && node && node !== document.body; i++) {
      if (node.querySelector(INTERACTIVE)) break;
      if (video && node.contains(video)) break;
      best = node;
      node = node.parentElement;
    }
    return best;
  }

  /**
   * Phase 2. Everything inside a known caption root is a caption, wherever it
   * sits — forced-narrative subtitles (signs, foreign dialogue) render at the
   * top of the frame and the position filter would otherwise reject them.
   */
  function scanCueRoot(root) {
    const out = [];
    const walker = textWalker(root);
    let n;
    while ((n = walker.nextNode())) {
      const el = n.parentElement;
      if (!el || out.includes(el) || !hasOwnText(el)) continue;
      const text = el.textContent.trim();
      if (!text || text.length > 300 || TIMECODE.test(text)) continue;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) {
        continue;
      }
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      out.push(el);
    }
    return out;
  }

  /** Phase 1. Position-filtered sweep of the whole document. */
  function scanDocument(rejects) {
    const box = video.getBoundingClientRect();
    const found = [];
    for (const root of collectRoots()) {
      const start = root === document ? document.body : root;
      if (!start) continue;
      const walker = textWalker(start);
      let n;
      while ((n = walker.nextNode())) {
        const el = n.parentElement;
        if (!el || found.includes(el)) continue;
        const reason = cueRejection(el, box);
        if (!reason) {
          found.push(el);
        } else if (rejects && rejects.length < 40 && reason !== 'no-own-text') {
          if (overlaps(el.getBoundingClientRect(), box)) rejects.push(describe(el, reason));
        }
      }
    }
    return found;
  }

  /** @param {object[]=} rejects collects near-miss candidates for diagnostics */
  function findCueElements(rejects) {
    if (!video) return [];
    const box = video.getBoundingClientRect();
    if (!box.width || !box.height) return [];

    const inVideo = (el) => overlaps(el.getBoundingClientRect(), box);

    // Cheap path — scan only the learned caption container, typically a handful
    // of elements. This is what runs on the per-frame cue swaps.
    let found = cueRoot?.isConnected ? scanCueRoot(cueRoot).filter(inVideo) : [];

    // Expensive path — full document sweep. Needed to learn the caption root in
    // the first place, and to relearn it after an SPA navigation or player
    // rebuild, but it's throttled: detection self-heals within a second rather
    // than re-deriving everything 60 times a second.
    const stale = performance.now() - lastFullScan >= FULL_SCAN_MS;
    if (!found.length || stale) {
      lastFullScan = performance.now();
      const strict = scanDocument(rejects);
      // Only displaces the cheap result when it actually found something —
      // otherwise a moment with only top-positioned cues (which the position
      // filter rejects) would wipe perfectly good matches.
      if (strict.length) {
        cueRoot = findCueRoot(strict[0]);
        found = strict;
        if (cueRoot?.isConnected) {
          for (const el of scanCueRoot(cueRoot)) {
            if (!found.includes(el) && inVideo(el)) found.push(el);
          }
        }
      }
    }

    // A caption is a few lines. Anything yielding more is a panel that slipped
    // through — reject it wholesale and drop the learned root, or the cheap
    // path will keep re-stamping it every frame.
    if (found.filter((el) => isOutermost(el, found)).length > MAX_CUE_LINES) {
      cueRoot = null;
      return [];
    }
    return found;
  }

  /**
   * The caption region: the highest ancestor that still only wraps caption text.
   * Used to stop a fixed-height container from clipping text once it grows,
   * and as the upper bound when flattening the player's background boxes.
   */
  function findRegion(cueEl, box) {
    let best = cueEl;
    let node = cueEl.parentElement;
    for (let i = 0; i < 6 && node && node !== document.body; i++) {
      const r = node.getBoundingClientRect();
      if (r.height > box.h * 0.6) break;
      if (isPlayerChrome(node, 1)) break;
      best = node;
      node = node.parentElement;
    }
    return best === cueEl ? cueEl.parentElement || cueEl : best;
  }

  /* ------------------------------------------------------------ stamping */

  function clearAncestorBackgrounds(cues, region) {
    for (const el of cleared) el.removeAttribute(CLEAR_ATTR);
    cleared.clear();
    if (!region) return;
    for (const cue of cues) {
      let node = cue.parentElement;
      for (let i = 0; i < 8 && node; i++) {
        node.setAttribute(CLEAR_ATTR, '');
        cleared.add(node);
        if (node === region) break;
        node = node.parentElement;
      }
    }
  }

  /** Everything needed to diagnose a styling miss without opening DevTools:
   *  what we stamped, what its parent is, and who actually won each property. */
  function snapshot(el) {
    const styles = (node) => {
      const cs = getComputedStyle(node);
      return {
        fontSize: cs.fontSize,
        fontWeight: cs.fontWeight,
        textShadow: cs.textShadow,
        background: cs.backgroundColor,
        color: cs.color,
        fontFamily: cs.fontFamily.slice(0, 60),
      };
    };
    const parent = el.parentElement;
    return {
      html: el.outerHTML.slice(0, 300),
      computed: styles(el),
      parentHtml: parent ? parent.outerHTML.slice(0, 300) : null,
      parentComputed: parent ? styles(parent) : null,
    };
  }

  function clearStamps() {
    for (const el of stamped) {
      el.removeAttribute(CUE_ATTR);
      el.removeAttribute(BG_ATTR);
    }
    stamped.clear();
    for (const el of cleared) el.removeAttribute(CLEAR_ATTR);
    cleared.clear();
    for (const el of boxed) el.removeAttribute(BOX_ATTR);
    boxed.clear();
    cueRoot = null;
    if (regionEl) {
      regionEl.removeAttribute(REGION_ATTR);
      regionEl = null;
    }
  }

  function stamp() {
    const rejects = [];
    const cues = findCueElements(rejects);
    status.rejects = cues.length ? [] : rejects;

    for (const el of stamped) {
      if (!cues.includes(el)) {
        el.removeAttribute(CUE_ATTR);
        el.removeAttribute(BG_ATTR);
        stamped.delete(el);
      }
    }

    for (const el of boxed) el.removeAttribute(BOX_ATTR);
    boxed.clear();

    for (const el of cues) {
      el.setAttribute(CUE_ATTR, '');
      // Stamped regardless of opacity: at 0 the variable resolves to
      // `transparent`, which *overrides* the player's own box. Dropping the
      // attribute instead would just restore Disney+'s dark background.
      if (isOutermost(el, cues)) {
        el.setAttribute(BG_ATTR, '');
        // The parent is the positioning container; capping its width is what
        // caps line length, since inline cues ignore max-width themselves.
        if (el.parentElement) {
          el.parentElement.setAttribute(BOX_ATTR, '');
          boxed.add(el.parentElement);
        }
      } else {
        el.removeAttribute(BG_ATTR);
      }
      stamped.add(el);
    }

    if (cues.length) {
      const box = contentBox(video);
      const region = findRegion(cues[0], box);
      if (region !== regionEl) {
        if (regionEl) regionEl.removeAttribute(REGION_ATTR);
        regionEl = region;
        region.setAttribute(REGION_ATTR, '');
      }

      // The player may paint its own background box on an ancestor of the text
      // carrier. Left alone it sits behind ours, making the opacity slider look
      // dead — so flatten everything between the cue and the region.
      clearAncestorBackgrounds(cues, regionEl);

      status.path = 'dom';
      status.sample = snapshot(cues[0]);
    } else {
      status.path = hasNativeCues() ? 'native' : 'none';
      status.sample = null;
    }
    status.cueCount = cues.length;
  }

  /* -------------------------------------------------------- native <track> */

  function hasNativeCues() {
    if (!video || !video.textTracks) return false;
    for (const t of video.textTracks) {
      if ((t.kind === 'subtitles' || t.kind === 'captions') && t.mode === 'showing') return true;
    }
    return false;
  }

  /**
   * Native cues live in the UA shadow DOM and only accept the ::cue property
   * subset, so they need a generated stylesheet with literal px values rather
   * than the custom properties used on the DOM path.
   */
  function updateNativeStyle(px) {
    if (status.path !== 'native' || !settings.enabled) {
      nativeStyleEl?.remove();
      nativeStyleEl = null;
      return;
    }
    if (!nativeStyleEl) {
      nativeStyleEl = document.createElement('style');
      nativeStyleEl.dataset.subscale = 'native';
      document.head.appendChild(nativeStyleEl);
    }
    const bg = settings.bgOpacity > 0 ? `rgba(0,0,0,${settings.bgOpacity / 100})` : 'transparent';
    const shadow = settings.shadow ? '0 .06em .12em rgba(0,0,0,.95)' : 'none';
    nativeStyleEl.textContent = `
      video::cue {
        font-size: ${px.toFixed(1)}px !important;
        background-color: ${bg} !important;
        text-shadow: ${shadow} !important;
      }
      video::-webkit-media-text-track-container,
      video::-webkit-media-text-track-display {
        font-size: ${px.toFixed(1)}px !important;
        line-height: 1.25 !important;
      }`;
  }

  /* ------------------------------------------------------------ sizing */

  function updateVars() {
    const root = document.documentElement.style;
    if (!settings.enabled || !video) {
      for (const p of ['size', 'bg', 'shadow', 'maxw']) root.removeProperty(`--subscale-${p}`);
      return;
    }
    const box = contentBox(video);
    const px = clamp(settings.minPx, (box.h * settings.scale) / 100, settings.maxPx);

    root.setProperty('--subscale-size', `${px.toFixed(1)}px`);
    root.setProperty(
      '--subscale-bg',
      settings.bgOpacity > 0 ? `rgba(0,0,0,${settings.bgOpacity / 100})` : 'transparent'
    );
    root.setProperty(
      '--subscale-shadow',
      settings.shadow ? '0 .06em .12em rgba(0,0,0,.95), 0 0 .25em rgba(0,0,0,.8)' : 'none'
    );
    // A percentage of the displayed image width. This can't be derived: Disney+
    // encodes 4:3 content into a 16:9 frame with the pillarbox bars baked into
    // the picture, so videoWidth/videoHeight reports 16:9 and nothing in the
    // metadata says where the real image stops. Hence a user setting.
    root.setProperty('--subscale-maxw', `${Math.round((box.w * settings.maxWidth) / 100)}px`);

    status.videoBox = `${Math.round(box.w)}x${Math.round(box.h)}`;
    // Intrinsic vs element size tells us whether black bars are geometry we can
    // compute around, or pixels baked into the encode that we can't see.
    const rect = video.getBoundingClientRect();
    status.intrinsic = `${video.videoWidth}x${video.videoHeight}`;
    status.elementBox = `${Math.round(rect.width)}x${Math.round(rect.height)}`;
    status.aspect = video.videoHeight
      ? (video.videoWidth / video.videoHeight).toFixed(3)
      : 'unknown';
    status.fontPx = Math.round(px);
    updateNativeStyle(px);
  }

  /* ------------------------------------------------------------ lifecycle */

  function sweep() {
    sweepQueued = false;

    if (!onWatchPage()) {
      if (stamped.size) clearStamps();
      status.path = 'off';
      status.cueCount = 0;
      return;
    }

    const current = currentVideo();
    if (current !== video) {
      video = current;
      clearStamps();
      watchVideo();
      // New player: drop the memoised roots and force an immediate full scan
      // rather than waiting out the throttle.
      rootsCachedAt = 0;
      lastFullScan = 0;
    }
    if (!video) {
      status.path = 'none';
      status.cueCount = 0;
      return;
    }
    // A throw here would otherwise vanish into the rAF callback, skip
    // updateVars(), and leave the whole thing dead with no visible cause.
    try {
      if (settings.enabled) stamp();
      status.error = null;
    } catch (err) {
      status.error = String(err?.message || err);
      console.error('[Subtitle Scaler]', err);
    }
    updateVars();
  }

  function queueSweep() {
    if (sweepQueued) return;
    sweepQueued = true;
    requestAnimationFrame(sweep);
  }

  function watchVideo() {
    resizeObserver?.disconnect();
    if (!video) return;
    resizeObserver = new ResizeObserver(() => {
      updateVars();
      queueSweep();
    });
    resizeObserver.observe(video);
    video.addEventListener('loadedmetadata', updateVars);
  }

  function applySettings(next) {
    settings = { ...DEFAULTS, ...next };
    if (!settings.enabled) {
      clearStamps();
      nativeStyleEl?.remove();
      nativeStyleEl = null;
    }
    updateVars();
    queueSweep();
  }

  function init() {
    chrome.storage.sync.get(DEFAULTS, (stored) => applySettings(stored));

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'sync') return;
      const next = { ...settings };
      for (const [k, { newValue }] of Object.entries(changes)) next[k] = newValue;
      applySettings(next);
    });

    // Cues are re-created on every swap, so re-stamping is the normal path.
    new MutationObserver(queueSweep).observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    // Safety net for cues inside shadow roots the observer above can't reach,
    // and for player teardown/rebuild on SPA navigation.
    setInterval(queueSweep, 750);
    window.addEventListener('resize', updateVars);
    document.addEventListener('fullscreenchange', () => {
      updateVars();
      queueSweep();
    });

    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      // Live preview while a slider is being dragged — storage writes are
      // debounced behind this to stay inside the sync quota.
      if (msg?.type === 'subscale:preview') {
        applySettings({ ...settings, ...msg.settings });
        return false;
      }
      if (msg?.type !== 'subscale:status') return false;
      if (!video) return false; // let the frame that has the player answer
      sendResponse({ ...status, settings });
      return true;
    });

    queueSweep();
  }

  init();
})();
