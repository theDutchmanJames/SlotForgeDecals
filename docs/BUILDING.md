# Building SlotForge Decals

The app is plain HTML/CSS/JavaScript with Electron 45.1.0. Use **Node.js 24**, npm and Git. Install dependencies on the target OS and architecture; never copy Windows node_modules to a Mac or Linux machine.

## Run from source

```sh
npm ci
npm run check
npm test
npm run setup:converter
npm start
```

EPS import needs the bundled converter. PNG, SVG, PDF and the editor do not need a system Ghostscript installation. Windows converter setup requires 7-Zip at its standard location, or set SEVEN_ZIP to its executable. It extracts the official installer without running it.

macOS needs Xcode Command Line Tools (`xcode-select --install`). Linux needs a C/C++ compiler, make and the usual desktop libraries. For Ubuntu 24.04:

```sh
sudo apt-get update
sudo apt-get install build-essential xvfb libnss3 libatk-bridge2.0-0 libgtk-3-0 libasound2t64 libgbm1 fonts-dejavu-core
```

Storage uses the bundled Node/Electron `node:sqlite` module in a worker; it does not add a native npm binding or require a system SQLite installation. Keep `src/sqlite-worker.cjs` in packaged files. Unit tests exercise migration and backup/restore; `node tests/sqlite-desktop.cjs` verifies the source or `SLOTFORGE_TEST_EXE` packaged app with an isolated workspace. `node tests/sqlite-scale.cjs` measures a repeated-artwork fixture with 1,000 saved sheets and up to 1,000 decals.

Run builds as your normal user.

## Native builders

- macOS: `bash "Build macOS.command" --no-pause`
- Linux: `bash "Build Linux.sh" --no-pause`

These install locked dependencies, check syntax, run unit tests, build Ghostscript for the host architecture and produce native packages in `dist/v0.2.20/`. They accept `--arch x64` or `--arch arm64`, which must match the host. `--quick` reuses matching dependencies and skips checks; it is for local iteration, not official release verification.

The lower-level commands, after dependency/converter setup:

```sh
npm run build:icons
npm run dist:win -- --x64 --publish never
npm run dist:mac -- --arm64 --publish never
npm run dist:linux -- --x64 --publish never
```

Run only the command for the current operating system and architecture. Windows creates a portable executable, macOS a DMG and ZIP, and Linux an AppImage and Debian package. Linux x64 file names use x86_64 for AppImage and amd64 for Debian.

Electron-builder 26.18.0 is pinned. Windows packages are unsigned; Mac apps use ad-hoc signing with hardened runtime disabled and are not notarized. Linux packages target Ubuntu 24.04-compatible systems. AppImage users may need FUSE support. No installer disables the Chromium sandbox.

## GitHub Actions releases

[Native desktop release](../.github/workflows/native-release.yml) runs on pushes to main and can be started manually from Actions. It builds natively on:

| Runner | Packages |
| --- | --- |
| windows-2025 | Windows x64 portable EXE |
| macos-15-intel | Intel Mac DMG / ZIP |
| ubuntu-24.04 | Linux x64 AppImage / DEB |
| ubuntu-24.04-arm | Linux ARM64 AppImage / DEB |

Apple Silicon runs separately on macOS 26 after the main release workflow succeeds. It builds and tests the exact released source, then adds the ARM64 DMG, ZIP and checksums to that public release. A delayed or failed Apple Silicon job does not hold up the other platforms.

Every platform runs syntax/unit tests. Windows also runs the full desktop regression suite. All four included packaged apps run the import/PDF/persistence integration test, all eight review regressions, and the editor/export UI test. Linux GUI tests use Xvfb and configure the setuid sandbox helper only on the isolated unpacked CI copy.

Only after all native builds and corresponding sources pass does the publisher verify checksums, create a draft release, upload every expected download, verify the uploaded digests, and publish it. The version tag must point to the exact tested commit. Existing published versions are never overwritten; bump package.json and package-lock.json for another release. Update RELEASE_NOTES.md in the same commit; keep release history out of the README introduction. Manual runs publish only when requested and run from main.

