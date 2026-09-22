import {
  CityData,
  ReliefShelter,
  SimulationParams,
  ZoneData,
  ZoneRiskAssessment,
} from '../types';

/**
 * The facts the assistant is allowed to state.
 *
 * The assistant can hold an ordinary conversation about weather, rivers and
 * disasters - that is most of why anyone opens a chat box. What it must never
 * do is answer "how deep is Velachery" from whatever it remembers about
 * Chennai, because the app has already computed that number and the model's
 * guess would sit on screen looking exactly as authoritative.
 *
 * So the split is by subject, not by mode: anything about *this* scenario is
 * quoted from the snapshot below, and anything general is the model's own.
 * The snapshot is built here, from the same inputs the dashboard renders, so
 * the two can never disagree.
 */

export interface ChatZoneFact {
  name: string;
  vri: number;
  band: string;
  depthCm: number;
  floodedAreaPercent: number;
  populationAtRisk: number;
  assistedEvacuationNeeded: number;
  leadTimeMins: number;
  alertTier: string;
  /** Which weighted component is doing the most work in this ward's VRI. */
  driver: string;
}

export interface ChatShelterFact {
  name: string;
  zoneName: string;
  capacity: number;
  occupied: number;
  headroom: number;
  accessible: boolean;
  medicalPost: boolean;
}

export interface ChatContext {
  city: string;
  state: string;
  generatedAt: string;
  scenario: {
    rainfallMmHr: number;
    durationHours: number;
    drainEfficiencyPercent: number;
    tideM: number;
    soilSaturationPercent: number;
    blockedDrains: number;
    totalDrains: number;
  };
  weather: {
    currentMmHr: number;
    accumulated24hMm: number;
    forecast24hMm: number;
    intensity: string;
    trend: string;
    cycloneKm: number | null;
  };
  zones: ChatZoneFact[];
  shelters: ChatShelterFact[];
  totals: {
    populationAtRisk: number;
    assistedEvacuationNeeded: number;
    shelterHeadroom: number;
    wardsFlooding: number;
    deepestCm: number;
  };
}

const BANDS: Record<string, string> = {
  low: 'low',
  moderate: 'moderate',
  high: 'high',
  severe: 'severe',
  critical: 'critical',
};

/**
 * The component contributing most to a ward's composite score.
 *
 * Weighted, not raw: a fragility score of 80 at weight 0.25 matters less than
 * a hazard score of 70 at weight 0.35, and an officer asking "why is this
 * ward top" wants the one that actually moved the number.
 */
function dominantDriver(a: ZoneRiskAssessment): string {
  const parts: [string, number][] = [
    ['hazard', a.hazard.score * a.hazard.weight],
    ['exposure', a.exposure.score * a.exposure.weight],
    ['fragility', a.fragility.score * a.fragility.weight],
    ['coping deficit', a.copingDeficit.score * a.copingDeficit.weight],
  ];
  parts.sort((x, y) => y[1] - x[1]);
  return parts[0][0];
}

export function buildChatContext(
  city: CityData,
  zones: ZoneData[],
  assessments: ZoneRiskAssessment[],
  params: SimulationParams
): ChatContext {
  const zoneById = new Map(zones.map((z) => [z.id, z]));
  const ranked = [...assessments].sort((a, b) => b.priorityScore - a.priorityScore);

  const zoneFacts: ChatZoneFact[] = ranked.map((a) => {
    const z = zoneById.get(a.zoneId);
    return {
      name: a.zoneName,
      vri: Math.round(a.vri),
      band: BANDS[a.band] ?? a.band,
      depthCm: Math.round(z?.predictedInundationDepthCm ?? 0),
      floodedAreaPercent: Math.round(z?.predictedFloodedAreaPercent ?? 0),
      populationAtRisk: a.populationAtRisk,
      assistedEvacuationNeeded: a.assistedEvacuationNeeded,
      leadTimeMins: Math.round(a.leadTimeToFloodMins),
      alertTier: z?.alertTier ?? 'advisory',
      driver: dominantDriver(a),
    };
  });

  const shelterFacts: ChatShelterFact[] = city.reliefShelters.map((s: ReliefShelter) => ({
    name: s.name,
    zoneName: zoneById.get(s.zoneId)?.name ?? s.zoneId,
    capacity: s.capacityPersons,
    occupied: s.currentOccupancyPersons,
    headroom: Math.max(0, s.capacityPersons - s.currentOccupancyPersons),
    accessible: s.isAccessible,
    medicalPost: s.hasMedicalPost,
  }));

  return {
    city: city.name,
    state: city.state,
    generatedAt: new Date().toISOString(),
    scenario: {
      rainfallMmHr: params.rainfallIntensityMmHr,
      durationHours: params.durationHours,
      drainEfficiencyPercent: params.drainMaintenanceEfficiency,
      tideM: params.tideLevelM,
      soilSaturationPercent: params.soilSaturationInitial,
      blockedDrains: params.blockedDrainIds.length,
      totalDrains: city.drainageChannels.length,
    },
    weather: {
      currentMmHr: city.weather.currentRainfallMmHr,
      accumulated24hMm: city.weather.totalAccumulated24hMm,
      forecast24hMm: city.weather.forecast24hMm,
      intensity: city.weather.intensityCategory,
      trend: city.weather.dopplerRadarTrend,
      cycloneKm: city.weather.cycloneProximityKm,
    },
    zones: zoneFacts,
    shelters: shelterFacts,
    totals: {
      populationAtRisk: assessments.reduce((s, a) => s + a.populationAtRisk, 0),
      assistedEvacuationNeeded: assessments.reduce((s, a) => s + a.assistedEvacuationNeeded, 0),
      shelterHeadroom: shelterFacts.reduce((s, f) => s + f.headroom, 0),
      wardsFlooding: zones.filter((z) => z.predictedInundationDepthCm >= 15).length,
      deepestCm: Math.round(zones.reduce((m, z) => Math.max(m, z.predictedInundationDepthCm), 0)),
    },
  };
}

