import { h } from '../dom';
import { BOOT, CRT_COMMANDS, IDLE, clock, runCrt } from './crt';
import {
  CITIES,
  cityForTimeZone,
  easeInOutCubic,
  mixShot,
  quadMatrix,
  traceRoute,
  wallArc,
  wallPoint,
  type CityId,
  type Pt,
  type Quad,
  type Shot,
  type Vec3,
} from './geometry';
import { createRoom, webglOk, type Room } from './room3d';
import './whiterose.css';

/**
 * L'endroit caché : la pièce de whiterose, en 3D. On y entre depuis le noir,
 * la caméra avance jusqu'au moniteur, et son écran devient un vrai terminal
 * posé exactement sur le verre (homographie CSS recalculée à chaque image).
 * `exit` ou Échap refont le chemin à l'envers.
 */

export interface WhiteroseOptions {
  /** Début de la visite, pour `time`. */
  bootedAt: number;
  reducedMotion: boolean;
  /** Faux si le visiteur a coupé la 3D du site : l'écran seul, sans la pièce. */
  allow3d: boolean;
  /** Journal SIEM du site. */
  log?: (level: number, rule: number, text: string) => void;
}

type Mode = 'enter' | 'screen' | 'trace' | 'leave';

const SVG = 'http://www.w3.org/2000/svg';
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const svg = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}) => {
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
  const mobile = matchMedia('(max-width: 860px)').matches;
  const room: Room | null = o.allow3d && webglOk() ? createRoom({ mobile }) : null;

  // ---------- DOM ----------
  const map = svg('svg', { class: 'wr-map', 'aria-hidden': 'true' });
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
  const world = h('div', { class: 'wr-world' }, room?.canvas ?? null, map, screen);
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
  room?.resize(vw, vh);
  let mode: Mode = 'enter';
  let leaving = false;
  const fallback = (): Shot => ({ pos: { x: 0, y: 0, z: 1 }, target: { x: 0, y: 0, z: 0 }, fov: 40 });
  const shotFor = (m: Mode): Shot => (!room ? fallback() : m === 'trace' ? room.shots.wall() : m === 'screen' ? room.shots.screen() : room.shots.room());
  let shot: Shot = shotFor('enter');
  let tween: { from: Shot; to: () => Shot; start: number; dur: number; done: () => void } | null = null;
  const pointer = { x: 0.5, y: 0.5 };
  const drift = { x: 0, y: 0 };
  let raf = 0;
  let alive = true;
  let lastKey = performance.now();
  let idleShown = false;

  function go(to: () => Shot, dur: number): Promise<void> {
    return new Promise((done) => {
      tween?.done();
      if (!motion || dur <= 0 || !room) {
        shot = to();
        tween = null;
        done();
        return;
      }
      tween = { from: structuredClone(shot), to, start: performance.now(), dur, done };
    });
  }

  let box = { w: 0, h: 0 };
  function sizeScreen() {
    box = room ? room.screenBox() : { w: Math.round(Math.min(vw * 0.92, 720)), h: Math.round(Math.min(vh * 0.72, 540)) };
    screen.style.width = `${box.w}px`;
    screen.style.height = `${box.h}px`;
    screen.style.fontSize = `${Math.max(12, Math.min(22, box.w / 30))}px`;
  }
  sizeScreen();

  // Sans WebGL : l'écran seul, à plat, au centre.
  const flatQuad = (): Quad => {
    const x = (vw - box.w) / 2;
    const y = (vh - box.h) / 2;
    return [
      { x, y },
      { x: x + box.w, y },
      { x: x + box.w, y: y + box.h },
      { x, y: y + box.h },
    ];
  };

  // ---------- traçage : arcs en 3D, projetés en SVG à chaque image ----------
  interface Mark {
    p: Vec3;
    dot: SVGCircleElement;
    ping: SVGCircleElement;
    label: SVGTextElement;
  }
  const arcs: { pts: Vec3[]; path: SVGPathElement }[] = [];
  const marks: Mark[] = [];
  const toPx = (p: Vec3): Pt => (room ? room.project(p) : { x: vw / 2, y: vh / 2 });

  function drawTrace() {
    for (const a of arcs)
      a.path.setAttribute(
        'd',
        a.pts
          .map((p, i) => {
            const q = toPx(p);
            return `${i ? 'L' : 'M'}${q.x.toFixed(1)} ${q.y.toFixed(1)}`;
          })
          .join(''),
      );
    for (const m of marks) {
      const q = toPx(m.p);
      for (const c of [m.dot, m.ping]) {
        c.setAttribute('cx', q.x.toFixed(1));
        c.setAttribute('cy', q.y.toFixed(1));
      }
      m.label.setAttribute('x', (q.x + 10).toFixed(1));
      m.label.setAttribute('y', (q.y - 8).toFixed(1));
    }
  }

  // Qualité adaptative : au-delà de 30 ms par image pendant une seconde, on allège.
  let last = 0;
  let slow = 0;
  let tier = 0;
  function frame(now: number) {
    if (!alive) return;
    raf = requestAnimationFrame(frame);
    const dt = last ? now - last : 16;
    last = now;
    if (room && tier < 4) {
      slow = dt > 30 ? slow + dt : Math.max(0, slow - dt * 0.5);
      if (slow > 1000) {
        room.degrade();
        tier++;
        slow = 0;
      }
    }
    if (tween) {
      const t = Math.min(1, (now - tween.start) / tween.dur);
      shot = mixShot(tween.from, tween.to(), easeInOutCubic(t));
      if (t >= 1) {
        const d = tween.done;
        tween = null;
        d();
      }
    }

    // Caméra tenue à la main : une respiration lente et un peu de la souris.
    const settled = mode === 'screen' || mode === 'trace';
    const k = motion && settled ? 1 : 0;
    drift.x += ((pointer.x - 0.5) * k - drift.x) * 0.04;
    drift.y += ((pointer.y - 0.5) * k - drift.y) * 0.04;
    const s = now / 1000;
    const dist = Math.hypot(shot.pos.x - shot.target.x, shot.pos.y - shot.target.y, shot.pos.z - shot.target.z);
    const amp = dist * 0.035;
    const breathe = motion ? 1 : 0;
    const live: Shot = {
      pos: {
        x: shot.pos.x + drift.x * amp + Math.sin(s * 0.31) * amp * 0.12 * breathe,
        y: shot.pos.y - drift.y * amp * 0.7 + Math.cos(s * 0.23) * amp * 0.08 * breathe,
        z: shot.pos.z,
      },
      target: shot.target,
      fov: shot.fov,
    };
    room?.render(live, s);
    if (!screen.hidden) screen.style.transform = quadMatrix(box.w, box.h, room ? room.screenQuad() : flatQuad());
    if (arcs.length || marks.length) drawTrace();
    clockEl.textContent = clock(new Date());

    if (mode === 'screen' && !booting && !busy && !idleShown && now - lastKey > 45_000) {
      idleShown = true;
      void typeLines(IDLE, 28);
    }
  }
  raf = requestAnimationFrame(frame);

  const onResize = () => {
    vw = window.innerWidth;
    vh = window.innerHeight;
    room?.resize(vw, vh);
    sizeScreen();
    if (!tween) shot = shotFor(mode);
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
    // Une touche pendant une réponse ou le démarrage : on affiche la suite d'un coup.
    if ((busy || booting) && e.key !== 'Enter') skip = true;
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
    root.classList.remove('focused');
    o.log?.(5, 100401, 'Traçage de route vers le nœud whiterose');
    await go(() => shotFor('trace'), 1800);
    const route = traceRoute(city);
    map.replaceChildren();
    let cancelled = false;
    const cancel = new Promise<void>((r) => (traceSkip = () => ((cancelled = true), r())));
    const sleep = (ms: number) => Promise.race([wait(motion ? ms : 0), cancel]);
    const at = (id: CityId) => wallPoint(CITIES[id].lon, CITIES[id].lat);

    for (let i = 0; i < route.length && !cancelled; i++) {
      const id = route[i] as CityId;
      const c = CITIES[id];
      const last = i === route.length - 1;
      if (i > 0) {
        const path = svg('path', { class: 'wr-arc', pathLength: 1 });
        map.append(path);
        arcs.push({ pts: wallArc(at(route[i - 1] as CityId), at(id)), path });
        await sleep(650);
      }
      const mark: Mark = {
        p: at(id),
        ping: svg('circle', { class: `wr-ping${last ? ' wr-ping-end' : ''}`, r: 7 }),
        dot: svg('circle', { class: `wr-dot${last ? ' wr-dot-end' : ''}`, r: 4.5 }),
        label: svg('text', { class: 'wr-label' }),
      };
      mark.label.textContent = i === 0 ? `${c.name} · toi` : last ? 'nœud ??' : c.name;
      map.append(mark.ping, mark.dot, mark.label);
      marks.push(mark);
      print(i === 0 ? `  0  ${c.name}  (toi)` : last ? `  ${i}  ???  · 0.000 ms` : `  ${i}  ${c.name}  · ${(18 + i * 37 + Math.random() * 20).toFixed(1)} ms`, last ? 'wr-alert' : 'wr-dim');
      await sleep(last ? 2600 : 420);
    }
    traceSkip = null;
    if (leaving) return;
    map.classList.add('fade');
    mode = 'screen';
    root.classList.add('focused');
    await go(() => shotFor('screen'), 1600);
    arcs.length = 0;
    marks.length = 0;
    map.replaceChildren();
    map.classList.remove('fade');
    if (!alive) return;
    await typeLines(['Quatre relais, trois continents. Tu ne les as pas choisis.', 'Moi, si.'], 26);
  }

  // ---------- entrée ----------
  async function enter() {
    room?.setScreen('text');
    if (motion) {
      await wait(30);
      black.classList.add('on');
      void typeConnect('connexion à whiterose');
    } else black.classList.add('on', 'instant');
    // Le temps de compiler les shaders, derrière le noir.
    room?.render(shot, 0);
    await wait(motion ? 1500 : 0);
    if (!alive) return;
    root.classList.add('lit');
    black.classList.remove('on');
    await wait(motion ? 600 : 0);
    const focusAt = setTimeout(() => root.classList.add('focused'), motion ? 2300 : 0);
    await go(() => shotFor('screen'), 3200);
    clearTimeout(focusAt);
    if (leaving || !alive) return;
    root.classList.add('focused');
    mode = 'screen';
    screen.hidden = false;
    requestAnimationFrame(() => {
      screen.classList.add('on');
      room?.setScreen('off');
    });
    input.focus({ preventScroll: true });
    await wait(motion ? 650 : 0);
    // Le démarrage passe dans la file : une commande tapée pendant ce temps attend son tour.
    queue = queue.then(boot);
    await queue;
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
    map.classList.add('fade');
    screen.classList.remove('on');
    screen.classList.add('off');
    await wait(motion ? 420 : 0);
    screen.hidden = true;
    root.classList.remove('focused');
    const fadeAt = setTimeout(() => black.classList.add('on'), motion ? 1300 : 0);
    await go(() => shotFor('leave'), 2000);
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
    room?.dispose();
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
