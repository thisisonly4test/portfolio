import type { Profile } from '../data/profile';
import { h } from '../dom';
import type { VirtualFS } from '../shell/vfs';
import type { Effect } from '../types';
import { createTerminal } from './terminal';

export interface ConsoleOptions {
  profile: Profile;
  fs: VirtualFS;
  bootedAt: number;
  onEffect: (effect: Effect) => void;
  onCommand?: (line: string) => void;
}

/** Touches qui ouvrent le terminal : ² sur AZERTY, ` sur QWERTY. */
export const TOGGLE_KEYS = ['²', '`'];

/**
 * Terminal déroulant, façon console de jeu : il descend du haut de l'écran
 * et se ferme avec Échap, `exit` ou la même touche.
 */
export function createConsole(options: ConsoleOptions) {
  let lastFocus: HTMLElement | null = null;
  const term = createTerminal({
    ...options,
    onEffect: (e) => {
      if (e.type === 'exit') close();
      else options.onEffect(e);
    },
  });
  const closeBtn = h('button', { class: 'console-close', type: 'button', 'aria-label': 'Fermer le terminal' }, 'Échap');
  const panel = h(
    'div',
    { class: 'console', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Terminal', hidden: true },
    h('div', { class: 'console-bar' }, h('span', {}, `${options.profile.username}@${options.profile.hostname}: ~`), closeBtn),
    term.root,
  );
  const backdrop = h('div', { class: 'console-backdrop', hidden: true });
  closeBtn.addEventListener('click', () => close());
  backdrop.addEventListener('click', () => close());

  function open() {
    if (!panel.hidden) return;
    lastFocus = document.activeElement as HTMLElement | null;
    panel.hidden = false;
    backdrop.hidden = false;
    requestAnimationFrame(() => {
      panel.classList.add('open');
      backdrop.classList.add('open');
    });
    term.focus();
  }

  function close() {
    if (panel.hidden) return;
    panel.classList.remove('open');
    backdrop.classList.remove('open');
    setTimeout(() => {
      panel.hidden = true;
      backdrop.hidden = true;
    }, 220);
    lastFocus?.focus({ preventScroll: true });
  }

  const toggle = () => (panel.hidden ? open() : close());

  window.addEventListener('keydown', (e) => {
    const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
    if (TOGGLE_KEYS.includes(e.key) && (!typing || e.target === term.input)) {
      e.preventDefault();
      toggle();
    } else if (e.key === 'Escape' && !panel.hidden) {
      e.preventDefault();
      close();
    }
  });

  return { elements: [backdrop, panel], open, close, toggle, terminal: term, isOpen: () => !panel.hidden };
}
