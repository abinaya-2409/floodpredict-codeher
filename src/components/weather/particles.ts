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

  constructor(private count = 1800) {}

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
   * `project` converts a coordinate to canvas pixels; the caller owns the map
   * projection, so this stays independent of Leaflet.
   */
  draw(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    project: (lat: number, lon: number) => [number, number]
  ): void {
    if (!this.grid || !this.bounds) return;
    this.ensure();

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

      const [x0, y0] = project(p.lat, p.lon);
      const [x1, y1] = project(nextLat, nextLon);

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

    ctx.strokeStyle = 'rgba(255,255,255,0.72)';
    ctx.stroke();
  }

  clear(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    ctx.clearRect(0, 0, width, height);
  }
}
