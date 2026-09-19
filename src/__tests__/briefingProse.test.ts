import { describe, it, expect } from 'vitest';
import { briefingToProse, briefingToText, buildIncidentBriefing } from '../utils/briefing';
import { CITIES } from '../data/mockData';
import { calculateZoneHydrology } from '../utils/floodEngine';
import { assessZone } from '../utils/riskIndex';
import type { SimulationParams } from '../types';

/**
 * The prose composer exists so the briefing panel works with no API key and
 * no network, which is the state this application is built for.
 *
 * Its one safety property is that it cannot invent. It only joins strings
 * that `buildIncidentBriefing` computed, so every figure in the prose must
 * already appear in the briefing it came from. That is exactly what the
 * language model prompt spends a paragraph asking a model not to do, and
 * what a model can still get wrong - so here it is a test rather than a
 * request.
 */

function briefingFor(cityIndex = 0, rainfall = 38) {
  const city = CITIES[cityIndex];
  const params: SimulationParams = {
    rainfallIntensityMmHr: rainfall,
    durationHours: 3.5,
    drainMaintenanceEfficiency: 65,
    tideLevelM: city.weather.stormSurgeTideM,
    soilSaturationInitial: 80,
    blockedDrainIds: city.drainageChannels.filter((d) => d.isBlocked).map((d) => d.id),
    activePumpingStations: city.drainageChannels
      .filter((d) => d.pumpingStationActive)
      .map((d) => d.id),
  };

  const zones = city.zones.map((zone) => {
    const hydro = calculateZoneHydrology(zone, city, params);
    return {
      ...zone,
      predictedInundationDepthCm: hydro.predictedInundationDepthCm,
      predictedFloodedAreaPercent: hydro.floodedAreaPercent,
      currentRisk: hydro.risk,
      alertTier: hydro.alertTier,
      leadTimeToFloodMins: hydro.leadTimeToFloodMins,
      drainageDeficitCusecs: hydro.drainageDeficitCusecs,
    };
  });

  const assessments = zones.map((z) => assessZone(z, city, z.leadTimeToFloodMins));
  return buildIncidentBriefing(city, zones, assessments, params);
}

/** Every distinct number in a string, digits and separators kept together. */
function numbersIn(text: string): string[] {
  return (text.match(/\d[\d,.]*/g) ?? []).map((n) => n.replace(/[.,]$/, ''));
}

describe('prose is composed, never invented', () => {
  it('introduces no number that the briefing did not already state', () => {
    for (let cityIndex = 0; cityIndex < CITIES.length; cityIndex++) {
      for (const rainfall of [0, 8, 38, 95, 160]) {
        const briefing = briefingFor(cityIndex, rainfall);
        const source = briefingToText(briefing);
        const prose = briefingToProse(briefing);

        const sourceNumbers = new Set(numbersIn(source));
        const invented = numbersIn(prose).filter((n) => !sourceNumbers.has(n));

        expect(
          invented,
          `city ${cityIndex} at ${rainfall}mm/hr invented ${invented.join(', ')}`
        ).toEqual([]);
      }
    }
  });

  it('carries every bullet of the briefing into the prose', () => {
    const briefing = briefingFor();
    const prose = briefingToProse(briefing);
    for (const section of briefing.sections) {
      for (const line of section.lines) {
        // The composer strips a trailing stop and may lowercase a lead-in,
        // so compare on the distinctive middle of the line.
        const core = line.replace(/[.\s]+$/, '').slice(1, 40);
        expect(prose, `dropped: ${line.slice(0, 60)}`).toContain(core);
      }
    }
  });

  it('opens with the headline', () => {
    const briefing = briefingFor();
    expect(briefingToProse(briefing).startsWith(briefing.headline.replace(/[.\s]+$/, ''))).toBe(true);
  });

  it('writes paragraphs, not bullets', () => {
    const prose = briefingToProse(briefingFor());
    expect(prose).not.toMatch(/^\s*[-*•]/m);
    expect(prose).toContain('\n\n');
    // Headings belong to the structured view, not to prose.
    expect(prose).not.toMatch(/^WHAT IS HAPPENING$/m);
  });

  it('stays readable when a section is empty', () => {
    const bare = {
      ...briefingFor(),
      sections: [{ heading: 'What is happening', lines: ['Rain modelled at 8 mm/hr.'] }],
    };
    const prose = briefingToProse(bare);
    expect(prose).toContain('8 mm/hr');
    expect(prose).not.toContain('undefined');
    expect(prose.trim().endsWith('.')).toBe(true);
  });
});
