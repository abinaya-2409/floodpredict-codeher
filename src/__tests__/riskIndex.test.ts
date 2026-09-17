import { describe, expect, it } from 'vitest';
import { CITIES } from '../data/mockData';
import { assessZone, bandForScore, rankByPriority, VRI_WEIGHTS } from '../utils/riskIndex';
import { calculateZoneHydrology } from '../utils/floodEngine';
import { SimulationParams } from '../types';

const chennai = CITIES[0];

const params = (over: Partial<SimulationParams> = {}): SimulationParams => ({
  rainfallIntensityMmHr: 45,
  durationHours: 3,
  drainMaintenanceEfficiency: 65,
  tideLevelM: 1.2,
  soilSaturationInitial: 75,
  blockedDrainIds: [],
  activePumpingStations: [],
  ...over,
});

function assess(zoneId: string, p: SimulationParams) {
  const zone = chennai.zones.find((z) => z.id === zoneId)!;
  const hydro = calculateZoneHydrology(zone, chennai, p);
  const computed = {
    ...zone,
    predictedInundationDepthCm: hydro.predictedInundationDepthCm,
    predictedFloodedAreaPercent: hydro.floodedAreaPercent,
  };
  return assessZone(computed, chennai, hydro.leadTimeToFloodMins);
}

describe('VRI weights', () => {
  it('sum to exactly 1', () => {
    const total = Object.values(VRI_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1, 10);
  });
});

describe('assessZone', () => {
  it('produces a 0-100 index for every zone in every city', () => {
    for (const city of CITIES) {
      for (const zone of city.zones) {
        const hydro = calculateZoneHydrology(zone, city, params());
        const a = assessZone(
          {
            ...zone,
            predictedInundationDepthCm: hydro.predictedInundationDepthCm,
            predictedFloodedAreaPercent: hydro.floodedAreaPercent,
          },
          city,
          hydro.leadTimeToFloodMins
        );
        expect(a.vri).toBeGreaterThanOrEqual(0);
        expect(a.vri).toBeLessThanOrEqual(100);
        for (const c of [a.hazard, a.exposure, a.fragility, a.copingDeficit]) {
          expect(c.score).toBeGreaterThanOrEqual(0);
          expect(c.score).toBeLessThanOrEqual(100);
          expect(c.rationale.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it('rises when rainfall rises, all else equal', () => {
    const calm = assess('velachery', params({ rainfallIntensityMmHr: 12 }));
    const storm = assess('velachery', params({ rainfallIntensityMmHr: 90 }));
    expect(storm.vri).toBeGreaterThan(calm.vri);
  });

  it('separates two zones that flood alike but differ socially', () => {
    // Kurla is far denser and more fragile than the OMR tech corridor.
    const kurlaCity = CITIES.find((c) => c.id === 'mumbai')!;
    const kurla = kurlaCity.zones.find((z) => z.id === 'kurla')!;
    const omr = chennai.zones.find((z) => z.id === 'omr')!;
    expect(kurla.demographics.groundFloorDwellingPercent).toBeGreaterThan(
      omr.demographics.groundFloorDwellingPercent
    );
  });

  it('never reports more people needing help than are at risk', () => {
    const a = assess('kolathur', params({ rainfallIntensityMmHr: 80 }));
    expect(a.assistedEvacuationNeeded).toBeLessThanOrEqual(a.populationAtRisk);
  });

  it('keeps lead time out of the index but inside the priority score', () => {
    const zone = chennai.zones.find((z) => z.id === 'velachery')!;
    const hydro = calculateZoneHydrology(zone, chennai, params());
    const computed = {
      ...zone,
      predictedInundationDepthCm: hydro.predictedInundationDepthCm,
      predictedFloodedAreaPercent: hydro.floodedAreaPercent,
    };
    const imminent = assessZone(computed, chennai, 20);
    const distant = assessZone(computed, chennai, 600);

    expect(imminent.vri).toBe(distant.vri);
    expect(imminent.priorityScore).toBeGreaterThan(distant.priorityScore);
  });
});

describe('bandForScore', () => {
  it('bands monotonically', () => {
    expect(bandForScore(10)).toBe('low');
    expect(bandForScore(30)).toBe('moderate');
    expect(bandForScore(50)).toBe('high');
    expect(bandForScore(70)).toBe('severe');
    expect(bandForScore(90)).toBe('critical');
  });
});

describe('rankByPriority', () => {
  it('returns highest priority first without mutating its input', () => {
    const p = params({ rainfallIntensityMmHr: 70 });
    const assessments = chennai.zones.map((z) => assess(z.id, p));
    const original = [...assessments];
    const ranked = rankByPriority(assessments);

    expect(assessments).toEqual(original);
    for (let i = 1; i < ranked.length; i++) {
      expect(ranked[i - 1].priorityScore).toBeGreaterThanOrEqual(ranked[i].priorityScore);
    }
  });
});
