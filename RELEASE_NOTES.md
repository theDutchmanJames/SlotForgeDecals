# SlotForge Decals 0.2.12

The first public GitHub release: an offline A4 decal studio for slotcar builders, with native Windows, macOS and Linux applications.

## Create, scale and print

- Import PNG, JPEG, WebP, SVG, EPS and PDF; set physical dimensions and model scale.
- Prepare images, trace bitmaps to vectors, refine traced colours and add silhouette outlines.
- Create editable text, curved lettering, shapes, stripes and racing-number plates.
- Arrange fixed A4 pages with multi-selection, groups, alignment, repeating grids and print checks.
- Review selected decals on side/top car references and resize them from the enlarged preview.
- Save a local decal library and projects; share editable sheets and decal packs.
- Export accurately sized PDFs, plain-paper sizing proofs and optional white-ink separations.
- Includes all eight reliability fixes from the 0.2.11 review.
- Fixes a delayed dialog-close event that could cancel a newly opened import on native platforms.

## Download and install

| Computer | Download and open |
| --- | --- |
| Windows x64 | windows-x64.exe — portable, double-click to open |
| Apple Silicon Mac | mac-arm64.dmg — drag Decals to Applications |
| Intel Mac | mac-x64.dmg — drag Decals to Applications |
| Linux x64 | linux-amd64.deb or linux-x86_64.AppImage |
| Linux ARM64 | linux-arm64.deb or linux-arm64.AppImage |

Mac ZIPs are also provided. On Linux, install the DEB with your software installer, or mark the AppImage executable before opening it. Linux packages are built on Ubuntu 24.04 for compatible modern systems. No Node.js installation is needed.

Windows builds are unsigned. Mac builds are ad-hoc signed, not Apple-notarized, and may require per-app approval in Privacy & Security. The app keeps its sandbox enabled.

Your existing workspace remains in Documents/SlotForge Decals, separately from the application. Export a backup before updating. There is no automatic in-app updater.

## Printing and sources

Print at **Actual size / 100%** and check the proof's 100 mm reference bars. The car preview is a flat sizing guide. White-ink PDF structure is tested, but physical white-ink printing has not been validated; confirm the required spot name and ink order with your print shop.

All five native builds are checked in GitHub Actions before publication, including packaged EPS import, physical PDF dimensions, saving/reopening and the eight review regressions. SHA256SUMS files accompany the downloads.

Licensed under AGPL-3.0-or-later. Corresponding application source, Ghostscript source, complete MuPDF source, revision records and build instructions are provided as separate assets on this release. These source downloads are for rebuilding and redistribution; they are not required to run the app.

See the repository README for the full feature overview, installation guide and first-sheet walkthrough.
