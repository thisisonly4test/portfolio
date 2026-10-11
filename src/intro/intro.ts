import type { Profile } from '../data/profile';
import { h, sleep } from '../dom';
import { bootScript, spinnerFrame, type BootLine } from './sequence';

export interface IntroOptions {
  profile: Profile;
  /** Multiplicateur de vitesse : 1 = normal. */
  speed: number;
  /** Passer les messages de démarrage et aller à la connexion. */
  skipBoot?: boolean;
  /**
   * Mode sans friction : la connexion se fait toute seule, et n'importe
   * quel clic, touche ou défilement passe l'intro. Sinon, il faut cliquer
   * sur le compte (version complète, pour « Rejouer l'intro »).
   */
  auto?: boolean;
}

export function formatClock(d: Date): string {
  return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

/**
 * Intro : messages de démarrage (noyau puis systemd), puis écran de
 * connexion avec le compte. Le mot de passe se tape tout seul. Échap ou
 * « Passer » vont directement au site. Se résout quand l'intro a disparu.
 */
export async function runIntro(root: HTMLElement, options: IntroOptions): Promise<void> {
  const skip = new AbortController();
  const screen = h('div', { class: 'intro', role: 'dialog', 'aria-label': 'Démarrage du portfolio' });
  const skipBtn = h('button', { class: 'intro-skip', type: 'button', onclick: () => skip.abort() }, 'Passer l’intro', h('kbd', {}, 'Échap'));
  const auto = options.auto === true;
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape' || (auto && !e.ctrlKey && !e.metaKey && !e.altKey)) skip.abort();
  };
  // Vouloir lire, c'est vouloir passer : défilement ou geste sur l'écran.
  const onScrollIntent = () => skip.abort();
  const onPointer = (e: PointerEvent) => {
    if (auto && !(e.target as HTMLElement).closest('.intro-skip')) skip.abort();
  };
  window.addEventListener('keydown', onKey);
  window.addEventListener('wheel', onScrollIntent, { passive: true });
  window.addEventListener('touchmove', onScrollIntent, { passive: true });
  screen.addEventListener('pointerdown', onPointer);
  if (auto) skipBtn.firstChild!.textContent = 'Clique ou fais défiler pour passer ';
  screen.append(skipBtn);
  root.append(screen);
  document.documentElement.classList.add('intro-open');

  try {
    // En mode auto, le démarrage défile plus vite : on garde l'ambiance, pas l'attente.
    if (!options.skipBoot) await boot(screen, auto ? options.speed * 1.6 : options.speed, skip.signal);
    if (!skip.signal.aborted) await login(screen, options.profile, options.speed, skip.signal, auto);
  } finally {
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('wheel', onScrollIntent);
    window.removeEventListener('touchmove', onScrollIntent);
    skipBtn.remove();
    document.documentElement.classList.remove('intro-open');
    screen.classList.add('leaving');
    await sleep(skip.signal.aborted ? 350 : 750);
    screen.remove();
  }
}

async function boot(screen: HTMLElement, speed: number, signal: AbortSignal): Promise<void> {
  const log = h('div', { class: 'boot-log', 'aria-hidden': 'true' });
  const wrap = h('div', { class: 'boot' }, log);
  screen.append(wrap);
  const wait = (ms: number) => sleep(ms / speed, signal);
  const scroll = () => (wrap.scrollTop = wrap.scrollHeight);

  for (const line of bootScript()) {
    await wait(line.delay);
    if (signal.aborted) break;
    if (line.kind === 'wait') await waitLine(log, line, wait, signal, speed, scroll);
    else log.append(renderLine(line));
    scroll();
  }
  await wait(350);
  wrap.classList.add('done');
  await sleep(signal.aborted ? 0 : 250);
  wrap.remove();
}

function renderLine(line: BootLine): HTMLElement {
  switch (line.kind) {
    case 'kernel': {
      const [, ts, msg] = /^(\[[^\]]+\])(.*)$/.exec(line.text) ?? [];
      return h('div', {}, h('span', { class: 'ts' }, ts ?? ''), msg ?? line.text);
    }
    case 'welcome':
      return h('div', { class: 'welcome', html: line.text });
    case 'blank':
      return h('div', { html: '&nbsp;' });
    default:
      return okLine(line.text);
  }
}

function okLine(html: string): HTMLElement {
  return h('div', {}, '[', h('span', { class: 'st ok' }, '  OK  '), '] ', h('span', { html }));
}

