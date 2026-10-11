import { describe, expect, it } from 'vitest';
import { clock, CRT_COMMANDS, duration, QUOTES, runCrt, type CrtContext } from '../../src/whiterose/crt';
import {
  applyMatrix,
  CITIES,
  cityForTimeZone,
  fitDistance,
  fovFor,
  isLand,
  MAP,
  mapDots,
  mixShot,
  quadMatrix,
  traceRoute,
  wallArc,
  wallPoint,
  type Quad,
  type Shot,
} from '../../src/whiterose/geometry';

describe('whiterose : géométrie', () => {
  it('l’homographie envoie les coins du rectangle sur ceux du quadrilatère', () => {
    const q: Quad = [
      { x: 10, y: 20 },
      { x: 310, y: 5 },
      { x: 300, y: 260 },
      { x: 0, y: 230 },
    ];
    const m = quadMatrix(400, 300, q);
    const corners = [
      [0, 0],
      [400, 0],
      [400, 300],
      [0, 300],
    ] as const;
    corners.forEach(([x, y], i) => {
      const p = applyMatrix(m, x, y);
      expect(p.x).toBeCloseTo(q[i]!.x, 2);
      expect(p.y).toBeCloseTo(q[i]!.y, 2);
    });
  });

  it('cadre un rectangle dans la vue, quel que soit le format', () => {
    for (const aspect of [16 / 9, 390 / 844, 21 / 9]) {
      const fov = 34;
      const d = fitDistance(0.4, 0.3, fov, aspect, 0.7);
      const t = Math.tan((fov * Math.PI) / 360);
      // Hauteur visible à cette distance : 2·d·tan(fov/2). L'écran en occupe au plus 70 %.
      expect(0.3 / (2 * d * t)).toBeLessThanOrEqual(0.7 + 1e-9);
      expect(0.4 / (2 * d * t * aspect)).toBeLessThanOrEqual(0.9 + 1e-9);
    }
    expect(fovFor(16 / 9, 66)).toBeLessThan(fovFor(9 / 16, 66));
    expect(fovFor(0.2, 66)).toBe(80);
  });

  it('le travelling part du premier plan et arrive au second', () => {
    const a: Shot = { pos: { x: 0, y: 1, z: 3 }, target: { x: 0, y: 1, z: 0 }, fov: 60 };
    const b: Shot = { pos: { x: 1, y: 1.2, z: 0.8 }, target: { x: 1, y: 1.2, z: 0.4 }, fov: 34 };
    expect(mixShot(a, b, 0)).toEqual(a);
    expect(mixShot(a, b, 1)).toEqual(b);
    expect(mixShot(a, b, 0.5).fov).toBe(47);
  });

  it('la carte murale dessine les continents, pas les océans', () => {
    expect(isLand(2, 47)).toBe(true); // France
    expect(isLand(-100, 40)).toBe(true); // États-Unis
    expect(isLand(135, -25)).toBe(true); // Australie
    expect(isLand(-30, 30)).toBe(false); // Atlantique
    expect(isLand(-150, 0)).toBe(false); // Pacifique
    const dots = mapDots();
    expect(dots.length).toBeGreaterThan(300);
    for (const d of dots) {
      expect(d.x).toBeGreaterThanOrEqual(MAP.left);
      expect(d.x).toBeLessThanOrEqual(MAP.right);
    }
    const paris = wallPoint(CITIES.paris.lon, CITIES.paris.lat);
    const sydney = wallPoint(CITIES.sydney.lon, CITIES.sydney.lat);
    expect(sydney.x).toBeGreaterThan(paris.x);
    expect(sydney.y).toBeLessThan(paris.y);
  });

  it('un arc relie ses deux extrémités en se décollant du mur', () => {
    const a = wallPoint(0, 0);
    const b = wallPoint(90, 30);
    const arc = wallArc(a, b, 10);
    expect(arc[0]).toEqual(a);
    expect(arc[10]!.x).toBeCloseTo(b.x, 9);
    expect(arc[10]!.y).toBeCloseTo(b.y, 9);
    expect(arc[5]!.z).toBeGreaterThan(a.z);
  });

  it('associe un fuseau à une ville de la carte', () => {
    expect(cityForTimeZone('Europe/Paris')).toBe('paris');
    expect(cityForTimeZone('Europe/London')).toBe('londres');
    expect(cityForTimeZone('America/Los_Angeles')).toBe('sanfrancisco');
    expect(cityForTimeZone('America/Toronto')).toBe('newyork');
    expect(cityForTimeZone('Asia/Tokyo')).toBe('tokyo');
    expect(cityForTimeZone('')).toBe('paris');
  });

  it('la route part du visiteur et finit ailleurs, sans boucle', () => {
    for (const id of Object.keys(CITIES) as (keyof typeof CITIES)[]) {
      const route = traceRoute(id);
      expect(route[0]).toBe(id);
      expect(route).toHaveLength(5);
      expect(new Set(route).size).toBe(route.length);
    }
  });
});

describe('whiterose : le shell du moniteur', () => {
  const ctx: CrtContext = { now: new Date(2026, 9, 11, 3, 4, 5, 67), elapsedMs: 125_000, city: 'Paris', random: 0.99 };

  it('formate l’heure à la milliseconde et les durées', () => {
    expect(clock(ctx.now)).toBe('03:04:05.067');
    expect(duration(5_000)).toBe('5 s');
    expect(duration(125_000)).toBe('2 min 5 s');
    expect(duration(3_725_000)).toBe('1 h 2 min 5 s');
  });

  it('répond aux commandes', () => {
    expect(runCrt('help', ctx).lines).toHaveLength(Object.keys(CRT_COMMANDS).length);
    expect(runCrt('time', ctx).lines.join(' ')).toContain('2 min 5 s');
    expect(runCrt('trace', ctx).action).toBe('trace');
    expect(runCrt('  EXIT ', ctx).action).toBe('exit');
    expect(runCrt('clear', ctx)).toEqual({ lines: [], action: 'clear' });
    expect(runCrt('rose', ctx).lines[0]).toContain(QUOTES[QUOTES.length - 1]!);
    expect(runCrt('nmap 10.0.0.1', ctx).lines[0]).toContain('inconnu');
    expect(runCrt('', ctx).lines).toEqual([]);
  });
});
