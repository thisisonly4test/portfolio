import { describe, expect, it } from 'vitest';
import { contactLinks, profile, SECTIONS, type Profile } from '../../src/data/profile';
import { esc, formatDuration, stripTags } from '../../src/shell/format';

describe('format', () => {
  it('échappe et dé-échappe', () => {
    const raw = `<a href="x">l'été & co</a>`;
    expect(esc(raw)).not.toMatch(/[<>"']/);
    expect(stripTags(esc(raw))).toBe(raw);
  });

  it('formate les durées', () => {
    expect(formatDuration(-5)).toBe('0 s');
    expect(formatDuration(42_000)).toBe('42 s');
    expect(formatDuration(61_000)).toBe('1 min 01 s');
    expect(formatDuration(3_725_000)).toBe('1 h 02 min');
  });
});

describe('profil', () => {
  it('a des identifiants de projets uniques, utilisables comme noms de dossier', () => {
    const ids = profile.projects.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9-]+$/);
  });

  it('a des sections uniques', () => {
    const ids = SECTIONS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('ne garde que les contacts renseignés, e-mail en premier', () => {
    const empty = { email: '', github: '', linkedin: '', rootme: '', tryhackme: '', cv: '' };
    const p: Profile = { ...profile, contact: { ...empty, email: 'a@b.c', rootme: 'https://www.root-me.org/x/' } };
    expect(contactLinks(p)).toEqual([
      { label: 'E-mail', value: 'a@b.c', href: 'mailto:a@b.c' },
      { label: 'Root-Me', value: 'root-me.org/x', href: 'https://www.root-me.org/x/' },
    ]);
    expect(contactLinks({ ...profile, contact: empty })).toEqual([]);
  });
});
