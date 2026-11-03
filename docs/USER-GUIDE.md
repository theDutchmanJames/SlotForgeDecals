# SlotForge Decals user guide

See the [README](../README.md) for downloads and installation.

## Choose your paper size

Use **Sheet size** in the top bar, beside the project name. Choose **A4 (210 × 297 mm)**, **A5 (148 × 210 mm)** or **Photo 4×6 in (101.6 × 152.4 mm)**. Click the **Portrait / Landscape** button in the top bar to switch orientation, or use **Paper & white ink → Orientation**. Every page in a project uses the same size.

Changing paper keeps artwork at the same printed size and position. On a smaller sheet, review **Print checks** and reposition decals or use **Auto-arrange**. Undo restores the previous paper choice. Existing projects open as A4; new sheets start as A4.

The paper choice is saved in projects, editable sheet files and workspace backups. A5/Photo editable files and backups need Decals 0.2.13 or newer; older versions reject them to prevent incorrect paper sizing. PDFs can be viewed and printed independently of Decals.

## Import your own picture

Use **Import an Image** in the left-hand Add artwork panel, on the welcome screen, or in **Import & Export**. You can also drop artwork onto the sheet. Choose PNG/JPEG/WebP or SVG/EPS/PDF, set the printed width and scale, and click **Add to sheet**. **Import Decals** is the separate action for saved decals shared by other users.

## Editor controls and selected decals

Click the bordered **Sheet name** field (with its pencil icon) to name your work. **Scale Conversion · 1:32** opens the scale conversion dialog and shows the current scale. **Add Sheet** saves your outgoing work and starts a separate sheet; **Add page** below the canvas adds a page to the current sheet instead. The toolbar’s **Export sheet…** and the Import & Export screen use the same sheet/page selection window.

Select one or more items on the canvas, then click **Save Decal to Library** in Add artwork. Enter a name and optional tags, then save. Multiple selected items are saved together as one reusable grouped decal; their canvas originals stay unchanged. The button is disabled when nothing is selected.

## Shapes and racing patterns

Open **Shapes & Patterns** to choose basic shapes or configure a diamond, star, regular polygon, arrow, chevron, trapezoid, shield, checkerboard or racing-stripe pattern. Text remains a separate quick-access tool. The preview updates as you change dimensions and colours. Stars have adjustable point counts and inner radius; polygons have adjustable sides; arrows and chevrons have adjustable proportions. Polygon shapes also support transparent fills and outlines. Click **Add to Sheet**, then use **Adjust Shape / Pattern** in the inspector to revisit the settings.

**Checkerboard** uses a **Square size (mm)** plus row and column counts. Adding rows or columns grows the overall pattern while each square keeps that size. A stretched older pattern is squared up when you apply its settings; Cancel keeps the original.

**Racing stripes** offers **1–12 stripes**, a length and equal spacing in millimetres, and two alternating colours. Set each stripe’s thickness under **Individual stripe widths**, or enter a **Default stripe width** and click **Apply width to all stripes**. The default also sets the width of newly added stripes. Increasing the count or gap grows the overall pattern without thinning the stripes. The preview shows the total printed dimensions.

To change existing double-stripe artwork, select it and choose **Stripe Count & Spacing**. Its existing widths and gap are used as starting values. Applying turns it into an editable group at the same position; Undo restores the original. Rotate the result for vertical or diagonal stripes.

Checkerboards and stripes are groups of individually editable rectangles. You can use **Edit group** for individual changes. Reapplying the pattern settings regenerates those children, so review the preview first; Cancel keeps the previous artwork. Shapes and patterns remain vector in PDF output and editable in shared files. New polygon shapes need a receiving app with support for these tools.

## Path Tool

