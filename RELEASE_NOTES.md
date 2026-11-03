# SlotForge Decals 0.2.19

Keep up to **10,000 saved decals**, with libraries that load artwork only when needed. Startup and autosave no longer load or resend your complete decal collection.

## Browse larger collections

- Both libraries show 48 items per page; the sidebar shows 24. Use Previous / Next to browse.
- Search and sorting cover the entire library. Grid and two-column List views remain available.
- Previews load as they approach the visible area, using a bounded thumbnail cache.
- Selections stay checked across pages and searches. Select this page adds the displayed items; Clear selection clears the whole selection.
- Full artwork loads when needed for placement, editing, previews or selected exports. Export processing runs in the storage worker.

## Existing artwork is preserved

- The library upgrade creates a verified pre-upgrade complete backup in the workspace Backups folder.
- Existing decals become independent SQLite records in one transaction. Each stored decal is checked against its validated original; a failure rolls back the upgrade.
- Saved sheets, history, embedded artwork and fonts are retained. Original legacy files remain unchanged.
- Older complete backups can be restored and upgraded. **Decals 0.2.18 and earlier cannot open the upgraded database or new complete backups.** Use compatible editable sheet and decal exports for sharing with older versions.

## Backup, sharing and recovery

- **Settings → Backup & Recovery → Export Complete Backup** saves the whole collection, including all sheets, history, decals, artwork and settings.
- Sharing files retain their limits: **500 decals per .sfdecal pack**, **100 sheets per .sfsheet collection**, and approximately **160 MB per portable file**.
- Legacy .sfbackup files support up to 1,000 decals and 30 embedded library fonts. Use a complete .sfdbbackup for larger collections.
- If saving fails when closing, **Export Unsaved Sheet** rescues the current editable sheet without loading or replacing the library.
- Conflicting embedded font names are rejected when adding a decal or exporting a pack, protecting existing text. Existing sheet copies remain independent of their library masters.

## Updating and installing

Keep an independent complete backup before updating. Your workspace remains in **Documents/SlotForge Decals**, outside the application installation. Allow free space for the upgrade backup alongside the database. Retained JSON and Projects files are migration-time copies, not current saves; do not remove the database to return to them.

| Computer | Download |
| --- | --- |
| Windows x64 | windows-x64.exe — portable; double-click to open |
| Intel Mac | mac-x64.dmg — drag Decals to Applications; ZIP also available |
| Linux x64 | linux-amd64.deb or linux-x86_64.AppImage |
| Linux ARM64 | linux-arm64.deb or linux-arm64.AppImage |

Apple Silicon is excluded. Mac builds require macOS 15 or newer. Linux packages target compatible modern systems using Ubuntu 24.04 builders. Install the DEB through your software installer, or mark the AppImage executable. No Node.js installation is needed.

Windows builds are unsigned; Smart App Control may block them. Mac builds are ad-hoc signed, not Apple-notarized. The application sandbox remains enabled. There is no automatic in-app updater.

## Verification and sources

Local verification passed **97 unit tests**, **23 desktop suites** and **13 packaged Windows acceptance suites**. Tests cover 10,000 decals, migration rollback, exact artwork preservation, older backup restore, in-app recovery, cross-page selection and export, font conflicts, restart, PDF output and both themes. All test workspaces are isolated from user data. Large individual images and active sheets still require memory; this release does not claim unlimited collections.

GitHub Actions builds and tests the native downloads. Downloads include SHA256 checksum files. Licensed under **AGPL-3.0-or-later**; application source, corresponding Ghostscript and MuPDF sources, revision records and build instructions accompany the release. Bundled components retain their notices in THIRD-PARTY-NOTICES.txt.
