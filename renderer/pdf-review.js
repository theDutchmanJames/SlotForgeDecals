(function (root, factory) {
  const api = factory(typeof module === 'object' ? require('./model.js') : root.DM);
  if (typeof module === 'object') module.exports = api;
  else root.PdfReview = api;
})(globalThis, DM => {
  'use strict';
  function artwork(items) {
    const rows = [];
    function visit(item, names, page) {
      const path = [...names, item.name || 'Decal'];
      if (item.kind === 'group' || item.kind === 'slice') {
        for (const child of item.children) visit(child, path, page);
        return;
      }
      const type = DM.artworkType(item),
        raster = type === 'Raster' || type === 'Mixed raster / vector';
      rows.push({ name: path.join(' › '), page: page + 1, type, raster });
    }
    for (const item of items) visit(item, [], item.page || 0);
    return rows;
  }
  // One row per decal on the sheet; identical copies are merged (×N) and any bitmap parts
  // inside a group or slice are named, so the list stays short on busy sheets.
  function decals(items) {
    const rows = [];
    for (const item of items) {
      const parts = artwork([item]),
        types = [...new Set(parts.map(p => p.type))],
        raster = parts.filter(p => p.raster),
        type =
          types.length === 1
            ? types[0]
            : raster.length
              ? 'Mixed raster / vector'
              : types.includes('Traced vector')
                ? 'Vector + traced'
                : 'Vector';
      const row = {
        name: item.name || 'Decal',
        page: (item.page || 0) + 1,
        type,
        raster: raster.length > 0,
        parts: parts.length,
        rasterParts:
          item.kind === 'group' || item.kind === 'slice'
            ? raster.map(p => p.name.split(' › ').slice(1).join(' › '))
            : [],
        count: 1
      };
      const same = rows.find(
        r =>
          r.name === row.name &&
          r.page === row.page &&
          r.type === row.type &&
          r.parts === row.parts &&
          r.rasterParts.join('|') === row.rasterParts.join('|')
      );
      if (same) same.count++;
      else rows.push(row);
    }
    return rows;
  }
  function markup(items, whiteInk = false) {
    const rows = artwork(items),
      raster = rows.filter(r => r.raster).length;
    const counts = ['Vector', 'Traced vector', 'Raster', 'Mixed raster / vector']
      .map(type => ({ type, count: rows.filter(r => r.type === type).length }))
      .filter(x => x.count);
    return `<section class="pdf-artwork-review" aria-label="PDF artwork types"><h3>Artwork types</h3><p class="pdf-artwork-counts">${counts.map(x => `${x.count} ${DM.esc(x.type.toLowerCase())}`).join(' · ')}</p>${raster ? `<div class="notice warn-notice pdf-raster-warning"><strong>${raster} ${raster === 1 ? 'artwork element still contains' : 'artwork elements still contain'} raster images.</strong><br>These stay as pixels in the PDF. To vectorize a logo, return to the editor, select its image and choose “Trace image to vector”. Tracing is optional and can change fine detail; high-resolution images can still print well.</div>` : '<p class="notice">All listed artwork is vector. Traced artwork uses vector paths; its retained original image is not printed.</p>'}<div class="pdf-artwork-list" tabindex="0" role="region" aria-label="Artwork type list"><table><thead><tr><th scope="col">Decal</th><th scope="col">Page</th><th scope="col">Type</th></tr></thead><tbody>${decals(
      items
    )
      .map(
        r =>
          `<tr class="${r.raster ? 'contains-raster' : ''}"><td>${DM.esc(r.name)}${r.count > 1 ? ` <span class="decal-count">×${r.count}</span>` : ''}${r.parts > 1 || r.rasterParts.length ? `<small class="decal-parts">${[r.parts > 1 ? `${r.parts} parts` : '', r.rasterParts.length ? `bitmap: ${r.rasterParts.map(DM.esc).join(', ')}` : ''].filter(Boolean).join(' · ')}</small>` : ''}</td><td>${r.page}</td><td><span class="artwork-type">${DM.esc(r.type)}</span></td></tr>`
      )
      .join(
        ''
      )}</tbody></table></div>${whiteInk && items.some(DM.hasWhite) ? '<p class="hint pdf-white-note">White ink is exported separately as a 600 PPI raster mask, including backing for vector decals. The types above describe the source artwork.</p>' : ''}</section>`;
  }
  return { artwork, decals, markup };
});
