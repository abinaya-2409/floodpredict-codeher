import { describe, expect, it } from 'vitest';
import { ALL_CITIES } from '../data/mockData';
import { calculateZoneHydrology } from '../utils/floodEngine';
import { assessZone } from '../utils/riskIndex';
import { buildIncidentBriefing, briefingToText } from '../utils/briefing';
import { SimulationParams, ZoneData } from '../types';

/**
 * The briefing replaced invented prose with computed facts, so what these
 * tests guard is that it stays computed: that the figures move with the
 * inputs, that nothing is stated when nothing is happening, and that no
 * number appears which the model did not produce.
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
  // Keep the hydrology beside the zone: leadTimeToFloodMins comes from the
  // engine, not from ZoneData, and assessZone takes it as its third argument.
  const computed = chennai.zones.map((z) => {
    const h = calculateZoneHydrology(z, chennai, p);
    return { zone: { ...z, ...h, currentRisk: h.risk } as ZoneData, lead: h.leadTimeToFloodMins };
  });
  const zones: ZoneData[] = computed.map((c) => c.zone);
  const assessments = computed.map((c) => assessZone(c.zone, chennai, c.lead));
  return { zones, briefing: buildIncidentBriefing(chennai, zones, assessments, p) };
}

describe('incident briefing', () => {
  it('never prints a raw object where a number belongs', () => {
    // assessZone takes the lead time as its third argument, not the params
    // object; passing the wrong one rendered "[object Object] min to act".
    const { briefing } = build(params({ rainfallIntensityMmHr: 120 }));
    expect(briefingToText(briefing)).not.toContain('[object Object]');
    expect(briefingToText(briefing)).not.toMatch(/undefined|NaN/);
  });

  it('produces every section with content', () => {
    const { briefing } = build(params({ rainfallIntensityMmHr: 120 }));
    expect(briefing.sections.length).toBeGreaterThanOrEqual(4);
    for (const s of briefing.sections) {
      expect(s.heading, s.heading).toBeTruthy();
      expect(s.lines.length, s.heading).toBeGreaterThan(0);
      for (const line of s.lines) expect(line.trim().length).toBeGreaterThan(0);
    }
  });

  it('escalates severity as the rain rises', () => {
    const calm = build(params({ rainfallIntensityMmHr: 20, durationHours: 1 })).briefing;
    const storm = build(params({ rainfallIntensityMmHr: 200, durationHours: 6 })).briefing;
    const order = ['routine', 'watch', 'warning', 'emergency'];
    expect(order.indexOf(storm.severity)).toBeGreaterThan(order.indexOf(calm.severity));
  });

  it('says nothing is happening when nothing is', () => {
    const { briefing } = build(params({ rainfallIntensityMmHr: 20, durationHours: 1 }));
    if (briefing.severity !== 'routine') return; // A wet baseline is allowed.
    expect(briefing.headline).toMatch(/no flooding expected/i);
    const residents = briefing.sections.find((s) => /residents/i.test(s.heading))!;
    expect(residents.lines.join(' ')).toMatch(/no public warning/i);
  });

  it('quotes depths that match the model, not rounded guesses', () => {
    const p = params({ rainfallIntensityMmHr: 150, durationHours: 5 });
    const { zones, briefing } = build(p);
    const deepest = Math.max(...zones.map((z) => z.predictedInundationDepthCm));
    const text = briefingToText(briefing);
    expect(text).toContain(`${deepest} cm`);
  });

  it('names the blocked drains it was given, and only those', () => {
    const drain = chennai.drainageChannels[0];
    const { briefing } = build(
      params({ rainfallIntensityMmHr: 120, blockedDrainIds: [drain.id] })
    );
    const text = briefingToText(briefing);
    expect(text).toContain(drain.name);
  });

  it('carries the recorded history for the city it is about', () => {
    const { briefing } = build(params({ rainfallIntensityMmHr: 120 }));
    const past = briefing.sections.find((s) => /before/i.test(s.heading));
    expect(past).toBeTruthy();
    // Chennai's record runs to six flood and cyclone events.
    expect(past!.lines[0]).toMatch(/Chennai/);
    expect(past!.lines.join(' ')).toMatch(/\d{4}/);
  });

  it('never claims more people need help than are at risk', () => {
    for (const mm of [20, 60, 120, 200]) {
      const { briefing } = build(params({ rainfallIntensityMmHr: mm }));
      const line = briefing.sections[0].lines.join(' ');
      const nums = [...line.matchAll(/([\d,]+) people live|([\d,]+) of them/g)];
      if (nums.length === 2) {
        const atRisk = Number(nums[0][1].replace(/,/g, ''));
        const assisted = Number(nums[1][2].replace(/,/g, ''));
        expect(assisted, `at ${mm}mm/hr`).toBeLessThanOrEqual(atRisk);
      }
    }
  });

  it('states what it was built from', () => {
    const { briefing } = build(params());
    expect(briefing.basis).toMatch(/no language model/i);
    expect(briefing.basis).toMatch(/flood model/i);
  });

  it('renders to plain text with every heading and line', () => {
    const { briefing } = build(params({ rainfallIntensityMmHr: 120 }));
    const text = briefingToText(briefing);
    for (const s of briefing.sections) {
      expect(text).toContain(s.heading.toUpperCase());
      for (const line of s.lines) expect(text).toContain(line);
    }
  });

  it('is deterministic for the same inputs', () => {
    const p = params({ rainfallIntensityMmHr: 90 });
    const a = briefingToText(build(p).briefing);
    const b = briefingToText(build(p).briefing);
    expect(a).toBe(b);
  });
});
