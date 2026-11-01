# SlotForge Decals user guide

See the [README](../README.md) for downloads and installation.

## Import your own picture

Use **Import image or artwork** in the left-hand Add artwork panel, on the welcome screen, in the User Library window, or in Import & Export. You can also use **Import your own image** below the library or drop a file onto the A4 sheet. Choose your PNG/JPEG/WebP (or SVG/EPS/PDF), set the printed width and scale, and click **Add to sheet**. Pack import is a separate action for files shared by other users.

## Racing-number templates

Choose **Racing numbers…** in Add artwork. Pick a roundel, oval plate or rectangular number plate; set the number, typeface, colours, border and printed dimensions. Roundels keep a circular shape. The preview updates as you change settings.

Choose **One decal** or **Matching pair**. Both copies in a pair have readable, identical numbers and can be edited independently. Pairs use the sheet’s cutting gap; if necessary they are placed vertically or on another A4 page. Existing artwork stays in place, so review Print checks or use Auto-arrange if decals overlap.

Templates are regular groups of vector shapes and editable text. Select one, choose **Edit group**, then save the finished design to your library when ready.

## Edit inside a group

Select a grouped decal and choose **Edit group** in the inspector. Choose an element from the preview or list to edit its text, font, colours, size, position, opacity and outline. You can add text, rectangles and ellipses, change layer order, lock elements and remove them. At least one element must remain in each group. Imported images and SVGs retain their contents; their placement and size can be changed here.

Use **Edit nested group** to go deeper and the breadcrumb buttons to return. The upright preview shows the group’s original design coordinates. A resized group can have different design and printed dimensions; the note below the preview shows both. Changing the contents keeps the complete group’s sheet size, rotation, mirroring, ink treatment and car placement. Text edits preserve letter proportions and centre the new text at its previous position; review the fit after changing a number.

**Undo / Redo** work within this editing session. **Cancel** discards the session. **Apply changes** updates the A4 sheet as one undoable edit. Sheet copies and saved library masters remain independent; explicitly save or update a library decal to keep a reusable version. Editable contents travel with saved sheets and decal packs.

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

Cropping removes border space without enlarging the artwork: printed millimetres per pixel stay the same, and visible artwork stays at its A4/car-preview placement, including rotation and mirroring. The resulting bounding-box width and height therefore shrink. Original pixels are retained so **Adjust crop & background**, **Reset edits** and **Restore original image** remain available. Restoration respects any subsequent resizing. Undo also restores the preceding edit.

Preparation runs locally in a cancellable worker at the original resolution, without downsampling, up to 16 megapixels and 20,000 pixels per edge. Outputs must fit the existing artwork data-size limit. It is intended for plain backgrounds, not automatic subject segmentation in photographs. Prepared artwork remains raster PNG; use tracing separately for vector paths. The retained original and preparation settings travel with saved projects and decal packs, including through tracing and restoring the prepared image.

## PNG-to-vector tracing

1. Select an imported PNG, JPEG or WebP on the sheet and click **Trace image to vector**.
2. Compare the original with the vector preview. Set 1–16 colours, Smooth/Balanced/Fine detail, and the transparency threshold. Click **Re-trace image** after changing tracing settings.
3. Optionally remove near-white background connected to the image edges. Enclosed white areas are preserved. Review the result before applying.
4. Choose **Replace with vector** or **Add vector copy**. Printed dimensions, scale, ink treatment and rotation are retained. Replacing also keeps the original image inside the decal; **Refine traced vector** and **Restore image** remain available after saving, sharing and reopening.
5. Save the result explicitly to your library, export it as SVG, or include it in an A4 PDF. Undo restores the previous sheet state.

Tracing runs offline in a cancellable background worker. It works best for logos, numbers and flat-colour graphics. Photographs, gradients and soft shadows are approximated with solid colours; lost detail cannot be recovered. Partial opacity becomes a solid/transparent edge at the selected threshold. Large images are processed at a maximum edge of 1,024 pixels (1,536 with Fine detail), while the full-resolution original is retained. Cancel or close the preview to leave the sheet unchanged. A trace cannot be applied until its preview matches the current settings.

## Refine a traced vector

Open **Trace image to vector** for a bitmap, or **Refine traced vector** for an existing trace.

