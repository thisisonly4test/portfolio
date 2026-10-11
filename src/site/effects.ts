
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