async function waitLine(
  log: HTMLElement,
  line: BootLine,
  wait: (ms: number) => Promise<void>,
  signal: AbortSignal,
  speed: number,
  scroll: () => void,
): Promise<void> {
  const status = h('span', { class: 'st wait' });
  const label = h('span');
  const el = h('div', {}, '[', status, '] ', label);
  log.append(el);
  const holdMs = (line.hold ?? 1000) / speed;
  const started = performance.now();
  let step = 0;
  while (!signal.aborted) {
    const elapsed = performance.now() - started;
    status.innerHTML = spinnerFrame(step++);
    label.textContent = `${line.text} (${Math.max(1, Math.ceil((elapsed * speed) / 500))}s / 1min 30s)`;
    scroll();
    if (elapsed >= holdMs) break;
    await wait(110);
  }
  el.replaceWith(okLine(line.doneText ?? line.text));
}

/** Écran de connexion : le compte, puis le mot de passe tapé tout seul. */
async function login(screen: HTMLElement, profile: Profile, speed: number, signal: AbortSignal, auto = false): Promise<void> {
  const clock = h('span', {}, formatClock(new Date()));
  const timer = setInterval(() => (clock.textContent = formatClock(new Date())), 1000);

  const field = h('div', { class: 'pw-field', 'aria-hidden': 'true' }, h('span', { class: 'pw-dots' }), h('span', { class: 'caret' }));
  const status = h('p', { class: 'login-status', role: 'status' }, 'Cliquer pour se connecter');
  const user = h(
    'button',
    { class: 'user', type: 'button', 'aria-label': `Se connecter en tant que ${profile.username}` },
    h('span', { class: 'user-avatar', 'aria-hidden': 'true' }, profile.username.charAt(0)),
    h('span', { class: 'user-name' }, profile.username),
  );
  const panel = h('div', { class: 'login-panel' }, user, field, status);
  const view = h(
    'div',
    { class: 'login' },
    h('header', { class: 'login-bar' }, h('span', {}, `${profile.hostname} · tty1`), clock),
    panel,
    h('footer', { class: 'login-foot' }, 'Debian GNU/Linux 13'),
  );
  screen.append(view);
  setTimeout(() => user.focus({ preventScroll: true }), 50);

  // Attend le clic (ou Entrée, ou l'abandon). En mode auto, se connecte seul.
  if (auto) status.textContent = 'Connexion automatique…';
  await new Promise<void>((resolve) => {
    if (auto) setTimeout(() => go(), 450 / speed);
    function go() {
      window.removeEventListener('keydown', onKey);
      resolve();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        go();
      }
    }
    user.addEventListener('click', go, { once: true });
    window.addEventListener('keydown', onKey);
    signal.addEventListener('abort', go, { once: true });
  });

  if (!signal.aborted) {
    panel.classList.add('typing');
    status.textContent = 'Mot de passe';
    const dots = field.querySelector('.pw-dots')!;
    await sleep(300 / speed, signal);
    for (let i = 0; i < (auto ? 8 : 12) && !signal.aborted; i++) {
      dots.textContent += '•';
      await sleep((45 + Math.random() * 55) / speed, signal);
    }
    await sleep(200 / speed, signal);
    panel.classList.add('auth');
    status.textContent = 'Authentification…';
    await sleep(450 / speed, signal);
    panel.classList.add('ok');
    status.textContent = `Session ouverte pour ${profile.username}`;
    await sleep(450 / speed, signal);
    if (!signal.aborted && !auto) await traceroute(view, profile, speed, signal);
  }
  clearInterval(timer);
}

/** Dernier écran : le trajet du paquet, annoncé avant que le site n'apparaisse. */
async function traceroute(view: HTMLElement, profile: Profile, speed: number, signal: AbortSignal): Promise<void> {
  const hops: [string, string, string][] = [
    ['fw-01', '203.0.113.1', '0.42'],
    ['web-01', '172.16.0.10', '0.87'],
    ['sw-core', '10.0.10.1', '1.12'],
    ['srv-ad', '10.0.20.10', '1.38'],
    ['siem', '10.0.30.5', '1.61'],
    ['wg0', '10.8.0.1', '1.94'],
  ];
  const out = h('div', { class: 'trace', 'aria-hidden': 'true' });
  out.append(h('p', {}, h('span', { class: 'prompt' }, `${profile.username}@${profile.hostname}:~$`), ' traceroute aurele'));
  out.append(h('p', { class: 'trace-dim' }, `traceroute to aurele (${profile.hostname}), ${hops.length + 1} hops max, 60 byte packets`));
  view.classList.add('tracing');
  view.append(out);
  await sleep(250 / speed, signal);
  out.append(h('p', {}, ' 1  ton-navigateur (192.168.1.37)  0.00 ms'));
  for (const [i, [host, ip, ms]] of hops.entries()) {
    await sleep(110 / speed, signal);
    if (signal.aborted) return;
    out.append(h('p', {}, ` ${i + 2}  ${host} (${ip})  ${ms} ms`));
  }
  await sleep(420 / speed, signal);
}
