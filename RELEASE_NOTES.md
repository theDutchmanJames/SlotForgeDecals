# SlotForge Decals 0.3.0

Print & cut for cutting machines and hand cutting, a Windows installer, faster everyday editing and a tidier workshop.

## Print & cut

- A new **Print & cut** panel sets how decals are cut out: lines that **follow each decal's shape** or a **rectangle**, with an offset around the artwork (default 1 mm). Nearby parts such as letters share one cut line and holes are not cut. Dashed lines on the sheet show the result, and any decal can override the sheet setting.
- **Export for cutter…** saves a folder with step-by-step instructions for **Silhouette Studio** (including the free Basic edition), **Cricut Design Space** or **Brother ScanNCut**. Each decal becomes a 300 DPI PNG with a white border along its cut line: inkjets print white as no ink, while the cutter software traces the border. Sheet files keep the exact layout: a page PNG with DXF cut lines for Silhouette, or an SVG with print and cut layers. The cutter software adds its own registration marks.
- **Print cut lines in the PDF** adds thin lines for cutting by hand or scanning a printed sheet with a ScanNCut.
- These files are checked for size and structure but have not yet been tested on every machine. Print on plain paper first.

## More ways to create

- **Batch racing numbers:** fill in *More numbers* (for example 1-30, 44, 51) in Racing Number Plates to create a plate or matching pair for every car at once; they fill free space and add pages as needed.
- **Recolour…** lists every colour in the selected decals, including inside SVG artwork, named colours and default black, and replaces the ones you change: handy for team variants.
- **Add mirrored copy (other side)** flips directional graphics such as arrows and stripes for the other side of the car. Editable text stays readable; lettering inside imported logos is mirrored too.
- **US Letter** and **custom paper sizes** (50–600 mm) join A4, A5 and Photo 4×6 in.
- **Four new cars** in the car preview: classic endurance GT, touring saloon, rally hatchback and Group C prototype, each with side and top views. Choosing a car sizes the model from the real car's length at your scale.

## Everyday editing

- **Copy, cut and paste** decals with Ctrl+C / Ctrl+X / Ctrl+V, also between sheets. Paste a copied image, a screenshot or SVG code to import it.
- **Choose installed font…** lists every font on your computer with a preview and embeds the chosen one in the sheet, so PDFs and shared sheets keep it.
- Every colour field has an **eyedropper** and quick **swatches** of your recent colours and the colours on the sheet.
- New artwork is placed in **free space** on the page instead of on top of existing decals.
- **Opacity** is a percentage slider with a live preview, and **undo** keeps 200 steps.

## A tidier workshop

- The **car preview** stays pinned at the top of the right panel while you edit a decal.
- **Import & Export** and the library windows follow the dark and light theme.
- Toolbar buttons that need a selection are greyed out with a hint until they can be used.
- **Help** is split into searchable topics with a keyboard-shortcut table.
- The PDF review lists one row per decal, merges identical copies and names any bitmap parts.
- The older .sfbackup format moved into a collapsible section of Settings.

## Updating and installing

Your saved sheets and decals remain in **Documents/SlotForge Decals**, outside the application. Sheets that use US Letter, a custom size or cut-line settings need Decals 0.3.0 or newer. Back up first through **Settings → Backup & Recovery → Export Complete Backup**.

| Computer | Installer | Portable |
| --- | --- | --- |
| Windows x64 | windows-x64-setup.exe | windows-x64-portable.exe |
| Intel Mac | mac-x64.dmg | mac-x64.zip |
| Linux x64 | linux-amd64.deb | linux-x86_64.AppImage |
| Linux ARM64 | linux-arm64.deb | linux-arm64.AppImage |

The Windows installer installs for your user account only, lets you choose the folder and never deletes your workspace when uninstalling. Apple Silicon downloads are added after their separate build passes. Mac builds require macOS 15 or newer. Windows builds are unsigned; Smart App Control may block them. Mac builds are ad-hoc signed, not Apple-notarized. There is no automatic in-app updater.

## Verification and sources

Local verification passed **122 unit tests** and **28 desktop suites**, including new checks for print & cut packages (DPI, millimetre sizes, DXF and SVG), copy and paste, clipboard images, installed fonts, recolouring, mirrored copies, batch numbers and custom paper. The packaged Windows build passed the packaged acceptance suites. All test workspaces are isolated from user data.

Licensed under **AGPL-3.0-or-later**; application source, corresponding Ghostscript and MuPDF sources, revision records and build instructions accompany the release. Bundled components retain their notices in THIRD-PARTY-NOTICES.txt.
