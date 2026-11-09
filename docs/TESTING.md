# Verification record

## Selective vector artwork editing — 9 November 2026

Edit Vector Artwork is available in the inspector for SVG decals, including vector imports converted from EPS/PDF. Users can select drawing shapes directly or navigate to white shapes, remove a selected shape, zoom, switch preview backgrounds, undo/redo, cancel, apply or restore the retained original. Compound paths are edited as whole objects. Definitions are excluded from selection, and visible nodes referenced by linked copies are protected. Removed objects are hidden with an inline display override to preserve sibling order and SVG definitions. Imported styles live in a shadow root in the editor; selection markers never enter exported artwork. Undo history is bounded by step count and text size.

The original SVG is validated, sanitized before rendering, stored as a normal shared artwork asset, and retained in projects, grouped decals and portable packs. Applying preserves dimensions, rotation and car placement. Starting a new trace clears the older vector-edit original while retaining the tracing image; restoring a traced raster clears SVG-only metadata.

Review fixes protect children of groups referenced by linked copies, honour visible children inside hidden parents, preserve intentionally hidden SVG roots, and clean up dialog listeners and observers. Trace refinement accepts shapes hidden by the vector editor without bringing them back. Manual refinement retains the vector original; generating a new trace clears it, while undoing that generation retains it. Restoring the raster clears vector-only metadata. The dialog footer stays accessible at 1100 × 720, and Fit avoids an inline-SVG baseline scrollbar.

Validation passed **99 unit tests**, syntax checks, all **24 desktop suites** and all **14 acceptance suites in a fresh Windows x64 package**. Pixel checks find a fully transparent former background, opaque white interior detail and preserved gradient colour; the exported PDF contains two filled paths and no bitmap images. Tests cover pointer selection, Delete, keyboard undo, local and sheet undo/redo, cancel, retained originals after restart, library export, CSS/gradients, clipping, linked groups, visibility overrides, trace refinement/regeneration/restoration, locked artwork and both themes at 1100 × 720. Screenshots were inspected. An existing packaged freehand gesture check failed intermittently before passing a diagnostic run and the complete packaged rerun; the check now records canvas state and a screenshot if no path is created. Tests use isolated workspaces; no user workspace was opened. macOS and Linux were not run locally. No version bump or publication is included.

## On-demand libraries — 3 November 2026

Saved decals are independent SQLite records. Startup and autosave carry only the current sheet and preferences, plus a count on load. Database queries search and sort metadata, returning 48 entries per library page and 24 per sidebar page; previews load near the visible area through a shared cache capped at 64 entries / 8 million string characters. Selected exports hydrate only the requested records in the worker. The library limit is 10,000 decals; portable files retain their 500-decal / 100-sheet and 160 MB limits.

The v1-to-v2 upgrade writes a verified pre-upgrade complete backup, splits decals in one transaction, verifies each stored decal against its validated original, preserves duplicate-ID entries with independent identities, retains legacy fonts and leaves old source files intact. Tests inject a failure halfway through migration and confirm full rollback. Older complete backups restore and upgrade; older applications cannot open the new database. Legacy workspace backups remain limited to 1,000 decals and 30 library fonts, and complete backups cover larger collections. An unsaved-sheet rescue export remains available when autosaving fails.

Review fixes cover stale update/delete stamps, hidden selections across pages, font-name collisions, bounded font registration, restoring through the in-app Settings path, recovery of legacy sheet fonts, unique selection identities for saved versions, closing/reopening the sidebar during a pending query, and asynchronous artwork placement. Existing import/export tests now explicitly select saved decals and wait for query completion.

Validation: **97 unit tests**, syntax checks and **23 desktop suites** pass. The new desktop suite checks 155 decals and 110 saved sheets, SQL search/sorting, cross-page selection/export, rapid search changes, on-demand placement, font conflicts, in-app backup restore, restart and compact layouts in both themes. The large-library desktop regression verifies the 10,001st save is refused, an existing master can be updated at the limit, 500 selected decals round-trip, and an unsaved sheet can be rescued during a save failure. All workspaces are isolated under test-output.