1. Choose **Path Tool** in the main **Add artwork** folder. Draw directly on your sheet; all tool options appear in the right-hand panel.
2. Choose **Pen / Bézier** to click straight points or drag while placing points to create curves. Choose **Freehand** to draw a stroke; it is smoothed into editable points.
3. Click the first point to close a pen path, or use **Closed shape**. Open lines need a non-zero line width. Set the line/fill colours and optional transparent fill.
4. In **Edit Points**, drag a point to move it, or drag its blue handles to shape a curve. Hold Shift while dragging a handle to mirror the opposite handle. Use **Smooth point**, **Corner point**, **Insert point after** or **Delete point**. X/Y fields set exact sheet coordinates.
5. Use **Ctrl + mousewheel** to zoom, **Pan** to move around, or **Fit Sheet / Fit Path**. **Undo drawing / Redo** (also Ctrl+Z / Ctrl+Shift+Z) affect the active drawing. **Finish Path** or Enter commits one undoable edit; **Cancel** or Escape discards it. These buttons stay at the top of the right panel while you scroll through the options.

Switching to another editing tool or saving finishes a valid path first. An incomplete path must be finished or cancelled before switching. Automatic workspace saves retain the committed sheet while a drawing is unfinished. Closing the app also finishes a valid path before saving.

Select a path on the canvas and choose **Edit Points & Curves** to edit it on the main canvas with its options on the right. Paths, including curve handles and holes, survive library saving and editable file sharing. PDF keeps the vector geometry; the receiving app needs path support to edit shared files.

## Merge and cut shapes

Choose **Merge & Cut** in the main **Add artwork** folder, then select 2–20 unlocked, filled native shapes or closed paths on the canvas. You can also select the shapes first and use **Merge / Cut Shapes** in the selection inspector. Ctrl/Shift-click adds or removes shapes; drag empty canvas to select several. Options appear in the right-hand panel and the canvas previews the result at its actual position.

- **Merge** joins the filled areas.
- **Cut** subtracts the other shapes from the selected **Base shape**.
- **Keep Overlap** retains the area common to all selected shapes.
- **Exclude Overlap** retains areas covered by an odd number of selected shapes.

Review the canvas preview, choose the base shape for the result’s colour, opacity and ink treatment, then click **Apply**. **Cancel**, Escape or switching away keeps the originals. **Keep original shapes too** adds the result without replacing the selection. Empty results cannot be applied. Results are editable paths with real transparent holes and Bézier curves. Undo restores the original shapes.

Groups of supported shapes also work; the first child supplies the result’s fill colour. The calculation uses filled areas, and the result has no outline; add one afterwards if needed. Images, imported SVGs, text, slices, open paths and transparent-fill shapes are not supported. Closing a path and giving it a fill makes it eligible.

## Sidebar library

Click the **Decal Library** heading to fold or unfold it. Its **Grid / List** buttons change the compact sidebar view, and the artwork area scrolls within a screen-relative height limit; adding 50 or more decals does not turn it into an indefinitely growing menu. The fold state and view are remembered. Open the full library from the top navigation for search, sorting and multi-selection. Both full libraries use two columns in List view.

## Racing-number templates

Choose **Shapes & Patterns → Racing Number Plates** in Add artwork. Pick a roundel, oval plate or rectangular number plate; set the number, typeface, colours, border and printed dimensions. Roundels keep a circular shape. The preview updates as you change settings.

Choose **One decal** or **Matching pair**. Both copies in a pair have readable, identical numbers and can be edited independently. Pairs use the sheet’s cutting gap; if necessary they are placed vertically or on another page. Existing artwork stays in place, so review Print checks or use Auto-arrange if decals overlap.

Templates are regular groups of vector shapes and editable text. Select one, choose **Edit group**, then save the finished design to your library when ready.

## Edit inside a group

Select a grouped decal and choose **Edit group** in the inspector. Choose an element from the preview or list to edit its text, font, colours, size, position, opacity and outline. You can add text, rectangles and ellipses, change layer order, lock elements and remove them. At least one element must remain in each group. Imported images and SVGs retain their contents; their placement and size can be changed here.

