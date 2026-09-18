/** Exercises the point forecast against real Open-Meteo data. */
import { forecastPoint } from '../src/utils/pointForecast.js';

const PLACES: [string, number, number][] = [
  ['T. Nagar, Chennai (flood-prone, low)', 13.0418, 80.2341],
  ['Velachery, Chennai (2015 worst-hit)', 12.9784, 80.2209],
  ['Ooty, Nilgiris (hill, 2200m)', 11.4102, 76.695],
  ['Kurla, Mumbai (Mithi floodplain)', 19.0726, 72.8845],
  ['Jaisalmer, Rajasthan (arid)', 26.9157, 70.9083],
  ['Guwahati, Assam (Brahmaputra)', 26.1445, 91.7362],
];

for (const [name, lat, lon] of PLACES) {
  for (const mode of ['live', 'scenario'] as const) {
    const f = await forecastPoint(lat, lon, {
      label: name,
      mode,
      scenarioMmHr: 90,
      scenarioHours: 6,
    });
    console.log(
      [
        mode.padEnd(8),
        name.padEnd(38),
        `elev ${String(f.elevationM).padStart(6)}m`,
        `sink ${String(f.sinkDepthM).padStart(6)}m`,
        `slope ${String(f.slopePercent).padStart(5)}%`,
        `peak ${String(f.peakDepthCm).padStart(3)}cm @${String(f.peakAtHour).padStart(2)}h`,
        `ttf ${String(f.timeToFloodMins ?? '-').padStart(4)}m`,
        `drain ${String(f.drainAwayHours).padStart(2)}h`,
        f.band.padEnd(8),
        f.confidence,
      ].join(' | ')
    );
  }
  // Open-Meteo is free and keyless; space the calls out rather than burst.
  await new Promise((r) => setTimeout(r, 600));
}
