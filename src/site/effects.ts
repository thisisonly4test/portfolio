
/** Apparition des blocs au défilement. */
export function setupReveal(root: ParentNode, onReveal?: (el: HTMLElement) => void): void {
  const items = root.querySelectorAll<HTMLElement>('.reveal');
  if (typeof IntersectionObserver !== 'function') {
    items.forEach((el) => el.classList.add('in'));
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        e.target.classList.add('in');
        onReveal?.(e.target as HTMLElement);
        io.unobserve(e.target);
      }
    },
    { rootMargin: '0px 0px -6% 0px', threshold: 0.05 },
  );
  items.forEach((el) => io.observe(el));
}

/**
 * Avancement du paquet d'après le défilement. Le paquet reste sur un
 * équipement pendant qu'on lit la section, puis voyage vers le suivant
 * quand la section suivante arrive.
 *
 * `tops` : position de chaque section ; `line` : ligne de lecture.
 */
export function progressFrom(tops: number[], line: number): number {
  if (!tops.length || line <= tops[0]!) return 0;
  for (let i = 0; i < tops.length - 1; i++) {
    const a = tops[i]!;
    const b = tops[i + 1]!;
    if (line < b) {
      const f = (line - a) / (b - a);
      // Pause sur l'équipement pendant 55 % de la section, puis trajet.
      const travel = Math.min(1, Math.max(0, (f - 0.55) / 0.45));
      const eased = travel < 0.5 ? 2 * travel * travel : 1 - Math.pow(-2 * travel + 2, 2) / 2;
      return i + eased;
    }
  }
  return tops.length - 1;
}

export function setupJourney(options: {
  sections: HTMLElement[];
  /** Ce qui suit l'avancement : la scène 3D, ou rien si WebGL manque. */
  map: { setProgress: (p: number) => void };
  nav: HTMLElement;
  /** Appelé la première fois que le paquet atteint chaque saut. */
  onReach?: (index: number) => void;
}): () => void {
  const { sections, map, nav, onReach } = options;
  const navLinks = new Map<string, HTMLElement>();
  nav.querySelectorAll<HTMLElement>('[data-section]').forEach((a) => navLinks.set(a.dataset.section!, a));
  let tops: number[] = [];
  let reached = 0;
  onReach?.(0);
  let ticking = false;

  const measure = () => {
    tops = sections.map((s) => s.getBoundingClientRect().top + window.scrollY);
  };

  const update = () => {
    ticking = false;
    const line = window.scrollY + window.innerHeight * 0.42;
    const atBottom = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 4;
    const p = atBottom ? sections.length - 1 : progressFrom(tops, line);
    map.setProgress(p);
    const current = Math.round(p);
    const before = reached;
    reached = Math.max(reached, Math.floor(p + 0.001));
    for (let i = before + 1; i <= reached; i++) onReach?.(i);
    document.documentElement.dataset.hop = String(current);
    const id = sections[current]?.id;
    navLinks.forEach((a, key) => a.classList.toggle('active', key === id));
    nav.classList.toggle('scrolled', window.scrollY > 24);
  };

  const schedule = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(update);
  };
  const onResize = () => {
    measure();
    schedule();
  };

  measure();
  update();
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', onResize);
  // Les polices et les blocs dépliés changent la hauteur des sections.
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(onResize) : null;
  sections.forEach((s) => ro?.observe(s));
  document.fonts?.ready.then(onResize).catch(() => {});

  return () => {
    window.removeEventListener('scroll', schedule);
    window.removeEventListener('resize', onResize);
    ro?.disconnect();
  };
}

/**
 * Intensité de l'assombrissement selon la distance (en px) entre la souris et
 * la citation : 1 tout près, 0 au-delà de `far`, en douceur entre les deux.
 */
export function dimFor(dist: number, near = 40, far = 340): number {
  const t = Math.min(1, Math.max(0, (far - dist) / (far - near)));
  return t * t * (3 - 2 * t);
}

/**
 * Quand la souris s'approche de la citation du bas, le reste du site baisse
 * doucement en luminosité ; seule la citation reste dans la lumière. Un voile
 * fixe, percé d'un halo qui suit la citation au défilement.
 */
export function setupCodaDim(coda: HTMLElement, reducedMotion: boolean): void {
  const veil = document.createElement('div');
  veil.className = 'coda-dim';
  veil.setAttribute('aria-hidden', 'true');
  document.body.append(veil);

  let target = 0;
  let k = 0;
  let raf = 0;
  let last = 0;
  const pointer = { x: -1e4, y: -1e4 };

  const measure = () => {
    const r = coda.getBoundingClientRect();
    // Distance au rectangle de la citation : nulle dedans.
    const dx = Math.max(r.left - pointer.x, 0, pointer.x - r.right);
    const dy = Math.max(r.top - pointer.y, 0, pointer.y - r.bottom);
    target = coda.matches(':focus') ? 1 : dimFor(Math.hypot(dx, dy));
    return r;
  };

  const step = (now: number) => {
    const dt = last ? now - last : 16;
    last = now;
    const r = measure();
    // Lissage indépendant de la cadence : environ 0,4 s pour arriver.
    k = reducedMotion ? target : k + (target - k) * (1 - Math.exp(-dt / 140));
    if (Math.abs(target - k) < 0.002) k = target;
    veil.style.setProperty('--x', `${r.left + r.width / 2}px`);
    veil.style.setProperty('--y', `${r.top + r.height / 2}px`);
    veil.style.setProperty('--rx', `${r.width / 2 + 90}px`);
    veil.style.setProperty('--ry', `${r.height / 2 + 70}px`);
    veil.style.opacity = k.toFixed(3);
    raf = k === target && k === 0 ? 0 : requestAnimationFrame(step);
    if (!raf) last = 0;
  };
  const wake = () => {
    if (!raf) raf = requestAnimationFrame(step);
  };

  window.addEventListener(
    'pointermove',
    (e) => {
      if (e.pointerType === 'touch') return;
      pointer.x = e.clientX;
      pointer.y = e.clientY;
      wake();
    },
    { passive: true },
  );
  document.documentElement.addEventListener('pointerleave', () => {
    pointer.x = pointer.y = -1e4;
    wake();
  });
  window.addEventListener('scroll', wake, { passive: true });
  coda.addEventListener('focus', wake);
  coda.addEventListener('blur', wake);
}