The repeated-artwork benchmark migrates 1,000 sheets and grows the library through 100, 1,000, 5,000 and 10,000 decals. At 10,000, this Windows run measured about 8 ms for workspace load, 85 ms for a placement save and 23 ms for a 48-row sheet query. Startup stayed around 22.8 KB including the current sheet's image. The database was about 22.1 MiB. These are backend timings with one shared 16 KiB synthetic asset, not a guarantee for unique large images or UI latency. Individual artwork and the active sheet still require memory; backup verification, indexing, garbage collection and retained history still scale with the database. Asset base64 overhead remains.

All **13 acceptance suites pass in a freshly built Windows x64 package**, including the 10,000-decal limit, on-demand libraries, original migration and complete backup/restore. Both theme screenshots were inspected at a compact window size. macOS and Linux are not run locally. No version bump, push or release is included in this phase.

## SQLite migration — 3 November 2026

Local storage now uses a worker-owned SQLite database with transactions, content-addressed artwork and item documents, three rotating workspace snapshots and retained saved-sheet history. Migration stages and verifies the database before publication; all legacy files remain untouched. Portable sheet, decal and workspace formats remain compatible. Complete .sfdbbackup export/restore includes all saved records and assets, with a recovery copy before replacing an existing database.

The storage tests cover exact migration round trips, unreadable originals, migration publication failure, stale writers, no-op saves, rollback between dependent writes, all-or-nothing imports, reference-index and asset corruption, bounded workspace snapshots, saved-history retention, failed backup output, restoring damaged databases, recovery before legacy migration can succeed, and protection against exports overwriting live or retained files. The desktop migration fixture uses real PNG artwork and an embedded font, 50 sheets and 50 decals, history and an unreadable original. It checks visible-only previews, undo/redo, backup through Settings, restore to another workspace, restart and recovery through the startup error screen.

Review fixes include preventing edits during startup, declaring readiness only after car assets load, reloading recovered workspaces through the desktop process, rejecting damaged reference indexes in backups, retaining original transaction errors, migrating last-opened order and preventing partial exports. Raw pointer tests wait for layout frames before calculating coordinates.

Validation: all **88 unit tests**, syntax checks, all **22 desktop suites**, and all **12 packaged Windows acceptance suites** pass. The packaged tests include the SQLite worker, real-image/font migration, complete backup and startup recovery, library sharing, canvas paths and patterns, slicing, paper sizes, PDF export and persistence. Migration-library screenshots were inspected; dark-theme layout and scrolling remain intact.

The synthetic repeated-artwork scale fixture migrates 1,000 saved sheets and exercises 100, 500 and 1,000 library decals. On this Windows machine, migration took about 2.4 seconds; at 1,000 decals, a placement save took about 268 ms, a workspace load 302 ms and a 1,000-sheet metadata listing 108 ms. The final database was about 4.1 MiB with one shared artwork asset, compared with 21.5 MiB of original sheet files alone. These are backend measurements for repeated 16 KiB synthetic artwork, not a general guarantee for unique large images or end-to-end UI latency.

At this earlier phase, the renderer still hydrated the current sheet and decal library and sent a complete workspace snapshot when saving. SQL storage reuses unchanged documents and assets, but serialization, validation and metadata work still scale with collection size. Existing limits remain; unbounded libraries and fully paginated renderer storage are not claimed. Saved histories are retained and therefore still consume space. Original assets remain exact UTF-8 data URI/SVG strings in BLOBs; base64 overhead has not been removed.

All tests use isolated folders under test-output; the user's normal workspace is not opened. macOS and Linux migration have not been run locally. No version bump, push or release is part of this update.


## Full review of pattern sizing and canvas tools — 3 November 2026

Reviewed changes since the previous full library/creation review: physical checkerboard and stripe sizing, header alignment, editable paths, boolean geometry, main-canvas tools, persistence/sharing and PDF output.

Fixed small-path normalization rejecting valid geometry through floating-point rounding; unchanged path edits adding undo entries and clearing Redo; Ctrl+S being ignored while a Path Tool field had focus; path and merge/cut previews appearing above artwork that should cover them; kept originals being faded in the preview; and grouped boolean results taking an unused wrapper colour instead of the first child's fill. Invalid point-coordinate edits now restore the controls as well as the geometry. The group colour rule is documented in the app and user documentation.

All **73 unit tests**, JavaScript syntax checks and all **21 desktop suites** pass. New regressions cover tiny-path coordinate round trips, nested group colours, unchanged-edit history preservation, saving from a focused field, invalid-draft protection, preview layer order and retained-original opacity. PDF inspection confirms curved vector output with eight cubic segments, no raster images and a transparent cut-out. Existing checks verify physical square/stripe sizes, sheet-name alignment, library sharing and persistence.

