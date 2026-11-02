# SlotForge Decals 0.2.15

Save, reuse and print just the part of a decal sheet you need.

## Slice area

- Open **Slice area…** above the canvas and draw a rectangle, or enter its position and dimensions in millimetres.
- Clip exactly at the boundary, or expand the area to include whole decals.
- Save a transparent slice to your library and share it in a .sfdecal pack. Text, vectors, embedded images, fonts and individual ink settings are retained.
- **Print this area…** keeps the original A4, A5 or Photo 4×6 paper size and prints only the selected area in its original position.
- **Export cropped PDF…** creates a PDF whose page matches the slice. Both export options include a preview and preserve the artwork's physical scale.
- The original sheet stays unchanged. Saved slices move, rotate and resize as one decal; edit the original artwork before creating a replacement slice.

## Printing and placement fixes

- Full-width and full-height library slices stay inside the paper bounds without resizing.
- Ungrouping retains white-only artwork and white backing, including nested slices, undo/redo and shared decal packs.
- Cropped PDFs retain top-left alignment and artwork scale, including very small slices.

Files containing slices require SlotForge Decals 0.2.15 or newer. Library placement follows model scale; use the same scale to keep the saved millimetre size. Custom paper sizes and physical offcuts depend on your printer's supported sizes, feed direction and margins.

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

All five native builds are checked in GitHub Actions before publication, including packaged slice drawing and sharing, cropped PDF dimensions, white-mask fidelity, EPS import, all six standard paper size/orientation combinations, saving/reopening and review regressions. SHA256SUMS files accompany the downloads.

Licensed under AGPL-3.0-or-later. Corresponding application source, Ghostscript source, complete MuPDF source, revision records and build instructions are provided as separate assets on this release. These source downloads are for rebuilding and redistribution; they are not required to run the app.

See the repository README for the full feature overview, installation guide and first-sheet walkthrough.
