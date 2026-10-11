import { contactLinks, type ContactLink, type Profile, type TimelineEntry } from '../data/profile';
import { h } from '../dom';
import { buildPacket, type Packet } from './dissect';
import type { EventLog } from './events';
import { entropyBits, facts, readEnv, type Fact } from './fingerprint';
import { hopsFor, type Hop } from './hops';
import { iconFor, projectMedia } from './visuals';
import { renderDissector, renderSiem } from './widgets';

const ARROW = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8h10M9 4l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="square"/></svg>';
const EXTERNAL = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3h7v7M13 3 4 12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="square"/></svg>';

function link(label: string, href: string, cls = 'btn', icon = ARROW, external = false) {
  return h(
    'a',
    { class: cls, href, ...(external ? { target: '_blank', rel: 'noopener' } : {}) },
    h('span', {}, label),
    h('span', { class: 'btn-icon', html: icon }),
  );
}

/** Bloc repliable : le détail est là pour qui le veut, sans encombrer la lecture. */
function more(label: string, hint: string, ...content: (HTMLElement | null)[]) {
  return h(
    'details',
    { class: 'more reveal' },
    h('summary', {}, h('span', { class: 'more-label' }, label), h('span', { class: 'more-hint' }, hint), h('span', { class: 'more-toggle', 'aria-hidden': 'true' })),
    h('div', { class: 'more-body' }, ...content),
  );
}

export interface PageHandles {
  root: HTMLElement;
  nav: HTMLElement;
  /** Toile du monde en 3D, fixée derrière le contenu. */
  canvas: HTMLCanvasElement;
  hops: Hop[];
  terminalButton: HTMLButtonElement;
}

/**
 * Tête de section : le nom de la section, en clair, puis la machine et la
 * commande, en discret. Le thème reste, sans brouiller la lecture.
 */
function hopHead(hop: Hop) {
  return h(
    'header',
    { class: 'hop-head' },
    h('p', { class: 'hop-label' }, hop.label),
    h('p', { class: 'hop-cmd', 'aria-hidden': 'true' }, h('span', { class: 'prompt' }, `${hop.host} $`), ` ${hop.cmd}`),
  );
}

export interface RenderOptions {
  /** Empreinte du navigateur ; par défaut, lue dans le navigateur. */
  env?: Fact[];
  /** Trame à disséquer au pare-feu ; null pour ne pas l'afficher. */
  packet?: Packet | null;
  /** Journal pour le saut SIEM ; sans journal, pas de tableau de bord. */
  log?: EventLog;
}

