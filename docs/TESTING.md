# Verification record

## Native release — 0.2.12

46 unit tests and JavaScript syntax checks pass locally. The native Windows package passes EPS/SVG/PNG import, physical PDF dimensions, named white separation, saving/reopening, all eight review regressions and the editor/export UI suite. GitHub Actions repeats the packaged checks on Windows x64, macOS x64/ARM64 and Linux x64/ARM64 before publication. See the successful workflow run attached to the release commit for platform results.

## Earlier Windows verification

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
