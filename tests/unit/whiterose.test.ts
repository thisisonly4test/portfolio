import { describe, expect, it } from 'vitest';
import { clock, CRT_COMMANDS, duration, QUOTES, runCrt, type CrtContext } from '../../src/whiterose/crt';
import {
  applyMatrix,
  CITIES,
  cityForTimeZone,
  coverZoom,
  mixView,
  project,
  quadMatrix,
  roomView,
  SCREEN,
  screenBox,
  screenView,
  traceRoute,
  type Quad,
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

  it('le plan large couvre la fenêtre, le plan serré cadre l’écran', () => {
    for (const [vw, vh] of [
      [1440, 900],
      [390, 844],
      [2560, 1080],
    ] as const) {
      expect(roomView(vw, vh).z).toBeGreaterThanOrEqual(coverZoom(vw, vh));
      const v = screenView(vw, vh);
      const pts = SCREEN.map((p) => project(p, v, vw, vh));
      for (const p of pts) {
        expect(p.x).toBeGreaterThan(0);
        expect(p.x).toBeLessThan(vw);
        expect(p.y).toBeGreaterThan(0);
        expect(p.y).toBeLessThan(vh);
      }
      const box = screenBox(vw, vh);
      // L'écran occupe l'essentiel de la fenêtre, limité par la hauteur ou la largeur.
      expect(box.h >= vh * 0.6 || box.w >= vw * 0.8).toBe(true);
    }
  });

  it('le travelling part du premier cadrage et arrive au second', () => {
    const a = roomView(1440, 900);
    const b = screenView(1440, 900);
    expect(mixView(a, b, 0)).toEqual(a);
    const end = mixView(a, b, 1);
    expect(end.z).toBeCloseTo(b.z, 6);
    expect(end.cx).toBeCloseTo(b.cx, 6);
    expect(end.cy).toBeCloseTo(b.cy, 6);
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
