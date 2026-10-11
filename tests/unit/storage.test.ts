// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { forgetIntro, introSeen, markIntroSeen } from '../../src/storage';

describe('storage', () => {
  beforeEach(() => localStorage.clear());

  it('mémorise et oublie l’intro', () => {
    expect(introSeen()).toBe(false);
    markIntroSeen();
    expect(introSeen()).toBe(true);
    forgetIntro();
    expect(introSeen()).toBe(false);
  });
});
