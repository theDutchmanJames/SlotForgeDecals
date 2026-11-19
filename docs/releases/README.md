# Release notes

`RELEASE_NOTES.md` in the project folder holds the notes for the next release. A push to `main`
publishes them as the GitHub release description.

## What's new: shown in the app

When Decals starts and finds a newer version, its update window shows the **What's new** section of
that release's notes. Decals reads only the lines under the heading `## What's new`, up to the next
heading, and shows them as plain text (bold, links and code marks are removed).

Keep it for users, short and concise:

- **At most six lines.** Longer lines are cut at about 280 characters.
- **One change per line**, best as `- **Name:** what it means for you.`
- **No "under the hood" changes** (tests, builds, code): put those under another heading, such as
  `## Verification and sources`, which the app does not show.

```markdown
## What's new

- **Sharper cut lines:** cleaner corners on small decals.
- **Calmer look:** new type, buttons and side lists throughout the app.
```

The update window also needs the download for each copy attached to the release with its usual name
(`SlotForgeDecals-X.Y.Z-Setup-x64.exe`, `-Portable-x64.exe`, `-mac-arm64.dmg`, `-mac-x64.dmg`,
`-linux-x86_64.AppImage`, `-linux-amd64.deb`, `-linux-arm64.AppImage`, `-linux-arm64.deb`). The
release workflows attach them all; a copy whose file is not attached yet (macOS and Linux follow a
little later) is told about the new version once it is there.

The update check itself comes from SlotForge Circuit (`docs/update-check-handoff.md` there):
`src/update-check.cjs`, `renderer/update-ui.js` and `renderer/update-window.css` are Circuit's files,
except that `update-ui.js` reads `window.desktop`, which is what Decals' preload exposes.
