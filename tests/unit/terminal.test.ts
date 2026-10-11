// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { profile } from '../../src/data/profile';
import { buildFS } from '../../src/shell/vfs';
import { createTerminal } from '../../src/site/terminal';

function make() {
  const onEffect = vi.fn();
  const term = createTerminal({ profile, fs: buildFS(profile), bootedAt: Date.now(), onEffect });
  document.body.replaceChildren(term.root);
  const press = (key: string, init: KeyboardEventInit = {}) =>
    term.input.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }));
  const type = (cmd: string) => {
    term.input.value = cmd;
    press('Enter');
  };
  const out = () => term.root.querySelector('.term-out')!.textContent ?? '';
  return { term, press, type, out, onEffect };
}

describe('terminal', () => {
  it('affiche l’accueil', () => {
    expect(make().out()).toContain('help');
  });

  it('exécute une commande avec Entrée', () => {
    const { type, out } = make();
    type('whoami');
    expect(out()).toContain('aurele@portfolio:~$ whoami');
  });

  it('clear vide la sortie', () => {
    const { type, out } = make();
    type('whoami');
    type('clear');
    expect(out()).toBe('');
  });

  it('parcourt l’historique avec les flèches', () => {
    const { type, press, term } = make();
    type('pwd');
    type('whoami');
    press('ArrowUp');
    expect(term.input.value).toBe('whoami');
    press('ArrowUp');
    expect(term.input.value).toBe('pwd');
    press('ArrowDown');
    expect(term.input.value).toBe('whoami');
    press('ArrowDown');
    expect(term.input.value).toBe('');
  });

  it('complète avec Tab', () => {
    const { press, term } = make();
    term.input.value = 'whoa';
    press('Tab');
    expect(term.input.value).toBe('whoami ');
  });

  it('transmet les effets à la page', () => {
    const { type, onEffect } = make();
    type('goto veille');
    expect(onEffect).toHaveBeenCalledWith({ type: 'goto', section: 'veille' });
    expect(onEffect).toHaveBeenCalledWith({ type: 'exit' });
  });

  it('les liens de la sortie exécutent leur commande', () => {
    const { term, out } = make();
    term.root.querySelector<HTMLButtonElement>('[data-cmd="help"]')!.click();
    expect(out()).toContain('Commandes');
  });

  it('Ctrl+C annule la ligne', () => {
    const { press, term, out } = make();
    term.input.value = 'rm truc';
    press('c', { ctrlKey: true });
    expect(term.input.value).toBe('');
    expect(out()).toContain('rm truc^C');
  });
});