export function renderPage(p: Profile, options: RenderOptions = {}): PageHandles {
  const env = options.env ?? safeFacts();
  const packet = options.packet === undefined ? safePacket(p) : options.packet;
  const hops = hopsFor(p);
  const contacts = contactLinks(p);

  // ---------- navigation ----------
  const terminalButton = h(
    'button',
    { class: 'nav-term', type: 'button', 'aria-label': 'Ouvrir le terminal', title: 'Terminal (touche ²)' },
    h('span', { class: 'prompt' }, '>_'),
    h('span', { class: 'nav-term-label' }, 'Terminal'),
  );
  const menuBtn = h('button', { class: 'nav-menu', type: 'button', 'aria-label': 'Menu', 'aria-expanded': 'false', 'aria-controls': 'nav-links' }, h('span'), h('span'));
  const links = h(
    'ul',
    { class: 'nav-links', id: 'nav-links' },
    ...hops.slice(1).map((s) => h('li', {}, h('a', { href: `#${s.id}`, 'data-section': s.id }, s.label))),
  );
  const nav = h(
    'nav',
    { class: 'nav', 'aria-label': 'Navigation principale' },
    h('a', { class: 'nav-brand', href: '#top' }, h('span', { class: 'prompt' }, '~'), ` ${p.username}`),
    links,
    h('div', { class: 'nav-actions' }, terminalButton, menuBtn),
  );
  const closeMenu = () => {
    nav.classList.remove('open');
    menuBtn.setAttribute('aria-expanded', 'false');
  };
  menuBtn.addEventListener('click', () => {
    const open = nav.classList.toggle('open');
    menuBtn.setAttribute('aria-expanded', String(open));
  });
  links.addEventListener('click', closeMenu);
  window.addEventListener('keydown', (e) => e.key === 'Escape' && closeMenu());

  const canvas = h('canvas', { class: 'world', 'aria-hidden': 'true' });

  // ---------- sections ----------
  const sections = hops.map((hop, i) =>
    h(
      'section',
      { class: `hop hop-${hop.id}`, id: hop.id, 'data-hop': String(i), 'aria-labelledby': `${hop.id}-title` },
      hop.id === 'top' ? null : hopHead(hop),
      ...renderHop(hop, p, { env, packet, log: options.log }, contacts),
    ),
  );

  const footer = h(
    'footer',
    { class: 'foot' },
    h('p', {}, `© ${new Date().getFullYear()} ${p.displayName} · fait main, sans framework`),
    h(
      'p',
      { class: 'foot-actions' },
      h('button', { type: 'button', class: 'link-btn', 'data-action': 'replay' }, 'Rejouer l’intro'),
      h('button', { type: 'button', class: 'link-btn', 'data-action': 'terminal' }, 'Ouvrir le terminal'),
      h('button', { type: 'button', class: 'link-btn', 'data-action': 'world' }, 'Désactiver la 3D'),
    ),
  );

  const main = h('main', { class: 'hops', id: 'contenu' }, ...sections, footer);
  const root = h('div', { class: 'site' }, canvas, h('div', { class: 'world-veil', 'aria-hidden': 'true' }), h('a', { class: 'skip', href: '#contenu' }, 'Aller au contenu'), nav, main);
  return { root, nav, canvas, hops, terminalButton };
}

/** La trame du visiteur : ses vraies valeurs, adresses et ports fictifs. */
function safePacket(p: Profile): Packet | null {
  try {
    const nav = globalThis.navigator;
    return buildPacket({
      srcIp: '192.168.1.37',
      dstIp: '203.0.113.1',
      srcPort: 49152 + Math.floor(Math.random() * 16000),
      dstPort: 80,
      seq: Math.floor(Math.random() * 2 ** 32),
      ack: Math.floor(Math.random() * 2 ** 32),
      id: Math.floor(Math.random() * 65535),
      host: p.hostname,
      userAgent: nav.userAgent,
      language: nav.language,
    });
  } catch {
    return null;
  }
}

function safeFacts(): Fact[] {
  try {
    return facts(readEnv());
  } catch {
    return [];
  }
}

interface HopContext {
  env: Fact[];
  packet: Packet | null;
  log?: EventLog;
}

function renderHop(hop: Hop, p: Profile, x: HopContext, contacts: ContactLink[]): (HTMLElement | null)[] {
  switch (hop.id) {
    case 'top':
      return heroHop(p, x.env, contacts);
    case 'apropos':
      return aboutHop(p, x.packet);
    case 'projets':
      return projectsHop(p);
    case 'competences':
      return skillsHop(p);
    case 'parcours':
      return pathHop(p);
    case 'veille':
      return watchHop(p, x.log);
    case 'contact':
      return contactHop(p, contacts);
  }
}

function heroHop(p: Profile, env: Fact[], contacts: ContactLink[]) {
  const bits = entropyBits(env);
  return [
    h(
      'div',
      { class: 'hero' },
      h('p', { class: 'hero-cmd', 'aria-hidden': 'true' }, h('span', { class: 'prompt' }, '$'), ' whoami'),
      h('h1', { id: 'top-title' }, p.displayName),
      h('p', { class: 'hero-role' }, p.role),
      h('p', { class: 'hero-pitch' }, p.pitch),
      p.availability ? h('p', { class: 'hero-status' }, h('span', { class: 'ok' }, '●'), ` ${p.availability}`) : null,
      h(
        'div',
        { class: 'hero-cta' },
        p.projects.length ? link('Voir mes projets', '#projets', 'btn primary') : null,
        contacts.length ? link('Me contacter', '#contact', 'btn') : null,
        p.contact.cv ? link('CV (PDF)', p.contact.cv, 'btn ghost', EXTERNAL, true) : null,
      ),
      h('p', { class: 'hero-hint' }, 'Fais défiler : tu es un paquet, et tu vas traverser mon infrastructure.'),
    ),
    env.length
      ? more(
          'Ce que ton navigateur révèle',
          'à n’importe quel site, sans cookie',
          h('dl', { class: 'probe-grid' }, ...env.flatMap((f) => [h('dt', {}, f.label), h('dd', {}, f.value)])),
          h(
            'p',
            { class: 'probe-note' },
            `Assez pour te reconnaître parmi des millions de visiteurs (≈ ${String(bits).replace('.', ',')} bits d’empreinte). Rien n’a été envoyé : tout est lu ici, dans ton navigateur.`,
          ),
        )
      : null,
  ];
}

