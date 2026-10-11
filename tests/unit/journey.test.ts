import { describe, expect, it } from 'vitest';
import { profile } from '../../src/data/profile';
import { progressFrom } from '../../src/site/effects';
import { entropyBits, facts, parseBrowser, parseOS } from '../../src/site/fingerprint';
import { hopsFor } from '../../src/site/hops';
import { damp, pathPoints, progressToT, seeded } from '../../src/scene/path';

describe('trajet 3D', () => {
  it('chaque saut du profil a une position dans le monde', () => {
    const nodes = hopsFor(profile).map((h) => h.node);
    expect(pathPoints(nodes)).toHaveLength(nodes.length);
    expect(() => pathPoints(['inconnu'])).toThrow();
  });

  it('avance toujours vers -z, sans revenir en arrière', () => {
    const pts = pathPoints(hopsFor(profile).map((h) => h.node));
    for (let i = 1; i < pts.length; i++) expect(pts[i]![2]).toBeLessThan(pts[i - 1]![2]);
  });

  it('convertit l’avancement en paramètre de courbe', () => {
    expect(progressToT(0, 7)).toBe(0);
    expect(progressToT(3, 7)).toBe(0.5);
    expect(progressToT(6, 7)).toBe(1);
    expect(progressToT(-1, 7)).toBe(0);
    expect(progressToT(99, 7)).toBe(1);
    expect(progressToT(2, 1)).toBe(0);
  });

  it('amortit sans dépasser la cible, quel que soit le pas', () => {
    expect(damp(0, 10, 5, 0)).toBe(0);
    for (const dt of [0.001, 0.016, 0.05, 1]) {
      const v = damp(0, 10, 5, dt);
      expect(v).toBeGreaterThan(0);
      expect(v).toBeLessThanOrEqual(10);
    }
  });

  it('génère un décor déterministe', () => {
    const a = seeded(1);
    const b = seeded(1);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
});

describe('avancement au défilement', () => {
  const tops = [0, 1000, 2000];
  it('reste sur l’équipement pendant la lecture, puis voyage', () => {
    expect(progressFrom(tops, -10)).toBe(0);
    expect(progressFrom(tops, 300)).toBe(0);
    expect(progressFrom(tops, 550)).toBe(0);
    expect(progressFrom(tops, 800)).toBeGreaterThan(0);
    expect(progressFrom(tops, 800)).toBeLessThan(1);
    expect(progressFrom(tops, 999.99)).toBeCloseTo(1, 3);
    expect(progressFrom(tops, 1200)).toBe(1);
    expect(progressFrom(tops, 9000)).toBe(2);
  });

  it('est croissant', () => {
    let prev = -1;
    for (let y = 0; y < 2500; y += 25) {
      const p = progressFrom(tops, y);
      expect(p).toBeGreaterThanOrEqual(prev);
      prev = p;
    }
  });
});

describe('empreinte du navigateur', () => {
  const chromeLinux = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
  it('reconnaît navigateur et système', () => {
    expect(parseBrowser(chromeLinux)).toBe('Chrome 141');
    expect(parseOS(chromeLinux)).toBe('Linux');
    expect(parseBrowser('Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0')).toBe('Firefox 140');
    expect(parseOS('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe('Windows 10/11');
    expect(parseBrowser('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Version/18.0 Mobile/15E148 Safari/604.1')).toBe('Safari 18');
    expect(parseOS('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)')).toBe('iOS');
    expect(parseBrowser('Mozilla/5.0 Chrome/141.0 Edg/141.0')).toBe('Edge 141');
    expect(parseOS('Mozilla/5.0 (Linux; Android 15; Pixel 7)')).toBe('Android 15');
  });

  it('liste les faits et omet ce qui manque', () => {
    const env = {
      userAgent: chromeLinux,
      language: 'fr-FR',
      languages: ['fr-FR', 'fr', 'en-US', 'en'],
      timeZone: 'Europe/Paris',
      screen: { width: 1920, height: 1080, dpr: 1 },
      touch: false,
      darkMode: true,
      cookies: true,
      doNotTrack: false,
      gpc: true,
    };
    const list = facts(env);
    expect(list.find((f) => f.label === 'Langues')?.value).toBe('fr-FR, fr, en-US');
    expect(list.find((f) => f.label === 'Do Not Track')?.value).toBe('activé');
    expect(list.some((f) => f.label === 'Mémoire')).toBe(false);
    expect(entropyBits(list)).toBeGreaterThan(20);
  });
});
