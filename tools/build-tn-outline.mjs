/**
 * Builds public/data/tamil-nadu-outline.json: the state boundary, as one
 * polygon, by dissolving the 32 Census 2011 district polygons.
 *
 *   node tools/build-tn-outline.mjs
 *
 * The map needs this to show only Tamil Nadu. A viewport is a rectangle and
 * a state is not, so bounding the pan is not enough - Kerala, Andhra Pradesh
 * and Sri Lanka still fill the corners. The fix is a mask: one polygon
 * covering the world with the state punched out of it as a hole, drawn over
 * the tiles. That needs a single dissolved outline, not 32 separate ones,
 * because 32 holes with shared edges leave hairline seams where the
 * simplified borders no longer match exactly.
 *
 * The output is committed so the app never dissolves 32 multipolygons at
 * runtime.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import union from '@turf/union';
import buffer from '@turf/buffer';
import simplify from '@turf/simplify';
import { featureCollection } from '@turf/helpers';

const SRC = 'public/data/india-districts.json';
const OUT = 'public/data/tamil-nadu-outline.json';

const geo = JSON.parse(readFileSync(SRC, 'utf8'));
const tn = geo.features.filter((f) => /tamil nadu/i.test(f.properties?.state ?? ''));
if (!tn.length) throw new Error('No Tamil Nadu features found in ' + SRC);

/**
 * Grow, dissolve, shrink back.
 *
 * A straight union leaves the state in 33 pieces. The district polygons were
 * Douglas-Peucker simplified at about 900m, which pulls shared borders apart
 * by a few hundred metres, so adjacent districts no longer touch and there is
 * nothing for a union to merge - Chennai and Thiruvallur, which share a long
 * border, come back as six separate parts.
 *
 * Buffering outward by more than the simplification error makes neighbours
 * overlap, the union then genuinely dissolves, and an inward buffer pulls the
 * outer edge back to roughly where it started. The residual error is well
 * under the simplification error already present in the source.
 */
const GROW_KM = 2;
const SHRINK_KM = -1.8;

let outline = null;
let skipped = 0;
for (const f of tn) {
  let grown;
  try {
    grown = buffer(f, GROW_KM, { units: 'kilometers' });
  } catch {
    skipped++;
    continue;
  }
  if (!grown) {
    skipped++;
    continue;
  }
  if (!outline) {
    outline = grown;
    continue;
  }
  try {
    const next = union(featureCollection([outline, grown]));
    if (next) outline = next;
    else skipped++;
  } catch {
    skipped++;
  }
}

const shrunk = buffer(outline, SHRINK_KM, { units: 'kilometers' });
if (shrunk) outline = shrunk;
// Buffering multiplies vertices; bring it back to something shippable.
try {
  outline = simplify(outline, { tolerance: 0.004, highQuality: false, mutate: true });
} catch {
  /* Keep the unsimplified outline rather than none. */
}

/**
 * Drop interior holes smaller than a few kilometres across.
 *
 * The buffer-and-shrink leaves two ~4km gaps near Puducherry. Whether they
 * are enclaves or rounding artefacts, as mask holes they punch dark patches
 * into the middle of the state, and showing a few square kilometres of
 * Puducherry is a much smaller error than that.
 */
const HOLE_MIN_DEG = 0.09; // roughly 10km
const spanOf = (ring) => {
  let minLat = 90;
  let maxLat = -90;
  let minLon = 180;
  let maxLon = -180;
  for (const [x, y] of ring) {
    minLon = Math.min(minLon, x);
    maxLon = Math.max(maxLon, x);
    minLat = Math.min(minLat, y);
    maxLat = Math.max(maxLat, y);
  }
  return Math.max(maxLat - minLat, maxLon - minLon);
};

let holesDropped = 0;
const keepBigHoles = (poly) =>
  poly.filter((ring, i) => {
    if (i === 0) return true;
    if (spanOf(ring) >= HOLE_MIN_DEG) return true;
    holesDropped++;
    return false;
  });

if (outline.geometry.type === 'Polygon') {
  outline.geometry.coordinates = keepBigHoles(outline.geometry.coordinates);
} else {
  outline.geometry.coordinates = outline.geometry.coordinates.map(keepBigHoles);
}

const countVerts = (c) =>
  Array.isArray(c) && c.length && Array.isArray(c[0])
    ? c.reduce((s, x) => s + countVerts(x), 0)
    : 1;

/** Bounding box, for the map to frame the state without measuring it again. */
let minLat = 90;
let maxLat = -90;
let minLon = 180;
let maxLon = -180;
const walk = (c) => {
  if (Array.isArray(c) && typeof c[0] === 'number') {
    minLon = Math.min(minLon, c[0]);
    maxLon = Math.max(maxLon, c[0]);
    minLat = Math.min(minLat, c[1]);
    maxLat = Math.max(maxLat, c[1]);
    return;
  }
  if (Array.isArray(c)) c.forEach(walk);
};
walk(outline.geometry.coordinates);

const out = {
  type: 'Feature',
  properties: {
    state: 'Tamil Nadu',
    districts: tn.length,
    note: 'Dissolved from Census 2011 district polygons (datameet, MIT).',
    bbox: [
      Number(minLat.toFixed(4)),
      Number(minLon.toFixed(4)),
      Number(maxLat.toFixed(4)),
      Number(maxLon.toFixed(4)),
    ],
  },
  geometry: outline.geometry,
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(out));

const bytes = JSON.stringify(out).length;
console.log(`districts dissolved : ${tn.length}${skipped ? ` (${skipped} skipped)` : ''}`);
console.log(`geometry            : ${outline.geometry.type}`);
console.log(`rings               : ${
  outline.geometry.type === 'Polygon'
    ? outline.geometry.coordinates.length
    : outline.geometry.coordinates.length + ' parts'
}`);
console.log(`vertices            : ${countVerts(outline.geometry.coordinates).toLocaleString()}`);
console.log(`small holes dropped : ${holesDropped}`);
console.log(`bbox (S,W,N,E)      : ${out.properties.bbox.join(', ')}`);
console.log(`output              : ${OUT}  ${(bytes / 1024).toFixed(1)} kB`);
