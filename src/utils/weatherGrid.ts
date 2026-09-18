import { runStorageModel } from './pointForecast';

/**
 * A Windy-style field over Tamil Nadu.
 *
 * Windy draws weather; this draws weather *and* what the ground does with it.
 * Rain, wind and temperature come straight from Open-Meteo for every cell in
 * a fixed grid. The fourth field is the one worth having: the flood model run
 * at every cell, for every hour, against that cell's own terrain - so the map
 * shows where rain turns into standing water rather than where it falls.
 *
 * The split is deliberate. Terrain is shipped with the app because it never
 * changes; weather is fetched through this application's own cached API
 * because it does, and because 720 cells is 720 billed calls that no single
 * browser should be paying for.
 *
 * Everything is stored in flat typed arrays indexed `hour * cells + cell`.
 * At 720 cells and 48 hours that is 34,560 values per field, and building
 * that many small objects is what would make scrubbing the timeline stutter.
 */

export const FIELDS = ['flood', 'rain', 'wind', 'temp'] as const;
export type FieldId = (typeof FIELDS)[number];

export interface FieldMeta {
  id: FieldId;
  label: string;
  unit: string;
  /** What the layer is claiming, in one line, for the UI to show. */
  description: string;
  /** Values at or below this are drawn as nothing at all. */
  floor: number;
  /** Value that saturates the colour ramp. */
  ceiling: number;
}

export const FIELD_META: Record<FieldId, FieldMeta> = {
  flood: {
    id: 'flood',
    label: 'Flood depth',
    unit: 'cm',
    description:
      'Modelled standing water, from this cell’s rainfall and terrain. Not observed.',
    floor: 1,
    ceiling: 60,
  },
  rain: {
    id: 'rain',
    label: 'Rainfall',
    unit: 'mm/hr',
    description: 'Hourly precipitation from the Open-Meteo forecast.',
    floor: 0.1,
    ceiling: 20,
  },
  wind: {
    id: 'wind',
    label: 'Wind',
    unit: 'km/h',
    description: 'Wind at 10m. Particles trace the direction it blows.',
    floor: 0.5,
    ceiling: 60,
  },
  temp: {
    id: 'temp',
    label: 'Temperature',
    unit: '°C',
    description: 'Air temperature at 2m.',
    floor: -50,
    ceiling: 45,
  },
};

interface GridFile {
  south: number;
  west: number;
  step: number;
  rows: number;
  cols: number;
  samplesPerCell?: number;
  elevationM: number[];
  sinkDepthM: number[];
  slopePercent: number[];
  drainableFraction: number[];
}

export interface WeatherGrid {
  south: number;
  west: number;
  step: number;
  rows: number;
  cols: number;
  cells: number;
  /** When the upstream forecast was fetched, so the UI can say how fresh it is. */
  generatedAt: string;
  /** ISO local times, one per hour step. */
  hours: string[];
  /** Per cell, constant. Kept so the flood field can be re-run locally. */
  elevationM: Float32Array;
  sinkDepthM: Float32Array;
  slopePercent: Float32Array;
  drainableFraction: Float32Array;
  /** hour * cells + cell. */
  rain: Float32Array;
  windU: Float32Array;
  windV: Float32Array;
  windSpeed: Float32Array;
  temp: Float32Array;
  flood: Float32Array;
  /** The largest value each field reaches, for honest legends. */
  peak: Record<FieldId, number>;
}

/** Lat of a row, lon of a column. Row 0 is the southern edge. */
export const latOf = (g: { south: number; step: number }, row: number) =>
  g.south + row * g.step;
export const lonOf = (g: { west: number; step: number }, col: number) =>
  g.west + col * g.step;

const HOURS = 48;

/** What /api/weather-grid returns: columnar, rounded, one entry per cell-hour. */
interface GridResponse {
  generatedAt: string;
  rows: number;
  cols: number;
  hours: string[];
  rain: number[];
  speed: number[];
  dir: number[];
  temp: number[];
}

/**
 * Loads the grid and fills it with a live forecast.
 *
 * The forecast comes from this application's own API rather than straight
 * from Open-Meteo. 720 cells is 720 billed calls against a 10,000-a-day
 * allowance, so a browser going direct would burn a user's quota in about
 * thirteen page loads, and every user would pay it again. Server-side it is
 * one upstream request the CDN shares with everyone.
 *
 * Progress is reported so the map can say what it is waiting on; a blank
 * screen for two seconds reads as broken.
 */
