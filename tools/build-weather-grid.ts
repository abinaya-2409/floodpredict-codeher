/**
 * Builds public/data/tn-weather-grid.json: a fixed lat/lon grid over Tamil
 * Nadu carrying the terrain each cell needs to run the flood model.
 *
 *   npx tsx tools/build-weather-grid.ts
 *
 * Run once; the output is committed.
 *
 * Terrain comes from Mapzen/AWS terrarium tiles rather than from Open-Meteo's
 * elevation endpoint. That endpoint bills per *coordinate*, not per request,
 * and a nine-point ring around every cell came to 6,003 coordinates - enough
 * to exhaust the hourly quota halfway through and lose the run. Terrarium
 * tiles are keyless, unmetered, and a raster: about forty PNGs cover the
 * whole state, and once they are decoded any number of samples is free.
 *
 * That changes what can be asked of the terrain. Instead of nine points per
 * cell, each 22km cell is sampled on an 8x8 subgrid and described by its own
 * distribution - where its low ground sits relative to its average, how much
 * relief it has. Flooding happens on the low ground, so that is what the cell
 * is represented by, rather than by whatever height its centre happened to be.
 *
 * Elevation is encoded in the RGB channels:
 *   metres = (R * 256 + G + B / 256) - 32768
 */

import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { PNG } from 'pngjs';

const OUT = 'public/data/tn-weather-grid.json';
const TILE_CACHE = '.cache/terrarium';

/**
 * Bounds, padded past the state outline.
 *
 * The grid deliberately covers sea and neighbouring states. A field
 * interpolated to the edge of its own data frays there, and the state mask
 * hides everything outside Tamil Nadu anyway - cheaper to carry a ring of
 * cells nobody sees than to explain a ragged coastline.
 */
const SOUTH = 7.9;
const NORTH = 13.9;
const WEST = 76.0;
const EAST = 80.75;
/**
 * Weather cell size. About 27km.
 *
 * Set by Open-Meteo's rate limit rather than by cartography. The forecast is
 * billed per coordinate with a ceiling of 600 a minute, so the whole state
 * has to fit inside one minute's budget or the first load takes ninety
 * seconds. 0.25 degrees gives 500 cells, which does. The field is bilinearly
 * interpolated when drawn, so the extra 5km of cell costs far less on screen
 * than a slow first paint would.
 */
const STEP = 0.25;
/**
 * Terrain samples per cell edge.
 *
 * 10 gives a 2.2km lattice inside every 22km cell, and it is the spacing -
 * not the cell - that the terrain statistics are computed over. That matters:
 * measured across a whole cell, the Western Ghats come out at 6% slope and
 * 734m of "ponding depth", because at 22km the gap between a cell's low
 * ground and its mean is relief, not a hollow. At 2.2km both mean what the
 * flood model thinks they mean.
 */
const SUB = 10;
/** Tile zoom. z10 is about 150m per pixel here, ample for a 22km cell. */
const Z = 10;

const axis = (from: number, to: number, step: number) => {
  const out: number[] = [];
  for (let v = from; v <= to + 1e-9; v += step) out.push(Number(v.toFixed(3)));
  return out;
};

const lats = axis(SOUTH, NORTH, STEP);
const lons = axis(WEST, EAST, STEP);
const rows = lats.length;
const cols = lons.length;
const cells = rows * cols;

/* ------------------------------------------------------------- tiles --- */

const n = 2 ** Z;
const lonToX = (lon: number) => ((lon + 180) / 360) * n;
const latToY = (lat: number) => {
  const r = (lat * Math.PI) / 180;
  return ((1 - Math.asinh(Math.tan(r)) / Math.PI) / 2) * n;
};

const tileMinX = Math.floor(lonToX(WEST));
const tileMaxX = Math.floor(lonToX(EAST));
const tileMinY = Math.floor(latToY(NORTH));
const tileMaxY = Math.floor(latToY(SOUTH));
const tileCount = (tileMaxX - tileMinX + 1) * (tileMaxY - tileMinY + 1);

console.log(`weather grid : ${cols} x ${rows} = ${cells} cells at ${STEP} deg (~${Math.round(STEP * 111)}km)`);
console.log(`terrain      : ${SUB}x${SUB} samples per cell = ${cells * SUB * SUB} readings`);
console.log(`tiles        : ${tileCount} at z${Z}\n`);

const tiles = new Map<string, Int16Array>();

async function loadTile(tx: number, ty: number): Promise<Int16Array | null> {
  const key = `${tx}_${ty}`;
  const cached = tiles.get(key);
  if (cached) return cached;

  const file = join(TILE_CACHE, `${Z}_${key}.png`);
  let buf: Buffer | null = null;

  if (existsSync(file)) {
    buf = readFileSync(file);
  } else {
    for (let attempt = 0; attempt < 4 && !buf; attempt++) {
      try {
        const res = await fetch(
          `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${Z}/${tx}/${ty}.png`
        );
        if (res.status === 404) return null; // Off the edge of the dataset.
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        buf = Buffer.from(await res.arrayBuffer());
        mkdirSync(TILE_CACHE, { recursive: true });
        writeFileSync(file, buf);
      } catch {
        await new Promise((r) => setTimeout(r, 900 * (attempt + 1)));
      }
    }
  }
  if (!buf) return null;

  const png = PNG.sync.read(buf);
  // Decode once into metres; the raw RGB is never needed again.
  const out = new Int16Array(png.width * png.height);
  for (let i = 0, p = 0; i < png.data.length; i += 4, p++) {
    out[p] = Math.round(png.data[i] * 256 + png.data[i + 1] + png.data[i + 2] / 256 - 32768);
  }
  tiles.set(key, out);
  return out;
}

