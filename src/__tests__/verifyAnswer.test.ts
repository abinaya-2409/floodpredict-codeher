import { describe, expect, it } from 'vitest';
import { ALL_CITIES } from '../data/mockData';
import { calculateZoneHydrology } from '../utils/floodEngine';
import { assessZone } from '../utils/riskIndex';
import { buildChatContext, chatContextToText } from '../utils/chatContext';
import {
  SnapshotFacts,
  correctionPrompt,
  readSnapshot,
  verifyAnswer,
} from '../../api/_verifyAnswer';
import { SimulationParams, ZoneData } from '../types';

/**
 * The check that decides whether an answer is allowed on screen.
 *
 * Two failures matter here and they pull in opposite directions. Missing an
 * altered figure puts a wrong number in front of an officer. Flagging a
 * general remark about the monsoon makes the assistant refuse to hold a
 * conversation, which is most of why anyone opens it. So the false-positive
 * cases below are not padding - they are half the specification.
 */

const chennai = ALL_CITIES.find((c) => c.id === 'chennai')!;

const params: SimulationParams = {
  rainfallIntensityMmHr: 120,
  durationHours: 3,
  drainMaintenanceEfficiency: 65,
  soilSaturationInitial: 40,
  tideLevelM: 1.0,
  blockedDrainIds: [],
  activePumpingStations: [],
};

function snapshot() {
  const computed = chennai.zones.map((z) => {
    const h = calculateZoneHydrology(z, chennai, params);
    return { zone: { ...z, ...h, currentRisk: h.risk } as ZoneData, lead: h.leadTimeToFloodMins };
  });
  const zones: ZoneData[] = computed.map((c) => c.zone);
  const assessments = computed.map((c) => assessZone(c.zone, chennai, c.lead));
  const context = buildChatContext(chennai, zones, assessments, params);
  const text = chatContextToText(context);
  return { context, text, facts: readSnapshot(text) };
}

/** A value near `base` that is definitely not itself in the snapshot. */
function nearbyButAbsent(base: number, facts: SnapshotFacts): number {
  for (let d = 1; d < 200; d++) {
    if (!facts.numbers.has(String(base + d))) return base + d;
  }
  throw new Error('no absent neighbour found');
}

describe('reading the snapshot', () => {
  it('finds the ward names', () => {
    const { context, facts } = snapshot();
    for (const z of context.zones) {
      expect(facts.wardNames, z.name).toContain(z.name.toLowerCase());
    }
  });

  it('keeps the city and state out of the ward names', () => {
    // Otherwise every general remark that says "Tamil Nadu" is read as a
    // claim about the data, and the assistant stops being able to talk.
    const { facts } = snapshot();
    expect(facts.wardNames.has('chennai')).toBe(false);
    expect(facts.wardNames.has('nadu')).toBe(false);
    expect(facts.names.has('chennai')).toBe(true);
  });
});

describe('answers that are fine', () => {
  it('passes an answer that quotes the data exactly', () => {
    const { context, facts } = snapshot();
    const w = context.zones[0];
    const reply =
      `${w.name} is the ward to move on first. Its VRI is ${w.vri}, with ` +
      `${w.leadTimeMins} minutes of lead time.`;
    expect(verifyAnswer(reply, facts)).toEqual([]);
  });

  it('passes general talk carrying figures of its own', () => {
    // The whole point of the assistant. None of these numbers are in the
    // snapshot and none of them should be held against it.
    const { facts } = snapshot();
    const reply =
      'Tamil Nadu takes most of its rain from the north-east monsoon, roughly ' +
      '800 mm between October and December. A cloudburst is usually defined as ' +
      '100 mm in an hour. The 2015 Chennai floods followed about 1200 mm in a month.';
    expect(verifyAnswer(reply, facts)).toEqual([]);
  });

  it('does not flag small counts and ordinals', () => {
    const { context, facts } = snapshot();
    const reply = `The first three wards on the list, including ${context.zones[0].name}, share a drain.`;
    expect(verifyAnswer(reply, facts)).toEqual([]);
  });
});

describe('the three failures', () => {
  it('catches a figure that was rounded or drifted', () => {
    const { context, facts } = snapshot();
    const w = context.zones[0];
    const wrong = nearbyButAbsent(w.populationAtRisk, facts);
    const reply = `In ${w.name}, ${wrong} people are in the flooded footprint.`;

    const found = verifyAnswer(reply, facts);
    const altered = found.filter((f) => f.kind === 'altered');
    expect(altered.length).toBe(1);
    expect(altered[0].value).toBe(String(wrong));
    // The real figure has to come back with it, or the correction prompt has
    // nothing to offer and the model just guesses again.
    expect(altered[0].expected).toBe(String(w.populationAtRisk));
  });

  it('catches a figure that is nowhere in the data', () => {
    const { context, facts } = snapshot();
    const reply = `${context.zones[0].name} has 987654 residents in the flooded footprint.`;

    const found = verifyAnswer(reply, facts);
    expect(found.some((f) => f.kind === 'invented' && f.value === '987654')).toBe(true);
  });

  it('catches a ward that does not exist here', () => {
    const { facts } = snapshot();
    expect(facts.names.has('netherfield')).toBe(false);

    const reply = 'Send the boats to Netherfield ward first.';
    const found = verifyAnswer(reply, facts);
    expect(found.some((f) => f.kind === 'misnamed' && f.value.includes('Netherfield'))).toBe(true);
  });

  it('reports each problem once, however often it is repeated', () => {
    const { context, facts } = snapshot();
    const reply =
      `${context.zones[0].name} has 987654 residents. ` +
      `I will say it again: ${context.zones[0].name} has 987654 residents.`;
    expect(verifyAnswer(reply, facts).filter((f) => f.value === '987654').length).toBe(1);
  });
});

describe('the correction it sends back', () => {
  it('names the figure and the one that should have been used', () => {
    const { context, facts } = snapshot();
    const w = context.zones[0];
    const wrong = nearbyButAbsent(w.populationAtRisk, facts);
    const problems = verifyAnswer(`In ${w.name}, ${wrong} people are at risk.`, facts);

    const prompt = correctionPrompt(problems);
    expect(prompt).toContain(String(wrong));
    expect(prompt).toContain(String(w.populationAtRisk));
    // "You got something wrong" produces another guess; naming both produces
    // a correction.
    expect(prompt.toLowerCase()).toContain('snapshot');
  });

  it('tells the model to drop an invented figure rather than swap it', () => {
    const { context, facts } = snapshot();
    const problems = verifyAnswer(
      `${context.zones[0].name} has 987654 residents at risk.`,
      facts
    );
    expect(correctionPrompt(problems).toLowerCase()).toMatch(/remove it|not in the snapshot/);
  });
});
