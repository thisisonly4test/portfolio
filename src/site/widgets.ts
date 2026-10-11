import { h, prefersReducedMotion } from '../dom';
import { CHALLENGES, type Ctf } from './ctf';
import { hexRows, printable, type Field, type Layer, type Packet } from './dissect';
import type { EventLog, SecEvent } from './events';

// ---------------------------------------------------------------------------
// Dissecteur de paquet façon Wireshark
// ---------------------------------------------------------------------------

/**
 * Arbre des couches à gauche, vidage hexadécimal à droite. Survoler un champ
 * allume ses octets, et inversement. « Chiffrer » remplace la charge HTTP
 * par des octets aléatoires, comme le ferait TLS.
 */
export function renderDissector(packet: Packet): HTMLElement {
  const layers: Layer[] = ['Ethernet II', 'IPv4', 'TCP', 'HTTP'];
  const byteEls: HTMLElement[] = [];
  const asciiEls: HTMLElement[] = [];
  const fieldEls = new Map<Field, HTMLElement>();
  const original = packet.bytes.slice();
  const bytes = packet.bytes.slice();
  let encrypted = false;

  const summary: Record<Layer, string> = {
    'Ethernet II': `${packet.fields[1]!.value} → ${packet.fields[0]!.value}`,
    IPv4: `${field('IPv4', 'Source').value} → ${field('IPv4', 'Destination').value}`,
    TCP: `${field('TCP', 'Port source').value} → ${field('TCP', 'Port destination').value}, [PSH, ACK]`,
    HTTP: 'GET / HTTP/1.1',
  };
  function field(layer: Layer, name: string) {
    return packet.fields.find((f) => f.layer === layer && f.name === name)!;
  }

  const tree = h('div', { class: 'dx-tree', role: 'tree', 'aria-label': 'Couches du paquet' });
  for (const layer of layers) {
    const list = h('ul', { role: 'group' });
    for (const f of packet.fields.filter((x) => x.layer === layer)) {
      const li =
        layer === 'HTTP'
          ? h('li', { role: 'treeitem', tabindex: '0' }, h('span', { class: 'dx-v' }, f.value))
          : h('li', { role: 'treeitem', tabindex: '0' }, h('span', { class: 'dx-k' }, `${f.name} : `), h('span', { class: 'dx-v' }, f.value));
      li.addEventListener('mouseenter', () => highlight(f));
      li.addEventListener('focus', () => highlight(f));
      li.addEventListener('mouseleave', () => highlight(null));
      fieldEls.set(f, li);
      list.append(li);
    }
    tree.append(
      h(
        'details',
        { class: `dx-layer dx-${layer.replace(/\W/g, '').toLowerCase()}`, open: layer !== 'Ethernet II' },
        h('summary', {}, h('strong', {}, layer), h('span', {}, summary[layer])),
        list,
      ),
    );
  }

  const hex = h('div', { class: 'dx-hex', 'aria-hidden': 'true' });
  for (const row of hexRows(bytes)) {
    const start = parseInt(row.offset, 16);
    const hexCells = h('span', { class: 'dx-bytes' });
    const asciiCells = h('span', { class: 'dx-ascii' });
    row.bytes.forEach((b, k) => {
      const i = start + k;
      const cell = h('span', { 'data-i': String(i) }, b.toString(16).padStart(2, '0'));
      const ch = h('span', { 'data-i': String(i) }, printable(b));
      byteEls[i] = cell;
      asciiEls[i] = ch;
      hexCells.append(cell);
      asciiCells.append(ch);
    });
    hex.append(h('div', { class: 'dx-row' }, h('span', { class: 'dx-off' }, row.offset), hexCells, asciiCells));
  }
  hex.addEventListener('mouseover', (e) => {
    const i = Number((e.target as HTMLElement).dataset.i);
    if (Number.isNaN(i)) return;
    const f = packet.fields.find((x) => i >= x.start && i < x.end);
    highlight(f ?? null);
  });
  hex.addEventListener('mouseleave', () => highlight(null));

  let lit: Field | null = null;
  function highlight(f: Field | null) {
    if (lit) {
      for (let i = lit.start; i < lit.end; i++) {
        byteEls[i]?.classList.remove('on');
        asciiEls[i]?.classList.remove('on');
      }
      fieldEls.get(lit)?.classList.remove('on');
    }
    lit = f;
    if (!f) return;
    for (let i = f.start; i < f.end; i++) {
      byteEls[i]?.classList.add('on');
      asciiEls[i]?.classList.add('on');
    }
    fieldEls.get(f)?.classList.add('on');
  }

  const toggle = h('button', { class: 'btn small', type: 'button', 'aria-pressed': 'false' }, 'Chiffrer avec TLS');
  const note = h('span', { class: 'dx-note' }, 'En clair, tout le réseau lit ton agent utilisateur.');
  toggle.addEventListener('click', () => {
    encrypted = !encrypted;
    toggle.setAttribute('aria-pressed', String(encrypted));
    toggle.textContent = encrypted ? 'Déchiffrer' : 'Chiffrer avec TLS';
    note.textContent = encrypted ? 'Chiffré : le réseau ne voit plus que du bruit. Les en-têtes IP et TCP, eux, restent lisibles.' : 'En clair, tout le réseau lit ton agent utilisateur.';
    const random = new Uint8Array(packet.payload.end - packet.payload.start);
    globalThis.crypto.getRandomValues(random);
    for (let i = packet.payload.start; i < packet.payload.end; i++) {
      bytes[i] = encrypted ? random[i - packet.payload.start]! : original[i]!;
      const el = byteEls[i]!;
      const ch = asciiEls[i]!;
      const update = () => {
        el.textContent = bytes[i]!.toString(16).padStart(2, '0');
        ch.textContent = printable(bytes[i]!);
        el.classList.toggle('enc', encrypted);
        ch.classList.toggle('enc', encrypted);
      };
      // Vague de gauche à droite, octet par octet.
      if (prefersReducedMotion()) update();
      else setTimeout(update, (i - packet.payload.start) * 2.2);
    }
    tree.querySelector('.dx-http')?.classList.toggle('enc', encrypted);
  });

  const total = packet.bytes.length;
  return h(
    'figure',
    { class: 'dx' },
    h('figcaption', { class: 'dx-bar' }, h('span', {}, `Trame 1 : ${total} octets sur le fil (${total * 8} bits)`), h('span', { class: 'dx-live' }, '● capture')),
    h('div', { class: 'dx-body' }, tree, hex),
    h('div', { class: 'dx-foot' }, toggle, note),
  );
}