function aboutHop(p: Profile, packet: Packet | null) {
  const width = Math.max(...p.principles.map((r) => r.verdict.length));
  return [
    h('h2', { class: 'reveal', id: 'apropos-title' }, 'Comprendre comment un système tient, et comment il tombe.'),
    h('div', { class: 'prose reveal' }, ...p.about.map((t) => h('p', {}, t))),
    h(
      'ul',
      { class: 'focus reveal' },
      ...p.focus.map((f) => h('li', {}, h('span', { class: 'focus-icon', html: iconFor(f.label) }), h('strong', {}, f.label), h('p', {}, f.text))),
    ),
    h('p', { class: 'kicker reveal' }, 'Mes principes, en règles de pare-feu'),
    h(
      'pre',
      { class: 'code reveal' },
      h('span', { class: 'c-kw' }, 'policy drop'),
      h('span', { class: 'c-dim' }, '   # tout ce qui n’est pas autorisé est refusé\n'),
      ...p.principles.flatMap((r) => [
        h('span', { class: r.verdict === 'accept' ? 'c-ok' : 'c-err' }, r.verdict.padEnd(width)),
        '  ',
        h('span', { class: 'c-str' }, r.text),
        '\n',
      ]),
    ),
    packet
      ? more(
          'Inspecter ton paquet',
          'façon Wireshark, octet par octet',
          h('p', { class: 'inspect-intro' }, 'La trame que ton navigateur envoie au pare-feu. Survole un champ pour voir ses octets, puis chiffre-la pour voir ce que TLS cache.'),
          renderDissector(packet),
        )
      : null,
  ];
}

function projectsHop(p: Profile) {
  return [
    h('h2', { class: 'reveal', id: 'projets-title' }, 'Des outils finis, testés et documentés.'),
    h(
      'div',
      { class: 'units reveal' },
      ...p.projects.map((proj) =>
        h(
          'details',
          { class: 'unit', 'data-project': proj.id },
          h(
            'summary',
            {},
            projectMedia(proj.media),
            h(
              'span',
              { class: 'unit-row' },
              h('span', { class: 'unit-desc' }, h('span', { class: 'unit-tag' }, h('span', { class: `unit-dot${proj.status === 'en cours' ? ' busy' : ''}`, 'aria-hidden': 'true' }, '●'), ` ${proj.domain} · ${proj.status}`), h('strong', {}, proj.name), h('span', {}, proj.tagline)),
              h('span', { class: 'unit-more' }, h('span', { class: 'unit-more-label' }, 'Détails'), h('span', { class: 'unit-toggle', 'aria-hidden': 'true' })),
            ),
          ),
          h(
            'div',
            { class: 'unit-body' },
            h(
              'div',
              { class: 'unit-cols' },
              h('div', {}, h('h4', {}, 'Le problème'), h('p', {}, proj.problem)),
              h('div', {}, h('h4', {}, 'Ce que j’ai fait'), ...proj.solution.map((s) => h('p', {}, s))),
              h(
                'div',
                {},
                h('h4', {}, 'Technologies'),
                h('ul', { class: 'chips' }, ...proj.stack.map((x) => h('li', {}, x))),
                proj.link ? link('Voir le projet', proj.link, 'btn small', EXTERNAL, true) : null,
              ),
            ),
          ),
        ),
      ),
    ),
  ];
}