- Use the colour swatches or six-digit hex fields to replace a colour across all shapes that use it.
- Click a shape in the vector preview, then **Remove shape**. **Previous/Next** can select small shapes; the last remaining shape cannot be removed. A compound path includes its cut-outs, which remain intact when recolouring.
- Choose Fit, 2×, 4× or 8× to compare details. Scrolling either preview scrolls the other to the same area.
- **Undo refinement / Redo** reverses local colour changes, removals and completed re-traces (up to 20 undo steps). The selection highlight is only in the preview.
- **Replace with vector** applies the whole preview as one sheet undo step; **Add vector copy** keeps the source decal. Cancel keeps the sheet unchanged.
- Reopening loads the saved edited SVG, so manual changes are preserved. **Re-trace image** explicitly generates new shapes from the retained original and replaces refinements in the preview; local undo can restore the preceding result.

Refinements remain vector paths in SVG/PDF and travel with saved sheets and decal packs. Printed size, A4 placement, rotation, mirroring and car positions are preserved. The original image remains available for restoration. Manual refinement supports the solid-colour paths produced by this app's tracer; it is not a general SVG node editor.

The inspector and library now label artwork **Raster**, **Vector**, **Traced vector**, **Vector + traced** or **Mixed raster / vector**, including grouped artwork. The library's Vector filter excludes artwork containing bitmaps; Images also includes mixed artwork.

## Your workshop

- Fixed A4 pages, portrait or landscape, with millimetre rulers, printable margins and cutting gaps.
- PNG, SVG, EPS and PDF imports; JPEG and WebP also work. Import physical dimensions or convert from an original model scale. PDF import lets you choose a page.
- Editable text, imported fonts, rectangles, ellipses, triangles, lines and stripes. Move, resize, rotate, align, group, layer, lock and duplicate artwork; undo/redo and automatic arrangement preserve physical size.
- Side and top car previews with individually draggable selected decals. Enter measured model dimensions or import your own straight-on reference pictures.
- Explicit **Save decal to library**, reusable independent copies, names/tags and importable `.sfdecal` sharing packs.
- Editable `.sfsheet` projects, complete `.sfbackup` backups, vector-preserving PDF output and a sizing proof with 100 mm reference bars.
- Optional named white-ink separation. See the printing limitations below.

## Projects and recovery

Click **Projects** beside the sheet name to see your current sheet and saved projects, with first-page A4 thumbnails, page/decal counts and model scales. Search by name or sort by recent use, name or last save. Existing `.sfsheet` files in the workspace's Projects folder are discovered automatically. **Open sheet file…** imports a sheet saved elsewhere.

- **Save current** stores the current sheet in Projects without opening a file picker. Repeated saves update the same project; changed saved versions are retained in `Projects/History`. Renaming a sheet keeps its project identity.
- **Open sheet** and **New sheet** save the outgoing sheet before switching. The app refuses to switch if that save fails. The blank default sheet is not archived automatically, but you can explicitly save it.
- **Versions** shows earlier saved versions of that project. **Workspace recovery** shows sheets from the last three automatic workspace backups.
- **Preview & recover** lets you review a version, then opens a separate recovered copy. The original project, library and preferences are kept. This recovers a sheet, not an entire earlier library; full-workspace backup import remains available through Import & Export.
- **Save sheet / Ctrl+S** also saves to Projects, then offers the existing file picker for a portable editable copy.

Project files contain the artwork, fonts, sizes and car-reference settings. Saved histories are local and are not automatically purged. Full `.sfbackup` files include the current workspace/library; separately copy the Projects folder if you also want to back up all saved sheets and their histories.

## Local saving

The default persistent folder is **Documents/SlotForge Decals**, resolved through your operating system's Documents location (including redirected Documents folders). It is outside the app installation. Replacing the application does not replace your artwork.

`workspace.json` holds the current sheet, saved library, custom fonts and preferences. Saves are automatic and atomic; `Backups` keeps the previous three readable versions. Saved sheets go to `Projects`, with older saved snapshots in `Projects/History`; exports go to `Exports`. Settings can open the folder and export a full backup. Keep an independent backup of valuable artwork.

## Selecting artwork

Drag from empty paper or canvas to select every decal touched by the rectangle. Ctrl/Shift-click toggles decals on the sheet or in Sheet layers; Ctrl/Shift-drag adds a rectangle to your selection. Ctrl+A selects the current page. Drag selected artwork to move it together; locked artwork stays put. Escape cancels a drag or clears a selection. Selection alone does not change your sheet or undo history.

## Faster arrangement

Select your decals, then click **Arrange…** on the canvas toolbar.

