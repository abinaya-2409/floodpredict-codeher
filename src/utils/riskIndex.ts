import {
  CityData,
  RiskComponent,
  RiskLevel,
  ZoneData,
  ZoneRiskAssessment,
} from '../types';

/**
 * Composite Vulnerability Risk Index (VRI).
 *
 * Hydrology tells us where the water goes. This tells us where it hurts most.
 * Two wards can flood to the same depth and still deserve very different
 * responses - that difference is what this file computes.
 *
 * The index is deliberately a weighted sum of four readable sub-scores rather
 * than a tuned black box. Every number surfaced in the UI traces back to an
 * input a municipal engineer can argue with.
 */

/** Weights sum to 1. Exported so the UI can state them openly. */
export const VRI_WEIGHTS = {
  hazard: 0.35,
  exposure: 0.2,
  fragility: 0.25,
  copingDeficit: 0.2,
} as const;

const clamp = (v: number, min = 0, max = 100) => Math.max(min, Math.min(max, v));

/** Linear normalisation onto 0-100, clamped at both ends. */
const normalise = (value: number, floor: number, ceiling: number) =>
  clamp(((value - floor) / (ceiling - floor)) * 100);

const inr = (n: number) => Math.round(n).toLocaleString('en-IN');

/**
 * Hazard - how severe the physical flooding is.
 * Depth dominates; areal extent modulates it.
 */
function scoreHazard(zone: ZoneData): RiskComponent {
  // 100cm of standing water is the practical ceiling for an urban residential
  // street: past that, everything downstream of this score is already critical.
  const depthScore = normalise(zone.predictedInundationDepthCm, 0, 100);
  const extentScore = clamp(zone.predictedFloodedAreaPercent);
  const score = Math.round(depthScore * 0.7 + extentScore * 0.3);

  return {
    score,
    weight: VRI_WEIGHTS.hazard,
    rationale:
      zone.predictedInundationDepthCm +
      'cm predicted depth across ' +
      zone.predictedFloodedAreaPercent +
      '% of the catchment',
  };
}

/**
 * Exposure - how many people the water actually reaches.
 * Density matters more than headcount: 240k spread over 22 sq km is a
 * different problem from 190k packed into 9 sq km.
 */
function scoreExposure(zone: ZoneData): RiskComponent {
  const density = zone.demographics.populationDensityPerSqKm;
  // 5k/sq km is suburban; 40k/sq km is about as dense as urban India gets.
  const densityScore = normalise(density, 5000, 40000);
  const reachScore = clamp(zone.predictedFloodedAreaPercent);
  const score = Math.round(densityScore * 0.55 + reachScore * 0.45);

  return {
    score,
    weight: VRI_WEIGHTS.exposure,
    rationale:
      inr(density) +
      ' residents/sq km, ' +
      zone.predictedFloodedAreaPercent +
      '% of the zone inundated',
  };
}

/**
 * Fragility - who is exposed, not just how many.
 *
 * Ground-floor-only dwellings carry the heaviest weight: vertical evacuation
 * is the single most effective survival action in an urban flood, and it is
 * exactly what these households cannot perform.
 */
function scoreFragility(zone: ZoneData): RiskComponent {
  const d = zone.demographics;
  const raw =
    normalise(d.groundFloorDwellingPercent, 10, 90) * 0.3 +
    normalise(d.elderly60PlusPercent, 4, 22) * 0.22 +
    normalise(d.disabledPersonsPercent, 1, 8) * 0.18 +
    normalise(d.lowIncomeHouseholdPercent, 5, 65) * 0.18 +
    normalise(d.noPrivateVehiclePercent, 20, 85) * 0.12;

  const drivers: string[] = [];
  if (d.groundFloorDwellingPercent >= 55)
    drivers.push(d.groundFloorDwellingPercent + '% ground-floor-only homes');
  if (d.elderly60PlusPercent >= 12) drivers.push(d.elderly60PlusPercent + '% aged 60+');
  if (d.lowIncomeHouseholdPercent >= 35)
    drivers.push(d.lowIncomeHouseholdPercent + '% low-income households');
  if (d.noPrivateVehiclePercent >= 60)
    drivers.push(d.noPrivateVehiclePercent + '% without a vehicle');

  return {
    score: Math.round(clamp(raw)),
    weight: VRI_WEIGHTS.fragility,
    rationale: drivers.length
      ? drivers.join(', ')
      : 'No dominant social vulnerability driver in this ward',
  };
}

