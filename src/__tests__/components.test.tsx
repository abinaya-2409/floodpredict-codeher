import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { VulnerabilityIndexPanel } from '../components/VulnerabilityIndexPanel';
import { EvacuationPriorityQueue } from '../components/EvacuationPriorityQueue';
import { CITIES } from '../data/mockData';
import { calculateZoneHydrology } from '../utils/floodEngine';
import { assessZone, rankByPriority } from '../utils/riskIndex';
import { SimulationParams } from '../types';

const params: SimulationParams = {
  rainfallIntensityMmHr: 55,
  durationHours: 3,
  drainMaintenanceEfficiency: 65,
  tideLevelM: 1.2,
  soilSaturationInitial: 75,
  blockedDrainIds: [],
  activePumpingStations: [],
};

const chennai = CITIES[0];
const assessments = chennai.zones.map((zone) => {
  const hydro = calculateZoneHydrology(zone, chennai, params);
  return assessZone(
    {
      ...zone,
      predictedInundationDepthCm: hydro.predictedInundationDepthCm,
      predictedFloodedAreaPercent: hydro.floodedAreaPercent,
    },
    chennai,
    hydro.leadTimeToFloodMins
  );
});

describe('VulnerabilityIndexPanel', () => {
  it('renders the composite index with one accessible meter per component', () => {
    render(<VulnerabilityIndexPanel assessment={assessments[0]} />);
    expect(screen.getByRole('region', { name: /Vulnerability Risk Index/i })).toBeTruthy();
    expect(screen.getAllByRole('meter')).toHaveLength(4);
  });

  it('shows the zone name and the score out of 100', () => {
    render(<VulnerabilityIndexPanel assessment={assessments[0]} />);
    expect(screen.getByText(assessments[0].zoneName)).toBeTruthy();
    expect(screen.getByText(String(assessments[0].vri))).toBeTruthy();
  });
});

describe('EvacuationPriorityQueue', () => {
  it('renders every zone in ranked order', () => {
    const queue = rankByPriority(assessments);
    render(
      <EvacuationPriorityQueue
        queue={queue}
        selectedZoneId={queue[0].zoneId}
        onSelectZone={() => {}}
      />
    );
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(queue.length);
    expect(items[0].textContent).toContain(queue[0].zoneName);
  });

  it('marks the selected zone for assistive technology', () => {
    const queue = rankByPriority(assessments);
    render(
      <EvacuationPriorityQueue
        queue={queue}
        selectedZoneId={queue[1].zoneId}
        onSelectZone={() => {}}
      />
    );
    const current = screen.getAllByRole('button').filter(
      (b) => b.getAttribute('aria-current') === 'true'
    );
    expect(current).toHaveLength(1);
    expect(current[0].textContent).toContain(queue[1].zoneName);
  });
});
