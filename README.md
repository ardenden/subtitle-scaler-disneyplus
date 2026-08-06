# Subtitle Scaler for Disney+

[![CI](https://github.com/ardenden/subtitle-scaler-disneyplus/actions/workflows/ci.yml/badge.svg)](https://github.com/ardenden/subtitle-scaler-disneyplus/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

<a href="https://chromewebstore.google.com/detail/subtitle-scaler/oflehfffcfgohboepehdiejebjhlgbhn">
  <img src="assets/chrome-web-store-badge.png" width="217" alt="Download from the Chrome Web Store">
</a>

Disney+ pins caption font size to a fixed preset ladder in `px` rather than to the
size of the video, so subtitles are oversized in a small window and too small on a
large screen. This extension sizes them as a percentage of the **rendered video
image** instead, and keeps them there across resize, fullscreen, and cue changes.

## Install

**[Get it on the Chrome Web Store](https://chromewebstore.google.com/detail/subtitle-scaler/oflehfffcfgohboepehdiejebjhlgbhn)**

Then open a Disney+ title, start playback with subtitles on, and click the
toolbar icon.

### From source

1. `chrome://extensions` → enable **Developer mode**
2. **Load unpacked** → select this folder
3. Open a Disney+ title, start playback with subtitles on, click the toolbar icon

## How it works

- **Author stylesheet + `!important`.** The player writes inline `font-size` on
  each cue and recomputes it on every swap. An injected stylesheet with
  `!important` outranks a non-important inline style, so we never have to fight
  the player's JS imperatively.
- **No hardcoded selectors.** Disney+ class names are obfuscated and change
  between deploys. [content.js](src/content.js) finds cue elements *structurally*
  — text-bearing elements over the lower half of the video image, away from
  anything interactive — then stamps `data-subscale-cue` on them.
  [subtitles.css](src/subtitles.css) targets only our own attributes.
- **Sized off the video, not the viewport.** `vh` overshoots on a 2.39:1 film in a
  short window because of letterboxing, so `contentBox()` derives the real image
  box from `videoWidth/videoHeight` and a `ResizeObserver` drives a CSS variable.
- **Both caption paths.** DOM-rendered TTML cues get full styling; native
  `<track>` cues fall back to a generated `::cue` stylesheet (a much more limited
  property set — that's a platform constraint, not an oversight). Disney+ uses
  the DOM path, so the native fallback is exercised by
  [test/native-track.html](test/native-track.html) instead.

## Design notes

Published and in daily use. The DOM caption path is confirmed against live
playback; the native `<track>` fallback has no Disney+ content to exercise it,
so [test/native-track.html](test/native-track.html) stands in.

What follows is the reasoning behind the parts that look arbitrary — worth
reading before changing detection. The individual bugs and their causes are in
`git log`.

### Guards against false positives

Detection looks for text over the video, which UI that overlays the player also
satisfies. Three guards, in order of how much they catch:

1. **Watch pages only.** The homepage autoplays a hero trailer, and a `<video>`
   is a `<video>` — so the surrounding UI text was being treated as captions.
   `onWatchPage()` gates the whole sweep.
2. **Nothing inside a scrollable ancestor.** The episodes pull-up and details
   panels scroll; captions never do. Checked last in `cueRejection()`, since
   it's the most expensive test and few candidates reach it.
3. **At most `MAX_CUE_LINES` lines.** More than a handful means a panel slipped
   through. The learned `cueRoot` is dropped too — otherwise the cheap per-frame
   path keeps re-stamping it, which is why panel text *stuck* while homepage
   text corrected itself after a second.

### Known limitation: the first cue after playback starts

If the *first* caption after starting a video is top-positioned — a sign, or
foreign dialogue — it renders unstyled for a few seconds.

`cueRoot` is only ever learned from the strict document scan, which applies the
position filter and rejects anything in the upper 40% of the video. Top cues are
found only by the cheap path, which needs a `cueRoot` already learned from a
bottom caption. At cold start there isn't one, so the first top cue falls
through. The first ordinary bottom caption teaches it the container and
everything works from then on. `clearStamps()` resets `cueRoot` on a video
element change, so switching episodes reopens the same window.

Left alone deliberately. Every fix means relaxing the position filter to
bootstrap from the top zone, which is exactly what let title cards and panel
text get styled before the guards above were added. A few seconds of cosmetic
delay is the better trade.

### Still open

Detection depends on the shape of the Disney+ player DOM, so a new player build
can break it — that's the standing risk, and it can't be pre-empted. When it
happens, the **Copy report** button names the check that rejected the cues.

### Cost during playback

The `MutationObserver` watches the whole document, and the player mutates
constantly while a video plays — so sweeps run close to once per animation
frame, not on the 750 ms interval the timer suggests. That makes the per-sweep
cost the thing that matters.

Two paths, split by expense:

- **Cheap** — scan the learned caption container only, a handful of elements.
  This is what runs on the per-frame cue swaps.
- **Expensive** — full-document sweep. Learns the caption root and relearns it
  after SPA navigation or a player rebuild. Floored to once per second by
  `FULL_SCAN_MS`, so detection self-heals within a second instead of
  re-deriving everything 60 times a second.

The shadow-root walk is memoised for `ROOTS_TTL_MS`, and the video element is
cached while it stays connected and correctly sized. Both were previously
full-document searches running every sweep.

Not profiled — this is a structural fix based on reading the hot path. A Chrome
performance recording during playback would be the way to confirm where time
actually goes.

### Diagnostics

When the popup reads `Waiting for captions…` it exposes a **Copy report**
button: every text element over the video plus the specific check that rejected
each one. That's the fast path to re-tuning `cueRejection()` without DevTools.

## Settings

| Setting    | Default | Notes                                                        |
| ---------- | ------- | ------------------------------------------------------------ |
| Size       | 4.6%    | of rendered video height, clamped to 14–140px                |
| Max width  | 92%     | of the displayed image width                                 |
| Background | 35%     | 0 paints `transparent`, which overrides the player's own box |
| Shadow     | on      | keeps text legible over bright scenes                        |

Settings live in `chrome.storage.sync` and apply live — no reload. Writes are
debounced: the popup pushes changes straight to the page for preview, because
writing on every slider event blows the 120-per-minute sync quota, after which
*all* writes fail silently.

**Max width** can't be derived. Disney+ encodes 4:3 content into a 16:9 frame
with the pillarbox bars baked into the picture, so `videoWidth`/`videoHeight`
report 16:9 and nothing says where the image really stops. The container is
shrink-to-fit, so the setting only bites below the caption's natural width —
around 55% in practice.

### Dropped: Raise and Weight

Cut, restored once with two genuine bugs fixed, then cut for good — the restored
Raise collapsed the caption container's width and wrapped dialogue to one word
per line.

The graveyard, for anyone tempted to try again:

- `transform: none translateY(-10px)` is invalid CSS. `none` can't be combined
  with a transform function, so the whole declaration is dropped. Most caption
  regions have no transform, making this the common path — normalise the
  captured base to `translateY(0)`.
- `transform` is ignored on non-replaced inline boxes, and the caption region is
  frequently an inline `<span>`.
- Fixing both still broke layout, so the transform reaches an element whose
  geometry the player depends on. Shifting cues vertically probably has to work
  *with* the player's per-cue inline positioning rather than override it.

Weight was never independently verified — it may work fine, or the caption font
may ship only one weight. It went out alongside Raise.