A fresh Windows package passes the path, editor-control/pattern and selection/car-positioning suites. Light/dark and compact layouts were inspected; tool panels also pass overflow checks. Tests used isolated workspaces. macOS/Linux were not run locally. No version change, push or release was performed.

## Main-canvas Path Tool and Merge & Cut — 3 November 2026

Renamed the drawing tool to **Path Tool**. It and **Merge & Cut** now have dedicated buttons in Add artwork. Both operate on the main sheet canvas with controls in the right-hand inspector; their toolbox-menu entries and separate editing dialogs were removed. Path drafts remain separate from committed artwork until Finish, with local undo, cancellation, point/handle editing, Ctrl-wheel zoom and fit/pan controls. Switching tools or saving finishes a valid path; invalid drafts require finishing or cancellation. Merge/cut supports selecting shapes on the canvas before or after activation, previews at the actual sheet position, and requires explicit Apply.

Syntax checks and all **71 unit tests** pass. All **21 desktop suites** pass, plus focused tests of gesture cancellation, unfinished-draft/autosave protection, switching tools, inspector persistence through zoom, on-canvas selection, editable library round trips and curved vector PDF output. A fresh Windows package passes path, editor-control and selection/car-positioning tests. An initial packaged car-drag test intermittently missed its gesture; the test now waits for a stable, visible preview target before using raw mouse coordinates, and its final isolated run passed. Dark and light layouts were inspected, including a compact window. Tests use isolated workspaces; no version bump or publication was performed.

## Editable paths and shape operations — 3 November 2026

Added native editable paths with cubic Bézier handles, freehand smoothing, open/closed contours, point insertion/deletion, smooth/corner controls and local drawing undo. The sheet-reference editor supports zoom, pan, exact point coordinates and fit-to-path. Merge, subtract, intersection and excluded-overlap operations support filled native shapes, closed paths and supported groups. Results retain curves and transparent holes. Shape calculations use the bundled, unmodified MIT-licensed Paper.js 0.12.18 core; imported SVGs, images, text and slices are excluded from these operations.

JavaScript syntax checks and all **71 unit tests** pass. Unit checks cover handle and sharing round trips, exact curve subdivision, boolean areas, real holes, empty results, locks, rotations, mirroring, resized groups, base colours and freehand smoothing. All **21 desktop suites** pass. The path suite uses real pointer gestures to create curved closed paths and freehand lines, checks point insertion, handle dragging, cancellation and undo, and verifies library saving and restart persistence. Pixel inspection confirms a transparent hole; exported PDF inspection finds a curved vector path with eight cubic segments and no raster images. Both themes and compact windows were inspected.

A fresh Windows package passes the path, editor-control and sheet-sharing suites. All workspaces are isolated from user data. macOS/Linux were not run locally; no version bump or public release was made.

## Physical pattern sizing and header alignment — 3 November 2026

Checkerboards now use a physical square size; row and column counts grow the pattern. Racing stripes use individual physical widths and equal gaps in millimetres, with a default width for new stripes and an apply-to-all shortcut. Editing an existing stripe pattern reads its scaled geometry, including legacy double stripes. The preview keeps overall dimensions visible. Applying settings to a stretched checkerboard restores square cells; the dialog explains this before applying.

All 67 unit tests and JavaScript syntax checks pass. The editor suite verifies fixed square sizes, 12 individually sized stripes, spacing changes without thinning, colour retention, small resized patterns, undo and PDF output. PDF measurements confirm 4 mm, 0.5 mm and 2 mm stripes separated by 3 mm gaps within 0.01 mm, with vector paths and no raster images. Header labels and fields share a vertical centre at 1100, 1400 and 1600 pixels in both themes. A fresh Windows package passes the editor and page-size suites, including all six paper/orientation PDF combinations. Test workspaces are isolated; nothing was published.

## Full review of the library and creation changes — 2 November 2026

Reviewed all local changes since 0.2.16: import/export selection, both libraries, sheet collections and persistence, editor controls, native polygon shapes and configurable patterns. Fixed pattern colours resetting when reopening their settings and small resized patterns failing to open for adjustment. Patterns now retain valid editable child geometry at small printed sizes. Closing a library also stops its pending preview work from updating the closed window.