export async function loadWeatherGrid(
  onProgress?: (done: number, total: number) => void,
  signal?: AbortSignal
): Promise<WeatherGrid> {
  onProgress?.(0, 2);
  const [gridRes, wxRes] = await Promise.all([
    fetch('/data/tn-weather-grid.json', { signal }),
    fetch('/api/weather-grid', { signal }),
  ]);

  if (!gridRes.ok) throw new Error(`Terrain grid unavailable (${gridRes.status})`);
  if (!wxRes.ok) {
    const detail = await wxRes.text().catch(() => '');
    throw new Error(`Forecast unavailable (${wxRes.status}) ${detail.slice(0, 120)}`);
  }

  const file = (await gridRes.json()) as GridFile;
  onProgress?.(1, 2);
  const wx = (await wxRes.json()) as GridResponse;

  if (wx.rows !== file.rows || wx.cols !== file.cols) {
    throw new Error(
      `Grid mismatch: terrain is ${file.cols}x${file.rows}, forecast is ${wx.cols}x${wx.rows}`
    );
  }

  const cells = file.rows * file.cols;
  const size = cells * HOURS;
  const rain = Float32Array.from(wx.rain);
  const windSpeed = Float32Array.from(wx.speed);
  const temp = Float32Array.from(wx.temp);
  const windU = new Float32Array(size);
  const windV = new Float32Array(size);

  for (let i = 0; i < size; i++) {
    // Meteorological direction is where the wind comes *from*, so the vector
    // it travels along is the negation of that bearing.
    const rad = (wx.dir[i] * Math.PI) / 180;
    windU[i] = -windSpeed[i] * Math.sin(rad);
    windV[i] = -windSpeed[i] * Math.cos(rad);
  }

  const terrain = {
    elevationM: file.elevationM,
    sinkDepthM: file.sinkDepthM,
    slopePercent: file.slopePercent,
    drainableFraction: file.drainableFraction,
  };
  const flood = computeFlood(rain, cells, terrain, 1);
  onProgress?.(2, 2);

  return {
    south: file.south,
    west: file.west,
    step: file.step,
    rows: file.rows,
    cols: file.cols,
    cells,
    generatedAt: wx.generatedAt,
    hours: wx.hours,
    elevationM: Float32Array.from(file.elevationM),
    sinkDepthM: Float32Array.from(file.sinkDepthM),
    slopePercent: Float32Array.from(file.slopePercent),
    drainableFraction: Float32Array.from(file.drainableFraction),
    rain,
    windU,
    windV,
    windSpeed,
    temp,
    flood,
    peak: {
      flood: peakOf(flood),
      rain: peakOf(rain),
      wind: peakOf(windSpeed),
      temp: peakOf(temp),
    },
  };
}

/**
 * Runs the flood model at every cell, for every hour.
 *
 * Each cell goes through the same storage model the click-anywhere forecast
 * uses, against its own precomputed terrain. That is what makes two cells
 * under identical rain come out differently: one is a delta and the other is
 * a hillside.
 *
 * `multiplier` scales the rainfall before the model sees it. At 1 this is the
 * forecast. Above 1 it is a what-if, and the UI has to say so - which it
 * needs to, because Tamil Nadu is dry most of the year and a flood layer that
 * is correctly empty for eleven months is indistinguishable from one that is
 * broken.
 */
export function computeFlood(
  rain: Float32Array,
  cells: number,
  terrain: {
    elevationM: number[] | Float32Array;
    sinkDepthM: number[] | Float32Array;
    slopePercent: number[] | Float32Array;
    drainableFraction: number[] | Float32Array;
  },
  multiplier = 1
): Float32Array {
  const flood = new Float32Array(cells * HOURS);
  const series = new Array<number>(HOURS);

  for (let cell = 0; cell < cells; cell++) {
    for (let t = 0; t < HOURS; t++) series[t] = rain[t * cells + cell] * multiplier;
    const { steps } = runStorageModel(series, {
      elevationM: terrain.elevationM[cell],
      sinkDepthM: terrain.sinkDepthM[cell],
      slopePercent: terrain.slopePercent[cell],
      drainableFraction: terrain.drainableFraction[cell],
    });
    for (let t = 0; t < HOURS; t++) flood[t * cells + cell] = steps[t].depthCm;
  }
  return flood;
}

/** Largest value in a field, for the legend and the empty-state check. */
export function peakOf(a: Float32Array): number {
  let m = 0;
  for (let i = 0; i < a.length; i++) if (a[i] > m) m = a[i];
  return m;
}

/** The scalar array a field is drawn from. */
export function fieldValues(grid: WeatherGrid, field: FieldId): Float32Array {
  switch (field) {
    case 'flood':
      return grid.flood;
    case 'rain':
      return grid.rain;
    case 'wind':
      return grid.windSpeed;
    case 'temp':
      return grid.temp;
  }
}

/**
 * Bilinear sample of a field at an arbitrary coordinate.
 *
 * Used for the wind particles, which sit between cells almost by definition -
 * snapping them to the nearest cell makes them move in visible steps.
 */
export function sampleBilinear(
  grid: WeatherGrid,
  values: Float32Array,
  hour: number,
  lat: number,
  lon: number
): number {
  const x = (lon - grid.west) / grid.step;
  const y = (lat - grid.south) / grid.step;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  if (x0 < 0 || y0 < 0 || x0 >= grid.cols - 1 || y0 >= grid.rows - 1) return 0;

  const fx = x - x0;
  const fy = y - y0;
  const base = hour * grid.cells;
  const at = (r: number, c: number) => values[base + r * grid.cols + c];

  const top = at(y0, x0) * (1 - fx) + at(y0, x0 + 1) * fx;
  const bottom = at(y0 + 1, x0) * (1 - fx) + at(y0 + 1, x0 + 1) * fx;
  return top * (1 - fy) + bottom * fy;
}
