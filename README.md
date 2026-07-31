# Subtitle Scaler for Disney+

Disney+ pins caption font size to a fixed preset ladder in `px` rather than to the
size of the video, so subtitles are oversized in a small window and too small on a
large screen. This extension sizes them as a percentage of the **rendered video
image** instead, and keeps them there across resize, fullscreen, and cue changes.

## Install (unpacked)

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
  property set — that's a platform constraint, not an oversight).

## Status

Working — DOM caption path confirmed against a live title. Size, background and
shadow all verified against real playback.

Bugs found during real use, all fixed:

- **Speaker labels didn't scale.** A cue shaped like
  `<span>NAME: <i>dialogue</i></span>` holds the label as a direct text node of
  the wrapper. The old `innermost()` filter dropped any element containing
  another text carrier, so the wrapper was never stamped and its label kept the
  player's size. Now every carrier is stamped; only the outermost gets the
  background box, so boxes still don't double up.
- **Top-positioned captions ignored.** Forced narratives (signs, foreign
  dialogue) render at the top of the frame and the position filter rejected
  them. Fixed by learning the caption root from a confirmed cue, then accepting
  anything inside it regardless of position.
- **Total detection failure** after the above. The cue-root path *replaced* the
  strict sweep rather than extending it, so one bad guess at the container
  killed detection permanently. Phase 1 now always runs and phase 2 may only
  widen the result.
- **Settings silently stopped applying.** The popup wrote to
  `chrome.storage.sync` on every `input` event, so a single slider drag blew the
  120-writes-per-minute quota. Past that point every write fails — including
  from unrelated controls, which is why the drop-shadow toggle looked broken and
  why `MAX_WRITE_OPERATIONS_PER_MINUTE` showed up on the extensions page.
  Changes now go straight to the content script for instant preview, with
  persistence on a 400 ms trailing debounce and a retry if the quota is hit
  anyway.

- `nearInteractive()` walked up five ancestors asking whether any of them
  *contained* an interactive element. A few levels above a caption you reach the
  player overlay, which contains every button on screen, so it rejected every
  candidate. Replaced by `isPlayerChrome()`, which checks direct children only —
  a control bar directly holds its buttons, a caption's ancestors hold layout
  divs.
- Position filtering used the video *image* box, so captions rendered down in
  the letterbox bar were rejected as `below-video`. Now filtered against the
  video element rect; the image box is still what drives sizing.

### Still worth checking

1. **False positives** — anything *other* than captions changing size (a title
   card, a "Next episode" overlay). The guards are `isPlayerChrome()` and the
   lower-40%-of-video position filter.
2. **Letterboxed film, windowed → fullscreen** — confirms sizing tracks the
   image box rather than the element box.
3. **Native `<track>` path** — untested. Needs a title that uses it; unclear
   which regions/titles do.
4. **Deploy resilience** — the real test is whether detection survives Disney+
   shipping a new player build.

### Diagnostics

When the popup reads `Waiting for captions…` it exposes a **Copy report**
button: every text element over the video plus the specific check that rejected
each one. That's the fast path to re-tuning `cueRejection()` without DevTools.

## Settings

| Setting    | Default | Notes                                                        |
| ---------- | ------- | ------------------------------------------------------------ |
| Size       | 4.6%    | of rendered video height, clamped to 14–140px                |
| Background | 35%     | 0 paints `transparent`, which overrides the player's own box |
| Shadow     | on      | keeps text legible over bright scenes                        |

Settings live in `chrome.storage.sync` and apply live — no reload.

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
