/* Clean up (import bay, docs/ui-reference/artwork-2026-11): crop and see-through background for a
   bitmap. Pixel edits stay in a disposable preview until the bay uses or applies them. The preview
   lies over the original with a line to drag across, so both are seen in one place. */
window.ImagePrepUI = {
  // host: the bay's step area. hooks.change(result) runs whenever a usable result appears or goes.
  mount(host, item, hooks = {}) {
    const source = ImagePrep.source(item);
    if (item.kind !== 'image' || !source.src) throw Error('Select a PNG, JPEG or WebP image to prepare.');
    if (source.pixelsW * source.pixelsH > ImagePrep.MAX_PIXELS)
      throw Error(
        'Image preparation supports up to 16 megapixels. Import a smaller image to prepare it; your current artwork is unchanged.'
      );
    const W = source.pixelsW,
      H = source.pixelsH,
      full = { x: 0, y: 0, w: W, h: H },
      initial = item.imageEdits || { crop: full, removeBackground: false, color: '#ffffff', tolerance: 12 };
    host.innerHTML = `<div class="bay-stage"><div class="bay-tb"><div class="seg" role="group" aria-label="What a click on the picture does"><button id="prep-mode-crop" aria-pressed="true">${icon('crop')}Crop</button><button id="prep-pick" aria-pressed="false">${icon('drop')}Pick background</button></div><span class="spacer"></span><span class="eyebrow">Preview on</span><div class="seg" role="group" aria-label="Preview background"><button data-prep-bg="transparent" aria-pressed="true">Checker</button><button data-prep-bg="light" aria-pressed="false">White</button><button data-prep-bg="dark" aria-pressed="false">Dark</button></div></div>
<div class="bay-view"><div class="prep-compare" data-background="transparent"><div class="prep-stack" style="--ar:${W / H}"><svg id="prep-original" viewBox="0 0 ${W} ${H}" aria-label="Original image: drag to crop"><defs><clipPath id="prep-left"><rect id="prep-left-rect" width="${W}" height="${H}"/></clipPath></defs><image href="${E(source.src)}" width="${W}" height="${H}" clip-path="url(#prep-left)"/><path id="prep-shade" fill="#000" fill-opacity=".45" fill-rule="evenodd" pointer-events="none"/><rect id="prep-crop-box" fill="none" stroke="#e5484d" stroke-width="2" vector-effect="non-scaling-stroke" pointer-events="none"/></svg><img id="prep-preview" alt="Cleaned-up image" hidden><span class="prep-line" aria-hidden="true"></span><span class="bay-lbl left">Original</span><span class="bay-lbl right" id="prep-badge">Preparing…</span></div><input id="prep-wipe" class="prep-wipe" type="range" min="0" max="100" value="50" aria-label="Compare the original and the cleaned-up image"></div></div></div>
<aside class="bay-side"><h3>Clean up</h3><p class="hint">Drag on the picture to crop. Choose <b>Pick background</b>, then click the background, to make it see-through.</p><div id="prep-suggest" class="bay-suggest" hidden></div>
<label class="switch-row"><input id="prep-remove" type="checkbox" role="switch" ${initial.removeBackground ? 'checked' : ''}><span class="sw" aria-hidden="true"></span>Remove the background colour</label>
<div class="field"><label for="prep-color">Background colour</label><input id="prep-color" type="color" value="${E(initial.color)}"></div>
<div class="field"><label for="prep-tolerance">How close a colour must be (0–100)</label><div class="bay-range"><input id="prep-tolerance-range" type="range" min="0" max="100" value="${initial.tolerance}" aria-label="How close a colour must be"><input id="prep-tolerance" type="number" min="0" max="100" value="${initial.tolerance}"></div><div class="bay-range-ends"><span>Only this colour</span><span>Similar colours too</span></div></div>
<div class="row"><button id="prep-trim">${icon('trim')}Trim empty edges</button><button id="prep-full">Full image</button></div>
<details class="bay-more"><summary>Exact crop in pixels</summary><div class="fields2">${[
      ['x', 'Left'],
      ['y', 'Top'],
      ['w', 'Width'],
      ['h', 'Height']
    ]
      .map(
        ([key, label]) =>
          `<div class="field"><label for="prep-${key}">${label} (px)</label><input id="prep-${key}" type="number" min="${key === 'w' || key === 'h' ? 1 : 0}" step="1" value="${initial.crop[key]}"></div>`
      )
      .join(
        ''
      )}</div></details><p id="prep-status" class="bay-quality" role="status" aria-live="polite">Preparing locally…</p><div class="row"><button id="prep-reset" class="ghost">Reset</button><button id="prep-update">Update preview</button></div><p class="hint">Only background connected to the edges goes; enclosed areas of the same colour stay. Best for plain backgrounds, not photos. The original is kept.</p><p class="dialog-error bay-error" role="alert"></p></aside>`;
    const q = s => host.querySelector(s),
      svg = q('#prep-original'),
      canvas = document.createElement('canvas');
    let worker = null,
      timer = null,
      auto = null,
      result = null,
      sequence = 0,
      disposed = false,
      loaded = false,
      picking = false,
      cropDrag = null;
    const error = text => (q('.bay-error').textContent = text || '');
    const changed = () => hooks.change?.(result);
    const stop = () => {
      worker?.terminate();
      worker = null;
      clearTimeout(timer);
    };
    const dispose = () => {
      if (disposed) return;
      disposed = true;
      sequence++;
      stop();
      clearTimeout(auto);
      canvas.width = canvas.height = 1;
      document.removeEventListener('keydown', cancelCrop, true);
    };
    const crop = () =>
      Object.fromEntries(['x', 'y', 'w', 'h'].map(key => [key, Number(q('#prep-' + key).value)]));
    const options = () =>
      ImagePrep.settings(
        {
          crop: crop(),
          removeBackground: q('#prep-remove').checked,
          color: q('#prep-color').value,
          tolerance: q('#prep-tolerance').value
        },
        W,
        H
      );
    const setCrop = r => {
      for (const key of ['x', 'y', 'w', 'h']) q('#prep-' + key).value = r[key];
      drawCrop();
    };
    // The cleaned-up picture covers its crop area; the line shows the original to its left.
    function drawWipe() {
      const at = Number(q('#prep-wipe').value) / 100,
        img = q('#prep-preview');
      q('#prep-left-rect').setAttribute('width', result ? at * W : W);
      q('.prep-line').style.left = at * 100 + '%';
      q('.prep-line').hidden = !result;
      if (!result) return;
      const c = result.imageEdits?.crop || crop(),
        cut = Math.max(0, Math.min(1, (at * W - c.x) / c.w));
      Object.assign(img.style, {
        left: (c.x / W) * 100 + '%',
        top: (c.y / H) * 100 + '%',
        width: (c.w / W) * 100 + '%',
        height: (c.h / H) * 100 + '%',
        clipPath: `inset(0 0 0 ${cut * 100}%)`
      });
    }
    function drawCrop() {
      try {
        const r = ImagePrep.cropRect(crop(), W, H);
        for (const key of ['x', 'y', 'width', 'height'])
          q('#prep-crop-box').setAttribute(key, r[{ width: 'w', height: 'h' }[key] || key]);
        q('#prep-shade').setAttribute('d', `M0 0H${W}V${H}H0Z M${r.x} ${r.y}h${r.w}v${r.h}h${-r.w}Z`);
      } catch {
        /* Invalid coordinates are explained when updating the preview. */
      }
    }
    function invalidate() {
      sequence++;
      stop();
      result = null;
      q('#prep-preview').hidden = true;
      q('#prep-badge').textContent = 'Update needed';
      q('#prep-status').textContent = 'Settings changed. The preview updates in a moment.';
      drawCrop();
      drawWipe();
      changed();
      clearTimeout(auto);
      auto = setTimeout(() => update(), 650);
    }
    const point = e => {
      const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(svg.getScreenCTM().inverse());
      return { x: Math.max(0, Math.min(W, p.x)), y: Math.max(0, Math.min(H, p.y)) };
    };
    const pixelAt = (x, y) =>
      canvas
        .getContext('2d', { willReadFrequently: true })
        .getImageData(Math.min(W - 1, Math.floor(x)), Math.min(H - 1, Math.floor(y)), 1, 1).data;
    const hex = px => '#' + [...px.slice(0, 3)].map(c => c.toString(16).padStart(2, '0')).join('');
    function setPicking(on) {
      picking = on;
      q('#prep-pick').setAttribute('aria-pressed', String(on));
      q('#prep-mode-crop').setAttribute('aria-pressed', String(!on));
      q('.prep-stack').classList.toggle('picking', on);
    }
    svg.onpointerdown = e => {
      if (e.button !== 0 || !loaded) return;
      e.preventDefault();
      if (picking) {
        const p = point(e),
          pixel = pixelAt(p.x, p.y);
        if (!pixel[3]) {
          error('Pick a visible background pixel.');
          return;
        }
        error();
        q('#prep-color').value = hex(pixel);
        q('#prep-remove').checked = true;
        setPicking(false);
        invalidate();
        return;
      }
      cropDrag = { start: point(e), before: crop(), id: e.pointerId, moved: false };
      svg.setPointerCapture(e.pointerId);
    };
    svg.onpointermove = e => {
      if (!cropDrag || e.pointerId !== cropDrag.id) return;
      const p = point(e),
        start = cropDrag.start;
      if (Math.hypot(p.x - start.x, p.y - start.y) < 1) return;
      cropDrag.moved = true;
      const x = Math.min(W - 1, Math.floor(Math.min(p.x, start.x))),
        y = Math.min(H - 1, Math.floor(Math.min(p.y, start.y)));
      setCrop({
        x,
        y,
        w: Math.max(1, Math.ceil(Math.max(p.x, start.x)) - x),
        h: Math.max(1, Math.ceil(Math.max(p.y, start.y)) - y)
      });
      invalidate();
    };
    function finishCrop(cancel) {
      if (!cropDrag) return;
      const d = cropDrag;
      cropDrag = null;
      if (cancel) {
        setCrop(d.before);
        invalidate();
      }
      if (svg.hasPointerCapture(d.id)) svg.releasePointerCapture(d.id);
    }
    svg.onpointerup = () => finishCrop(false);
    svg.onpointercancel = () => finishCrop(true);
    svg.onlostpointercapture = () => {
      if (cropDrag) finishCrop(true);
    };
    function cancelCrop(e) {
      if (e.key === 'Escape' && cropDrag) {
        e.preventDefault();
        e.stopPropagation();
        finishCrop(true);
      }
    }
    document.addEventListener('keydown', cancelCrop, true);
    for (const key of ['x', 'y', 'w', 'h', 'remove', 'color']) q('#prep-' + key).oninput = invalidate;
    q('#prep-tolerance').oninput = () => {
      q('#prep-tolerance-range').value = q('#prep-tolerance').value;
      invalidate();
    };
    q('#prep-tolerance-range').oninput = () => {
      q('#prep-tolerance').value = q('#prep-tolerance-range').value;
      invalidate();
    };
    q('#prep-wipe').oninput = drawWipe;
    for (const button of host.querySelectorAll('[data-prep-bg]'))
      button.onclick = () => {
        q('.prep-compare').dataset.background = button.dataset.prepBg;
        for (const b of host.querySelectorAll('[data-prep-bg]'))
          b.setAttribute('aria-pressed', String(b === button));
      };
    q('#prep-full').onclick = () => {
      setCrop(full);
      invalidate();
    };
    q('#prep-reset').onclick = () => {
      setCrop(full);
      q('#prep-remove').checked = false;
      q('#prep-color').value = '#ffffff';
      q('#prep-tolerance').value = q('#prep-tolerance-range').value = 12;
      invalidate();
      update();
    };
    q('#prep-mode-crop').onclick = () => setPicking(false);
    q('#prep-pick').onclick = () => setPicking(!picking);
    const failed = message => {
      stop();
      result = null;
      error(message);
      q('#prep-badge').textContent = 'No result';
      q('#prep-status').textContent = 'Your artwork has not changed.';
      drawWipe();
      changed();
    };
    async function update(trim = false) {
      clearTimeout(auto);
      if (!loaded || disposed) return;
      stop();
      const token = ++sequence;
      result = null;
      changed();
      error();
      q('#prep-badge').textContent = 'Processing…';
      q('#prep-status').textContent = 'Preparing locally at full resolution…';
      try {
        const settings = { ...options(), trim },
          pixels = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, W, H);
        worker = new Worker('image-prep-worker.js');
        worker.onerror = e => {
          e.preventDefault();
          if (!disposed && token === sequence) failed('Image preparation could not start. Try again.');
        };
        worker.onmessage = e => {
          if (disposed || token !== sequence) return;
          stop();
          if (e.data.error) {
            failed(e.data.error);
            return;
          }
          try {
            const next = e.data.result,
              out = document.createElement('canvas');
            out.width = next.width;
            out.height = next.height;
            out
              .getContext('2d')
              .putImageData(new ImageData(new Uint8ClampedArray(next.buffer), next.width, next.height), 0, 0);
            const src = out.toDataURL('image/png');
            out.width = out.height = 1;
            if (src.length > 28e6)
              throw Error('Prepared PNG exceeds the artwork size limit. Choose a smaller crop.');
            const prepared = ImagePrep.prepared(item, next, src);
            DM.validateItem(prepared);
            result = prepared;
            setCrop(next.settings.crop);
            q('#prep-preview').src = src;
            q('#prep-preview').hidden = false;
            q('#prep-badge').textContent = 'Cleaned up';
            const ppi = Math.round(Math.min(next.width / prepared.w, next.height / prepared.h) * 25.4);
            q('#prep-status').textContent =
              `${next.removed.toLocaleString()} background pixels removed · ${next.width.toLocaleString()} × ${next.height.toLocaleString()} px · ${ppi} PPI at ${prepared.w.toFixed(1)} mm · original kept`;
            drawWipe();
            changed();
          } catch (err) {
            failed(err.message);
          }
        };
        timer = setTimeout(() => {
          if (!disposed && token === sequence)
            failed('Preparation took too long. Choose a smaller image or crop.');
        }, 45000);
        worker.postMessage(
          { width: pixels.width, height: pixels.height, buffer: pixels.data.buffer, settings },
          [pixels.data.buffer]
        );
      } catch (err) {
        if (!disposed && token === sequence) failed(err.message);
      }
    }
    q('#prep-update').onclick = () => update();
    q('#prep-trim').onclick = () => update(true);
    drawCrop();
    const image = new Image();
    image.src = source.src;
    image
      .decode()
      .then(() => {
        if (disposed) return;
        if (image.naturalWidth !== W || image.naturalHeight !== H)
          throw Error('Original pixel dimensions do not match the image. Reimport it before preparing.');
        canvas.width = W;
        canvas.height = H;
        canvas.getContext('2d', { willReadFrequently: true }).drawImage(image, 0, 0);
        loaded = true;
        // A plain colour in all four corners is very likely the background: offer to remove it.
        const corners = [pixelAt(0, 0), pixelAt(W - 1, 0), pixelAt(0, H - 1), pixelAt(W - 1, H - 1)];
        if (
          !initial.removeBackground &&
          corners.every(c => c[3] > 250) &&
          corners.every(c => c.slice(0, 3).every((v, n) => Math.abs(v - corners[0][n]) < 10))
        ) {
          const colour = hex(corners[0]);
          q('#prep-suggest').hidden = false;
          q('#prep-suggest').innerHTML =
            `<span class="bay-swatch" style="background:${colour}"></span><span>Plain background found: <b>${colour.toUpperCase()}</b></span><button id="prep-suggest-use">Remove it</button>`;
          q('#prep-suggest-use').onclick = () => {
            q('#prep-color').value = colour;
            q('#prep-remove').checked = true;
            q('#prep-suggest').hidden = true;
            invalidate();
          };
        }
        update();
      })
      .catch(err => {
        if (!disposed) failed(err.message);
      });
    return { result: () => result, update, dispose };
  }
};
