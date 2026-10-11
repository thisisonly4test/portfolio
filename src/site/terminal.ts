import type { Profile } from '../data/profile';
import { h } from '../dom';
import { esc } from '../shell/format';
import { Shell } from '../shell/shell';
import type { VirtualFS } from '../shell/vfs';
import type { Effect } from '../types';

export interface TerminalOptions {
  profile: Profile;
  fs: VirtualFS;
  bootedAt: number;
  /** Effets que le terminal ne gère pas lui-même (exit, goto, reboot). */
  onEffect: (effect: Effect) => void;
  /** Appelé pour chaque commande saisie (journal SIEM). */
  onCommand?: (line: string) => void;
}

/** Émulateur de terminal branché sur le shell virtuel. */
export function createTerminal(options: TerminalOptions) {
  const shell = new Shell(options.fs, options.profile, { bootedAt: options.bootedAt });
  const output = h('div', { class: 'term-out', role: 'log', 'aria-live': 'polite' });
  const prompt = h('span', { class: 'term-prompt', html: shell.promptHtml() });
  const input = h('input', {
    class: 'term-input',
    type: 'text',
    autocomplete: 'off',
    autocapitalize: 'off',
    spellcheck: 'false',
    'aria-label': 'Commande',
    enterkeyhint: 'send',
  });
  const ghost = h('span', { class: 'term-ghost', 'aria-hidden': 'true' });
  const line = h('div', { class: 'term-line' }, prompt, h('span', { class: 'term-field' }, input, ghost));
  const root = h('div', { class: 'term' }, output, line);

  let historyIndex = -1;
  let draft = '';

  const print = (html: string) => output.insertAdjacentHTML('beforeend', `<div class="term-row">${html || '&nbsp;'}</div>`);
  const scroll = () => (root.scrollTop = root.scrollHeight);

  /** Suggestion grisée tirée de l'historique, acceptée avec → ou Tab. */
  const updateGhost = () => {
    const v = input.value;
    const match = v ? [...shell.history].reverse().find((x) => x.startsWith(v) && x !== v) : undefined;
    ghost.dataset.before = v;
    ghost.textContent = match ? match.slice(v.length) : '';
  };

  function execute(command: string) {
    print(`${shell.promptHtml()} ${esc(command)}`);
    options.onCommand?.(command);
    const result = shell.run(command);
    for (const l of result.lines) print(l);
    for (const e of result.effects) {
      if (e.type === 'clear') output.replaceChildren();
      else options.onEffect(e);
    }
    prompt.innerHTML = shell.promptHtml();
    historyIndex = -1;
    scroll();
  }

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const cmd = input.value;
      input.value = '';
      ghost.textContent = '';
      if (cmd.trim()) execute(cmd);
      else {
        print(shell.promptHtml());
        scroll();
      }
    } else if (e.key === 'Tab') {
      e.preventDefault();
      if (ghost.textContent) {
        input.value += ghost.textContent;
      } else {
        const { value, options: opts } = shell.complete(input.value);
        input.value = value;
        if (opts.length) {
          print(`${shell.promptHtml()} ${esc(input.value)}`);
          print(opts.map((o) => `<span class="t-${o.endsWith('/') ? 'dir' : 'file'}">${esc(o)}</span>`).join('   '));
          scroll();
        }
      }
    } else if (e.key === 'ArrowRight' && ghost.textContent && input.selectionStart === input.value.length) {
      e.preventDefault();
      input.value += ghost.textContent;
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const hist = shell.history;
      if (!hist.length) return;
      if (historyIndex === -1) draft = input.value;
      if (e.key === 'ArrowUp') historyIndex = historyIndex === -1 ? hist.length - 1 : Math.max(0, historyIndex - 1);
      else if (historyIndex !== -1) historyIndex = historyIndex + 1 >= hist.length ? -1 : historyIndex + 1;
      input.value = historyIndex === -1 ? draft : hist[historyIndex]!;
    } else if (e.ctrlKey && e.key.toLowerCase() === 'l') {
      e.preventDefault();
      output.replaceChildren();
    } else if (e.ctrlKey && e.key.toLowerCase() === 'c') {
      if (input.selectionStart !== input.selectionEnd) return; // laisse copier
      e.preventDefault();
      print(`${shell.promptHtml()} ${esc(input.value)}^C`);
      input.value = '';
      scroll();
    }
    queueMicrotask(updateGhost);
  });
  input.addEventListener('input', updateGhost);

  root.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const link = target.closest<HTMLElement>('[data-cmd]');
    if (link) {
      execute(link.dataset.cmd!);
      input.focus();
      return;
    }
    if (target.closest('a')) return;
    if (!window.getSelection()?.toString()) input.focus({ preventScroll: true });
  });

  print(`<span class="t-muted">Debian GNU/Linux 13 ${esc(options.profile.hostname)} pts/0</span>`);
  print(`Tape <button type="button" class="t-link" data-cmd="help">help</button> pour la liste des commandes.`);
  print('');

  /** Ajoute des lignes HTML (déjà échappées) après coup, pour les réponses asynchrones. */
  const printLines = (...lines: string[]) => {
    for (const l of lines) print(l);
    scroll();
  };

  return { root, input, shell, execute, printLines, focus: () => input.focus({ preventScroll: true }) };
}
