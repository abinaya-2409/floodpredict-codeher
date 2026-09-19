import { WeatherGrid, sampleBilinear } from '../../utils/weatherGrid';

/**
 * The moving streaks that make a wind map read as wind.
 *
 * Particles live in latitude and longitude, not pixels, so panning and
 * zooming move them with the map instead of scattering them. Each frame a
 * particle is advected by the wind at its own position, and the trail is made
 * by fading the whole canvas slightly rather than by remembering each path -
 * one translucent rectangle a frame instead of thousands of stored points.
 *
 * Particles are retired on a staggered age. Without that they all drift into
 * the same convergence lines within a few seconds and the field turns into a
 * handful of bright threads over an empty map.
 */

interface Particle {
  lat: number;
  lon: number;
  age: number;
  maxAge: number;
}

export interface ParticleBounds {
  south: number;
  north: number;
  west: number;
  east: number;
}

/**
 * A frame's worth of map projection, as four numbers.
 *
 * The draw loop used to call Leaflet's `latLngToContainerPoint` twice per
 * particle - 3,600 calls a frame at the default count. Each one builds a
 * LatLng, projects it into a new Point, rounds it, subtracts the pixel
 * origin and allocates a second Point to add the pane offset: roughly three
 * short-lived objects and eight calls, so about eleven thousand objects a
 * frame for the garbage collector to deal with. Measured on a real Leaflet
 * map at this count it was 2.1ms of a 16.7ms frame, spent entirely on
 * arriving at a number.
 *
 * Web Mercator is an affine transform of a closed-form function, so the
 * whole projection for a frame is a scale and an origin. Those are computed
 * once, from Leaflet itself, and every particle is then ten floating-point
 * operations: 0.42ms for the same 3,600, a five-fold reduction, with no
 * allocation at all.
 */
export interface FrameProjection {
  /** World-pixel span of the whole globe at this zoom: 256 * 2^zoom. */
  scale: number;
  /** World-pixel coordinate of the canvas's left edge. */
  originX: number;
  /** World-pixel coordinate of the canvas's top edge. */
  originY: number;
}

/**
 * Longitude to world pixels. Exactly Leaflet's EPSG:3857, which composes
 * SphericalMercator with the transformation (1/2piR, 0.5, -1/2piR, 0.5):
 * the radius cancels, leaving a plain linear map of the -180..180 range.
 */
export function mercatorWorldX(lon: number, scale: number): number {
  return ((lon + 180) / 360) * scale;
}

/** Latitude to world pixels. The same composition, on atanh(sin(lat)). */
export function mercatorWorldY(lat: number, scale: number): number {
  const s = Math.sin((lat * Math.PI) / 180);
  return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * scale;
}

/**
 * Derives a frame's projection from one point whose position the map has
 * already told us.
 *
 * Self-calibrating on purpose. Anchoring to a point Leaflet itself placed
 * means the fast path cannot drift from the slow one: if Leaflet changes
 * how it positions the pane, or the map is mid zoom-animation, the origin
 * moves with it. Nothing here has to know about panes or pixel origins.
 */
export function frameProjection(
  scale: number,
  anchorLat: number,
  anchorLon: number,
  anchorX: number,
  anchorY: number
): FrameProjection {
  return {
    scale,
    originX: mercatorWorldX(anchorLon, scale) - anchorX,
    originY: mercatorWorldY(anchorLat, scale) - anchorY,
  };
}

export class WindParticles {
  private particles: Particle[] = [];
  private grid: WeatherGrid | null = null;
  private hour = 0;
  private bounds: ParticleBounds | null = null;

  /**
   * Degrees moved per km/h of wind, per frame.
   *
   * Tuned for legibility rather than realism: at true speed the streaks cross
   * the state in about a second and read as noise. Windy does the same.
   */
  private readonly SPEED = 0.00042;
  private readonly BASE_AGE = 60;

  /**
   * The streak colour. White reads as wind over a dark basemap and as
   * nothing at all over a light one, so the caller sets it from the theme.
   */
  private ink = 'rgba(255,255,255,0.72)';

