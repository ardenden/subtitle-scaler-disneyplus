# Chrome Web Store listing copy

Paste-ready text for the Developer Dashboard. Upload
`dist/subtitle-scaler-1.0.0.zip`.

---

## Name

```
Subtitle Scaler
```

## Short description (132 char limit)

```
Scales subtitles on Disney+ relative to the video image, so they stay readable at any window or screen size.
```

## Category

**Accessibility.** It's a readability aid, not entertainment — and reviewers
read the category as a claim about purpose.

## Detailed description

```
Disney+ sizes its subtitles from a fixed list of presets measured in pixels. That size doesn't follow the video, so captions look oversized in a small window and too small on a large screen or a TV — and changing window size means going back into the player settings.

Subtitle Scaler sizes captions as a percentage of the video image itself. Set it once and it holds: resize the window, go fullscreen, switch between a widescreen film and a 16:9 episode, and the subtitles stay the size you picked.

Controls:

• Size — as a percentage of the video's height, not the window's
• Max width — keep long lines inside the picture, useful on older 4:3 shows
• Background — adjust the box behind the text, or turn it off entirely
• Drop shadow — keeps text legible over bright scenes

Measured against the video image rather than the browser window, so letterboxed films don't get oversized text. Works with regular dialogue subtitles and with the top-of-screen captions used for signs and forced narratives.

Open source and MIT licensed: https://github.com/ardenden/subtitle-scaler-disneyplus

No accounts, no tracking, no network requests. The extension makes no outbound connections of any kind and collects no data. It only runs on Disney+ playback pages.
```

## Single purpose

```
Resizes and restyles subtitles on Disney+ playback pages so they stay readable at any window or screen size.
```

## Permission justifications

**`storage`**

```
Stores the user's own display preferences — caption size, background opacity, and drop shadow — so they persist between sessions. Nothing else is written, and no data leaves the browser.
```

**`activeTab`**

```
Used only while the extension's popup is open, so it can send the current tab a live preview of a setting as the user drags a slider, and read back whether captions were detected. No page content is collected or transmitted.
```

**Host permission — `https://*.disneyplus.com/*`**

```
The extension restyles Disney+ caption elements, which requires a content script on Disney+ playback pages to locate those elements and apply CSS to them. This is the only site it runs on.
```

## Privacy practices

- **Data collected:** none. Tick nothing.
- The extension makes no network requests whatsoever — worth stating plainly in
  any free-text privacy field, since it's unusual and easy to verify from the
  source.
- **Remote code:** No. All code is in the package.
- **Privacy policy URL:** not required when no data is collected. If the form
  insists, the GitHub README serves.

## Trader status (EU DSA)

**Non-trader** for a free hobby extension. Note this blocks EU/EEA
distribution — reaching the EU requires declaring trader status and publishing
verified contact details, including a physical address, on the public listing.

## Screenshots

At least one, 1280×800 or 640×400. The strongest set:

1. A caption at default Disney+ size next to the same caption scaled up — the
   before/after is the entire pitch
2. The popup open over a playing episode, showing the controls
3. A letterboxed film in a windowed browser, showing text sized to the image
   rather than the window

Crop to the video area. Avoid leaving personal account details, profile names,
or the Continue Watching row visible.
