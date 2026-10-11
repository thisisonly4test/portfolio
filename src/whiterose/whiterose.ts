import roomUrl from '../assets/whiterose-room.webp';
import { h } from '../dom';
import { BOOT, CRT_COMMANDS, IDLE, clock, runCrt } from './crt';
import {
  CITIES,
  IMAGE,
  LAMP,
  SCREEN,
  cityForTimeZone,
  easeInOutCubic,
  mixView,
  project,
  quadMatrix,
  roomView,
  screenBox,
  screenView,
  stageTransform,
  traceRoute,
  wallView,
  type CityId,
  type Quad,
  type View,
} from './geometry';
import './whiterose.css';

/**
 * L'endroit caché : la pièce de `whiterose-room.webp`. On y entre depuis le
 * noir, la caméra plonge vers le moniteur, et son écran devient un vrai
 * terminal posé exactement sur le verre (homographie CSS). `exit` ou Échap
 * refont le chemin à l'envers.
 */

export interface WhiteroseOptions {
  /** Début de la visite, pour `time`. */
  bootedAt: number;
  reducedMotion: boolean;
  /** Journal SIEM du site. */
  log?: (level: number, rule: number, text: string) => void;
}

type Mode = 'enter' | 'screen' | 'trace' | 'leave';

const SVG = 'http://www.w3.org/2000/svg';
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const svg = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>) => {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
};

let current: Promise<void> | null = null;

/** Ouvre la pièce ; la promesse se résout une fois revenu au site. */
export function openWhiterose(options: WhiteroseOptions): Promise<void> {
  current ??= run(options).finally(() => (current = null));
  return current;
}

