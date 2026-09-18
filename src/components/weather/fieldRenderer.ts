import { FieldId, FIELD_META, WeatherGrid } from '../../utils/weatherGrid';

/**
 * Turns a grid of numbers into the smooth colour wash a weather map is
 * supposed to look like.
 *
 * The whole trick is to paint one pixel per grid cell into a tiny offscreen
 * canvas - 23 by 30 - and then let the browser scale it up with smoothing on.
 * That gives bilinear interpolation across the whole field for free, on the
 * GPU, at any zoom. Interpolating in JavaScript to fill a 1600-pixel-wide
 * canvas would be a million samples a frame and would make the timeline
 * unusable.
 *
 * Mercator is not linear in latitude, so a single scaled blit is technically
 * wrong. Across Tamil Nadu - 8 to 14 degrees north - the error works out at
 * about 0.2% of the height, one or two pixels. Drawing row by row to fix that
 * would cost far more than it buys.
 */

type Stop = { at: number; rgb: [number, number, number] };

/**
 * Ramps are quoted as fractions of the field's ceiling, not absolutes, so a
 * quiet day and a cyclone use the same scale and stay comparable.
 *
 * Flood reuses the severity palette the rest of the application already
 * reserves for data, because 30cm of water on this map has to mean the same
 * thing as 30cm in the ward table.
 */
const RAMPS: Record<FieldId, Stop[]> = {
  flood: [
    { at: 0.0, rgb: [45, 212, 191] },
    { at: 0.25, rgb: [96, 165, 250] },
    { at: 0.5, rgb: [251, 191, 36] },
    { at: 0.75, rgb: [251, 113, 133] },
    { at: 1.0, rgb: [232, 121, 249] },
  ],
  rain: [
    { at: 0.0, rgb: [56, 132, 255] },
    { at: 0.2, rgb: [56, 189, 248] },
    { at: 0.4, rgb: [52, 211, 153] },
    { at: 0.6, rgb: [250, 204, 21] },
    { at: 0.8, rgb: [249, 115, 22] },
    { at: 1.0, rgb: [225, 29, 72] },
  ],
  wind: [
    { at: 0.0, rgb: [30, 64, 120] },
    { at: 0.25, rgb: [34, 211, 238] },
    { at: 0.5, rgb: [74, 222, 128] },
    { at: 0.7, rgb: [250, 204, 21] },
    { at: 0.85, rgb: [249, 115, 22] },
    { at: 1.0, rgb: [225, 29, 72] },
  ],
  temp: [
    { at: 0.0, rgb: [49, 90, 190] },
    { at: 0.35, rgb: [34, 211, 238] },
    { at: 0.5, rgb: [74, 222, 128] },
    { at: 0.68, rgb: [250, 204, 21] },
    { at: 0.85, rgb: [249, 115, 22] },
    { at: 1.0, rgb: [190, 24, 60] },
  ],
};

function rampAt(stops: Stop[], t: number): [number, number, number] {
  const x = Math.max(0, Math.min(1, t));
  for (let i = 1; i < stops.length; i++) {
    if (x <= stops[i].at) {
      const a = stops[i - 1];
      const b = stops[i];
      const f = (x - a.at) / Math.max(1e-6, b.at - a.at);
      return [
        Math.round(a.rgb[0] + (b.rgb[0] - a.rgb[0]) * f),
        Math.round(a.rgb[1] + (b.rgb[1] - a.rgb[1]) * f),
        Math.round(a.rgb[2] + (b.rgb[2] - a.rgb[2]) * f),
      ];
    }
  }
  return stops[stops.length - 1].rgb;
}

/** The scale a field is drawn against, so the legend cannot disagree with it. */
export function fieldScale(grid: WeatherGrid, field: FieldId): { lo: number; hi: number } {
  const meta = FIELD_META[field];
  if (field === 'temp') {
    // Temperature has no meaningful zero, so it gets a window around what is
    // actually in the data rather than a fixed ceiling.
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < grid.temp.length; i++) {
      const v = grid.temp[i];
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    // A flat field - every cell identical, or an empty array - would give
    // lo === hi, which collapses the ramp to one colour and prints the same
    // number at both ends of the legend. Guarantee a span to read against.
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) return { lo: 15, hi: 45 };
    const mid = (lo + hi) / 2;
    if (hi - lo < 4) return { lo: Math.floor(mid - 2), hi: Math.ceil(mid + 2) };
    return { lo: Math.floor(lo), hi: Math.ceil(hi) };
  }
  /*
   * Otherwise: floor at zero, ceiling at what the forecast actually reaches.
   *
   * Adaptive rather than fixed, in both directions. A cyclone must not flatten
   * into one saturated colour, and a quiet week must not disappear into the
   * bottom eighth of the ramp - which is what a fixed 60cm flood ceiling does
   * when the whole state peaks at 16cm. The legend prints the numbers, so the
   * scale is stated rather than assumed.
   */
  const peak = Math.ceil(grid.peak[field]);
  return { lo: 0, hi: Math.max(peak, meta.floor * 6, 1) };
}

export function colorFor(
  field: FieldId,
  value: number,
  scale: { lo: number; hi: number }
): string {
  const t = (value - scale.lo) / Math.max(1e-6, scale.hi - scale.lo);
  const [r, g, b] = rampAt(RAMPS[field], t);
  return `rgb(${r},${g},${b})`;
}

/**
 * Paints one hour of one field into an offscreen canvas, one pixel per cell.
 *
 * Row 0 of the grid is its southern edge and row 0 of an image is its top, so
 * the rows are written in reverse - without that the state comes out upside
 * down, which is surprisingly easy to miss on a field with no hard edges.
 */
export function paintField(
  target: HTMLCanvasElement,
  grid: WeatherGrid,
  values: Float32Array,
  hour: number,
  field: FieldId,
  scale: { lo: number; hi: number }
): void {
  const { cols, rows, cells } = grid;
  target.width = cols;
  target.height = rows;
  const ctx = target.getContext('2d');
  if (!ctx) return;

  const img = ctx.createImageData(cols, rows);
  const meta = FIELD_META[field];
  const base = hour * cells;
  const span = Math.max(1e-6, scale.hi - scale.lo);

  for (let r = 0; r < rows; r++) {
    const flipped = rows - 1 - r;
    for (let c = 0; c < cols; c++) {
      const v = values[base + r * cols + c];
      const o = (flipped * cols + c) * 4;

      if (v <= meta.floor) {
        img.data[o + 3] = 0;
        continue;
      }

      const t = (v - scale.lo) / span;
      const [red, green, blue] = rampAt(RAMPS[field], t);
      img.data[o] = red;
      img.data[o + 1] = green;
      img.data[o + 2] = blue;
      // Fade in over the first stretch of the ramp so light rain reads as
      // light rain rather than as a hard edge against nothing.
      img.data[o + 3] = Math.round(255 * Math.min(1, 0.35 + t * 1.6));
    }
  }

  ctx.putImageData(img, 0, 0);
}

/** Evenly spaced legend ticks across a field's active scale. */
export function legendTicks(
  field: FieldId,
  scale: { lo: number; hi: number },
  count = 5
): { value: number; color: string }[] {
  const out: { value: number; color: string }[] = [];
  for (let i = 0; i < count; i++) {
    const v = scale.lo + ((scale.hi - scale.lo) * i) / (count - 1);
    out.push({ value: Math.round(v), color: colorFor(field, v, scale) });
  }
  return out;
}