Use **Edit nested group** to go deeper and the breadcrumb buttons to return. The upright preview shows the group’s original design coordinates. A resized group can have different design and printed dimensions; the note below the preview shows both. Changing the contents keeps the complete group’s sheet size, rotation, mirroring, ink treatment and car placement. Text edits preserve letter proportions and centre the new text at its previous position; review the fit after changing a number.

**Undo / Redo** work within this editing session. **Cancel** discards the session. **Apply changes** updates the sheet as one undoable edit. Sheet copies and saved library masters remain independent; explicitly save or update a library decal to keep a reusable version. Editable contents travel with saved sheets and decal packs.

## Curved text

Select text and set **Text bend (°)** in Text & appearance. Positive values arch upward, negative values curve downward, and 0 restores straight lettering. The range is −300° to +300°. Bending keeps the letter scale and the decal’s centre, so its overall width and height change; review the fit and printable margins afterward. The same control is available for text inside **Edit group**.

Text, fonts, letter spacing, fill and outlines remain editable. Curves are native SVG text-on-path, and PDF export preserves text. Custom fonts are embedded in the project. Use this version or newer to edit and render curved lettering from shared sheets and packs.

## Outlines for imported artwork

Select a PNG/JPEG/WebP or imported SVG/EPS/PDF decal and choose **Add silhouette outline**. Set a colour and an outward width from 0.05 to 10 mm. The preview follows opaque artwork and transparent cut-outs. An image with an opaque background receives a rectangular border; prepare its background before outlining if necessary.

The silhouette is sampled at up to 600 PPI (maximum 1536 pixels per edge) and approximated with vector contours. The preview reports the effective sampling resolution. For soft or partially transparent edges, adjust **Transparency threshold** and click **Update silhouette**. Border width and colour changes update immediately after the silhouette is ready. Review small details and soft edges before applying; the approximation is not a cutting-machine contour guarantee.

The original artwork is kept inside an outlined group at its existing printed size, rotation and placement, including its car reference placement. Overall dimensions grow by twice the chosen border width. SVG artwork stays vector; PNG artwork stays raster, with a vector border. White-ink treatment applies to the complete result. Undo, Cancel, **Adjust outline** and **Remove outline** are supported. Removing the outline restores the original at its current scale.

An outlined decal scales as a complete unit. Reopening Adjust outline rebuilds a uniform border at the chosen millimetre width. Use the dedicated outline controls for its border; use Remove outline before preparing, tracing or editing the original again. You can group outlined decals with other elements and resize them inside that group. To adjust an individual outline, work with that decal separately on the sheet. Explicitly ungrouping the outlined decal turns its source and border into independent layers.

## Prepare imported images

Select a PNG, JPEG or WebP and choose **Crop & remove background** in the inspector.

1. Drag a crop rectangle over the original image, or enter exact left/top/width/height values in pixels. **Full image** clears the crop.
2. Enable **Remove background colour**. Choose a colour or use **Pick from original**, then adjust tolerance (0 is exact matching; higher values accept more colour variation).
3. **Update preview** to inspect the result. Only matching colour connected to the crop edges is removed; enclosed matching areas stay intact. **Trim transparent edges** updates the preview and crops away fully transparent borders.
4. Switch between **Transparent**, **Light** and **Dark** preview backgrounds to check cut-outs. These backgrounds are never included in the artwork.
5. Choose **Apply to decal** or **Add prepared copy**. Nothing changes on the sheet before applying. Settings changes disable Apply until an updated preview is ready.

Cropping removes border space without enlarging the artwork: printed millimetres per pixel stay the same, and visible artwork stays at its sheet/car-preview placement, including rotation and mirroring. The resulting bounding-box width and height therefore shrink. Original pixels are retained so **Adjust crop & background**, **Reset edits** and **Restore original image** remain available. Restoration respects any subsequent resizing. Undo also restores the preceding edit.