// ---------------------------------------------------------------------------
// SIEM : journal en direct des actions du visiteur
// ---------------------------------------------------------------------------

const levelClass = (l: number) => (l >= 10 ? 'high' : l >= 5 ? 'mid' : 'low');
const clock = (d: Date) => d.toLocaleTimeString('fr-FR');

export function renderSiem(log: EventLog): HTMLElement {
  const rows = h('ol', { class: 'feed', 'aria-live': 'polite', 'aria-label': 'Événements de sécurité' });
  const alerts = h('strong', {}, '0');
  const total = h('strong', {}, '0');
  const spark = h('div', { class: 'spark', 'aria-hidden': 'true' });
  const BUCKETS = 24;
  for (let i = 0; i < BUCKETS; i++) spark.append(h('span'));

  const addRow = (e: SecEvent, animate: boolean) => {
    const li = h(
      'li',
      { class: `lvl-${levelClass(e.level)}${animate ? ' new' : ''}` },
      h('time', {}, clock(e.time)),
      h('span', { class: 'f-lvl', title: `Niveau ${e.level}, règle ${e.rule}` }, e.level >= 10 ? 'alerte' : e.level >= 5 ? 'suspect' : 'info'),
      h('span', { class: 'f-text' }, e.text),
    );
    rows.prepend(li);
    while (rows.children.length > 6) rows.lastElementChild!.remove();
  };

  const refresh = () => {
    const c = log.counts();
    alerts.textContent = String(c.mid + c.high);
    alerts.parentElement?.classList.toggle('hot', c.high > 0);
    total.textContent = String(log.events.length);
    // Histogramme : événements par tranche de 5 s sur les 2 dernières minutes.
    const now = Date.now();
    const counts = new Array(BUCKETS).fill(0);
    for (const e of log.events) {
      const k = Math.floor((now - e.time.getTime()) / 5000);
      if (k >= 0 && k < BUCKETS) counts[BUCKETS - 1 - k]++;
    }
    const max = Math.max(1, ...counts);
    [...spark.children].forEach((bar, i) => ((bar as HTMLElement).style.height = `${(counts[i]! / max) * 100}%`));
  };

  for (const e of log.events.slice(-6)) addRow(e, false);
  refresh();
  log.subscribe((e) => {
    addRow(e, true);
    refresh();
  });
  setInterval(refresh, 5000);

  return h(
    'div',
    { class: 'siem-live' },
    h(
      'div',
      { class: 'siem-kpis' },
      h('div', {}, h('span', {}, 'Événements'), total),
      h('div', { class: 'k-alerts' }, h('span', {}, 'Suspects ou alertes'), alerts),
      spark,
    ),
    rows,
    h('p', { class: 'siem-note' }, 'Chaque ligne est une de tes actions sur ce site. Ouvre le terminal et essaie ', h('code', {}, 'cat /etc/shadow'), ' pour déclencher une alerte. Rien ne sort de ton navigateur.'),
  );
}