Sheet batch imports now stage and flush complete temporary files before publishing them to the library. Simulated write and publish failures leave the original saved sheets unchanged and remove files from the failed batch. An abrupt process interruption can leave complete imported sheets or ignored temporary files; the entire batch is not a single filesystem transaction.

JavaScript syntax checks, all **65 unit tests**, all **20 Windows desktop suites**, and **four suites against a freshly built Windows package** pass. The packaged checks cover editor controls/pattern editing, collection sharing, project history/recovery and line/stripe thickness. Custom colours and tiny checkerboards/12-stripe patterns are covered by regression tests. PDF inspection found 57 vector paths and no raster images for the tested shape sheet. Both themes and compact layouts were reviewed. All test workspaces are isolated from real user data. These changes remain local; macOS/Linux were not tested locally.

## Editor controls and Shapes & Patterns — 2 November 2026

All 64 unit tests and 20 Windows desktop suites pass. `tests/editor-controls.cjs` uses more than 50 decals and 50 saved sheets to verify two-column library lists, scroll limits, sidebar view/fold persistence and scroll preservation. It checks saving a multi-item selection without changing the canvas originals, sheet renaming, orientation and undo, scale conversion, Add Sheet, and matching toolbar/sharing export pickers. Both themes are checked at 1100, 1400 and 1600 pixels with no overlapping project controls.

The creation checks cover the shape gallery, adjustable stars, arrows, checkerboards and stripes, invalid parameters, parameter editing, cancel/undo, and upgrading an existing double stripe to 12 stripes without changing its identity, placement or dimensions. PDF inspection confirms native paths and zero raster images. Unit tests round-trip every new preset through decal sharing, validate normalized polygon coordinates and pattern bounds, and exercise 1, 5 and 12 stripes plus transparent outlined shapes. The Windows package is tested separately using isolated workspaces; macOS/Linux builds are not run locally for these changes.

## Import/export and library redesign — 2 November 2026

Both libraries and the import/export pickers use one shared selection browser. Verified grid/list views, remembered sorting, checkboxes, Ctrl/Shift range selection, hidden selections during search, white action buttons, export-only red titles, and compact layouts in both themes. Sheet collections preserve individual settings and embedded fonts; selecting pages renumbers page references without resizing or moving artwork. Imports create independent library entries and leave the current editor open. Legacy single-sheet files and blank templates still work.

All 63 unit tests and 19 Windows desktop suites pass. The sheet-file tests cover legacy/collection round trips, nested artwork, font retention, invalid data, independent identities, persistence, and rollback after a simulated disk failure. `tests/collections.cjs` (also run through `tests/sheet-sharing.cjs`) covers selective sheet/page and decal sharing, another installation's workspace, malformed saved blanks, cancellation, failed writes, restart preferences and the separate backup-restore route. A fresh Windows package passes the collection, project/history and core UI/PDF suites. All test workspaces are isolated from real user data. macOS/Linux have not been run locally for this redesign; no new public release was created for it.

## Local review — 2 November 2026

Reviewed changes since the slicing review: theme-aware branding, the PDF artwork review, Ctrl+mousewheel zoom, Sheet Library saving/sharing, and Apple Silicon release recovery. Fixed an imported blank `Untitled sheet` template not being stored in the library. Later edits to saved blank templates are now preserved on switching; an unreadable saved blank blocks switching instead of silently skipping its save.

JavaScript syntax checks, all 61 unit tests and all 19 Windows desktop suites pass. A newly built Windows package also passes sheet-sharing and PDF-review/zoom suites, including cancelled/failed exports, independent imports into another workspace, embedded fonts, groups, slices, multiple pages, restart persistence, mixed SVG artwork, white-mask notices, and unchanged print dimensions. Both themes, bundled logos, the 120 × 22 px footer and long-title layouts were checked at seven widths (1100–1600 px), including the responsive breakpoint. Test workspaces are isolated from real user data.

Release-recovery validation tests pass. Version 0.2.16 was subsequently published with Windows, macOS Intel and both Linux architectures after their CI checks passed. At the user's request, the separate manual publishing workflow omitted the stalled Apple Silicon build, verified the exact source/artifact commits and checksums, and disclosed the missing platform in the release notes. Normal release builds still require all five platforms.