let fetched = 0;
for (let ty = tileMinY; ty <= tileMaxY; ty++) {
  for (let tx = tileMinX; tx <= tileMaxX; tx++) {
    await loadTile(tx, ty);
    fetched++;
    process.stdout.write(`\r  tiles ${fetched}/${tileCount}`);
  }
}
process.stdout.write('\n\n');

/** Elevation at a coordinate, or null where no tile covers it. */
function elevationAt(lat: number, lon: number): number | null {
  const fx = lonToX(lon);
  const fy = latToY(lat);
  const tx = Math.floor(fx);
  const ty = Math.floor(fy);
  const tile = tiles.get(`${tx}_${ty}`);
  if (!tile) return null;
  const px = Math.min(255, Math.max(0, Math.floor((fx - tx) * 256)));
  const py = Math.min(255, Math.max(0, Math.floor((fy - ty) * 256)));
  return tile[py * 256 + px];
}

/* ----------------------------------------------------------- terrain --- */

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const percentile = (sorted: number[], p: number) =>
  sorted[clamp(Math.floor(p * (sorted.length - 1)), 0, sorted.length - 1)];

const elevationM: number[] = [];
const sinkDepthM: number[] = [];
const slopePercent: number[] = [];
const drainableFraction: number[] = [];

/** Metres between adjacent terrain samples. */
const sampleM = (STEP / SUB) * 111_320;
let sea = 0;

for (const lat of lats) {
  for (const lon of lons) {
    // Read the cell as a small raster so each interior point has neighbours.
    const raster: (number | null)[][] = [];
    for (let i = 0; i < SUB; i++) {
      const row: (number | null)[] = [];
      for (let j = 0; j < SUB; j++) {
        const sLat = lat - STEP / 2 + (STEP * (i + 0.5)) / SUB;
        const sLon = lon - STEP / 2 + (STEP * (j + 0.5)) / SUB;
        row.push(elevationAt(sLat, sLon));
      }
      raster.push(row);
    }

    /**
     * Terrain at every interior sample, computed against its immediate
     * neighbours rather than against the whole cell.
     */
    const candidates: {
      elevation: number;
      sink: number;
      slope: number;
      drainable: number;
    }[] = [];

    for (let i = 1; i < SUB - 1; i++) {
      for (let j = 1; j < SUB - 1; j++) {
        const self = raster[i][j];
        if (self === null || self <= 0) continue;

        const around: number[] = [];
        for (const [di, dj] of [
          [-1, -1], [-1, 0], [-1, 1],
          [0, -1], [0, 1],
          [1, -1], [1, 0], [1, 1],
        ]) {
          const v = raster[i + di][j + dj];
          if (v !== null && Number.isFinite(v)) around.push(v);
        }
        if (around.length < 5) continue;

        const mean = around.reduce((a, b) => a + b, 0) / around.length;
        const relief = Math.max(self, ...around) - Math.min(self, ...around);
        candidates.push({
          elevation: self,
          // Clamped: the storage model caps its own capacity at 3m, so a
          // hundred-metre figure only hides that the cell saturated.
          sink: clamp(mean - self, -20, 20),
          slope: clamp((relief / (sampleM * 2)) * 100, 0, 25),
          drainable: around.filter((e) => e < self).length / around.length,
        });
      }
    }

    if (candidates.length < 4) {
      sea++;
      elevationM.push(0);
      sinkDepthM.push(0);
      slopePercent.push(0);
      drainableFraction.push(0.5);
      continue;
    }

    // The cell is represented by its low ground, because that is where water
    // stands and where people are flooded - not by whatever its centre
    // pixel happened to be. The 20th percentile by elevation rather than the
    // single minimum, so one anomalous pixel cannot speak for 500 square
    // kilometres.
    candidates.sort((a, b) => a.elevation - b.elevation);
    const pick = candidates[Math.floor(0.2 * (candidates.length - 1))];

    elevationM.push(Number(pick.elevation.toFixed(1)));
    sinkDepthM.push(Number(pick.sink.toFixed(2)));
    slopePercent.push(Number(pick.slope.toFixed(3)));
    drainableFraction.push(Number(pick.drainable.toFixed(3)));
  }
}

const out = {
  note:
    'Fixed grid over Tamil Nadu. Terrain is precomputed from Mapzen/AWS terrarium ' +
    'elevation tiles. Each cell is sampled on a 10x10 lattice and represented by '+
    'the terrain at its low ground, computed against a 2.2km neighbourhood. ' +
    'Weather is fetched live at runtime against the same cell centres.',
  source: 'https://registry.opendata.aws/terrain-tiles/',
  south: SOUTH,
  west: WEST,
  step: STEP,
  rows,
  cols,
  samplesPerCell: SUB * SUB,
  sampleSpacingM: Math.round((STEP / SUB) * 111320),
  tileZoom: Z,
  elevationM,
  sinkDepthM,
  slopePercent,
  drainableFraction,
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(out));

const bytes = JSON.stringify(out).length;
console.log(`cells          : ${cells} (${sea} open water)`);
console.log(`elevation      : ${Math.min(...elevationM)}m .. ${Math.max(...elevationM)}m`);
console.log(`ponding depth  : ${Math.min(...sinkDepthM).toFixed(1)}m .. ${Math.max(...sinkDepthM).toFixed(1)}m relative to surroundings`);
console.log(`hollows        : ${sinkDepthM.filter((v) => v > 0.5).length} cells sit below their surroundings`);
console.log(`steepest cell  : ${Math.max(...slopePercent).toFixed(2)}%`);
console.log(`output         : ${OUT}  ${(bytes / 1024).toFixed(1)} kB`);