Preparation runs locally in a cancellable worker at the original resolution, without downsampling, up to 16 megapixels and 20,000 pixels per edge. Outputs must fit the existing artwork data-size limit. It is intended for plain backgrounds, not automatic subject segmentation in photographs. Prepared artwork remains raster PNG; use tracing separately for vector paths. The retained original and preparation settings travel with saved projects and decal packs, including through tracing and restoring the prepared image.

## PNG-to-vector tracing

1. Select an imported PNG, JPEG or WebP on the sheet and click **Trace image to vector**.
2. Compare the original with the vector preview. Set 1–16 colours, Smooth/Balanced/Fine detail, and the transparency threshold. Click **Re-trace image** after changing tracing settings.
3. Optionally remove near-white background connected to the image edges. Enclosed white areas are preserved. Review the result before applying.
4. Choose **Replace with vector** or **Add vector copy**. Printed dimensions, scale, ink treatment and rotation are retained. Replacing also keeps the original image inside the decal; **Refine traced vector** and **Restore image** remain available after saving, sharing and reopening.
5. Save the result explicitly to your library, export it as SVG, or include it in a PDF. Undo restores the previous sheet state.

Tracing runs offline in a cancellable background worker. It works best for logos, numbers and flat-colour graphics. Photographs, gradients and soft shadows are approximated with solid colours; lost detail cannot be recovered. Partial opacity becomes a solid/transparent edge at the selected threshold. Large images are processed at a maximum edge of 1,024 pixels (1,536 with Fine detail), while the full-resolution original is retained. Cancel or close the preview to leave the sheet unchanged. A trace cannot be applied until its preview matches the current settings.

## Refine a traced vector

Open **Trace image to vector** for a bitmap, or **Refine traced vector** for an existing trace.

- Use the colour swatches or six-digit hex fields to replace a colour across all shapes that use it.
- Click a shape in the vector preview, then **Remove shape**. **Previous/Next** can select small shapes; the last remaining shape cannot be removed. A compound path includes its cut-outs, which remain intact when recolouring.
- Choose Fit, 2×, 4× or 8× to compare details. Scrolling either preview scrolls the other to the same area.
- **Undo refinement / Redo** reverses local colour changes, removals and completed re-traces (up to 20 undo steps). The selection highlight is only in the preview.
- **Replace with vector** applies the whole preview as one sheet undo step; **Add vector copy** keeps the source decal. Cancel keeps the sheet unchanged.
- Reopening loads the saved edited SVG, so manual changes are preserved. **Re-trace image** explicitly generates new shapes from the retained original and replaces refinements in the preview; local undo can restore the preceding result.

Refinements remain vector paths in SVG/PDF and travel with saved sheets and decal packs. Printed size, sheet placement, rotation, mirroring and car positions are preserved. The original image remains available for restoration. Manual refinement supports the solid-colour paths produced by this app's tracer; it is not a general SVG node editor.

The inspector and library now label artwork **Raster**, **Vector**, **Traced vector**, **Vector + traced** or **Mixed raster / vector**, including grouped artwork. The library's Vector filter excludes artwork containing bitmaps; Images also includes mixed artwork.

## Your workshop

- A4, A5 and Photo 4×6-inch pages, portrait or landscape, with millimetre rulers, printable margins and cutting gaps.
- PNG, SVG, EPS and PDF imports; JPEG and WebP also work. Import physical dimensions or convert from an original model scale. PDF import lets you choose a page.
- Editable text, imported fonts, rectangles, ellipses, triangles, lines and stripes. Move, resize, rotate, align, group, layer, lock and duplicate artwork; undo/redo and automatic arrangement preserve physical size.
- Side and top car previews with individually draggable selected decals. Enter measured model dimensions or import your own straight-on reference pictures.
- Explicit **Save decal to library**, reusable independent copies, names/tags and importable `.sfdecal` sharing packs.
- Editable `.sfsheet` projects, complete `.sfdbbackup` backups, vector-preserving PDF output and a sizing proof with labelled 50/100 mm reference bars.
- Optional named white-ink separation. See the printing limitations below.

## Libraries, import and export

