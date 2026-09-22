import { describe, expect, it } from 'vitest';
import { ALL_CITIES } from '../data/mockData';
import { calculateZoneHydrology } from '../utils/floodEngine';
import { assessZone } from '../utils/riskIndex';
import {
  buildChatContext,
  chatContextToText,
  localReport,
  localSummary,
} from '../utils/chatContext';
import { SimulationParams, ZoneData } from '../types';

/**
 * The assistant is allowed to talk about monsoons from memory. It is not
 * allowed to talk about Velachery from memory, and the only thing standing
 * between those two is this snapshot. So what these tests guard is that the
 * snapshot carries every figure the model would otherwise be tempted to
 * invent, that the figures track the inputs, and that the two answers the app
 * writes for itself never come out empty.
 */

const chennai = ALL_CITIES.find((c) => c.id === 'chennai')!;

const params = (over: Partial<SimulationParams> = {}): SimulationParams => ({
  rainfallIntensityMmHr: 45,
  durationHours: 3,
  drainMaintenanceEfficiency: 65,
  soilSaturationInitial: 40,
  tideLevelM: 1.0,
  blockedDrainIds: [],
  activePumpingStations: [],
  ...over,
});

function build(p: SimulationParams) {
  const computed = chennai.zones.map((z) => {
    const h = calculateZoneHydrology(z, chennai, p);
    return { zone: { ...z, ...h, currentRisk: h.risk } as ZoneData, lead: h.leadTimeToFloodMins };
  });
  const zones: ZoneData[] = computed.map((c) => c.zone);
  const assessments = computed.map((c) => assessZone(c.zone, chennai, c.lead));
  return { zones, assessments, context: buildChatContext(chennai, zones, assessments, p) };
}

describe('chat context', () => {
  it('carries every ward, worst first', () => {
    const { zones, context } = build(params({ rainfallIntensityMmHr: 120 }));
    expect(context.zones.length).toBe(zones.length);

    // Dispatch order is the whole point of the index, so a snapshot that
    // listed wards in data order would quietly invite the wrong answer to
    // "which one first".
    const vris = context.zones.map((z) => z.vri);
    expect([...vris]).toEqual([...vris].sort((a, b) => b - a));
  });

  it('names a driver for every ward', () => {
    const { context } = build(params({ rainfallIntensityMmHr: 120 }));
    const allowed = ['hazard', 'exposure', 'fragility', 'coping deficit'];
    for (const z of context.zones) {
      expect(allowed, z.name).toContain(z.driver);
    }
  });

  it('moves with the rainfall', () => {
    const light = build(params({ rainfallIntensityMmHr: 20 })).context;
    const heavy = build(params({ rainfallIntensityMmHr: 200 })).context;
    expect(heavy.totals.deepestCm).toBeGreaterThan(light.totals.deepestCm);
    expect(heavy.totals.populationAtRisk).toBeGreaterThanOrEqual(light.totals.populationAtRisk);
  });

  it('renders no placeholder where a number belongs', () => {
    // The failure that shipped once before: an object stringified into prose
    // and sat there looking like a reading.
    const text = chatContextToText(build(params({ rainfallIntensityMmHr: 120 })).context);
    expect(text).not.toContain('[object Object]');
    expect(text).not.toMatch(/undefined|NaN/);
  });

  it('states the scenario, not just the outcome', () => {
    // Without the inputs on screen the model will describe a simulation as
    // though it were a gauge reading.
    const text = chatContextToText(build(params({ rainfallIntensityMmHr: 120 })).context);
    expect(text).toContain('SCENARIO:');
    expect(text).toContain('120 mm/hr');
    expect(text).toContain('WARDS');
  });

  it('keeps every ward figure quotable from the text', () => {
    const { context } = build(params({ rainfallIntensityMmHr: 120 }));
    const text = chatContextToText(context);
    for (const z of context.zones) {
      expect(text, z.name).toContain(z.name);
      expect(text, z.name).toContain(`VRI ${z.vri}`);
    }
  });
});

describe('answers written without a model', () => {
  it('reports something for any scenario', () => {
    for (const mm of [20, 80, 200]) {
      const { context } = build(params({ rainfallIntensityMmHr: mm }));
      const report = localReport(context);
      expect(report.length, `${mm} mm/hr`).toBeGreaterThan(120);
      expect(report, `${mm} mm/hr`).not.toMatch(/undefined|NaN|\[object/);
    }
  });

  it('summarises in one paragraph', () => {
    const { context } = build(params({ rainfallIntensityMmHr: 120 }));
    const summary = localSummary(context);
    expect(summary).not.toMatch(/undefined|NaN|\[object/);
    expect(summary.split('\n\n').length).toBe(1);
    expect(summary).toContain(chennai.name);
  });

  it('calls out a shelter shortfall rather than burying it', () => {
    // The one conclusion in the report that is a judgement and not a figure,
    // and the one an officer most needs stated plainly.
    const { context } = build(params({ rainfallIntensityMmHr: 200 }));
    const report = localReport(context);
    const short = context.totals.shelterHeadroom < context.totals.assistedEvacuationNeeded;
    expect(report.includes('shortfall')).toBe(short);
  });
});
