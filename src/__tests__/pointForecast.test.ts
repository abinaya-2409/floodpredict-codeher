import { describe, expect, it } from 'vitest';
import {
  TerrainInput,
  bandForDepth,
  runStorageModel,
  samplingRing,
} from '../utils/pointForecast';

/**
 * The storage model is the one piece of this app that makes a physical
 * claim, so it is pinned by behaviour rather than by exact numbers: the
 * coefficients will be tuned, but a hollow must never drain faster than a
 * hillside, and water must never appear without rain.
 */

const FLAT_HOLLOW: TerrainInput = {
  sinkDepthM: 1.5,
  slopePercent: 0.3,
  drainableFraction: 0.1,
  elevationM: 8,
};
const HILLSIDE: TerrainInput = {
  sinkDepthM: -3,
  slopePercent: 9,
  drainableFraction: 0.9,
  elevationM: 600,
};

const storm = (mmHr: number, hours: number, total = 48) =>
  Array.from({ length: total }, (_, h) => (h < hours ? mmHr : 0));

describe('runStorageModel', () => {
  it('leaves dry ground dry', () => {
    const { steps } = runStorageModel(storm(0, 0), FLAT_HOLLOW);
    expect(steps.every((s) => s.depthCm === 0)).toBe(true);
  });

  it('floods a flat hollow deeper than a hillside under the same storm', () => {
    const rain = storm(80, 6);
    const hollow = runStorageModel(rain, FLAT_HOLLOW);
    const hill = runStorageModel(rain, HILLSIDE);
    const peak = (r: typeof hollow) => Math.max(...r.steps.map((s) => s.depthCm));
    expect(peak(hollow)).toBeGreaterThan(peak(hill));
  });

  it('ignores rain below the drainage threshold', () => {
    const { thresholdMmHr } = runStorageModel(storm(0, 0), FLAT_HOLLOW);
    const { steps } = runStorageModel(storm(thresholdMmHr - 0.5, 12), FLAT_HOLLOW);
    expect(Math.max(...steps.map((s) => s.depthCm))).toBe(0);
  });

  it('accumulates once rain passes the threshold', () => {
    const { thresholdMmHr } = runStorageModel(storm(0, 0), FLAT_HOLLOW);
    const { steps } = runStorageModel(storm(thresholdMmHr * 4, 12), FLAT_HOLLOW);
    expect(Math.max(...steps.map((s) => s.depthCm))).toBeGreaterThan(0);
  });

  it('separates a cloudburst from a long moderate event', () => {
    // Equal totals, different intensities. A peak-flow formula would score
    // these the same; a storage model must not.
    const burst = runStorageModel(storm(240, 2), FLAT_HOLLOW);
    const drizzle = runStorageModel(storm(20, 24), FLAT_HOLLOW);
    const peak = (r: typeof burst) => Math.max(...r.steps.map((s) => s.depthCm));
    expect(peak(burst)).not.toBe(peak(drizzle));
  });

  it('recedes after the rain stops', () => {
    const { steps } = runStorageModel(storm(120, 4), FLAT_HOLLOW);
    const peak = Math.max(...steps.map((s) => s.depthCm));
    expect(steps[steps.length - 1].depthCm).toBeLessThan(peak);
  });

  it('never exceeds its own storage ceiling', () => {
    const { steps, capacityCm } = runStorageModel(storm(400, 40), FLAT_HOLLOW);
    expect(Math.max(...steps.map((s) => s.depthCm))).toBeLessThanOrEqual(capacityCm);
  });

  it('gives low coastal ground a lower drainage threshold than inland ground', () => {
    // Submerged outfalls stop draining, so the coast starts flooding sooner.
    const coast = runStorageModel(storm(0, 0), { ...FLAT_HOLLOW, elevationM: 1 });
    const inland = runStorageModel(storm(0, 0), { ...FLAT_HOLLOW, elevationM: 40 });
    expect(coast.thresholdMmHr).toBeLessThan(inland.thresholdMmHr);
  });
});

describe('samplingRing', () => {
  it('puts the clicked point first, then eight neighbours', () => {
    const ring = samplingRing(13.0418, 80.2341, 900);
    expect(ring).toHaveLength(9);
    expect(ring[0]).toEqual([13.0418, 80.2341]);
  });

  it('spaces the ring at roughly the requested radius', () => {
    const [lat, lon] = [13.0418, 80.2341];
    const ring = samplingRing(lat, lon, 900);
    // The due-north sample should be ~900m away: 900/111320 degrees.
    expect(ring[1][0] - lat).toBeCloseTo(900 / 111320, 5);
  });
});

describe('bandForDepth', () => {
  it('matches the thresholds the legend advertises', () => {
    expect(bandForDepth(0)).toBe('low');
    expect(bandForDepth(14)).toBe('low');
    expect(bandForDepth(15)).toBe('moderate');
    expect(bandForDepth(30)).toBe('high');
    expect(bandForDepth(50)).toBe('severe');
    expect(bandForDepth(75)).toBe('critical');
  });
});
