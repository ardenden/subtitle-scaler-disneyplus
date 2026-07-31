# Native `<track>` path test

Disney+ renders captions into the DOM, so `hasNativeCues()` and
`updateNativeStyle()` never run against real playback. This page exercises them.

It builds a `<video>` from a canvas `MediaStream` (a real playing video, no media
file needed) and attaches a subtitle track via `addTextTrack()`, which lands in
`video.textTracks` exactly as a `<track>` element would. The cues are then drawn
by the browser in its own shadow DOM — unreachable from the page, which is the
whole point.

## Running it

```sh
node test/server.mjs      # http://localhost:8787/watch
```

The path must contain `/watch`, or `onWatchPage()` gates the sweep off. The
server returns the same page for every path, so any `/watch` URL works.

**Requires a temporary manifest change** — add `http://localhost:8787/*` to
`content_scripts[0].matches`, reload the extension, and *revert it before
committing*. Shipping a localhost match would inject the content script into
every local dev server its users run.

## What passing looks like

- Popup status reads `Native cues · <n>px`
- The Size slider resizes the caption text
- Background and Drop shadow visibly change it

`::cue` accepts a restricted property set, so the background is a plain
rectangle here rather than the rounded, padded box the DOM path produces. That's
a browser limitation, not a bug.
