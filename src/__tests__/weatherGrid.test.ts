import { describe, expect, it } from 'vitest';
import {
  FIELDS,
  FIELD_META,
  WeatherGrid,
  fieldValues,
  latOf,
  lonOf,
  sampleBilinear,
} from '../utils/weatherGrid';
import { colorFor, fieldScale, legendTicks } from '../components/weather/fieldRenderer';

/**
 * The grid is the one place where an off-by-one is invisible: a field drawn
 * upside down or half a cell out still looks like weather. These tests pin
 * the geometry and the scaling, which is where that kind of error hides.
 */

function makeGrid(over: Partial<WeatherGrid> = {}): WeatherGrid {
  const rows = 4;
  const cols = 3;
  const cells = rows * cols;
  const hours = 2;
  const zeros = () => new Float32Array(cells * hours);

  const rain = zeros();
  // Hour 0: a single wet cell at row 1, col 1.
  rain[1 * cols + 1] = 10;
  // Hour 1: the same cell, heavier.
  rain[cells + 1 * cols + 1] = 20;

  return {
    south: 8,
    west: 76,
    step: 0.5,
    rows,
    cols,
    cells,
    generatedAt: '2026-01-01T00:00:00.000Z',
    hours: ['2026-01-01T00:00', '2026-01-01T01:00'],
    elevationM: new Float32Array(cells),
    sinkDepthM: new Float32Array(cells),
    slopePercent: new Float32Array(cells),
    drainableFraction: new Float32Array(cells),
    rain,
    windU: zeros(),
    windV: zeros(),
    windSpeed: zeros(),
    temp: zeros(),
    flood: zeros(),
    peak: { flood: 0, rain: 20, wind: 0, temp: 0 },
    ...over,
  };
}

describe('grid geometry', () => {
  it('puts row zero at the southern edge', () => {
    const g = makeGrid();
    expect(latOf(g, 0)).toBe(8);
    expect(latOf(g, 3)).toBe(9.5);
    expect(lonOf(g, 0)).toBe(76);
    expect(lonOf(g, 2)).toBe(77);
  });
});

describe('sampleBilinear', () => {
  const g = makeGrid();

  it('returns the cell value exactly on a grid point', () => {
    expect(sampleBilinear(g, g.rain, 0, latOf(g, 1), lonOf(g, 1))).toBeCloseTo(10, 5);
  });

  it('interpolates halfway between two cells', () => {
    // Midway between the wet cell and its dry neighbour to the east.
    const v = sampleBilinear(g, g.rain, 0, latOf(g, 1), lonOf(g, 1) + g.step / 2);
    expect(v).toBeCloseTo(5, 5);
  });

  it('reads the right hour', () => {
    expect(sampleBilinear(g, g.rain, 1, latOf(g, 1), lonOf(g, 1))).toBeCloseTo(20, 5);
  });

  it('returns zero outside the grid rather than wrapping', () => {
    expect(sampleBilinear(g, g.rain, 0, 40, 100)).toBe(0);
    expect(sampleBilinear(g, g.rain, 0, -40, -100)).toBe(0);
  });
});

describe('fieldScale', () => {
  it('never lets a field saturate below its own peak', () => {
    // A cyclone must not flatten into one colour because the ramp topped out.
    const g = makeGrid({ peak: { flood: 0, rain: 250, wind: 0, temp: 0 } });
    const scale = fieldScale(g, 'rain');
    expect(scale.hi).toBeGreaterThanOrEqual(250);
  });

  it('follows a quiet forecast down instead of washing it out', () => {
    // A fixed ceiling would put a 2mm/hr peak in the bottom tenth of the ramp
    // and render the whole state one colour.
    const g = makeGrid({ peak: { flood: 0, rain: 2, wind: 0, temp: 0 } });
    expect(fieldScale(g, 'rain').hi).toBe(2);
  });

  it('never collapses to a zero-width scale', () => {
    const g = makeGrid({ peak: { flood: 0, rain: 0, wind: 0, temp: 0 } });
    for (const f of ['flood', 'rain', 'wind'] as const) {
      expect(fieldScale(g, f).hi, f).toBeGreaterThan(0);
    }
  });

  it('guarantees a readable span when a field is flat', () => {
    // Every cell identical: without a floor on the span the legend prints
    // the same number at both ends and the ramp is one colour.
    const g = makeGrid();
    const scale = fieldScale(g, 'temp');
    expect(scale.hi - scale.lo).toBeGreaterThanOrEqual(4);
  });

  it('windows temperature around the data, not around zero', () => {
    const temp = new Float32Array(24);
    temp.fill(28);
    temp[0] = 21;
    temp[1] = 39;
    const g = makeGrid({ temp, peak: { flood: 0, rain: 0, wind: 0, temp: 39 } });
    const scale = fieldScale(g, 'temp');
    expect(scale.lo).toBe(21);
    expect(scale.hi).toBe(39);
  });
});

describe('legend', () => {
  it('agrees with the colours the field is drawn in', () => {
    const g = makeGrid();
    const scale = fieldScale(g, 'rain');
    const ticks = legendTicks('rain', scale, 5);
    expect(ticks).toHaveLength(5);
    expect(ticks[0].value).toBe(scale.lo);
    expect(ticks[4].value).toBe(scale.hi);
    // The legend swatch must be the same function the map uses.
    expect(ticks[2].color).toBe(colorFor('rain', ticks[2].value, scale));
  });

  it('produces a distinct colour at each end', () => {
    const g = makeGrid();
    for (const f of FIELDS) {
      const scale = fieldScale(g, f);
      expect(colorFor(f, scale.lo, scale), f).not.toBe(colorFor(f, scale.hi, scale));
    }
  });

  it('clamps out-of-range values instead of producing nonsense', () => {
    const g = makeGrid();
    const scale = fieldScale(g, 'rain');
    expect(colorFor('rain', -999, scale)).toBe(colorFor('rain', scale.lo, scale));
    expect(colorFor('rain', 9e9, scale)).toBe(colorFor('rain', scale.hi, scale));
  });
});

describe('fieldValues', () => {
  it('maps every field to a real array', () => {
    const g = makeGrid();
    for (const f of FIELDS) {
      expect(fieldValues(g, f), f).toBeInstanceOf(Float32Array);
      expect(fieldValues(g, f).length, f).toBe(g.cells * 2);
    }
  });

  it('describes every field for the legend', () => {
    for (const f of FIELDS) {
      expect(FIELD_META[f].label, f).toBeTruthy();
      expect(FIELD_META[f].description, f).toBeTruthy();
    }
  });
});
