# SlotForge Decals 0.2.14

A new decal-sheet icon, matching the SlotForge App Collection.

- Upright backing sheet with a plain circular decal and racing stripes.
- Clear spacing around the peeled corner keeps the design readable at small sizes.
- The app header, desktop packages and README use the same approved design.

## Download and install

| Computer | Download and open |
| --- | --- |
| Windows x64 | windows-x64.exe — portable, double-click to open |
| Apple Silicon Mac | mac-arm64.dmg — drag Decals to Applications |
| Intel Mac | mac-x64.dmg — drag Decals to Applications |
| Linux x64 | linux-amd64.deb or linux-x86_64.AppImage |
| Linux ARM64 | linux-arm64.deb or linux-arm64.AppImage |

Mac ZIPs are also provided; Mac builds require macOS 15 or newer. On Linux, install the DEB with your software installer, or mark the AppImage executable before opening it. Linux packages are built on Ubuntu 24.04 for compatible modern systems. No Node.js installation is needed.

Windows builds are unsigned. Mac builds are ad-hoc signed, not Apple-notarized, and may require per-app approval in Privacy & Security. The app keeps its sandbox enabled.

Your existing workspace remains in Documents/SlotForge Decals, separately from the application. Export a backup before updating. There is no automatic in-app updater.

## Printing and sources

Print at **Actual size / 100%** and check the proof's labelled 50/100 mm reference bars. The car preview is a flat sizing guide. White-ink PDF structure is tested, but physical white-ink printing has not been validated; confirm the required spot name and ink order with your print shop.

All five native builds are checked in GitHub Actions before publication, including packaged EPS import, physical PDF dimensions in all six size/orientation combinations, saving/reopening and the eight review regressions. SHA256SUMS files accompany the downloads.

Licensed under AGPL-3.0-or-later. Corresponding application source, Ghostscript source, complete MuPDF source, revision records and build instructions are provided as separate assets on this release. These source downloads are for rebuilding and redistribution; they are not required to run the app.

See the repository README for the full feature overview, installation guide and first-sheet walkthrough.
