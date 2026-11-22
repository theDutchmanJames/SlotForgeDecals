# SlotForge Decals 0.4.0

Every screen redone, a new look shared with SlotForge Timing and Paddock, four more cars, and many fixes for safer saving and faster arranging.

## What's new

- **Workshop:** Decals now opens on a start page with all your sheets, their history and deleted sheets to recover.
- **Editor remade:** a slim top bar, a tool rail, Library/Layers/Pages tabs, Find (Ctrl+K) and a floating car fit check.
- **New pages:** a Decal Library with shelves and tags, a Car page to place the livery, and Print & share step by step.
- **Make on the sheet:** type text, racing numbers and shapes straight on the sheet; one Import bay for all artwork.
- **Four more cars:** classic and modern formula cars, a modern endurance prototype and a stock car.
- **Safer and faster:** autosave during non-stop editing, Undo on notices, and auto-arrange about 100× faster.

## A new look

- Calmer and clearer, shared with SlotForge Timing and Paddock: flat buttons, one red accent, **Barlow Condensed** titles and **Roboto Mono** numbers. Both fonts only style the app; your sheets and their fonts are untouched.
- The saved state is coloured: green when saved, yellow while saving, red if saving failed.

## Every screen redone

- **Workshop:** continue the open sheet, or start new: blank, from an image, from a shared file or the example. Every saved sheet with search, pin and filters, and a panel to open, rename, duplicate, share, pin, delete and see its history. Deleted sheets and snapshots can be recovered.
- **Editor:** a slim top bar with Find (Ctrl+K) and Export PDF; a tool rail with one-key shortcuts; Library, Layers and Pages tabs on the left; Decal, Layout and Sheet & paper tabs on the right. A selection bar above the selected decals, layers with thumbnails and locks, page thumbnails, and a zoom percentage with an actual-size button.
- **Import bay:** one window for all artwork, in steps: choose pages (PDF/EPS pages as separate decals), clean up, image or vector (trace), and size & place (on the car, quick sizes, 1, 2 or 4 copies).
- **Making artwork:** Text, Number and Shape: click to drop, drag to size, or Enter for free space. Type directly on the sheet with a small text bar. Racing numbers in rows, Recolour inside the Decal tab, and Edit vector over the sheet.
- **Decal Library page:** shelves for all, favourites, recently used, tags, untagged and each kind. Cards at the sheet's scale or true size. A details panel with tags, creator, sizes at 1:24, 1:32 and 1:43, and which sheets use the decal. Select several, and drag cards onto a tag shelf to tag them.
- **Layout tab:** align and space with exact spacing (with a note against the cutting gap), repeat with ghosts on the sheet, Most that fit, Fill the free space, page counts, and auto-arrange with a before/after preview.
- **Car page:** the whole livery on the side and top views, each decal at its printed size; drag to place and resize. Nine car bodies, or your own model from a photo.
- **Print & share page:** check the sheet (with one-click fixes), test print and measure, print on decal paper with white ink and cut lines, cut out for Silhouette, Cricut or ScanNCut, and share & back up.
- **Settings page:** the look, what Decals opens on, backups with a reminder, storage and updates. **Help** with three-step how-tos, Show me, and search. A **Fonts** tab with sample text, embedded fonts with clean-up, included fonts and computer fonts.
- **Clearer windows:** "Delete this?" windows say what will happen and what stays safe. Trouble cards start with "Your work is safe". Up to three notices at once, with Undo; a deleted sheet offers Recover.

## Update window

- About 5 seconds after Decals starts, it asks GitHub once whether a newer version is out. If there is one, a window shows the version, what is new in it, and the file for your copy (installer, portable app, disk image, AppImage or .deb).
- **Download** saves that file in your Downloads folder and checks it against the release; **Show in folder** then shows where it is. Decals never opens or installs it: close Decals and install it yourself.
- **Skip this version** hides the window until a newer version appears. **Settings → Updates** has Check now, and an on/off switch for the check at start.
- The Windows downloads are now named `Setup-x64.exe` and `Portable-x64.exe`, as in the other SlotForge apps.

## Fixes and speed

- **Safer saving:** auto-arrange and Undo no longer work from an out-of-date sheet; non-stop editing is now saved at most 2.5 seconds after the first change; closing right after an edit still saves it; interrupted backups and restores clean up their leftover files.
- **Print:** white ink works on long custom sheets, see-through decals keep their white, imported SVGs keep blend modes and hidden layers, and each font is in the print file once.
- **Clearer errors:** a damaged font says which font it is.
- **Faster:** auto-arrange with 300 decals went from 3.5 s to 0.03 s, filling a page is about 5× faster, and heavy image work runs in the background without freezing the editor. Snapshots are kept at least 10 minutes apart.

## Updating and installing

Your saved sheets and decals remain in **Documents/SlotForge Decals**, outside the application. Sheets from 0.4.0 open in 0.3.0 and the other way round. Back up first through **Settings → Backups → Back up now**.

| Computer | Installer | Portable |
| --- | --- | --- |
| Windows x64 | Setup-x64.exe | Portable-x64.exe |
| Intel Mac | mac-x64.dmg | mac-x64.zip |
| Linux x64 | linux-amd64.deb | linux-x86_64.AppImage |
| Linux ARM64 | linux-arm64.deb | linux-arm64.AppImage |

The Windows installer installs for your user account only, lets you choose the folder and never deletes your workspace when uninstalling. Apple Silicon downloads are added after their separate build passes. Mac builds require macOS 15 or newer. Windows builds are unsigned; Smart App Control may block them. Mac builds are ad-hoc signed, not Apple-notarized. Updates are never installed automatically.

## Verification and sources

Local verification passed **171 unit tests** and **41 desktop suites** in both themes, all with workspaces isolated from user data. On top of those: a coverage map (90.6% of code lines run by the tests), thousands of seeded random save and undo sequences, tests that kill the app mid-save, and an hour of random clicking (45,846 steps, storage intact).

Licensed under **AGPL-3.0-or-later**; application source, corresponding Ghostscript and MuPDF sources, revision records and build instructions accompany the release. Bundled components retain their notices in THIRD-PARTY-NOTICES.txt.
