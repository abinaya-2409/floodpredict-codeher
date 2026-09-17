import { CityData, ResourcePrepositioning, ZoneData, ZoneRiskAssessment } from '../types';

/**
 * Derives what to send where, from the risk index.
 *
 * This replaces a hand-authored array of five entries that covered only
 * Chennai wards - one of which referenced a zone that no longer existed - so
 * the dispatch board was empty in every other city and its "CRITICAL"
 * priorities were typed in by a person rather than computed.
 *
 * Each rule below answers a different question:
 *   pumps      - can the drains clear what is arriving?
 *   boats      - is the water deep enough that vehicles cannot pass?
 *   rescue     - how many people cannot evacuate themselves?
 *   generators - how many will be in shelters without mains power?
 *   rations    - how many will still be there tomorrow?
 */

const priorityFor = (a: ZoneRiskAssessment): ResourcePrepositioning['priority'] =>
  a.band === 'critical' || a.band === 'severe'
    ? 'CRITICAL'
    : a.band === 'high'
      ? 'HIGH'
      : 'MEDIUM';

function busiestStreet(zone: ZoneData): string {
  if (!zone.keyStreets.length) return zone.name;
  return [...zone.keyStreets].sort(
    (a, b) => b.predictedInundationDepthCm - a.predictedInundationDepthCm
  )[0].name;
}

export function recommendResources(
  assessments: ZoneRiskAssessment[],
  zones: ZoneData[],
  city: CityData
): ResourcePrepositioning[] {
  const byId = new Map(zones.map((z) => [z.id, z]));
  const out: ResourcePrepositioning[] = [];

  for (const a of assessments) {
    const zone = byId.get(a.zoneId);
    if (!zone) continue;

    // Nothing below the watch band needs pre-positioning.
    if (a.vri < 25) continue;

    const coords = zone.geoCenter ?? [city.lat, city.lng];
    const priority = priorityFor(a);
    const street = busiestStreet(zone);
    const push = (
      n: number,
      type: ResourcePrepositioning['type'],
      name: string,
      units: number,
      reason: string
    ) => {
      if (units < 1) return;
      out.push({
        id: `${a.zoneId}-${type}-${n}`,
        type,
        name,
        zoneId: a.zoneId,
        targetStreet: street,
        recommendedUnits: units,
        priority,
        status: 'recommended',
        coordinates: coords as [number, number],
        reason,
      });
    };

    // Pumps scale with how far drainage falls short of the inflow.
    const drains = city.drainageChannels.filter((d) => zone.drainIds.includes(d.id));
    const avgChoke = drains.length
      ? drains.reduce((s, d) => s + d.chokePercentage, 0) / drains.length
      : 0;
    push(
      1,
      'dewatering_pump',
      '100 HP high-discharge submersible pump set',
      Math.round((avgChoke / 100) * (zone.catchmentAreaSqKm / 4)) + (a.vri >= 65 ? 2 : 1),
      `Drains ${Math.round(avgChoke)}% choked against ${zone.predictedInundationDepthCm}cm standing water`
    );

    // Boats become relevant once roads stop carrying vehicles.
    if (zone.predictedInundationDepthCm >= 45) {
      push(
        2,
        'ndrf_boat_unit',
        'NDRF inflatable rescue dinghy squad',
        Math.ceil(a.assistedEvacuationNeeded / 900),
        `${zone.predictedInundationDepthCm}cm depth makes ${street} impassable to vehicles`
      );
    }

    // Rescue teams scale with the people who cannot move themselves.
    if (a.assistedEvacuationNeeded >= 800) {
      push(
        3,
        'sdrf_rescue_team',
        'SDRF quick reaction squad',
        Math.ceil(a.assistedEvacuationNeeded / 1600),
        `${a.assistedEvacuationNeeded.toLocaleString('en-IN')} residents need assisted evacuation`
      );
    }

    // Shelters without mains power need generators.
    const shelters = city.reliefShelters.filter((s) => s.zoneId === a.zoneId);
    const unpowered = shelters.filter((s) => !s.hasPowerBackup).length;
    if (unpowered > 0 && a.vri >= 45) {
      push(4, 'mobile_power_generator', '125 kVA mobile generator truck', unpowered,
        `${unpowered} shelter(s) in this ward have no power backup`);
    }

    // Relief supply follows anyone still displaced after the first night.
    if (a.vri >= 55) {
      push(
        5,
        'food_relief_truck',
        'Emergency dry ration and water depot',
        Math.ceil(a.populationAtRisk / 12000),
        `${a.populationAtRisk.toLocaleString('en-IN')} residents inside the flooded footprint`
      );
    }
  }

  // Most urgent ward first, then the heaviest ask within it.
  const rank = { CRITICAL: 0, HIGH: 1, MEDIUM: 2 } as const;
  return out.sort(
    (x, y) => rank[x.priority] - rank[y.priority] || y.recommendedUnits - x.recommendedUnits
  );
}
