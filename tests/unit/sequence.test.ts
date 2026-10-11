import { describe, expect, it } from 'vitest';
import { bootScript, kernelLines, rng, scriptDuration, spinnerFrame, stamp, systemdLines } from '../../src/intro/sequence';

describe('séquence de démarrage', () => {
  it('est déterministe pour une graine donnée', () => {
    expect(bootScript(42)).toEqual(bootScript(42));
    expect(rng(1)()).not.toBe(rng(2)());
  });

  it('formate les horodatages comme dmesg', () => {
    expect(stamp(0)).toBe('[    0.000000]');
    expect(stamp(12.5)).toBe('[   12.500000]');
  });

  it('a des horodatages croissants', () => {
    const times = kernelLines().map((l) => parseFloat(l.text.slice(1, 13)));
    expect(times[0]).toBe(0);
    for (let i = 1; i < times.length; i++) expect(times[i]).toBeGreaterThan(times[i - 1]!);
  });

  it('enchaîne noyau puis systemd et finit sur graphical.target', () => {
    const script = bootScript();
    const firstSystemd = script.findIndex((l) => l.kind === 'welcome');
    expect(script.slice(0, firstSystemd - 1).every((l) => l.kind === 'kernel')).toBe(true);
    expect(script.at(-1)!.text).toContain('portfolio.service');
    expect(systemdLines().some((l) => l.kind === 'wait' && l.doneText)).toBe(true);
  });

  it('dure entre 2 et 5 secondes à vitesse normale', () => {
    const d = scriptDuration(bootScript());
    expect(d).toBeGreaterThan(2000);
    expect(d).toBeLessThan(5000);
  });

  it('anime le spinner [ *** ] dans les deux sens', () => {
    const frames = Array.from({ length: 10 }, (_, i) => spinnerFrame(i));
    expect(new Set(frames).size).toBe(6);
    expect(frames[0]).toBe(frames[10 % 10]);
    expect(spinnerFrame(1)).toBe(spinnerFrame(9));
  });
});