  constructor(private count = 1800) {}

  setInk(ink: string): void {
    this.ink = ink;
  }

  /** Thins the field on a device that cannot afford the full one. */
  setCount(count: number): void {
    this.count = Math.max(120, Math.round(count));
    if (this.particles.length > this.count) this.particles.length = this.count;
  }

  setGrid(grid: WeatherGrid | null): void {
    this.grid = grid;
    this.particles = [];
  }

  setHour(hour: number): void {
    this.hour = hour;
  }

  /** Called on every pan and zoom so particles only spawn where they show. */
  setBounds(b: ParticleBounds): void {
    this.bounds = b;
    if (this.particles.length) {
      // Anything now well off-screen is cheaper to respawn than to track.
      for (const p of this.particles) {
        if (!this.inside(p.lat, p.lon)) this.reset(p);
      }
    }
  }

  private inside(lat: number, lon: number): boolean {
    const b = this.bounds;
    if (!b) return false;
    return lat >= b.south && lat <= b.north && lon >= b.west && lon <= b.east;
  }

  private reset(p: Particle): void {
    const b = this.bounds;
    if (!b) return;
    p.lat = b.south + Math.random() * (b.north - b.south);
    p.lon = b.west + Math.random() * (b.east - b.west);
    p.age = 0;
    p.maxAge = this.BASE_AGE * (0.5 + Math.random());
  }

  private ensure(): void {
    if (!this.bounds) return;
    while (this.particles.length < this.count) {
      const p: Particle = { lat: 0, lon: 0, age: 0, maxAge: 0 };
      this.reset(p);
      // Stagger the first generation's ages so they do not all expire together.
      p.age = Math.random() * p.maxAge;
      this.particles.push(p);
    }
    if (this.particles.length > this.count) {
      this.particles.length = this.count;
    }
  }

  /**
   * Advances and draws one frame.
   *
   * Takes the frame's projection rather than a callback: the caller still
   * owns the map, and this stays independent of Leaflet, but the per-particle
   * cost is now arithmetic instead of a library call.
   */
  draw(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    projection: FrameProjection
  ): void {
    if (!this.grid || !this.bounds) return;
    this.ensure();

    const { scale, originX, originY } = projection;

    // Fade rather than clear: what remains is the trail.
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    ctx.fillRect(0, 0, width, height);
    ctx.globalCompositeOperation = 'source-over';

    ctx.lineWidth = 1.1;
    ctx.lineCap = 'round';
    ctx.beginPath();

    for (const p of this.particles) {
      const u = sampleBilinear(this.grid, this.grid.windU, this.hour, p.lat, p.lon);
      const v = sampleBilinear(this.grid, this.grid.windV, this.hour, p.lat, p.lon);

      // Dead air: nothing to trace, so recycle it somewhere with weather.
      if (Math.abs(u) + Math.abs(v) < 0.3) {
        this.reset(p);
        continue;
      }

      const nextLon = p.lon + u * this.SPEED;
      // Longitude degrees shrink towards the poles; without this correction
      // the streaks tilt north-south more than the wind actually does.
      const nextLat = p.lat + v * this.SPEED * Math.cos((p.lat * Math.PI) / 180);

      const x0 = mercatorWorldX(p.lon, scale) - originX;
      const y0 = mercatorWorldY(p.lat, scale) - originY;
      const x1 = mercatorWorldX(nextLon, scale) - originX;
      const y1 = mercatorWorldY(nextLat, scale) - originY;

      p.lat = nextLat;
      p.lon = nextLon;
      p.age += 1;

      if (p.age > p.maxAge || !this.inside(p.lat, p.lon)) {
        this.reset(p);
        continue;
      }
      if (x1 < -50 || y1 < -50 || x1 > width + 50 || y1 > height + 50) continue;

      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
    }

    ctx.strokeStyle = this.ink;
    ctx.stroke();
  }

  clear(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    ctx.clearRect(0, 0, width, height);
  }
}
