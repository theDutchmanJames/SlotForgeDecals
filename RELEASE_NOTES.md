# SlotForge Decals 0.2.20

Remove unwanted background shapes from imported vector artwork while keeping the decal vector and retaining an original you can restore.

## Edit Vector Artwork

- Select an SVG decal on your sheet and choose **Edit Vector Artwork** in the right-hand panel. This also supports vector artwork imported through EPS/PDF conversion.
- Click a drawing shape, browse with Previous / Next, or use **Next white shape** to find white backgrounds. Only the selected shape is removed, so white lettering and details stay unless you select them.
- Inspect the result against transparent, light or dark backgrounds, with Fit–800% zoom.
- Undo and redo changes inside the preview. Cancel leaves the sheet unchanged; Apply changes creates one sheet undo step and preserves printed size, rotation and placement.
- **Restore original** recovers the artwork from before the first vector edit. That original stays with saved sheets, library decals and editable sharing files, including after restarting.

Compound paths are selected as whole objects. Clipping paths, masks and reusable definitions are retained. Shapes used by linked copies, including children of linked groups, are protected from removal. Embedded bitmap backgrounds still need the image preparation tool; this editor removes SVG drawing objects, not individual pixels.

## Tracing and reliability

- Traced artwork remains compatible with colour and shape refinement after removing a background in the vector editor. Hidden shapes stay removed.
- Manual trace refinement preserves the retained vector original. Explicitly re-tracing creates a new vector result; undoing that regeneration restores the preceding result. The original raster image remains separately restorable.
- SVG visibility overrides are respected, preview styles are isolated from the app, and editor history is bounded. Controls remain accessible in smaller windows.

## Updating and installing

Your saved sheets and decals remain in **Documents/SlotForge Decals**, outside the application installation. This update does not change the database format. You can make an independent complete backup through **Settings → Backup & Recovery → Export Complete Backup**.

| Computer | Download |
| --- | --- |
| Windows x64 | windows-x64.exe — portable; double-click to open |
| Intel Mac | mac-x64.dmg — drag Decals to Applications; ZIP also available |
| Linux x64 | linux-amd64.deb or linux-x86_64.AppImage |
| Linux ARM64 | linux-arm64.deb or linux-arm64.AppImage |

Apple Silicon downloads will be added after the separate build and tests pass. Mac builds require macOS 15 or newer. Linux packages target compatible modern systems using Ubuntu 24.04 builders. Install the DEB through your software installer, or mark the AppImage executable. No Node.js installation is needed.

Windows builds are unsigned; Smart App Control may block them. Mac builds are ad-hoc signed, not Apple-notarized. The application sandbox remains enabled. There is no automatic in-app updater.

## Verification and sources

Local verification passed **99 unit tests**, **24 desktop suites** and **14 packaged Windows acceptance suites**. Coverage includes selective background removal, retained white details, vector PDF output, linked groups, clipping, trace refinement, undo, original restoration after restart, library sharing and both themes at a compact window size. All test workspaces are isolated from user data.

GitHub Actions builds and tests the native downloads before publication. Downloads include SHA256 checksum files. Licensed under **AGPL-3.0-or-later**; application source, corresponding Ghostscript and MuPDF sources, revision records and build instructions accompany the release. Bundled components retain their notices in THIRD-PARTY-NOTICES.txt.