Open **Sheet Library** or **Decal Library** in the top navigation. Both have **Grid / List** views, search and sorting: **Name A–Z**, **Name Z–A**, **Newest added** and **Recently updated**. View and sort preferences are remembered. Existing entries use their recorded date when an original added date is unavailable.

Click a checkbox to toggle selection. Click a name or preview to select one item, **Ctrl-click** (or Command-click) to add/remove an item, and **Shift-click** to select a range in the displayed order. Saved libraries show 48 items per page. **Previous / Next** move between pages; search and sorting cover the entire library. **Select this page** selects the visible page, while **Select all shown** applies to bounded import files. **Clear selection** clears everything. The count identifies selected entries on other pages or hidden by search. Selection alone does not open or place artwork.

- **Save sheet / Ctrl+S** stores your current sheet locally. Repeated saves keep its identity and retain earlier changed versions in the local database.
- **Open Sheet / Continue editing** opens a saved sheet or returns to the current one. The outgoing sheet is saved first. **Add to Sheet** places an independent decal copy at the current model scale.
- **Import Sheet(s)** reads an editable .sfsheet file. Select which saved sheets to import; expand **Choose pages…** to import specific pages. Imported sheets receive new identities in Sheet Library, and the current sheet stays open.
- **Export Sheet(s)** starts with the selected library entries checked. The editor toolbar preselects the current sheet. Choose the sheets and optional pages, then export one .sfsheet file. Multiple sheets retain their individual settings and fonts. There is a maximum of 100 saved sheets per file and 160 MB per import/export. Single-sheet exports remain in the existing format; multi-sheet collections require collection support in the receiving app.
- **Import Decals / Export Decals** use the same selection browser. Packs contain up to 500 saved decals, including the fonts needed by the selected artwork. Your library supports 10,000 decals.
- **Versions** shows earlier saved versions. **Recovery** offers the last three workspace backups. Recovering a sheet opens a separate copy.

**Import & Export** groups sheets separately from images and decals. Imports are always on the left; exports are on the right, with red titles on white buttons. **Import an Image** still imports artwork to the canvas. **Export PDF** still reviews the current sheet before producing its print PDF.

Use **Settings → Backup & Recovery → Export Complete Backup** for a verified `.sfdbbackup` containing every saved sheet, saved version, decal, artwork asset, custom font and preference. **Restore Complete Backup** replaces this complete collection after confirmation and keeps a recovery backup of the current database in `Backups` first. The startup recovery screen also offers this option if the database cannot load.

**Export/Restore Workspace Backup** remains available for legacy `.sfbackup` files. These support up to 1,000 decals, 30 embedded library fonts and 160 MB. Use a complete backup for larger libraries or conflicting font names. They contain only the current sheet, decals, fonts and preferences; restoring one does not replace your other saved sheets. Saved sheet histories are not automatically purged. Only redistribute artwork and fonts you have permission to share.

## Local saving

The default persistent folder is **Documents/SlotForge Decals**, resolved through your operating system's Documents location (including redirected Documents folders). It is outside the app installation. Replacing the application does not replace your artwork.

`decals.sqlite` holds the current sheet, saved sheets and their history, decal library, custom fonts and preferences. Automatic saves use transactions; the previous three workspace snapshots remain available through Recovery. Identical artwork is stored once and referenced by its sheets and versions. The database runs in a background worker, and library previews load as they approach the visible area. Exports default to `Exports`; complete backups default to `Backups`.

On first launch after the SQLite update, the editor waits while existing `workspace.json`, its three backups, `Projects/*.sfsheet` and `Projects/History/*.sfsheet` are migrated and verified. All originals stay unchanged. Unreadable files are reported and retained; they are not silently discarded or included as usable records in a complete backup. Keep those originals separately if recovery is needed. If migration fails, it does not publish a partial database.

After migration, these legacy files are **migration-time copies**, not current saves. Do not delete `decals.sqlite` to switch back to them: that would lose subsequent edits from view. Use editable sheet/decal exports for sharing with compatible earlier versions. Complete SQLite backups require this storage update or a compatible newer app.