Pull requests run read-only syntax and unit checks. Publishing permissions are limited to the final job; build jobs have read-only repository access. No signing or publishing secrets are required beyond GitHub's scoped workflow token.

The [Apple Silicon workflow](../.github/workflows/recover-apple-release.yml) also supports manual retries: supply the completed native workflow's run ID and full source commit SHA. It requires successful source, Windows, Intel Mac and both Linux jobs, plus unexpired artifacts from that same commit. It checks out the original source, runs the normal Apple Silicon tests, and verifies the original downloads against the public release before uploading new assets. Existing files are never overwritten. The release notes are updated after upload verification. If the original release is still a draft, the normal complete-release publisher is used. Later application changes are not included in the recovered binary.

## Corresponding source and licences

Ghostscript **10.08.0** is built unmodified on macOS/Linux with embedded resources, using `scripts/build-ghostscript.sh`. On Windows the unmodified official binaries are extracted. Native builds reject runner-local dynamic library links.

- Windows installer: gs10080w64.exe from Artifex's [gs10080 release](https://github.com/ArtifexSoftware/ghostpdl-downloads/releases/tag/gs10080).
- Installer SHA256: `52a91b8bf09298788d7a57b9206127026c23eacd75405f0a131e26dc381dce50`.
- Ghostscript source SHA256: `c20492bc8ebb96c87fa2e52a0926e1cda8cde95d66145e018ac713fed5da38cf`.

MuPDF is the unmodified **mupdf@1.28.1** npm package, commit `20061bd45183f5a2bff8f43675e4da91e5ac2901`. Its complete source archive includes recursive submodules and upstream JavaScript/WASM build instructions in `platform/wasm/BUILDING.md`.

- Complete MuPDF archive SHA256: `421b6882db04c120dc8ec789fb830387b9434972bdebff421b6faa3917fc5c3f`.
- Submodule revision record SHA256: `63a215227e59a0c164ac29a6663b01543266cd67cb140eb662640c96e0ee13b0`.

`node scripts/collect-sources.cjs` obtains those checksum-pinned archives from the existing SlotForge Livery v1.1.0 release (or local vendor/sources), and archives the exact committed Decals source. The Decals release publishes them as its own assets alongside the binaries. Download the source archives, BUILDING.md and MUPDF-SOURCE-REVISIONS.txt from the same release when rebuilding or redistributing.

Release installers contain the licence and third-party notices. Corresponding sources are separate downloads on that same release. The older local Windows folder builder, `npm run pack`, also places sources inside its Sources directory; it needs both converter archives and the revision file under vendor/sources and the full Windows Ghostscript distribution under vendor/ghostscript. It refuses to overwrite an existing output folder.

## Verification

```sh
npm run check
npm test
npm run test:desktop
npm run test:package
```

Run GUI tests sequentially. They use isolated test-output workspaces, never the normal library. The packaged test runner finds the native unpacked app in dist/v<version>. For a custom executable set SLOTFORGE_TEST_EXE before running an individual test, for example `node tests/integration.cjs`. TEST_FONT can override the test font; defaults use Arial on Windows/macOS and DejaVu Sans on Linux.

Do not disable Electron's sandbox to fix a launch failure. In Linux CI, apply the documented root ownership and 4755 permissions to the test copy's chrome-sandbox helper, then use `xvfb-run -a npm run test:package`.

## Assets and vendored code

`assets/icon.svg` is the editable collection icon. `npm run build:icons` generates PNG and ICO files; electron-builder makes the Mac icon. The legacy Windows folder builder embeds/verifies ICO resources with resedit. Car illustrations and their provenance are documented in [ASSETS.md](ASSETS.md).

pdf-lib 1.17.1 and ImageTracer.js 1.2.6 are bundled unchanged with their notices. PNG tracing runs offline in a worker. See [THIRD-PARTY-NOTICES.txt](../THIRD-PARTY-NOTICES.txt) for all runtime and build-only components.
