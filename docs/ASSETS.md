# Car reference assets

The built-in image generation tool produced these original transparent PNG assets. They are shipped in the application, not fetched at runtime. No fallback API/CLI was used.

- `assets/car-side.png` — generic white GT car, orthographic side view.
- `assets/car-top.png` — matching top view, using the side image as a visual reference.
- `assets/icon.svg` / `assets/icon.png` / `assets/icon.ico` — the collection-style red tile and white peeling decal-sheet symbol. The 240 px tile, 55 px corner radius and #e5484d red match Livery; its white pictogram follows Livery and Timing. SVG is the editable source, PNG is 1024 px, and ICO contains 16/24/32/48/64/128/256 px images. This icon is drawn directly as vector artwork, without image generation.

`npm run build:icons` regenerates both raster formats. Packaging embeds and verifies the ICO in the Windows executable's icon resources; the app window uses the matching PNG.

Side image prompt:

> Use case: product-mockup. Asset for a slotcar decal placement app. One single generic white GT endurance racing car, strict orthographic SIDE elevation, nose to the LEFT, full nose-to-tail body and wing visible, horizontal wheel centres, realistic high quality industrial automotive illustration, fine crisp contours and restrained soft shading like a professional car livery template. No branding, no text, NO numbers, NO stripes, no decals. Clean white painted body panels, smoked black windows, black tires and wheels, modest rear wing, recognizable generic modern GT coupe proportions. Fully transparent background, NO ground shadow, NO floor, NO ruler, NO padding beyond small transparent border, no other views or objects. Car alone fills wide horizontal image closely, straight-on side without perspective. Body must remain largely flat white to allow overlay of user graphics.

Top image prompt specification:

> Create a matching second reference view of the supplied generic white GT car: strict orthographic TOP / plan view looking straight down, nose to the LEFT. Same unbranded white body, smoked windows, black tires, modest rear wing and restrained industrial illustration shading. No branding, numbers, stripes, decals, text, ruler, ground shadow, floor or other views. Fully transparent background, with a small transparent border. The car fills a wide horizontal image and provides white body panels for decal overlays.

The car images are illustrative. App dimensions calibrate the image rectangle to user measurements, but do not make the generated body a measured car-specific template.
