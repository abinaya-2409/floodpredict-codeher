import { describe, expect, it } from 'vitest';
import { assessDistrict, sampleGrid } from '../utils/districtModel';
import { LiveRainfall } from '../utils/openMeteo';

const rain = (over: Partial<LiveRainfall> = {}): LiveRainfall => ({
  currentMmHr: 4,
  peak24hMmHr: 18,
  total24hMm: 60,
  total48hMm: 95,
  hoursToPeak: 6,
  maxProbabilityPercent: 80,
  observedAt: '2026-09-17T18:00',
  series: [],
  ...over,
});

describe('sampleGrid', () => {
  it('covers the bounding box without touching its edges', () => {
    const pts = sampleGrid([11.0, 12.0, 75.0, 76.0], 3);
    expect(pts).toHaveLength(9);
    for (const [lat, lon] of pts) {
      expect(lat).toBeGreaterThan(11.0);
      expect(lat).toBeLessThan(12.0);
      expect(lon).toBeGreaterThan(75.0);
      expect(lon).toBeLessThan(76.0);
    }
  });
});

describe('assessDistrict', () => {
  const base = {
    name: 'Test District',
    context: 'Test State',
    center: [11.5, 75.5] as [number, number],
  };

  it('scores a flat coastal district above an elevated one under equal rain', () => {
    const coastal = assessDistrict({ ...base, elevations: [2, 3, 1, 2, 4, 2, 3, 1, 2], rainfall: rain() });
    const upland = assessDistrict({ ...base, elevations: [600, 720, 540, 810, 690, 640, 700, 580, 760], rainfall: rain() });
    expect(coastal.hazardScore).toBeGreaterThan(upland.hazardScore);
  });

  it('rises with rainfall intensity on identical terrain', () => {
    const terrain = [5, 6, 4, 7, 5, 6, 5, 4, 6];
    const calm = assessDistrict({ ...base, elevations: terrain, rainfall: rain({ peak24hMmHr: 3, total24hMm: 8 }) });
    const storm = assessDistrict({ ...base, elevations: terrain, rainfall: rain({ peak24hMmHr: 55, total24hMm: 180 }) });
    expect(storm.hazardScore).toBeGreaterThan(calm.hazardScore);
  });

  it('stays within 0-100 at both extremes', () => {
    const nothing = assessDistrict({ ...base, elevations: [1200, 1300, 1250], rainfall: rain({ peak24hMmHr: 0, total24hMm: 0, total48hMm: 0 }) });
    const worst = assessDistrict({ ...base, elevations: [0, 0, 0], rainfall: rain({ peak24hMmHr: 200, total24hMm: 600, total48hMm: 900 }) });
    expect(nothing.hazardScore).toBeGreaterThanOrEqual(0);
    expect(worst.hazardScore).toBeLessThanOrEqual(100);
    expect(worst.hazardScore).toBeGreaterThan(nothing.hazardScore);
  });

  it('survives missing elevation samples rather than producing NaN', () => {
    const r = assessDistrict({ ...base, elevations: [], rainfall: rain() });
    expect(Number.isFinite(r.hazardScore)).toBe(true);
    expect(Number.isFinite(r.minElevationM)).toBe(true);
  });

  it('always carries the caveat that it is not the modelled product', () => {
    const r = assessDistrict({ ...base, elevations: [10, 12, 8], rainfall: rain() });
    expect(r.caveat).toMatch(/not be used for/i);
    expect(r.caveat).toMatch(/reconnaissance/i);
  });
});