- **Rows & columns:** repeat a single decal or a whole selection. Rows and columns include the original cell. Set separate horizontal and vertical gaps in millimetres, inspect the A4 preview, then create copies. Each cell preserves internal placement, printed size and rotation. Copies extend right/down from the original selection and must fit inside the printable margins; existing artwork stays in place. Use print checks to review overlap with other decals.
- **Align:** left, horizontal centre, right, top, vertical centre or bottom, measured using rotated artwork bounds.
- **Equal gaps:** select three or more decals and distribute horizontally or vertically. Outer decals stay fixed; insufficient room produces an explanation.
- **Mirror:** flip each decal left/right or top/bottom in place. Text is mirrored too. Duplicate first to keep both versions. Mirroring is retained in the library, shared files, car preview and PDF. The inspector marks mirrored artwork.
- **Move to page:** send the selection to an existing or new A4 page, retaining size, position and rotation. The editor follows the selection to its destination.

Each operation is one undo step. Locked decals must be unlocked before alignment, distribution, mirroring or page moves; grid copying keeps locked originals and creates unlocked copies.

## Scale and car preview

Decal widths and heights are printed millimetres. A scale such as 1:32 alone cannot determine a logo's size: supply its printed width, the SVG's physical dimensions, or a known original width and scale.

The target scale selected during import becomes the active car/library placement scale; existing decals keep their physical size. The main scale control can also resize selected or all decals by old scale ÷ new scale. Library copies convert from their saved reference scale.

Every selected decal appears on the car at its physical size. New preview placements retain the selection’s sheet spacing, centred over the car; saved side/top placements are reused. Drag each decal independently on the car without changing the A4 layout. Preview placements are saved and support undo/redo. Large selections may extend beyond the car; artwork is never shrunk to fit.

With one decal selected, open the enlarged car preview (⤢), then adjust **Decal width** or **Decal height** in millimetres. Valid changes immediately update the selected decal on the A4 sheet and both car views. **Keep proportions** links width and height; turn it off for independent sizing. The A4 position and rotation stay unchanged, while the decal stays centred on its existing car-preview position. Each field-editing session is one undo step. Locked decals must be unlocked in the editor first. Changes are saved automatically.

The supplied car is an original illustrative GT reference, not a measured replica of a specific model. Its side and top views use the entered length, height and width. Use your own model measurements and tightly cropped orthographic reference images for a closer comparison. This is a flat sizing preview, not a 3D wrap or a prediction of stretching around body curvature. Confirm fit with a plain-paper proof.

## Printing and artwork fidelity

Exported pages are exactly 210 × 297 mm (or landscape). Print at **Actual size / 100%**, with any “Fit to page” option disabled. Measure the proof's 100 mm bars before using decal paper.

Native text, shapes and supported SVG artwork remain vectors. PNGs and embedded bitmap portions remain raster; placing them in a PDF does not make them infinitely scalable. Low-resolution raster artwork is flagged. Optional image tracing produces new vector paths; review the approximation before replacing a bitmap.

SVG import preserves paths, gradients, clipping, masks, symbols and embedded images within a 12 MB / 20,000-object limit. Unsupported filters, external links and unsafe content produce an explanation. Some complex vector artwork needs expansion or simplification in its original editor. EPS/PDF conversion runs locally through bundled Ghostscript and MuPDF.

White printing requires a suitable printer/RIP. Enable white ink, use the required spot name, and choose **Colour + white backing** or **White ink only** per decal. The white plate is a 600 PPI, alpha-thresholded silhouette with no choke adjustment. It has passed PDF structure tests but has **not been tested on a physical white-ink printer**. Confirm spot recognition, ink order and appearance with the print shop. Output preserves RGB artwork; it is not certified PDF/X or a managed CMYK proof. Proofs show native white-only shapes in magenta for sizing; the production spot plate is separate.

PDF is the finished print/share format. Use `.sfsheet` for editable sheets and `.sfdecal` for reusable saved decals. Imported fonts travel inside these files; only redistribute fonts and artwork you have permission to share.

## Current scope

Local file sharing is implemented. Accounts, online galleries, direct Livery integration, 3D body mapping, automatic updates and signed installers are future work. Native Windows, macOS and Linux packages are built by GitHub Actions; see the README for signing and system information.

See [testing notes](TESTING.md), [asset notes](ASSETS.md), [third-party notices](../THIRD-PARTY-NOTICES.txt) and [license](../LICENSE).
