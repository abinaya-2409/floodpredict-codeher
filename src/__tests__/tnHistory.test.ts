import { describe, expect, it } from 'vitest';
import {
  TN_DISASTERS,
  TN_DISTRICT_CENTROIDS,
  TN_DISTRICT_FLOOD_COUNTS,
} from '../data/tnDisasterHistory';
import { historyForPoint, nearestDistrict, RAINFALL_ANCHORS } from '../utils/tnHistory';

/**
 * The generated dataset is the one place in this application where a wrong
 * number would be indistinguishable from a right one, because it is all
 * derived from prose. These tests guard the derivation, not the arithmetic:
 * that every event is attributable, that disagreements between the two source
 * files survived the merge, and that nothing acquired a figure its source
 * never published.
 */

describe('TN disaster dataset', () => {
  it('attributes every event to a source', () => {
    for (const e of TN_DISASTERS) {
      expect(e.source, e.id).toBeTruthy();
      expect(e.sourceType, e.id).toBeTruthy();
    }
  });

  it('carries no invented rainfall', () => {
    // Only one event in the record has a published rainfall figure. If this
    // number climbs, something is filling gaps rather than reporting them.
    const withRain = TN_DISASTERS.filter((e) => e.isHydro && e.rainfallMm !== null);
    expect(withRain).toHaveLength(1);
    expect(withRain[0].name).toMatch(/fengal/i);
  });

  it('keeps the disagreement between the two source files', () => {
    // The detailed file says Nivar killed 6; the summary file says 12.
    const nivar = TN_DISASTERS.find((e) => /nivar/i.test(e.name))!;
    expect(nivar.deaths).toBe(6);
    expect(nivar.variants.join(' ')).toMatch(/12/);

    const fengal = TN_DISASTERS.find((e) => /fengal/i.test(e.name))!;
    expect(fengal.deaths).toBe(40);
    expect(fengal.variants.join(' ')).toMatch(/3/);
  });

  it('flags events whose own source cell held more than one figure', () => {
    const monsoon2021 = TN_DISASTERS.find((e) => e.id === 'TN2021-04')!;
    expect(monsoon2021.deathsRaw).toMatch(/128/);
  });

  it('excludes the summary file TOTAL row and the reference-only 2015 entry', () => {
    expect(TN_DISASTERS.some((e) => /^total/i.test(e.name))).toBe(false);
    expect(TN_DISASTERS.some((e) => e.year === 2015)).toBe(false);
  });

  it('separates non-hydro incidents from the flood record', () => {
    const fireworks = TN_DISASTERS.filter((e) => e.hazard === 'fireworks');
    expect(fireworks.length).toBeGreaterThan(0);
    expect(fireworks.every((e) => !e.isHydro)).toBe(true);
  });

  it('keeps drought out of the flood exposure counts', () => {
    // The 2019 declaration named 18 districts. If it were counted, inland
    // districts would rank alongside Chennai for flood exposure.
    const drought = TN_DISASTERS.find((e) => e.hazard === 'drought')!;
    expect(drought.districts.length).toBeGreaterThan(10);
    // Erode appears only in the drought event, so it must not be counted.
    expect(drought.districts).toContain('Erode');
    expect(TN_DISTRICT_FLOOD_COUNTS.Erode).toBeUndefined();
  });

  it('ranks the coastal and delta districts highest for flood exposure', () => {
    const top = Object.entries(TN_DISTRICT_FLOOD_COUNTS).slice(0, 4).map(([d]) => d);
    expect(top).toContain('Chennai');
    expect(top).toContain('Cuddalore');
  });

  it('gives every district a centroid inside Tamil Nadu', () => {
    const entries = Object.entries(TN_DISTRICT_CENTROIDS);
    expect(entries.length).toBeGreaterThanOrEqual(30);
    for (const [name, [lat, lon]] of entries) {
      expect(lat, name).toBeGreaterThan(7.5);
      expect(lat, name).toBeLessThan(13.9);
      expect(lon, name).toBeGreaterThan(75.7);
      expect(lon, name).toBeLessThan(80.8);
    }
  });

  it('publishes an anchor only for the event that has a measured figure', () => {
    expect(RAINFALL_ANCHORS).toHaveLength(1);
    expect(RAINFALL_ANCHORS[0].mm).toBeGreaterThan(0);
  });
});

describe('historyForPoint', () => {
  it('finds Chennai from a Chennai coordinate', () => {
    // T. Nagar.
    expect(nearestDistrict(13.0418, 80.2341)?.district).toBe('Chennai');
  });

  it('returns the recorded events for that district', () => {
    const h = historyForPoint(13.0418, 80.2341)!;
    expect(h.district).toBe('Chennai');
    expect(h.floodEvents.length).toBeGreaterThan(0);
    expect(h.floodEvents.every((e) => e.hazard === 'flood' || e.hazard === 'cyclone')).toBe(
      true
    );
    expect(h.latest).not.toBeNull();
  });

  it('refuses to answer for a point well outside Tamil Nadu', () => {
    // Delhi. Without the distance cut-off, some district is always nearest.
    expect(historyForPoint(28.6139, 77.209)).toBeNull();
  });

  it('counts deaths only across flood and cyclone events', () => {
    const h = historyForPoint(13.0418, 80.2341)!;
    const expected = h.floodEvents.reduce((s, e) => s + (e.deaths ?? 0), 0);
    expect(h.floodDeaths).toBe(expected);
  });

  it('reports exposure as a ratio no greater than one', () => {
    for (const [, [lat, lon]] of Object.entries(TN_DISTRICT_CENTROIDS)) {
      const h = historyForPoint(lat, lon);
      if (!h) continue;
      expect(h.exposureRatio).toBeGreaterThanOrEqual(0);
      expect(h.exposureRatio).toBeLessThanOrEqual(1);
    }
  });
});