async function run(o: WhiteroseOptions): Promise<void> {
  const motion = !o.reducedMotion;
  const tz = (() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    } catch {
      return '';
    }
  })();
  const city = cityForTimeZone(tz);

  // ---------- DOM ----------
  const room = h('img', { class: 'wr-room', src: roomUrl, alt: '', width: IMAGE.w, height: IMAGE.h, decoding: 'async', draggable: 'false' });
  const lamp = h('div', { class: 'wr-lamp' });
  lamp.style.left = `${LAMP.x}px`;
  lamp.style.top = `${LAMP.y}px`;
  const map = svg('svg', { class: 'wr-map', viewBox: `0 0 ${IMAGE.w} ${IMAGE.h}`, 'aria-hidden': 'true' });
  const stage = h('div', { class: 'wr-stage' }, room, lamp, h('div', { class: 'wr-monitor-glow' }), map);

  const clockEl = h('span', { class: 'wr-clock' });
  const out = h('div', { class: 'wr-out', role: 'log', 'aria-live': 'polite' });
  const typed = h('span', { class: 'wr-typed' });
  const input = h('input', {
    class: 'wr-input',
    type: 'text',
    autocomplete: 'off',
    autocapitalize: 'off',
    spellcheck: 'false',
    enterkeyhint: 'send',
    'aria-label': 'Commande',
  });
  const line = h('div', { class: 'wr-line' }, h('span', { class: 'wr-ps' }, '>'), typed, h('span', { class: 'wr-cursor', 'aria-hidden': 'true' }), input);
  const crt = h('div', { class: 'wr-crt' }, h('div', { class: 'wr-bar' }, h('span', {}, 'WR-OS // nœud inconnu'), clockEl), out, line);
  const screen = h('div', { class: 'wr-screen', hidden: true }, crt);
  const world = h('div', { class: 'wr-world' }, stage, screen);
  const connect = h('p', { class: 'wr-connect' });
  const black = h('div', { class: 'wr-black' }, connect);
  const exitBtn = h('button', { class: 'wr-exit', type: 'button' }, 'Échap · quitter');
  const root = h(
    'div',
    { class: 'wr', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'whiterose' },
    world,
    h('div', { class: 'wr-vignette', 'aria-hidden': 'true' }),
    h('div', { class: 'wr-grain', 'aria-hidden': 'true' }),
    exitBtn,
    black,
  );

  const lastFocus = document.activeElement as HTMLElement | null;
  document.documentElement.classList.add('wr-open');
  document.body.append(root);
  o.log?.(7, 100400, 'Tunnel ouvert vers un hôte inconnu (whiterose)');

  // ---------- caméra ----------
  let vw = window.innerWidth;
  let vh = window.innerHeight;
  let mode: Mode = 'enter';
  let view: View = roomView(vw, vh);
  let tween: { from: View; to: () => View; start: number; dur: number; done: () => void } | null = null;
  const pointer = { x: 0.5, y: 0.5 };
  const drift = { x: 0, y: 0 };
  let raf = 0;
  let alive = true;
  let lastKey = performance.now();
  let idleShown = false;

  let leaving = false;
  const target = (): View => (mode === 'trace' ? wallView(vw, vh) : mode === 'screen' ? screenView(vw, vh) : roomView(vw, vh));

  function go(to: () => View, dur: number): Promise<void> {
    return new Promise((done) => {
      tween?.done();
      if (!motion || dur <= 0) {
        view = to();
        tween = null;
        done();
        return;
      }
      tween = { from: { ...view }, to, start: performance.now(), dur, done };
    });
  }

  function sizeScreen() {
    const box = screenBox(vw, vh);
    screen.style.width = `${box.w}px`;
    screen.style.height = `${box.h}px`;
    screen.style.fontSize = `${Math.max(12, Math.min(22, box.w / 30))}px`;
    return box;
  }
  let box = sizeScreen();

  function frame(now: number) {
    if (!alive) return;
    raf = requestAnimationFrame(frame);
    if (tween) {
      const t = Math.min(1, (now - tween.start) / tween.dur);
      view = mixView(tween.from, tween.to(), easeInOutCubic(t));
      if (t >= 1) {
        const d = tween.done;
        tween = null;
        d();
      }
    }

    // Caméra tenue à la main : une respiration lente et un peu de la souris.
    const settled = mode === 'screen' || mode === 'trace';
    const k = motion && settled ? 1 : 0;
    drift.x += ((pointer.x - 0.5) * 5 * k - drift.x) * 0.04;
    drift.y += ((pointer.y - 0.5) * 3.5 * k - drift.y) * 0.04;
    const s = now / 1000;
    const v: View = {
      cx: view.cx + drift.x + (motion ? Math.sin(s * 0.31) * 0.7 : 0),
      cy: view.cy + drift.y + (motion ? Math.cos(s * 0.23) * 0.45 : 0),
      z: view.z,
    };
    stage.style.transform = stageTransform(v, vw, vh);
    if (!screen.hidden) {
      const q = SCREEN.map((p) => project(p, v, vw, vh)) as Quad;
      screen.style.transform = quadMatrix(box.w, box.h, q);
    }

    // Lampe : un vieux néon, presque stable.
    if (motion) {
      const dip = Math.random() < 0.012 ? 0.55 : 1;
      lamp.style.opacity = String((0.78 + Math.sin(s * 9.3) * 0.04 + Math.sin(s * 23.1) * 0.03) * dip);
    }
    clockEl.textContent = clock(new Date());

    if (mode === 'screen' && !idleShown && now - lastKey > 45_000) {
      idleShown = true;
      void typeLines(IDLE, 28);
    }
  }
  raf = requestAnimationFrame(frame);

  const onResize = () => {
    vw = window.innerWidth;
    vh = window.innerHeight;
    box = sizeScreen();
    if (!tween) view = target();
  };
  const onPointer = (e: PointerEvent) => {
    pointer.x = e.clientX / vw;
    pointer.y = e.clientY / vh;
  };
  window.addEventListener('resize', onResize);
  window.addEventListener('pointermove', onPointer);

  // ---------- terminal du moniteur ----------
  let booting = false;
  let skip = false;
  const history: string[] = [];
  let hIndex = 0;

  const scroll = () => (out.scrollTop = out.scrollHeight);
  const print = (text: string, cls = '') => {
    const p = h('p', { class: cls });
    p.textContent = text || ' ';
    out.append(p);
    while (out.childElementCount > 120) out.firstElementChild?.remove();
    scroll();
    return p;
  };

  async function typeLines(lines: string[], speed: number, cls = '') {
    for (const text of lines) {
      if (!alive) return;
      if (!motion || skip || !text || speed <= 0) {
        print(text, cls);
        if (motion && !skip) await wait(text ? (speed <= 0 ? 35 : 60) : 220);
        continue;
      }
      const p = print('', cls);
      for (let i = 1; i <= text.length && alive; i++) {
        if (skip) {
          p.textContent = text;
          break;
        }
        p.textContent = text.slice(0, i);
        scroll();
        await wait(speed + (text[i - 1] === ',' || text[i - 1] === '.' ? speed * 5 : 0));
      }
      await wait(120);
    }
  }

  async function boot() {
    booting = true;
    skip = false;
    await typeLines(BOOT.slice(0, 4), 10, 'wr-dim');
    await typeLines(BOOT.slice(4), 34);
    booting = false;
    lastKey = performance.now();
  }

  const mirror = () => {
    typed.textContent = input.value;
  };

  // Une commande à la fois : celles tapées pendant une réponse attendent leur tour.
  let queue = Promise.resolve();
  let busy = false;
  const enqueue = (raw: string) => {
    if (busy) skip = true;
    queue = queue.then(async () => {
      busy = true;
      skip = false;
      await execute(raw);
      busy = false;
    });
  };

  async function execute(raw: string) {
    if (leaving) return;
    const text = raw.trim();
    print(`> ${raw}`, 'wr-echo');
    if (text) {
      history.push(text);
      hIndex = history.length;
    }
    const res = runCrt(text, { now: new Date(), elapsedMs: Date.now() - o.bootedAt, city: CITIES[city].name, random: Math.random() });
    if (res.action === 'clear') {
      out.replaceChildren();
      return;
    }
    await typeLines(res.lines, res.voice ? 26 : 0);
    if (res.action === 'exit') void leave();
    else if (res.action === 'trace') await trace();
  }

  input.addEventListener('input', mirror);
  input.addEventListener('keydown', (e) => {
    lastKey = performance.now();
    if (busy && e.key !== 'Enter') skip = true;
    if (booting) {
      skip = true;
      if (e.key === 'Enter') e.preventDefault();
      return;
    }
    if (mode !== 'screen') return;
    if (e.key === 'Enter') {
      e.preventDefault();
      const v = input.value;
      input.value = '';
      mirror();
      enqueue(v);
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      hIndex = Math.max(0, Math.min(history.length, hIndex + (e.key === 'ArrowUp' ? -1 : 1)));
      input.value = history[hIndex] ?? '';
      mirror();
    } else if (e.key === 'Tab') {
      e.preventDefault();
      const hit = Object.keys(CRT_COMMANDS).filter((c) => c.startsWith(input.value.trim()));
      if (hit.length === 1) input.value = hit[0]!;
      mirror();
    } else if (e.key === 'l' && e.ctrlKey) {
      e.preventDefault();
      out.replaceChildren();
    }
  });

  // ---------- trace sur la carte ----------
  let traceSkip: (() => void) | null = null;

  async function trace() {
    mode = 'trace';
    o.log?.(5, 100401, 'Traçage de route vers le nœud whiterose');
    await go(() => wallView(vw, vh), 1700);
    const route = traceRoute(city);
    map.replaceChildren();
    const g = svg('g', { class: 'wr-route' });
    map.append(g);
    let cancelled = false;
    const cancel = new Promise<void>((r) => (traceSkip = () => ((cancelled = true), r())));
    const sleep = (ms: number) => Promise.race([wait(motion ? ms : 0), cancel]);

    for (let i = 0; i < route.length && !cancelled; i++) {
      const id = route[i] as CityId;
      const c = CITIES[id];
      const last = i === route.length - 1;
      if (i > 0) {
        const p = CITIES[route[i - 1] as CityId];
        const len = Math.hypot(c.x - p.x, c.y - p.y);
        const mid = { x: (p.x + c.x) / 2, y: Math.min(p.y, c.y) - len * 0.18 };
        const path = svg('path', { class: 'wr-arc', d: `M${p.x} ${p.y} Q${mid.x} ${mid.y} ${c.x} ${c.y}`, pathLength: 1 });
        g.append(path);
        await sleep(650);
      }
      g.append(
        svg('circle', { class: `wr-ping${last ? ' wr-ping-end' : ''}`, cx: c.x, cy: c.y, r: 1.4 }),
        svg('circle', { class: `wr-dot${last ? ' wr-dot-end' : ''}`, cx: c.x, cy: c.y, r: 1.1 }),
      );
      const label = svg('text', { class: 'wr-label', x: c.x + 2.4, y: c.y - 1.8 });
      label.textContent = i === 0 ? `${c.name} · toi` : last ? 'nœud ??' : c.name;
      g.append(label);
      print(i === 0 ? `  0  ${c.name}  (toi)` : last ? `  ${i}  ???  · 0.000 ms` : `  ${i}  ${c.name}  · ${(18 + i * 37 + Math.random() * 20).toFixed(1)} ms`, last ? 'wr-alert' : 'wr-dim');
      await sleep(last ? 2600 : 420);
    }
    traceSkip = null;
    if (leaving) return;
    map.classList.add('fade');
    mode = 'screen';
    await go(() => screenView(vw, vh), 1500);
    map.replaceChildren();
    map.classList.remove('fade');
    if (!alive) return;
    await typeLines(['Quatre relais, trois continents. Tu ne les as pas choisis.', 'Moi, si.'], 26);
  }

  // ---------- entrée ----------
  async function enter() {
    if (motion) {
      await wait(30);
      black.classList.add('on');
      void typeConnect('connexion à whiterose');
    } else black.classList.add('on', 'instant');
    await Promise.all([room.decode().catch(() => undefined), wait(motion ? 1500 : 0)]);
    if (!alive) return;
    view = roomView(vw, vh);
    root.classList.add('lit');
    black.classList.remove('on');
    await wait(motion ? 700 : 0);
    const focusAt = setTimeout(() => root.classList.add('focused'), motion ? 2000 : 0);
    await go(() => screenView(vw, vh), 2900);
    clearTimeout(focusAt);
    if (leaving || !alive) return;
    root.classList.add('focused');
    mode = 'screen';
    screen.hidden = false;
    box = sizeScreen();
    requestAnimationFrame(() => screen.classList.add('on'));
    input.focus({ preventScroll: true });
    await wait(motion ? 650 : 0);
    await boot();
  }

  async function typeConnect(text: string) {
    for (let i = 0; i <= text.length && alive && black.classList.contains('on'); i++) {
      connect.textContent = text.slice(0, i);
      await wait(38);
    }
    for (let n = 0; n < 6 && alive && black.classList.contains('on'); n++) {
      connect.textContent = text + '.'.repeat((n % 3) + 1);
      await wait(260);
    }
  }

  // ---------- sortie ----------
  let resolveClosed!: () => void;
  const closed = new Promise<void>((r) => (resolveClosed = r));

  async function leave() {
    if (leaving) return;
    leaving = true;
    traceSkip?.();
    skip = true;
    mode = 'leave';
    input.blur();
    screen.classList.remove('on');
    screen.classList.add('off');
    await wait(motion ? 420 : 0);
    screen.hidden = true;
    root.classList.remove('focused');
    const fadeAt = setTimeout(() => black.classList.add('on'), motion ? 1100 : 0);
    await go(() => roomView(vw, vh), 1700);
    clearTimeout(fadeAt);
    black.classList.add('on');
    connect.textContent = '';
    await wait(motion ? 500 : 0);
    alive = false;
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', onResize);
    window.removeEventListener('pointermove', onPointer);
    window.removeEventListener('keydown', onKey, true);
    root.classList.add('gone');
    await wait(motion ? 450 : 0);
    root.remove();
    document.documentElement.classList.remove('wr-open');
    lastFocus?.focus({ preventScroll: true });
    resolveClosed();
  }

  // Échap et les touches du terminal du site ne doivent pas traverser la pièce.
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (mode === 'trace' && traceSkip) traceSkip();
      else if (mode === 'screen' || mode === 'trace') void leave();
      return;
    }
    if (e.key === '²' || e.key === '`') {
      e.stopImmediatePropagation();
      if (e.target !== input) e.preventDefault();
      return;
    }
    if (mode === 'trace' && traceSkip && e.key !== 'Tab') traceSkip();
    if (mode === 'screen' && e.target !== input && !e.metaKey && !e.ctrlKey) input.focus({ preventScroll: true });
  };
  window.addEventListener('keydown', onKey, true);
  root.addEventListener('pointerdown', (e) => {
    if (e.target === exitBtn) return;
    if (mode === 'trace') traceSkip?.();
    if (mode === 'screen') setTimeout(() => input.focus({ preventScroll: true }), 0);
  });
  exitBtn.addEventListener('click', () => void leave());

  void enter();
  return closed;
}