## Slicing update — 0.2.15

Syntax checks, all 57 unit tests and all 17 Windows desktop suites pass. The rebuilt Windows preview also passes the new slice regressions. Tests compare actual rendered PDF colour output and complete white masks before and after ungrouping, and check edge artwork in a reused full-width slice. GitHub Actions repeats all Windows desktop suites and seven packaged suites on each native target before publication.

## Icon update — 0.2.14

Syntax checks and all 51 unit tests pass. The packaged Windows editor smoke test passes, including PDF export, editable sheets and library packs. The Windows executable's seven embedded icon images match the generated ICO byte for byte. The packaged app reports 0.2.14 and loads the new header icon; dark and light previews were captured, and the README screenshot was refreshed. GitHub Actions runs the full native release checks before publication.

## Paper sizes — 0.2.13

51 unit tests, syntax checks and all 15 source desktop suites pass locally. The paper-size suite checks the top-bar picker at 1600 and 1100 pixels in both themes, aligned controls, unchanged artwork, undo/redo, print-bound warnings, editable-file import/export, white ink and persistence. All six paper/orientation combinations produce two-page PDFs with exact page boxes; an 18 × 10 mm vector decal measures within 0.001 mm of its intended dimensions. Photo proofs use labelled 50/100 mm rulers and have been rendered for visual inspection.

Five model/storage/PDF tests cover legacy A4 defaults, invalid sizes, layout bounds, histories, workspace versions and white separations. The native Windows package passes all five packaged suites (paper sizes, dialog events, integration, review fixes and editor UI). Pointer tests explicitly scroll their targets into view before dragging. The paper-size desktop suite runs in every native packaged build before release publication.

## Native release — 0.2.12

46 unit tests and JavaScript syntax checks pass locally. The native Windows package passes EPS/SVG/PNG import, physical PDF dimensions, named white separation, saving/reopening, all eight review regressions and the editor/export UI suite. GitHub Actions repeats the packaged checks on Windows x64, macOS x64/ARM64 and Linux x64/ARM64 before publication. See the successful workflow run attached to the release commit for platform results.

## Earlier Windows verification

The native ARM64 run exposed a delayed HTML-dialog close event cancelling a new import. A deterministic regression failed before the fix and passes afterward. The shared dialog now ignores stale close events after reopening; Escape still cancels the current import. This check runs in every packaged build.

Verified on Windows x64, Node 24.21.0 and Electron 45.1.0 on 1 November 2026.

The Circuit-style top-right Light/Dark control was checked in the packaged app for keyboard activation, settings synchronization, 1100 px layout, unchanged artwork and theme persistence after restart. The startup selector error found during that check was corrected before delivery.

`node tests/thickness.cjs` verifies line/stripe thickness changes with fixed lengths, live A4 geometry, undo/redo, preserved outline controls on rectangles and persistence. PDF geometry measured 3.99993 mm for a 4 mm line and 4.19993 mm for each band of a 10 mm paired-stripe design (42% band, 16% gap, 42% band).

- JavaScript syntax checks and 43 unit/storage/PDF/tracing/selection/layout/project/image-preparation/artwork-type/creation/finishing/review-regression tests pass.
- Desktop smoke test: example library and A4 editor, editable text, imported and embedded fonts, rotated canvas dragging/resizing, explicit library save, undo/redo, automatic arrangement, PDF/proof export, editable sheet export/reopen and decal-pack export. No renderer exceptions.
- Integration test: SVG gradients/CSS/clipping, 4,000-object SVG, rejection of unsafe CSS/script/circular symbols, local EPS conversion, PNG import and resolution checks, import scale synchronization, top-view car dragging, decal pack export/import and persistence across restart.
- Exact portrait and landscape A4 page boxes inspected through MuPDF; two-page landscape export checked.
- A requested 18 × 10 mm rectangle measures 17.9996977 × 9.9998321 mm in both exported pages (tolerance 0.01 mm).
- Example PDF contains native vector paths and text with no flattened page image. Export and sizing-proof pages have been rendered and visually inspected.
- White plate tests confirm a named `/Separation /RDG_WHITE` colour space and stencil image. Integration verifies the actual 600 PPI mask export path.

Commands and isolated profiles are documented in BUILDING.md. The portable executable is checked with the same desktop suites before delivery.

## Multi-selection and car placement

