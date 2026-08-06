# Releasing

Shipping an update to the Chrome Web Store.

## Steps

1. **Bump `version` in `manifest.json`.** Store versions only ever increase — a
   published number can never be reused or gone below, so there's no undoing a
   version once it's live.
2. `powershell -File tools/package.ps1` → `dist/subtitle-scaler-<version>.zip`
3. `node tools/check.mjs` — also runs in CI, but catching a problem here is
   quicker than a failed upload.
4. [Developer Dashboard](https://chrome.google.com/webstore/devconsole) → the
   item → **Package** → **Upload new package**.
5. If the controls or behaviour changed, update the description on **Store
   listing**. Package and listing changes go through the same single review, so
   there's no reason to skip it.
6. **Save Draft**, then **Submit for review**. Existing users update
   automatically within a few hours of approval.

Tag the release once it's submitted:

```sh
git tag -a v1.0.1 -m "v1.0.1" && git push origin v1.0.1
```

## Things that have bitten

- **The temporary localhost match.** `test/server.mjs` needs
  `http://localhost:8787/*` in `content_scripts[0].matches`, and shipping it
  would inject the content script into every dev server a user runs. It nearly
  went out twice. `tools/check.mjs` now fails the build on any match pattern
  other than disneyplus.com — but revert it as soon as you're done testing
  rather than relying on that.
- **Zip layout.** `manifest.json` must be at the root, and entries need forward
  slashes. `Compress-Archive` on Windows PowerShell 5.1 writes backslash
  separators, which the ZIP spec disallows. `tools/package.ps1` builds the
  archive entry by entry to avoid both.
- **Screenshots.** 1280×800 or 640×400, 24-bit PNG, no alpha. Windows saves
  32-bit ARGB and region captures routinely land a pixel short; either is
  rejected with only "An unknown error occurred". Run
  `tools/fix-screenshots.ps1 <folder>` to conform them.
- **Capturing them at all.** Widevine blanks protected frames, so a screen
  capture of real playback is black where the picture should be. Captions still
  render, since they sit outside the protected surface, but for a usable image
  use `test/screenshot-rig.html` — it reproduces the Disney+ caption DOM over a
  synthetic backdrop, sized to exactly 1280×800.

## Listing

All the store copy — description, single-purpose statement, per-permission
justifications, privacy answers — lives in
[store-listing.md](store-listing.md). Edit there and paste, so the wording stays
under version control.

Declared **non-trader** under the EU DSA, which blocks EU/EEA distribution.
Changing that means publishing verified contact details, including a physical
address, on the public listing.

## Firefox

Not published there. It's free, and needs only a
`browser_specific_settings.gecko.id` block added to the manifest.
