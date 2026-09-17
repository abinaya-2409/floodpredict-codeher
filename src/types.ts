export type RiskLevel = 'low' | 'moderate' | 'high' | 'severe' | 'critical';

export type AlertTier = 'advisory' | 'watch' | 'warning' | 'evacuate';

export interface WeatherForecast {
  currentRainfallMmHr: number;
  totalAccumulated24hMm: number;
  forecast6hMm: number;
  forecast12hMm: number;
  forecast24hMm: number;
  forecast48hMm: number;
  intensityCategory: 'Light' | 'Moderate' | 'Heavy' | 'Very Heavy' | 'Extremely Heavy';
  atmosphericPressureHpa: number;
  windSpeedKmh: number;
  stormSurgeTideM: number;
  cycloneProximityKm: number | null;
  dopplerRadarTrend: 'intensifying' | 'steady' | 'weakening';
}

export interface DrainageChannel {
  id: string;
  name: string;
  type: 'major_river' | 'canal' | 'storm_drain' | 'culvert' | 'surplus_channel';
  maxCapacityCusecs: number;
  currentFlowCusecs: number;
  chokePercentage: number; // 0 - 100%
  isBlocked: boolean;
  blockageReason?: string;
  connectedLakeOrBasin: string;
  pumpingStationActive: boolean;
  outfallCondition: 'free' | 'tide_locked' | 'partially_submerged';
}

export interface StreetVulnerability {
  streetId: string;
  name: string;
  wardNumber: number;
  zoneId: string;
  groundElevationMeters: number; // above MSL
  soilType: 'clay' | 'alluvial' | 'sandy_loam' | 'impervious_concrete';
  imperviousSurfaceRatio: number; // 0 to 1
  criticalRainfallThresholdMmHr: number; // e.g., 42 mm/hr
  rainfallDurationThresholdHours: number; // e.g., 1.5 hrs
  predictedInundationDepthCm: number;
  predictedTimeToFloodMinutes: number;
  riskLevel: RiskLevel;
  historicalFloodingEvents: {
    eventYear: number;
    eventName: string;
    maxDepthCm: number;
    durationDays: number;
  }[];
  residentActionPlan: {
    recommendedTier: AlertTier;
    vehicleAction: string;
    electricalAction: string;
    groundFloorSafety: string;
    nearestShelterName: string;
    shelterDistanceKm: number;
    safeRouteSummary: string;
  };
}


/**
 * Social vulnerability inputs for a zone.
 *
 * Figures are ward-level estimates derived from Census 2011 district handbooks
 * and municipal corporation ward profiles. They are indicative, not surveyed -
 * every consumer of this data should treat it as a planning estimate.
 */
export interface ZoneDemographics {
  /** Residents per sq km. Drives exposure alongside flooded area. */
  populationDensityPerSqKm: number;
  /** Share of residents aged 60+. Reduced mobility during evacuation. */
  elderly60PlusPercent: number;
  /** Share of residents with a disability affecting mobility or sensory access. */
  disabledPersonsPercent: number;
  /** Share of households below the state poverty line / in notified slums. */
  lowIncomeHouseholdPercent: number;
  /** Share of dwellings whose only living floor is at ground level. */
  groundFloorDwellingPercent: number;
  /** Share of residents without a private vehicle for self-evacuation. */
  noPrivateVehiclePercent: number;
  /** Critical facilities inside or serving the zone. */
  criticalFacilities: {
    hospitals: number;
    schools: number;
    nearestHospitalKm: number;
  };
}

/** One weighted contributor to the composite index. */
export interface RiskComponent {
  /** 0 - 100 */
  score: number;
  /** Weight applied in the composite. All weights sum to 1. */
  weight: number;
  /** Plain-language reason, shown in the UI so the index stays explainable. */
  rationale: string;
}

/**
 * The composite 0-100 Vulnerability Risk Index for a zone.
 * Deliberately separate from raw hydrology: this answers "where does help
 * matter most", not "where is the water deepest".
 */
export interface ZoneRiskAssessment {
  zoneId: string;
  zoneName: string;
  /** Composite 0 - 100. */
  vri: number;
  band: RiskLevel;
  hazard: RiskComponent;
  exposure: RiskComponent;
  fragility: RiskComponent;
  copingDeficit: RiskComponent;
  /** Minutes until critical level - kept OUT of the index, used for urgency. */
  leadTimeToFloodMins: number;
  /** Ranking key for dispatch and evacuation: severity weighted by urgency. */
  priorityScore: number;
  /** Estimated residents in the flooded footprint. */
  populationAtRisk: number;
  /** Estimated residents at risk who need assisted evacuation. */
  assistedEvacuationNeeded: number;
}