/**
 * Coping deficit - the gap between need and local capacity.
 * Scored as a deficit (higher = worse) so it adds like the other components.
 */
function scoreCopingDeficit(zone: ZoneData, city: CityData): RiskComponent {
  const shelters = city.reliefShelters.filter((s) => s.zoneId === zone.id);
  const headroom = shelters.reduce(
    (sum, s) => sum + Math.max(0, s.capacityPersons - s.currentOccupancyPersons),
    0
  );

  // How much of the at-risk population could actually be housed locally?
  const atRisk = Math.round(zone.population * (zone.predictedFloodedAreaPercent / 100));
  const coverage = atRisk > 0 ? clamp((headroom / atRisk) * 100) : 100;
  const shelterDeficit = 100 - coverage;

  // A choked network cannot clear water once it arrives.
  const drains = city.drainageChannels.filter((d) => zone.drainIds.includes(d.id));
  const avgChoke = drains.length
    ? drains.reduce((sum, d) => sum + d.chokePercentage, 0) / drains.length
    : 50;

  const medicalDistance = normalise(
    zone.demographics.criticalFacilities.nearestHospitalKm,
    0.5,
    8
  );

  return {
    score: Math.round(clamp(shelterDeficit * 0.5 + avgChoke * 0.32 + medicalDistance * 0.18)),
    weight: VRI_WEIGHTS.copingDeficit,
    rationale:
      inr(headroom) +
      ' shelter spaces for ~' +
      inr(atRisk) +
      ' at risk, drains ' +
      Math.round(avgChoke) +
      '% choked',
  };
}

/** Band the composite for colour-coding, sharing hydrology's vocabulary. */
export function bandForScore(vri: number): RiskLevel {
  if (vri >= 80) return 'critical';
  if (vri >= 65) return 'severe';
  if (vri >= 45) return 'high';
  if (vri >= 25) return 'moderate';
  return 'low';
}

/**
 * Urgency multiplier for dispatch ordering.
 *
 * Deliberately outside the VRI: mixing "how bad" with "how soon" into one
 * number makes both unreadable. A zone 30 minutes from critical outranks an
 * equally severe zone six hours out - but its severity does not change.
 */
function urgencyMultiplier(leadTimeMins: number): number {
  if (leadTimeMins <= 30) return 1.5;
  if (leadTimeMins <= 60) return 1.3;
  if (leadTimeMins <= 120) return 1.15;
  if (leadTimeMins <= 240) return 1.0;
  return 0.85;
}

export function assessZone(
  zone: ZoneData,
  city: CityData,
  leadTimeToFloodMins: number
): ZoneRiskAssessment {
  const hazard = scoreHazard(zone);
  const exposure = scoreExposure(zone);
  const fragility = scoreFragility(zone);
  const copingDeficit = scoreCopingDeficit(zone, city);

  const vri = Math.round(
    hazard.score * hazard.weight +
      exposure.score * exposure.weight +
      fragility.score * fragility.weight +
      copingDeficit.score * copingDeficit.weight
  );

  const populationAtRisk = Math.round(
    zone.population * (zone.predictedFloodedAreaPercent / 100)
  );

  // Residents who cannot self-evacuate: elderly, disabled, or without transport.
  // These groups overlap, so the union is estimated rather than summed.
  const d = zone.demographics;
  const assistedShare = Math.min(
    0.9,
    (d.elderly60PlusPercent + d.disabledPersonsPercent) / 100 +
      (d.noPrivateVehiclePercent / 100) * 0.35
  );

  return {
    zoneId: zone.id,
    zoneName: zone.name,
    vri,
    band: bandForScore(vri),
    hazard,
    exposure,
    fragility,
    copingDeficit,
    leadTimeToFloodMins,
    priorityScore: Math.round(vri * urgencyMultiplier(leadTimeToFloodMins)),
    populationAtRisk,
    assistedEvacuationNeeded: Math.round(populationAtRisk * assistedShare),
  };
}

/** Auto-ranked evacuation / dispatch queue. Highest priority first. */
export function rankByPriority(assessments: ZoneRiskAssessment[]): ZoneRiskAssessment[] {
  return [...assessments].sort((a, b) => {
    if (b.priorityScore !== a.priorityScore) return b.priorityScore - a.priorityScore;
    // Tie-break on who needs carrying out, not on who is merely wetter.
    return b.assistedEvacuationNeeded - a.assistedEvacuationNeeded;
  });
}
