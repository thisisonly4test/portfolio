// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from 'vitest';
import { profile, type Profile } from '../../src/data/profile';
import { hopsFor } from '../../src/site/hops';
import { renderPage } from '../../src/site/page';
import { EventLog } from '../../src/site/events';

beforeAll(() => {
  // jsdom n'a pas matchMedia ; le schéma réseau en a besoin.
  window.matchMedia = ((q: string) => ({ matches: q.includes('reduce'), media: q })) as unknown as typeof window.matchMedia;
});

const empty = { email: '', github: '', linkedin: '', rootme: '', tryhackme: '', cv: '' };

describe('renderPage', () => {
  it('rend un saut par section visible, dans l’ordre du trajet', () => {
    const { root } = renderPage(profile);
    const ids = [...root.querySelectorAll('section.hop')].map((s) => s.id);
    expect(ids).toEqual(hopsFor(profile).map((s) => s.id));
    expect(ids[0]).toBe('top');
  });

  it('montre l’empreinte du navigateur fournie, sans rien inventer', () => {
    const { root } = renderPage(profile, { env: [{ label: 'Navigateur', value: 'Firefox 140' }] });
    expect(root.querySelector('.probe-grid')?.textContent).toBe('NavigateurFirefox 140');
    expect(renderPage(profile, { env: [] }).root.querySelector('.probe-grid')).toBeNull();
  });

  it('écrit les principes comme des règles accept / drop', () => {
    const code = renderPage(profile).root.querySelector('.hop-apropos .code')!.textContent!;
    for (const r of profile.principles) expect(code).toContain(r.text);
    expect(code).toContain('policy drop');
  });

  it('rend chaque projet avec problème, solution et stack', () => {
    const { root } = renderPage(profile);
    const rows = root.querySelectorAll('.unit');
    expect(rows).toHaveLength(profile.projects.length);
    const first = rows[0]!;
    expect(first.textContent).toContain(profile.projects[0]!.problem);
    expect(first.querySelectorAll('.chips li')).toHaveLength(profile.projects[0]!.stack.length);
  });

  it('masque le parcours quand il est vide', () => {
    const p: Profile = { ...profile, education: [], experience: [], certifications: [] };
    expect(hopsFor(p).some((s) => s.id === 'parcours')).toBe(false);
    expect(renderPage(p).root.querySelector('#parcours')).toBeNull();
  });

  it('n’affiche aucun contact inventé', () => {
    const { root } = renderPage({ ...profile, contact: empty });
    expect(root.querySelector('.contact-mail')).toBeNull();
    expect(root.querySelector('.contact-soon')).not.toBeNull();
    expect(root.querySelector('a[href^="mailto:"]')).toBeNull();
  });

  it('affiche e-mail, liens et CV quand ils sont renseignés', () => {
    const p: Profile = { ...profile, contact: { ...empty, email: 'a@b.c', github: 'https://github.com/x', cv: 'cv.pdf' } };
    const { root } = renderPage(p);
    expect(root.querySelector('.contact-mail')?.getAttribute('href')).toBe('mailto:a@b.c');
    expect(root.querySelector('.contact-links a')?.getAttribute('href')).toBe('https://github.com/x');
    expect(root.querySelectorAll('a[href="cv.pdf"]').length).toBeGreaterThan(0);
  });

  it('affiche le statut seulement s’il est renseigné', () => {
    expect(renderPage({ ...profile, availability: '' }).root.querySelector('.hero-status')).toBeNull();
    expect(renderPage({ ...profile, availability: 'Alternance sept. 2026' }).root.querySelector('.hero-status')?.textContent).toContain('Alternance');
  });

  it('la navigation reprend les sections, sans numéros', () => {
    const { nav, hops } = renderPage(profile);
    const labels = [...nav.querySelectorAll('.nav-links a')].map((a) => a.textContent);
    expect(labels).toEqual(hops.slice(1).map((h) => h.label));
    expect(nav.textContent).not.toMatch(/\d{2}/);
  });

  it('chaque section porte son nom en clair', () => {
    const { root, hops } = renderPage(profile);
    const labels = [...root.querySelectorAll('.hop-label')].map((n) => n.textContent);
    expect(labels).toEqual(hops.slice(1).map((h) => h.label));
  });

  it('chaque projet a un visuel', () => {
    const { root } = renderPage(profile);
    for (const proj of profile.projects) {
      const card = root.querySelector(`[data-project="${proj.id}"]`)!;
      expect(card.querySelector('.p-media img, .p-media svg')).not.toBeNull();
    }
  });

  it('le détail technique est replié par défaut', () => {
    const { root } = renderPage(profile);
    const blocks = [...root.querySelectorAll<HTMLDetailsElement>('details.more')];
    expect(blocks.length).toBeGreaterThan(0);
    expect(blocks.every((d) => !d.open)).toBe(true);
  });

  it('affiche le dissecteur et le SIEM seulement quand on les fournit', () => {
    const bare = renderPage(profile, { packet: null }).root;
    expect(bare.querySelector('.dx')).toBeNull();
    expect(bare.querySelector('.siem-live')).toBeNull();
    const log = new EventLog();
    log.log(10, 5710, 'Test');
    const full = renderPage(profile, { log }).root;
    expect(full.querySelector('.dx-hex')).not.toBeNull();
    expect(full.querySelector('.feed')?.textContent).toContain('alerte');
  });
});