const n = (v: number) => v.toLocaleString('en-IN');

/**
 * The snapshot as text for the model.
 *
 * Deliberately terse and uniform. Prose here would invite the model to
 * paraphrase it back with the numbers "tidied", and a rounded evacuation
 * figure is a wrong evacuation figure.
 */
export function chatContextToText(c: ChatContext): string {
  const lines: string[] = [];

  lines.push(`CITY: ${c.city}, ${c.state}`);
  lines.push(
    `SCENARIO: ${c.scenario.rainfallMmHr} mm/hr for ${c.scenario.durationHours} h; ` +
      `drains ${c.scenario.drainEfficiencyPercent}% efficient, ` +
      `${c.scenario.blockedDrains} of ${c.scenario.totalDrains} blocked; ` +
      `tide ${c.scenario.tideM} m; soil ${c.scenario.soilSaturationPercent}% saturated`
  );
  lines.push(
    `WEATHER: now ${c.weather.currentMmHr} mm/hr (${c.weather.intensity}, ${c.weather.trend}); ` +
      `${c.weather.accumulated24hMm} mm fell in 24 h; ${c.weather.forecast24hMm} mm forecast next 24 h` +
      (c.weather.cycloneKm === null ? '' : `; cyclone ${c.weather.cycloneKm} km away`)
  );
  lines.push(
    `TOTALS: ${n(c.totals.populationAtRisk)} people at risk, ` +
      `${n(c.totals.assistedEvacuationNeeded)} need assisted evacuation, ` +
      `${c.totals.wardsFlooding} wards flooding, deepest ${c.totals.deepestCm} cm, ` +
      `${n(c.totals.shelterHeadroom)} shelter places free`
  );

  lines.push('', 'WARDS (worst first):');
  for (const z of c.zones) {
    lines.push(
      `- ${z.name}: VRI ${z.vri} (${z.band}), driven by ${z.driver}; ` +
        `${z.depthCm} cm over ${z.floodedAreaPercent}% of the ward; ` +
        `${n(z.populationAtRisk)} at risk, ${n(z.assistedEvacuationNeeded)} need help to leave; ` +
        `${z.leadTimeMins} min lead time; alert tier ${z.alertTier}`
    );
  }

  if (c.shelters.length) {
    lines.push('', 'SHELTERS:');
    for (const s of c.shelters) {
      const tags = [s.accessible ? 'step-free' : null, s.medicalPost ? 'medical post' : null]
        .filter(Boolean)
        .join(', ');
      lines.push(
        `- ${s.name} (${s.zoneName}): ${n(s.headroom)} of ${n(s.capacity)} places free` +
          (tags ? ` - ${tags}` : '')
      );
    }
  }

  return lines.join('\n');
}

/**
 * The report, written without a model.
 *
 * This is what the Report button returns when no key is configured, offline,
 * or when every model in the chain is rate-limited - which on a free tier is
 * a normal Tuesday, not an outage. It is the same content the model would be
 * asked to rephrase, so the failure mode is plainer wording, never a missing
 * answer.
 */
export function localReport(c: ChatContext): string {
  const worst = c.zones[0];
  const out: string[] = [];

  out.push(
    `${c.city} is modelled at ${c.scenario.rainfallMmHr} mm/hr over ` +
      `${c.scenario.durationHours} hours, with drains running at ` +
      `${c.scenario.drainEfficiencyPercent}% and ${c.scenario.blockedDrains} of ` +
      `${c.scenario.totalDrains} blocked.`
  );

  if (worst) {
    out.push(
      `${worst.name} is the ward to move on first: VRI ${worst.vri} (${worst.band}), ` +
        `driven by ${worst.driver}, ${worst.depthCm} cm of water across ` +
        `${worst.floodedAreaPercent}% of it, and ${worst.leadTimeMins} minutes of lead time. ` +
        `${n(worst.populationAtRisk)} people are in the flooded footprint and ` +
        `${n(worst.assistedEvacuationNeeded)} of them cannot leave unaided.`
    );
  }

  out.push(
    `Across the city ${n(c.totals.populationAtRisk)} people are at risk and ` +
      `${n(c.totals.assistedEvacuationNeeded)} need assisted evacuation, against ` +
      `${n(c.totals.shelterHeadroom)} free shelter places. ` +
      (c.totals.shelterHeadroom < c.totals.assistedEvacuationNeeded
        ? 'That is a shortfall - shelter capacity is the binding constraint.'
        : 'Shelter capacity covers the assisted caseload.')
  );

  return out.join('\n\n');
}

/**
 * The one-paragraph version, also without a model.
 */
export function localSummary(c: ChatContext): string {
  const worst = c.zones[0];
  const critical = c.zones.filter((z) => z.band === 'critical' || z.band === 'severe').length;

  return (
    `${c.totals.wardsFlooding} of ${c.zones.length} wards are flooding in ${c.city}, ` +
    `deepest ${c.totals.deepestCm} cm` +
    (critical ? `, ${critical} in the severe or critical band` : '') +
    `. ${n(c.totals.populationAtRisk)} people are at risk` +
    (worst ? `, worst in ${worst.name} at VRI ${worst.vri} with ${worst.leadTimeMins} minutes' notice` : '') +
    `. ${n(c.totals.shelterHeadroom)} shelter places remain free.`
  );
}