Migration needs free space for both the originals and new database, and a local filesystem supporting hard links (such as NTFS). If publication is unsupported, the app stops safely and leaves the originals intact. Backup and restore also need room for staging and recovery copies. Keep an independent complete backup of valuable artwork.

The library supports **10,000 decals**. Sharing limits remain **500 decals per pack**, **100 sheets per collection**, and approximately **160 MB per portable file or current workspace**. The complete library database can grow beyond that file limit. The sidebar shows 24 decals per page; full library windows show 48. Only page metadata and a bounded thumbnail cache stay loaded. Full artwork loads when needed for previews, editing, placement or export. Autosave sends the current sheet and preferences, without the library. Large individual sheets and images still need memory to open.

The on-demand library upgrade first writes a verified `before-library-upgrade-….sfdbbackup` in `Backups`, then separates existing decals into independent database records in one transaction. A failed upgrade rolls back. Existing sheets, versions, originals and embedded artwork are retained. Older complete backups can be restored and upgraded; older app versions cannot open this upgraded database or its new complete backups. Use portable sheet/decal files for compatible sharing.

If saving fails when closing, **Export Unsaved Sheet** rescues the current editable sheet without loading or replacing your library.

## Selecting artwork

Drag from empty paper or canvas to select every decal touched by the rectangle. Ctrl/Shift-click toggles decals on the sheet or in Sheet layers; Ctrl/Shift-drag adds a rectangle to your selection. Ctrl+A selects the current page. Drag selected artwork to move it together; locked artwork stays put. Escape cancels a drag or clears a selection. Selection alone does not change your sheet or undo history.

## Faster arrangement

Hold **Ctrl** and use the **mousewheel over the canvas** to zoom around the pointer. Normal mousewheel scrolling still pans the sheet. Zoom only changes your view; decal dimensions and PDF output stay the same. Click the zoom percentage below the canvas to fit the page again.

Select your decals, then click **Arrange…** on the canvas toolbar.

- **Rows & columns:** repeat a single decal or a whole selection. Rows and columns include the original cell. Set separate horizontal and vertical gaps in millimetres, inspect the sheet preview, then create copies. Each cell preserves internal placement, printed size and rotation. Copies extend right/down from the original selection and must fit inside the printable margins; existing artwork stays in place. Use print checks to review overlap with other decals.
- **Align:** left, horizontal centre, right, top, vertical centre or bottom, measured using rotated artwork bounds.
- **Equal gaps:** select three or more decals and distribute horizontally or vertically. Outer decals stay fixed; insufficient room produces an explanation.
- **Mirror:** flip each decal left/right or top/bottom in place. Text is mirrored too. Duplicate first to keep both versions. Mirroring is retained in the library, shared files, car preview and PDF. The inspector marks mirrored artwork.
- **Move to page:** send the selection to an existing or new page, retaining size, position and rotation. The editor follows the selection to its destination.

Each operation is one undo step. Locked decals must be unlocked before alignment, distribution, mirroring or page moves; grid copying keeps locked originals and creates unlocked copies.

## Scale and car preview

Decal widths and heights are printed millimetres. A scale such as 1:32 alone cannot determine a logo's size: supply its printed width, the SVG's physical dimensions, or a known original width and scale.

The target scale selected during import becomes the active car/library placement scale; existing decals keep their physical size. The main scale control can also resize selected or all decals by old scale ÷ new scale. Library copies convert from their saved reference scale.

Every selected decal appears on the car at its physical size. New preview placements retain the selection’s sheet spacing, centred over the car; saved side/top placements are reused. Drag each decal independently on the car without changing the sheet layout. Preview placements are saved and support undo/redo. Large selections may extend beyond the car; artwork is never shrunk to fit.