function skillsHop(p: Profile) {
  return [
    h('h2', { class: 'reveal', id: 'competences-title' }, 'Du câble au script.'),
    h(
      'div',
      { class: 'skills reveal' },
      ...p.skills.map((s) =>
        h(
          'div',
          { class: 'skill' },
          h('span', { class: 'skill-icon', html: iconFor(s.id) }),
          h('h3', {}, s.title),
          h('p', {}, s.summary),
          h('ul', { class: 'chips' }, ...s.items.map((it) => h('li', {}, it))),
        ),
      ),
    ),
  ];
}

function timeline(entries: TimelineEntry[]) {
  return h(
    'ol',
    { class: 'timeline' },
    ...entries.map((e) =>
      h(
        'li',
        { class: 'reveal' },
        h('p', { class: 'tl-period' }, e.period || 'En cours'),
        h('h3', {}, e.title),
        e.place ? h('p', { class: 'tl-place' }, e.place) : null,
        e.details.length ? h('ul', {}, ...e.details.map((d) => h('li', {}, d))) : null,
      ),
    ),
  );
}

function pathHop(p: Profile) {
  return [
    h('h2', { class: 'reveal', id: 'parcours-title' }, 'Formation et expériences.'),
    p.education.length ? h('div', { class: 'path-group' }, h('h3', { class: 'kicker' }, 'Formation'), timeline(p.education)) : null,
    p.experience.length ? h('div', { class: 'path-group' }, h('h3', { class: 'kicker' }, 'Expériences'), timeline(p.experience)) : null,
    p.certifications.length
      ? h(
          'div',
          { class: 'path-group' },
          h('h3', { class: 'kicker' }, 'Certifications'),
          h(
            'ul',
            { class: 'certs' },
            ...p.certifications.map((c) =>
              h('li', { class: 'reveal' }, c.link ? h('a', { href: c.link, target: '_blank', rel: 'noopener' }, c.name) : h('strong', {}, c.name), h('span', {}, [c.issuer, c.year].filter(Boolean).join(' · '))),
            ),
          ),
        )
      : null,
  ];
}

function watchHop(p: Profile, log?: EventLog) {
  const w = p.watch;
  return [
    h('h2', { class: 'reveal', id: 'veille-title' }, w.topic),
    h('div', { class: 'prose reveal' }, h('p', {}, w.intro)),
    h(
      'ol',
      { class: 'pipeline reveal' },
      ...w.pipeline.map((s) => h('li', {}, h('span', { class: 'pipe-icon', html: iconFor(s.step) }), h('strong', {}, s.step), h('p', {}, s.text))),
    ),
    h('p', { class: 'kicker reveal' }, 'Mes sources'),
    h('ul', { class: 'sources reveal' }, ...w.sources.map((s) => h('li', {}, h('strong', {}, s.name), h('span', {}, s.kind)))),
    log
      ? more('Mon SIEM te regarde', 'tes actions sur ce site, en direct', renderSiem(log))
      : null,
  ];
}

function contactHop(p: Profile, contacts: ContactLink[]) {
  const email = contacts.find((c) => c.label === 'E-mail');
  const others = contacts.filter((c) => c !== email);
  return [
    h('h2', { class: 'reveal', id: 'contact-title' }, 'Un stage, une alternance, une question ?'),
    h(
      'div',
      { class: 'contact-body reveal' },
      email
        ? h('a', { class: 'contact-mail', href: email.href }, email.value, h('span', { class: 'btn-icon', html: ARROW }))
        : h('p', { class: 'contact-soon' }, 'Mes coordonnées arrivent très bientôt.'),
      others.length
        ? h(
            'ul',
            { class: 'contact-links' },
            ...others.map((c) => h('li', {}, h('a', { href: c.href, target: '_blank', rel: 'noopener' }, h('span', {}, c.label), h('span', {}, c.value), h('span', { class: 'btn-icon', html: EXTERNAL })))),
          )
        : null,
      p.contact.cv ? link('Télécharger mon CV', p.contact.cv, 'btn', EXTERNAL, true) : null,
    ),
  ];
}