`node tests/selection.cjs` exercises marquee selection in both directions and from outside the paper, zoomed coordinates, Ctrl/Shift-click on canvas and layers, additive marquee selection, locked artwork and other-page protection, moving multiple items, cancellation, undo/redo and persistence. It verifies that all selected decals appear at their real sizes and retain relative spacing, that each car placement moves independently without changing A4 coordinates, and that enlarged preview sizing remains available for a single decal. Unit tests cover precise intersection with rotated artwork.

## Enlarged car preview sizing controls

`node tests/car-preview.cjs` checks live width/height changes to an actual PNG on both the car and A4 canvas, linked and independent proportions, unchanged A4 position/rotation, centred car placement in both views, one undo step per typing session, invalid input recovery, locked/no-selection states and persistence after restarting. It runs against both source and packaged applications.

## Image import and tracing details

`node tests/tracing.cjs` exercises the actual native file chooser from the welcome screen and library, imports a PNG, sizes it, and runs tracing in the real Electron worker. It verifies preview invalidation after changing settings, replace/copy/cancel, undo/redo, original restoration, vector SVG/PDF export, saved decal-pack export/import and persistence after restarting. The new artwork and pack import buttons are checked independently.

The 640 × 400 pixel transparent test roundel becomes three vector paths with two colours. Colour checks verify the red ring and dark lettering; rendered pixel checks verify transparency outside the logo and inside the cut-out. Its PDF contains three filled paths and zero bitmap images. Unit tests cover transparent RGB handling, enclosed-white preservation, deterministic tracing, invalid inputs and original-image metadata in shared files. A reviewed preview screenshot is saved in `docs/tracing-preview.png`.

Not validated: physical printer output, white-ink RIP compatibility, exhaustive SVG/EPS dialect coverage, exact geometry of specific real car bodies, third-party operating systems or a signed installer. Untraced raster content remains raster; traced content is an approximation. No online sharing service or 3D mapping is claimed.

## Arrangement update (0.2.5)

`node tests/layout.cjs` checks live grid previews, invalid-grid rejection, exact cell gaps, unchanged originals, undo/redo, moving to existing/new pages, alignment and distribution, lock controls, mirroring and persistence. PDF inspection confirms a mirrored asymmetric SVG stays vector artwork with a 20 × 10 mm footprint and reflected vertices within 0.01 mm. Pixel checks verify a mirrored PNG swaps its red/blue halves and that mirrored grouped artwork looks identical after ungrouping. Five layout unit tests cover rotated bounds, grid counts and limits, equal gaps, alignment, reversible mirrors, sharing and page moves. Source editor and selection regression suites also pass.

## Project browser (0.2.6)

`node tests/projects.cjs` checks thumbnails and legacy files, name search and sorting, automatic preservation when switching or starting a new sheet, history recovery into independent copies, unchanged saved-library content, explicit blank-sheet saving, unreadable-file preservation, failure to save the outgoing project, and persistence across restart. It rotates all workspace backups after opening a recovery preview to confirm that the reviewed snapshot is the one recovered. Dark, light and 1100-pixel layouts are captured. Existing editor tests cover the updated editable-sheet import/export flow with embedded fonts.

Four project-store unit tests cover serialized saves, unchanged-save deduplication, historical versions, persistent recent ordering, legacy/duplicate projects, unreadable file protection, stale-version detection, path traversal rejection and rotating workspace backups.

## Image preparation (0.2.7)

`node tests/image-prep.cjs` exercises the actual image-preparation worker, colour picking, tolerance and invalid/empty results, transparent-edge trimming, manual drag cropping, preview backgrounds, cancellation, undo/redo, prepared copies, locking, saved library packs, restart persistence, and tracing/restoration. Pixel checks confirm transparent corners, preserved enclosed white and unchanged red artwork. Cropping a 200 × 120 px image at 40 × 24 mm down to 120 × 80 px produces 24 × 16 mm and preserves placement on the A4/car views. Restoration after doubling the prepared width restores the original at twice its original printed scale.

Five unit tests cover edge-connected removal, chosen-colour tolerance, preserved soft transparency, exact trimming, invalid bounds and image-size limits, unchanged PPI and source-point placement for every mirror combination at a nonzero rotation, sharing metadata, tracing compatibility and original restoration. Existing import/tracing GUI regressions also pass.

