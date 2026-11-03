# SlotForge Decals 0.2.17

Draw editable curves directly on your sheet, merge and cut shapes, create accurately sized racing patterns, and organise and share your decal and sheet collections more easily.

## Path Tool and Merge & Cut

- **Path Tool** has its own button in **Add artwork**. Draw on the main canvas, with options in the right-hand panel.
- Place straight points, drag to create Bézier curves, or draw freehand strokes that become editable paths. Open lines and closed filled shapes are supported.
- Move points and handles, enter exact coordinates, insert or delete points, and switch between smooth and corner points. Drawing undo/redo, zoom, pan and fit controls are included.
- **Finish Path** commits the edit; **Cancel** discards it. Switching tools or saving finishes a valid draft first. Incomplete drafts are protected from accidental tool changes.
- **Merge & Cut** also has a main-canvas button. Select 2–20 filled native shapes or closed paths and merge, cut from a chosen base, keep overlap or exclude overlap.
- Preview the result before applying, choose its base colour and optionally retain the originals. Supported groups work too; a group's first child supplies its fill colour.
- Results retain editable curves and transparent holes in saved/shared files and remain vector in PDF output. Imported SVGs, images, text and slices cannot be combined with these shape operations.

## Shapes and physical pattern sizing

- **Shapes & Patterns** adds diamonds, stars, regular polygons, arrows, chevrons, trapezoids and shields, alongside the basic shapes and racing number plates.
- Configure dimensions, colours, outlines and shape-specific settings with a live preview. Reopen the settings to adjust a saved shape or pattern.
- **Checkerboards** use a square size in millimetres. Adding rows or columns grows the pattern without squashing the squares.
- **Racing stripes** support 1–12 stripes, individual stripe widths, a default width and equal spacing in millimetres. Adding stripes or increasing spacing keeps each stripe's width.
- Patterns remain groups of editable shapes. Applying pattern settings regenerates their children; Cancel preserves individual edits.

## Libraries, importing and sharing

- **Import & Export** groups imports on the left and exports on the right, with clearer labels and selection dialogs.
- Both libraries share grid and two-column list views, search, sorting and multi-selection. View and sorting preferences are remembered.
- Import or export selected decals and sheets. A `.sfsheet` collection can contain up to 100 saved sheets, each retaining its own settings, artwork, fonts and pages. Choose individual pages when needed.
- **Save Decal to Library** saves one or more selected canvas items together as a reusable decal.
- The sidebar decal library has a bounded, scrollable area, grid/list controls and a working collapse toggle.
- Sheet naming is more visible, the scale control reads **Scale Conversion**, **Add Sheet** replaces New sheet, and the orientation button switches between portrait and landscape.
- Sheet batch imports preserve existing files if a write or publish step fails. Imported sheets receive independent identities.

## Review fixes

- Leaving an unchanged path preserves Undo/Redo, and Ctrl+S works while a Path Tool field has focus.
- Tiny paths save without floating-point validation errors; invalid point edits restore the displayed coordinates.
- Path and merge/cut previews respect layer order. Kept originals retain their actual opacity, and grouped results use the correct fill colour.
- Pattern colours and small resized patterns remain editable. Sheet-name alignment is corrected.

New paths, polygon shapes and multi-sheet collections require **Decals 0.2.17 or newer** in the receiving app. Existing single-sheet files and decal packs remain importable. PDF recipients do not need Decals.

## Download and install

| Computer | Download |
| --- | --- |
| Windows x64 | `windows-x64.exe` — portable; double-click to open |
| Intel Mac | `mac-x64.dmg` — drag Decals to Applications; ZIP also available |
| Linux x64 | `linux-amd64.deb` or `linux-x86_64.AppImage` |
| Linux ARM64 | `linux-arm64.deb` or `linux-arm64.AppImage` |

**Apple Silicon is excluded from this release.** Mac builds require macOS 15 or newer. Linux packages target compatible modern systems using Ubuntu 24.04 builders. Install the DEB through your software installer, or mark the AppImage executable. No Node.js installation is needed.

Windows builds are unsigned; Smart App Control may block them. Mac builds are ad-hoc signed, not Apple-notarized. The application sandbox remains enabled.

Your workspace stays in **Documents/SlotForge Decals**, separately from the application. Back up valuable work before updating; separately copy the **Projects** folder to preserve all saved sheets and histories. There is no automatic in-app updater.

## Verification and sources

Local verification passed 73 unit tests, all 21 desktop suites and focused tests against a fresh Windows package. GitHub Actions builds and tests all four included native targets before publication. Downloads include SHA256 checksum files.

Print at **Actual size / 100%** and check the proof's labelled reference bars. The car preview is a flat sizing guide. White-ink output still needs confirmation with your printer or print shop.

Licensed under **AGPL-3.0-or-later**. Application source, corresponding Ghostscript and MuPDF sources, revision records and build instructions accompany the release. Paper.js and other bundled components retain their notices in THIRD-PARTY-NOTICES.txt.