With one decal selected, open the enlarged car preview (⤢), then adjust **Decal width** or **Decal height** in millimetres. Valid changes immediately update the selected decal on the sheet and both car views. **Keep proportions** links width and height; turn it off for independent sizing. The sheet position and rotation stay unchanged, while the decal stays centred on its existing car-preview position. Each field-editing session is one undo step. Locked decals must be unlocked in the editor first. Changes are saved automatically.

The supplied car is an original illustrative GT reference, not a measured replica of a specific model. Its side and top views use the entered length, height and width. Use your own model measurements and tightly cropped orthographic reference images for a closer comparison. This is a flat sizing preview, not a 3D wrap or a prediction of stretching around body curvature. Confirm fit with a plain-paper proof.

## Save or print a slice

Choose **Slice area…** above the canvas. Draw a rectangle over the current page, or enter its left/top position and width/height in millimetres. **Clip at boundary** uses that exact rectangle; **Expand to include whole decals** grows it to avoid cutting through artwork.

- **Save to library:** name the slice and optionally add tags. It becomes one reusable decal with a transparent background, retained artwork and individual ink treatments. Share it through a .sfdecal pack. Use the same model scale when placing it to keep its saved physical size.
- **Print this area…:** preview and save a PDF on the original paper size, showing only the slice at its original position.
- **Export cropped PDF…:** preview and save a custom-sized PDF matching the slice. Your printer must support that paper size.

The original sheet stays unchanged. You can move, rotate and resize a saved slice as one decal; edit the original artwork to make a replacement. Files containing slices need version 0.2.15 or newer. Print at **Actual size / 100%**, and check your printer's margins and offcut feeding requirements.

## Printing and artwork fidelity

**Export PDF** opens an artwork review before saving. Each element is labelled **Vector**, **Traced vector**, **Raster**, or **Mixed raster / vector**, with its page number and group/slice path. Raster-containing entries are highlighted even when their resolution is high. Return to the editor to trace a logo if needed, or continue with raster artwork intentionally. Retained originals of traced decals do not count as printed raster images. Slice PDF previews include the same review for the selected decals.

Exported pages match the selected sheet size and orientation. Choose matching paper in your printer settings and print at **Actual size / 100%**, with any “Fit to page” option disabled. Measure the proof's labelled bars before using decal paper: 100 mm, or 50 mm on the short side of a Photo 4×6 sheet.

Native text, shapes and supported SVG artwork remain vectors. PNGs and embedded bitmap portions remain raster; placing them in a PDF does not make them infinitely scalable. Low-resolution raster artwork is flagged. Optional image tracing produces new vector paths; review the approximation before replacing a bitmap.

SVG import preserves paths, gradients, clipping, masks, symbols and embedded images within a 12 MB / 20,000-object limit. Unsupported filters, external links and unsafe content produce an explanation. Some complex vector artwork needs expansion or simplification in its original editor. EPS/PDF conversion runs locally through bundled Ghostscript and MuPDF.

White printing requires a suitable printer/RIP. Enable white ink, use the required spot name, and choose **Colour + white backing** or **White ink only** per decal. The white plate is a 600 PPI, alpha-thresholded silhouette with no choke adjustment. It has passed PDF structure tests but has **not been tested on a physical white-ink printer**. Confirm spot recognition, ink order and appearance with the print shop. Output preserves RGB artwork; it is not certified PDF/X or a managed CMYK proof. Proofs show native white-only shapes in magenta for sizing; the production spot plate is separate.

PDF is the finished print/share format. Use `.sfsheet` for editable sheets and `.sfdecal` for reusable saved decals. Imported fonts travel inside these files; only redistribute fonts and artwork you have permission to share.

## Current scope

Local file sharing is implemented. Accounts, online galleries, direct Livery integration, 3D body mapping, automatic updates and signed installers are future work. Native Windows, macOS and Linux packages are built by GitHub Actions; see the README for signing and system information.

See [testing notes](TESTING.md), [asset notes](ASSETS.md), [third-party notices](../THIRD-PARTY-NOTICES.txt) and [license](../LICENSE).