## Trace refinement (0.2.8)

`node tests/trace-refinement.cjs` verifies colour replacement across multiple shapes, invalid-colour handling, individual shape removal, local and sheet undo/redo, both directions of linked zoom/scroll, preserved transparent cut-outs, unchanged physical placement, saved refinements on reopening, reversible re-tracing, cancellation, library packs, original restoration and restart persistence. SVG checks exclude selection-only attributes; PDF inspection finds two recoloured green vector paths, no removed black speck and zero bitmap images. A styled unsupported SVG is rejected before inline preview insertion. The artwork-type unit test covers original raster, traces, embedded bitmaps and nested groups. Existing tracing and image-preparation regressions also pass.





## Group editing and racing numbers — 0.2.9

Four creation tests cover template fitting and proportions, valid pack round trips, isolated nested edits, retained parent transforms, undo/redo, invalid-edit rollback, locks, last-element protection and detached draft/addition data.

`node tests/creation.cjs` uses an isolated workspace to exercise matching roundel pairs, library-font retention in the project, text and colour edits, cancellation, local and sheet undo/redo, invalid dimensions, locked elements, nested rotated/mirrored/resized groups, additions and removals, editable library packs, restart persistence and pairs requiring a new A4 page. The exported A4 PDF contains two vector paths and two text operations with zero raster images. Dark-theme dialogs and the light-theme editor at 1100 × 800 are visually inspected. The complete group retains its printed dimensions and car placements.

The existing desktop smoke test also passes, including imported fonts, sheet and pack export/reopening, canvas manipulation and PDF output. Native tests run sequentially; no normal user workspace is opened.

## Curved text and artwork outlines — 0.2.10

Three finishing tests cover signed arc geometry, baseline length and metadata round trips, exact contour conversion to millimetres, outline size/centre/transform preservation, restoring sources after nonuniform scaling, saved packs and invalid values.

`node tests/finishing.cjs` verifies custom-font curves in both directions, reversible straight text, retained A4/car centres, group editing, maximum bends, undo/redo, SVG gradient and cut-out outlines, width and threshold validation, cancellation (including during preparation), an empty-image error, adjustment and removal, saved packs and restart. The vector fixture PDF contains nine native text operations, a gradient and an outline path, with no raster image. A requested 0.5 mm outward border uses a 0.999983 mm stroke beneath the artwork (expected 1 mm). Raster pixel checks distinguish the green outer/inner border, original red artwork, transparent cut-out and clear background; the retained source image is unchanged.

The creation regression and core desktop smoke tests also pass after these additions. Dark-theme curved-text and outline previews were visually inspected. These are software checks; physical printer validation remains the user's final sizing proof.

## Full-review fixes — 0.2.11

Six additional tests cover pointer-resize size and outline constraints, nested overflow geometry through rotation/mirroring/nonuniform scales, safe auto-arrangement, effective opacity and refusal to change overlapping transparency, collection limits and export/import agreement, storage rejection without rotating backups, and recovery from semantically invalid primary JSON without modifying that file.

`node tests/review-fixes.cjs` repeats all eight review scenarios in an isolated desktop workspace. A 40 × 1 mm line dragged toward 2 mm wide stops at 4 × 0.1 mm and survives restart. Width 0 followed by width 25 accepts the correction; locked inputs are disabled and their handlers also guard edits. Moving a group child beyond A4 triggers print warnings and an export-review dialog; its standalone preview contains the overflow (red pixel check), and Auto-arrange fits the entire group. Ungrouping multiplies safe opacity, while overlapping group transparency is protected. The 1,001st library save is refused, updating at 1,000 succeeds, and restart succeeds. A 500-decal export round-trips; 501 is blocked. With workspace writes deliberately failing, a backup still exports all 1,000 entries plus the current unsaved sheet name and validates for restoration. No renderer exceptions are allowed.

## Slice placement and inherited ink

`node tests/slice-regressions.cjs` checks full-width library placement and visible edge artwork in a real PDF. It changes group ink through the inspector, ungroups nested slices, and compares the entire white mask and rendered colour PDF before and after. White-only artwork remains off the colour plate, white backing is retained, and undo/redo and decal-pack sharing preserve the result. The suite runs in both desktop and packaged checks. Unit tests additionally cover full-height, rotated and oversized placements across every sheet size and orientation without resizing artwork.
