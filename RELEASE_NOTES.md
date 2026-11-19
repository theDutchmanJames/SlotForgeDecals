# SlotForge Decals 0.4.0

A new look, shared with SlotForge Timing and Paddock. Everything works as before; it is calmer, clearer and easier to read.

## The new look

- **Titles** are set in Barlow Condensed and **numbers** (sizes, counts, versions) in Roboto Mono. Both fonts are bundled and only style the app: your sheets and their fonts are untouched.
- **One accent colour.** Red now marks only the main action of a window (such as Export PDF), the selected item and focus. Buttons are flat; delete is red text instead of a red block.
- **Neutral folders** in the side panels, with the title in capitals and a chevron on the right. An open folder has a thin red mark.
- **Windows** have a larger title with a line under it. Yes/No windows show a badge: **?** for a question, a red **!** for something that cannot be undone.
- The **light theme** uses warmer greys.

## The sheet bar and tools

- The **sheet name** is shown large above the sheet, with the paper size, orientation and scale beside it.
- The **saved state** is coloured: green when saved, yellow while saving, red if saving failed.
- Undo and Redo are compact icon buttons; **Export PDF** is the one main button.
- The editing tools above the sheet are grouped as **Select**, **Edit** and **Arrange**. **Snap** lights up when it is on.

## Settings, Help and the libraries

- **App Settings** has a side list (Appearance, Workspace, Backup & Recovery, Updates) with a status line for each, and every setting is one slim row. The theme is a Dark/Light switch, storage is shown as small tiles, and automatic update checks have an on/off switch.
- **Help** has the same side list with search, and each topic reads as one calm column.
- **Sheet Library** and **Decal Library** have one toolbar with search, sort, a Grid/List switch and the page buttons. Each card shows its preview edge to edge, with its buttons in a strip at the bottom.
- **Import & Export** and **Export for cutter** start with a short note on what the window does and when to use it.
- The **update notice** has a download badge and says which version you have.

## Updating and installing

Your saved sheets and decals remain in **Documents/SlotForge Decals**, outside the application. Sheets from 0.4.0 open in 0.3.0 and the other way round: only the look of the app changed. Back up first through **Settings → Backup & Recovery → Export Complete Backup**.

| Computer | Installer | Portable |
| --- | --- | --- |
| Windows x64 | windows-x64-setup.exe | windows-x64-portable.exe |
| Intel Mac | mac-x64.dmg | mac-x64.zip |
| Linux x64 | linux-amd64.deb | linux-x86_64.AppImage |
| Linux ARM64 | linux-arm64.deb | linux-arm64.AppImage |

The Windows installer installs for your user account only, lets you choose the folder and never deletes your workspace when uninstalling. Apple Silicon downloads are added after their separate build passes. Mac builds require macOS 15 or newer. Windows builds are unsigned; Smart App Control may block them. Mac builds are ad-hoc signed, not Apple-notarized. Updates are never installed automatically.

## Verification and sources

Local verification passed **143 unit tests** and **29 desktop suites** in both themes, including the layout of the new sheet bar, Settings, Help and the libraries. The packaged Windows build passed the packaged acceptance suites. All test workspaces are isolated from user data.

Licensed under **AGPL-3.0-or-later**; application source, corresponding Ghostscript and MuPDF sources, revision records and build instructions accompany the release. Bundled components retain their notices in THIRD-PARTY-NOTICES.txt.