// ---------------------------------------------------------------------------
// CTF : pastille dans la navigation et panneau des défis
// ---------------------------------------------------------------------------

export function renderCtf(ctf: Ctf, openTerminal: () => void): { pill: HTMLButtonElement; panel: HTMLElement } {
  const count = h('span', { class: 'ctf-count' });
  const pill = h('button', { class: 'ctf-pill', type: 'button', 'aria-haspopup': 'dialog', title: 'Mini-CTF caché dans le site' }, h('span', { class: 'ctf-flag' }, '⚑'), count);
  const list = h('ol', { class: 'ctf-list' });
  const score = h('p', { class: 'ctf-score' });
  const panel = h(
    'div',
    { class: 'ctf-panel', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Mini-CTF', hidden: true },
    h(
      'div',
      { class: 'ctf-box' },
      h('header', {}, h('p', { class: 'ctf-kicker' }, 'capture the flag'), h('h3', {}, 'Cinq flags sont cachés dans ce site.'), h('p', {}, 'Format : ', h('code', {}, 'FLAG{...}'), '. Valide-les dans le terminal avec ', h('code', {}, 'submit FLAG{...}'), '. Aucun outil requis : un navigateur et de la curiosité.')),
      list,
      score,
      h(
        'footer',
        {},
        h('button', { class: 'btn primary small', type: 'button', 'data-ctf': 'terminal' }, 'Ouvrir le terminal'),
        h('button', { class: 'btn ghost small', type: 'button', 'data-ctf': 'close' }, 'Fermer'),
      ),
    ),
  );

  const render = () => {
    const found = new Set(ctf.foundIds);
    count.textContent = found.size ? `${found.size}/${CHALLENGES.length}` : 'CTF';
    pill.classList.toggle('done', ctf.complete);
    list.replaceChildren(
      ...CHALLENGES.map((c, i) =>
        h(
          'li',
          { class: found.has(c.id) ? 'found' : '' },
          h('span', { class: 'ctf-n' }, found.has(c.id) ? '✓' : String(i + 1).padStart(2, '0')),
          h('div', {}, h('strong', {}, c.title, h('em', {}, ` ${c.points} pts`)), h('p', {}, c.hint)),
        ),
      ),
    );
    score.textContent = ctf.complete
      ? `${ctf.score}/${ctf.maxScore} points. Tous trouvés. Écris-moi avec l’objet « root@aurele » : je saurai.`
      : `${ctf.score}/${ctf.maxScore} points.`;
  };
  render();
  ctf.subscribe(render);

  const close = () => (panel.hidden = true);
  pill.addEventListener('click', () => {
    panel.hidden = false;
    panel.querySelector<HTMLButtonElement>('[data-ctf="terminal"]')?.focus();
  });
  panel.addEventListener('click', (e) => {
    const action = (e.target as HTMLElement).closest<HTMLElement>('[data-ctf]')?.dataset.ctf;
    if (e.target === panel || action === 'close') close();
    if (action === 'terminal') {
      close();
      openTerminal();
    }
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !panel.hidden) close();
  });
  return { pill, panel };
}

// ---------------------------------------------------------------------------
// Notifications façon IDS
// ---------------------------------------------------------------------------

export function createToaster(): { el: HTMLElement; push: (title: string, body: string, tone?: 'ok' | 'warn' | 'err') => void } {
  const el = h('div', { class: 'toasts', 'aria-live': 'polite' });
  return {
    el,
    push(title, body, tone = 'ok') {
      const t = h('div', { class: `toast t-${tone}` }, h('strong', {}, title), h('p', {}, body));
      el.append(t);
      setTimeout(() => {
        t.classList.add('out');
        setTimeout(() => t.remove(), 400);
      }, 4200);
    },
  };
}

// ---------------------------------------------------------------------------
// Titres qui se « déchiffrent » à l'apparition
// ---------------------------------------------------------------------------

const GLYPHS = 'ABCDEF0123456789#$%&*+<>/\\=';

export function scramble(el: HTMLElement, duration = 650): void {
  const text = el.textContent ?? '';
  if (prefersReducedMotion() || !text.trim()) return;
  el.setAttribute('aria-label', text);
  const start = performance.now();
  const step = (now: number) => {
    const t = Math.min(1, (now - start) / duration);
    const settled = Math.floor(t * text.length);
    let out = '';
    for (let i = 0; i < text.length; i++) {
      const ch = text[i]!;
      out += i < settled || ch === ' ' ? ch : GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
    }
    el.textContent = out;
    if (t < 1) requestAnimationFrame(step);
    else {
      el.textContent = text;
      el.removeAttribute('aria-label');
    }
  };
  requestAnimationFrame(step);
}
