import { CityData, ZoneData, StreetVulnerability, SimulationParams, RiskLevel, AlertTier, HistoricalFloodComparison } from '../types';

export function calculateZoneHydrology(
  zone: ZoneData,
  city: CityData,
  params: SimulationParams
): {
  predictedInundationDepthCm: number;
  floodedAreaPercent: number;
  risk: RiskLevel;
  alertTier: AlertTier;
  drainageDeficitCusecs: number;
  leadTimeToFloodMins: number;
} {
  const intensity = params.rainfallIntensityMmHr;
  const duration = params.durationHours;
  const tideImpact = city.coastalCity ? Math.max(0, (params.tideLevelM - 1.0) * 15) : 0;
  
  // Calculate average drain blockage factor for drains servicing this zone
  const zoneDrains = city.drainageChannels.filter(d => zone.drainIds.includes(d.id));
  let totalChoke = 0;
  let totalCap = 0;
  let activePumps = 0;

  zoneDrains.forEach(d => {
    const isManuallyBlocked = params.blockedDrainIds.includes(d.id);
    const choke = isManuallyBlocked ? 90 : d.chokePercentage;
    totalChoke += choke;
    totalCap += d.maxCapacityCusecs;
    if (params.activePumpingStations.includes(d.id) || d.pumpingStationActive) {
      activePumps += 1;
    }
  });

  const avgChoke = zoneDrains.length > 0 ? (totalChoke / zoneDrains.length) : 50;
  const pumpMitigation = activePumps * 8; // mm equivalent relief

  // Hydrological Runoff formulation (Modified Rational Formula with micro-topography factor)
  // Runoff Q = C * I * A
  // Soil saturation increases runoff over time
  const effectiveSaturation = Math.min(1.0, (params.soilSaturationInitial / 100) + (duration * 0.15));
  const soilInfiltrationFactor = zone.soilPermeability === 'high' ? 0.35 : (zone.soilPermeability === 'medium' ? 0.20 : 0.08);
  const baseImpervious = 0.80;
  const runoffCoeff = baseImpervious * (1 - soilInfiltrationFactor * (1 - effectiveSaturation));

  // Drainage capacity vs rainfall inflow
  const effectiveInflowMm = (intensity * duration * runoffCoeff) + tideImpact - pumpMitigation;
  const drainDischargeCapacityEquivalentMm = (zone.drainageDensityRatio * 18) * (1 - (avgChoke / 100)) * (params.drainMaintenanceEfficiency / 100);

  const netWaterAccumulationMm = Math.max(0, effectiveInflowMm - (drainDischargeCapacityEquivalentMm * duration));
  
  // Elevation depression factor (lower elevation = higher ponding)
  // Chennai average elevation ~ 4-8m. Below 4m gets severe ponding.
  const elevationMultiplier = Math.max(0.6, 1.8 - (zone.averageElevationM * 0.18));
  
  const predictedDepthCm = Math.round((netWaterAccumulationMm / 10) * elevationMultiplier);
  const floodedAreaPercent = Math.min(95, Math.round((predictedDepthCm / 120) * 100 * (elevationMultiplier * 0.8)));

  // Risk Level Classification
  let risk: RiskLevel = 'low';
  let alertTier: AlertTier = 'advisory';

  if (predictedDepthCm >= 75) {
    risk = 'critical';
    alertTier = 'evacuate';
  } else if (predictedDepthCm >= 50) {
    risk = 'severe';
    alertTier = 'evacuate';
  } else if (predictedDepthCm >= 30) {
    risk = 'high';
    alertTier = 'warning';
  } else if (predictedDepthCm >= 15) {
    risk = 'moderate';
    alertTier = 'watch';
  } else {
    risk = 'low';
    alertTier = 'advisory';
  }

  // Lead time to flood: higher intensity + choked drain = fast onset
  let leadTime = Math.max(15, Math.round(180 - (intensity * 1.5) - (avgChoke * 0.8) + (zone.averageElevationM * 8)));
  if (predictedDepthCm < 10) leadTime = 360;

  return {
    predictedInundationDepthCm: predictedDepthCm,
    floodedAreaPercent: Math.max(5, floodedAreaPercent),
    risk,
    alertTier,
    drainageDeficitCusecs: Math.round(totalCap * (avgChoke / 100)),
    leadTimeToFloodMins: leadTime
  };
}

export function calculateStreetHydrology(
  street: StreetVulnerability,
  zone: ZoneData,
  city: CityData,
  params: SimulationParams
): StreetVulnerability {
  const intensity = params.rainfallIntensityMmHr;
  const duration = params.durationHours;
  
  // Street micro-elevation delta from zone average
  const microElevationDelta = zone.averageElevationM - street.groundElevationMeters;
  const soilFactor = street.soilType === 'clay' ? 1.25 : (street.soilType === 'impervious_concrete' ? 1.4 : 1.0);
  
  // Specific street threshold logic
  const isOverThreshold = intensity >= street.criticalRainfallThresholdMmHr;
  const thresholdRatio = intensity / street.criticalRainfallThresholdMmHr;

  // Drain choke factor
  const zoneDrains = city.drainageChannels.filter(d => zone.drainIds.includes(d.id));
  const hasBlockedDrain = zoneDrains.some(d => params.blockedDrainIds.includes(d.id) || d.isBlocked);
  const chokeBoost = hasBlockedDrain ? 1.4 : 1.0;

  let depthCm = Math.round(
    Math.max(0, (intensity * duration * 0.45 * street.imperviousSurfaceRatio * soilFactor * chokeBoost) + (microElevationDelta * 12))
  );

  if (!isOverThreshold && depthCm > 25) {
    depthCm = Math.round(depthCm * 0.6);
  }

  let risk: RiskLevel = 'low';
  let tier: AlertTier = 'advisory';

  if (depthCm >= 75) {
    risk = 'critical';
    tier = 'evacuate';
  } else if (depthCm >= 50) {
    risk = 'severe';
    tier = 'evacuate';
  } else if (depthCm >= 30) {
    risk = 'high';
    tier = 'warning';
  } else if (depthCm >= 15) {
    risk = 'moderate';
    tier = 'watch';
  }

  const leadTimeMins = Math.max(10, Math.round((street.criticalRainfallThresholdMmHr / Math.max(10, intensity)) * 60 * (1 / chokeBoost)));

  return {
    ...street,
    predictedInundationDepthCm: depthCm,
    predictedTimeToFloodMinutes: leadTimeMins,
    riskLevel: risk,
    residentActionPlan: {
      ...street.residentActionPlan,
      recommendedTier: tier
    }
  };
}

export function calculateHistoricalSimilarity(
  city: CityData,
  params: SimulationParams,
  historicalEvents: HistoricalFloodComparison[]
): HistoricalFloodComparison[] {
  const simulated24hRain = params.rainfallIntensityMmHr * Math.min(24, params.durationHours * 4);
  
  return historicalEvents.map(event => {
    const rainDiffRatio = 1 - Math.min(1, Math.abs(simulated24hRain - event.recordedRainfallMm24h) / event.recordedRainfallMm24h);
    const chokeFactor = params.blockedDrainIds.length > 0 ? 0.2 : 0;
    const similarity = Math.round(Math.min(99, Math.max(10, (rainDiffRatio * 85) + (chokeFactor * 100))));
    
    return {
      ...event,
      similarityScore: similarity
    };
  }).sort((a, b) => b.similarityScore - a.similarityScore);
}
