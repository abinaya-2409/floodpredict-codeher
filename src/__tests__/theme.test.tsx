import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { ThemeProvider } from '../theme/ThemeProvider';
import { ThemeSwitcher } from '../components/ThemeSwitcher';
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

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
});

describe('ThemeProvider + ThemeSwitcher', () => {
  it('writes data-theme onto the document root', () => {
    render(
      <ThemeProvider>
        <ThemeSwitcher />
      </ThemeProvider>
    );
    expect(document.documentElement.getAttribute('data-theme')).toBeTruthy();
  });

  it('exposes all three themes as radio options', () => {
    render(
      <ThemeProvider>
        <ThemeSwitcher />
      </ThemeProvider>
    );
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(3);
    // Exactly one may be checked at a time.
    expect(radios.filter((r) => r.getAttribute('aria-checked') === 'true')).toHaveLength(1);
  });

  it('switches theme and persists the choice', () => {
    render(
      <ThemeProvider>
        <ThemeSwitcher />
      </ThemeProvider>
    );
    const light = screen.getByRole('radio', { name: /Daylight theme/i });
    act(() => light.click());

    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(localStorage.getItem('jalrakshak.theme')).toBe('light');
  });
});

describe('VRI surfaces', () => {
  it('renders the composite index with accessible meters', () => {
    render(
      <ThemeProvider>
        <VulnerabilityIndexPanel assessment={assessments[0]} />
      </ThemeProvider>
    );
    expect(screen.getByRole('region', { name: /Vulnerability Risk Index/i })).toBeTruthy();
    // One meter per weighted component.
    expect(screen.getAllByRole('meter')).toHaveLength(4);
  });

  it('renders the queue in ranked order', () => {
    const queue = rankByPriority(assessments);
    render(
      <ThemeProvider>
        <EvacuationPriorityQueue
          queue={queue}
          selectedZoneId={queue[0].zoneId}
          onSelectZone={() => {}}
        />
      </ThemeProvider>
    );
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(queue.length);
    expect(items[0].textContent).toContain(queue[0].zoneName);
  });
});
