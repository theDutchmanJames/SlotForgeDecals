# SlotForge Decals 0.2.18

Your sheets and decal library now use SQLite, with shared artwork storage, verified migration and complete backups covering all saved sheets and their history.

## Existing artwork stays with you

- On first launch, Decals migrates the current workspace, decal library, saved sheets, fonts, settings and saved history into `decals.sqlite`.
- Migration is checked before the database becomes active. The editor waits until loading finishes, and all original workspace and sheet files remain unchanged as recovery copies.
- Unreadable legacy files are reported and kept. Failed migration does not publish a partial database or silently overwrite existing artwork.
- After migration, the retained JSON and Projects files are migration-time copies, not current saves. Do not remove the database to return to those older files.

## Complete backup and recovery

- Open **Settings → Backup & Recovery → Export Complete Backup** to create a verified `.sfdbbackup` containing all saved sheets, their history, library decals, artwork, fonts and preferences.
- **Restore Complete Backup** keeps a recovery copy before replacing an existing database. It is also available on the startup recovery screen.
- Recovery covers damaged databases and unreadable legacy workspaces. Original damaged files remain available for recovery.
- Existing `.sfsheet`, `.sfdecal` and `.sfbackup` files remain supported. A legacy `.sfbackup` contains only the current sheet and decal library; it does not contain every saved sheet. Complete database backups require Decals 0.2.18 or a compatible newer version.

## Storage and responsiveness

- Identical artwork is stored once and reused by sheets and saved versions. Unchanged item documents are reused across saves.
- Database work runs in a background worker. Sheet listings load metadata, and library previews load as they approach the visible area.
- Undo no longer serializes embedded image and font strings merely to copy editable objects.
- Transactional saves, stale-session checks and verified backups protect related changes. Export writes are atomic and cannot replace live database files or retained sheet originals.
- Current library and sharing limits remain unchanged: the editor still loads the current sheet and decal library into memory. This update does not claim unlimited collections.

## Updating and installing

Before updating from an older version, keep an independent copy of your **Documents/SlotForge Decals** folder, including Projects and Backups. Migration retains that folder and its original files; allow space for the new database alongside them. Once migrated, use **Export Complete Backup** for future backups. App updates do not replace your workspace folder.

| Computer | Download |
| --- | --- |
| Windows x64 | `windows-x64.exe` — portable; double-click to open |
| Intel Mac | `mac-x64.dmg` — drag Decals to Applications; ZIP also available |
| Linux x64 | `linux-amd64.deb` or `linux-x86_64.AppImage` |
| Linux ARM64 | `linux-arm64.deb` or `linux-arm64.AppImage` |

Apple Silicon is excluded from this release. Mac builds require macOS 15 or newer. Linux packages target compatible modern systems using Ubuntu 24.04 builders. Install the DEB through your software installer, or mark the AppImage executable. No Node.js installation is needed.

Windows builds are unsigned; Smart App Control may block them. Mac builds are ad-hoc signed, not Apple-notarized. The application sandbox remains enabled. There is no automatic in-app updater.

## Verification and sources

Local verification passed **88 unit tests**, **22 desktop suites** and **12 packaged Windows acceptance suites**, plus a storage fixture with 1,000 saved sheets and up to 1,000 library decals. Tests use isolated workspaces, including real images, embedded fonts, migration failures, damaged databases, complete recovery, sharing and PDF output. GitHub Actions builds and tests all four included native targets before publication. Downloads include SHA256 checksum files.

Licensed under **AGPL-3.0-or-later**. Application source, corresponding Ghostscript and MuPDF sources, revision records and build instructions accompany the release. Bundled components retain their notices in THIRD-PARTY-NOTICES.txt.
