import './styles/base.css';
import './styles/intro.css';
import './styles/site.css';
import './styles/widgets.css';

import { profile } from './data/profile';
import { prefersReducedMotion } from './dom';
import { runIntro } from './intro/intro';
import { buildFS } from './shell/vfs';
import { createConsole } from './site/console';
import { setupCodaDim, setupJourney, setupReveal } from './site/effects';
import { classifyCommand, events } from './site/events';
import { renderPage } from './site/page';
import { createToaster, scramble } from './site/widgets';
import { forgetIntro, introSeen, markIntroSeen, setWorldDisabled, worldDisabled } from './storage';

/**
 * Paramètres d'URL :
 *   ?intro=skip   pas d'intro
 *   ?intro=full   intro complète (clic sur le compte), même pour un visiteur déjà venu
 *   ?intro=fast   intro complète accélérée (×6), pour les tests
 *   ?world=off    sans la scène 3D (aussi : bouton « Désactiver la 3D » en pied de page)
 *
 * Première visite : intro courte et automatique (≈ 3 s, vitesse ×3), qu'un clic, une
 * touche ou un défilement interrompt. Visites suivantes : pas d'intro.
 * « Rejouer l'intro » donne la version complète.
 */

const app = document.getElementById('app')!;
const params = new URLSearchParams(location.search);
const bootedAt = Date.now();
const toaster = createToaster();

events.log(3, 100010, 'Nouvelle connexion entrante, port 443', 'fw-01');
events.log(4, 100011, 'Empreinte du navigateur collectée (localement)', 'web-01');

// ---------- page ----------
const page = renderPage(profile, { log: events });
app.append(page.root, toaster.el);

// Le monde en 3D se charge à part : le contenu s'affiche sans l'attendre.
let world: { setProgress: (p: number) => void; setPaused: (p: boolean) => void } | null = null;
let pendingProgress = 0;
const map = {
  setProgress: (p: number) => {
    pendingProgress = p;
    world?.setProgress(p);
  },
};
async function startWorld() {
  const { createWorld, webglAvailable } = await import('./scene/scene');
  if (!webglAvailable()) throw new Error('WebGL indisponible');
  world = createWorld({
    canvas: page.canvas,
    hopNodes: page.hops.map((hop) => hop.node),
    labels: page.hops.map((hop) => ({ host: hop.host, role: hop.label })),
    events,
    reducedMotion: prefersReducedMotion(),
    mobile: matchMedia('(max-width: 860px)').matches,
  });
  world.setProgress(pendingProgress);
  document.documentElement.classList.add('has-world');
}
const worldBtn = page.root.querySelector<HTMLButtonElement>('[data-action="world"]')!;
if (worldDisabled() || params.get('world') === 'off') {
  document.documentElement.classList.add('no-world');
  worldBtn.textContent = 'Activer la 3D';
} else {
  startWorld().catch(() => {
    document.documentElement.classList.add('no-world');
    worldBtn.hidden = true;
  });
}
worldBtn.addEventListener('click', () => {
  setWorldDisabled(!worldDisabled());
  location.reload();
});

const coda = page.root.querySelector<HTMLElement>('.coda');
if (coda) setupCodaDim(coda, prefersReducedMotion());

setupReveal(page.root, (el) => {
  if (el.tagName === 'H2') scramble(el);
});
setupJourney({
  sections: [...page.root.querySelectorAll<HTMLElement>('section.hop')],
  map,
  nav: page.nav,
  onReach: (i) => {
    const hop = page.hops[i];
    if (hop && i > 0) events.log(2, 100100 + i, `Paquet routé vers ${hop.host} (${hop.label})`, hop.host);
  },
});

// ---------- terminal ----------
const consoleUi = createConsole({
  profile,
  fs: buildFS(profile),
  bootedAt,
  onCommand: (line) => {
    const rule = classifyCommand(line);
    if (!rule) return;
    events.log(rule.level, rule.rule, rule.text, 'pts/0');
    if (rule.level >= 10) toaster.push(`Alerte niveau ${rule.level}`, rule.text, 'err');
  },
  onEffect: (e) => {
    if (e.type === 'goto') document.getElementById(e.section)?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    else if (e.type === 'whiterose') void whiterose();
    else if (e.type === 'reboot') {
      consoleUi.close();
      setTimeout(() => void intro(true), 250);
    }
  },
});
app.append(...consoleUi.elements);
page.terminalButton.addEventListener('click', () => consoleUi.toggle());
page.root.querySelector('[data-action="terminal"]')?.addEventListener('click', () => consoleUi.open());
page.root.querySelector('[data-action="replay"]')?.addEventListener('click', () => {
  window.scrollTo({ top: 0 });
  void intro(true);
});

// ---------- whiterose : la pièce cachée ----------
// Chargée à la demande : rien ne pèse sur le site tant qu'on ne l'appelle pas.
async function whiterose() {
  consoleUi.close();
  const { openWhiterose } = await import('./whiterose/whiterose');
  world?.setPaused(true);
  await openWhiterose({
    bootedAt,
    allow3d: !document.documentElement.classList.contains('no-world'),
    reducedMotion: prefersReducedMotion(),
    log: (level, rule, text) => events.log(level, rule, text, 'pts/0'),
  });
  world?.setPaused(false);
}

// ---------- console du navigateur ----------
console.log('%c aurele@portfolio %c Tu ouvres la console ? Bon réflexe.', 'background:#e8b04a;color:#111;font-weight:600;padding:2px 4px', 'color:inherit');
Object.assign(window, { forgetIntro });

// ---------- intro ----------
async function intro(force = false) {
  const mode = params.get('intro');
  params.delete('intro');
  if (!force && (mode === 'skip' || (introSeen() && mode !== 'full' && mode !== 'fast'))) return;
  const full = force || mode === 'full' || mode === 'fast';
  const speed = mode === 'fast' ? 6 : prefersReducedMotion() ? 4 : full ? 1 : 3;
  window.scrollTo({ top: 0 });
  await runIntro(app, { profile, speed, auto: !full });
  const title = page.root.querySelector<HTMLElement>('.hero h1');
  if (title) scramble(title, 900);
  events.log(3, 5501, `Session ouverte pour ${profile.username} (tty1)`, 'portfolio');
  markIntroSeen();
}

void intro();
