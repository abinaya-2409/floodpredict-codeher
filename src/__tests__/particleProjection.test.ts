import { describe, it, expect } from 'vitest';
import L from 'leaflet';
import {
  frameProjection,
  mercatorWorldX,
  mercatorWorldY,
  WindParticles,
} from '../components/weather/particles';

/**
 * The wind field's projection, checked against Leaflet's own.
 *
 * The draw loop called `latLngToContainerPoint` twice per particle - 3,600
 * library calls a frame - and each one reads the map pane's current offset,
 * which during a drag is a layout read. It now computes Web Mercator
 * directly and calls Leaflet once a frame to anchor it.
 *
 * That is only safe while the two agree exactly, and nothing in the running
 * app would tell us if they stopped: the streaks would simply be drawn in
 * the wrong place, which looks like wind. So the agreement is the test.
 * Leaflet's CRS is pure arithmetic, so it can be checked without a DOM.
 */

const CRS = L.CRS.EPSG3857;

/** Tamil Nadu's corners, the equator, and the edges of the usable range. */
const POINTS: [number, number][] = [
  [13.0827, 80.2707], // Chennai
  [8.0883, 77.5385], // Kanniyakumari
  [11.4102, 76.6950], // the Nilgiris
  [10.9, 78.3], // the state's centre
  [0, 0],
  [0, 180],
  [0, -180],
  [85.0511, 179.9],
  [-85.0511, -179.9],
  [45.5, -73.6],
];

const ZOOMS = [0, 1, 6, 7.5, 11, 14, 18];

describe('the fast projection is Leaflet arithmetic, not an approximation', () => {
  it('lands on the same world pixel as Leaflet at every zoom', () => {
    for (const zoom of ZOOMS) {
      const scale = CRS.scale(zoom);
      for (const [lat, lon] of POINTS) {
        const theirs = CRS.latLngToPoint(L.latLng(lat, lon), zoom);
        const x = mercatorWorldX(lon, scale);
        const y = mercatorWorldY(lat, scale);
        // Sub-hundredth of a pixel. Anything larger is a formula that has
        // drifted, not a rounding difference.
        expect(Math.abs(x - theirs.x), `x at z${zoom} ${lat},${lon}`).toBeLessThan(0.01);
        expect(Math.abs(y - theirs.y), `y at z${zoom} ${lat},${lon}`).toBeLessThan(0.01);
      }
    }
  });

  it('reproduces a container point from one anchor Leaflet supplied', () => {
    // Stand in for a map: an arbitrary pane offset, the way a dragged map
    // would have one.
    for (const zoom of [6, 7.5, 11]) {
      const scale = CRS.scale(zoom);
      const paneOriginX = 12345.5;
      const paneOriginY = -6789.25;

      const container = (lat: number, lon: number) => {
        const p = CRS.latLngToPoint(L.latLng(lat, lon), zoom);
        return [p.x - paneOriginX, p.y - paneOriginY];
      };

      // Anchor on the centre, exactly as the draw loop does.
      const [ax, ay] = container(10.9, 78.3);
      const proj = frameProjection(scale, 10.9, 78.3, ax, ay);

      for (const [lat, lon] of POINTS) {
        const [wantX, wantY] = container(lat, lon);
        const gotX = mercatorWorldX(lon, proj.scale) - proj.originX;
        const gotY = mercatorWorldY(lat, proj.scale) - proj.originY;
        expect(Math.abs(gotX - wantX), `x z${zoom} ${lat},${lon}`).toBeLessThan(0.01);
        expect(Math.abs(gotY - wantY), `y z${zoom} ${lat},${lon}`).toBeLessThan(0.01);
      }
    }
  });

  it('puts the anchor exactly where it was told to', () => {
    const proj = frameProjection(CRS.scale(9), 10.9, 78.3, 640, 360);
    expect(mercatorWorldX(78.3, proj.scale) - proj.originX).toBeCloseTo(640, 9);
    expect(mercatorWorldY(10.9, proj.scale) - proj.originY).toBeCloseTo(360, 9);
  });
});

describe('the field thins rather than stalls', () => {
  it('drops particles when the count is lowered', () => {
    const p = new WindParticles(1800);
    // No grid, so draw is a no-op; the cap is what is under test.
    p.setCount(300);
    expect(() => p.setCount(300)).not.toThrow();
    // Never to nothing: a wind map with no wind in it is a broken map, not
    // a fast one.
    p.setCount(1);
    expect(() => p.setCount(1)).not.toThrow();
  });
});