export interface ZoneData {
  id: string;
  name: string;
  tamilName?: string;
  hindiName?: string;
  wardNumbers: number[];
  population: number;
  catchmentAreaSqKm: number;
  demographics: ZoneDemographics;
  averageElevationM: number;
  soilPermeability: 'low' | 'medium' | 'high';
  drainageDensityRatio: number; // km of drain per sq km
  criticalThresholdMm: number;
  predictedInundationDepthCm: number;
  predictedFloodedAreaPercent: number;
  currentRisk: RiskLevel;
  alertTier: AlertTier;
  drainIds: string[];
  historicalBenchmark: {
    year2015DepthCm: number;
    year2023MichaungDepthCm: number;
    vulnerabilityIndex: number; // 0 - 100
  };
  keyStreets: StreetVulnerability[];
  mapCoordinates: { x: number; y: number; width: number; height: number; polygonPoints?: string };
  geoCenter?: [number, number]; // [lat, lng] for Leaflet
  geoPolygon?: [number, number][]; // Polygon coordinates for Leaflet
}

export interface ResourcePrepositioning {
  id: string;
  type: 'dewatering_pump' | 'ndrf_boat_unit' | 'sdrf_rescue_team' | 'mobile_power_generator' | 'food_relief_truck';
  name: string;
  zoneId: string;
  targetStreet: string;
  recommendedUnits: number;
  priority: 'CRITICAL' | 'HIGH' | 'MEDIUM';
  status: 'recommended' | 'dispatched' | 'operational';
  coordinates: [number, number];
  reason: string;
}

export interface HydrologicalTimelinePoint {
  hour: string; // e.g. "T-12h", "T-6h", "Current", "T+3h", "T+6h"
  timestamp: string;
  rainfallMmHr: number;
  accumulatedMm: number;
  avgInundationCm: number;
  riskScore: number; // 0 - 100
  drainFlowPercentage: number;
}

export interface CityData {
  id: string;
  name: string;
  state: string;
  description: string;
  lat: number;
  lng: number;
  averageAnnualRainfallMm: number;
  coastalCity: boolean;
  majorWaterBodies: string[];
  zones: ZoneData[];
  drainageChannels: DrainageChannel[];
  weather: WeatherForecast;
  reliefShelters: ReliefShelter[];
}

export interface ReliefShelter {
  id: string;
  name: string;
  zoneId: string;
  address: string;
  capacityPersons: number;
  currentOccupancyPersons: number;
  elevationM: number;
  isAccessible: boolean;
  hasMedicalPost: boolean;
  hasPowerBackup: boolean;
  contactNumber: string;
}

export interface HistoricalFloodComparison {
  eventName: string;
  year: number;
  recordedRainfallMm24h: number;
  peakInundationAreaSqKm: number;
  affectedPopulation: number;
  primaryCause: string;
  similarityScore: number; // 0 - 100% based on current simulated rain & choke
}

export interface SimulationParams {
  rainfallIntensityMmHr: number;
  durationHours: number;
  drainMaintenanceEfficiency: number; // 0 to 100%
  tideLevelM: number; // High tide factor
  soilSaturationInitial: number; // 0 to 100%
  blockedDrainIds: string[];
  activePumpingStations: string[];
}

export interface CitizenReport {
  id: string;
  timestamp: string;
  zoneId: string;
  streetName: string;
  waterDepthCm: number;
  isPassableForVehicles: boolean;
  drainCloggedNotice: boolean;
  powerOutage: boolean;
  description: string;
  verifiedByAuthority: boolean;
}

export interface AlertBroadcast {
  id: string;
  timestamp: string;
  tier: AlertTier;
  targetZoneIds: string[];
  affectedStreets: string[];
  title: string;
  messageEn: string;
  messageLocal: string;
  language: 'en' | 'ta' | 'hi' | 'te' | 'mr';
  actionChecklist: string[];
  channel: 'SMS' | 'WhatsApp' | 'Sirens' | 'Cell Broadcast' | 'Municipal App';
  status: 'draft' | 'dispatched' | 'simulated';
}
