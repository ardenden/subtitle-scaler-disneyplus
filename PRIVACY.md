# Privacy Policy — Subtitle Scaler

**Last updated: 31 July 2026**

## The short version

Subtitle Scaler collects nothing, transmits nothing, and contacts no servers.

## What is collected

No personal data of any kind. Specifically, the extension does not collect,
store, or transmit:

- Personally identifiable information (name, address, email, age, ID numbers)
- Health, financial, or payment information
- Authentication information or credentials
- Personal communications
- Location or IP-derived data
- Browsing or web history
- User activity — clicks, mouse position, scrolling, or keystrokes
- Website content

## What is stored, and where

The extension stores your display preferences only: caption size, background
opacity, and whether the drop shadow is on.

These are kept in `chrome.storage.sync`, which is Chrome's own settings storage.
If you are signed into Chrome, your browser syncs them to your Google account so
your preferences follow you between devices. That synchronisation is performed by
Chrome, not by this extension — the developer has no access to it and no way to
read it.

Uninstalling the extension removes these settings.

## Network activity

None. The extension makes no outbound network requests whatsoever — no
analytics, no telemetry, no error reporting, no update pings, no advertising,
no third-party services of any kind. Every line of code it runs is contained in
the package you installed.

This is independently verifiable: the source is public at
https://github.com/ardenden/subtitle-scaler-disneyplus

## Page access

The extension runs only on Disney+ playback pages
(`https://*.disneyplus.com/*`). To do its job it reads the page's structure in
order to locate caption elements and apply styling to them. This reading happens
entirely within your browser, in memory, and nothing derived from it is stored
or sent anywhere.

The extension includes a diagnostic "Copy report" button, which — only when you
click it — copies a technical summary to your clipboard so it can be pasted into
a bug report. It is placed on your clipboard and nowhere else. You choose whether
to share it, and with whom.

## Data sharing

There is no data to share, and none is sold, transferred, or disclosed to any
third party.

## Changes

Any future change to this policy will be published in this file, with the
revision history publicly visible in the repository's commit log.

## Contact

Questions or concerns: https://github.com/ardenden/subtitle-scaler-disneyplus/issues
