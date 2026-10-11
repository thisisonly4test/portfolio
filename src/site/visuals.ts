import type { Media } from '../data/profile';
import { h, prefersReducedMotion } from '../dom';

/**
 * Visuels du site : icônes au trait et schémas animés des projets qui
 * n'ont pas d'interface graphique (outils en ligne de commande, bots).
 * Tout est en SVG en ligne, aux couleurs du site.
 */

const icon = (paths: string) =>
  `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="square" stroke-linejoin="miter">${paths}</svg>`;

export const ICONS: Record<string, string> = {
  systemes: icon('<rect x="4" y="3.5" width="16" height="7" /><rect x="4" y="13.5" width="16" height="7" /><path d="M7.5 7h2M7.5 17h2M15 7h1.5M15 17h1.5" />'),
  reseaux: icon('<rect x="9.5" y="2.5" width="5" height="5" /><rect x="2.5" y="16.5" width="5" height="5" /><rect x="16.5" y="16.5" width="5" height="5" /><path d="M12 7.5v4.5M5 16.5V12h14v4.5" />'),
  securite: icon('<path d="M12 2.8 4.5 5.6v6c0 4.6 3.2 8 7.5 9.6 4.3-1.6 7.5-5 7.5-9.6v-6z" /><path d="m8.8 12 2.3 2.3 4.2-4.6" />'),
  virtualisation: icon('<path d="m12 3 8.5 4.5L12 12 3.5 7.5z" /><path d="m3.5 12 8.5 4.5 8.5-4.5M3.5 16.5 12 21l8.5-4.5" />'),
  automatisation: icon('<path d="M4 7h11l-3-3M20 17H9l3 3" /><path d="m8 11-2 2 2 2M16 9l2 2-2 2" />'),
  ia: icon('<path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" /><circle cx="12" cy="12" r="3.2" />'),
  collecter: icon('<path d="M12 3.5v11M7.5 10l4.5 4.5 4.5-4.5M4 19.5h16" />'),
  trier: icon('<path d="M3.5 5h17l-6.5 7.5v6l-4 2v-8z" />'),
  synthetiser: icon('<path d="M6 3.5h8.5L18 7v13.5H6z" /><path d="M14.5 3.5V7H18M9 11h6M9 14h6M9 17h4" />'),
  restituer: icon('<path d="M3.5 11.5 20.5 4l-5 16.5-4-6.5z" /><path d="m11.5 14 4-4.5" />'),
};

/** Icône associée à une compétence, un axe ou une étape (par identifiant ou libellé). */
export function iconFor(key: string): string {
  const k = key
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z]/g, '');
  if (k.startsWith('infra')) return ICONS.systemes!;
  if (k.startsWith('cyber')) return ICONS.securite!;
  if (k === 'iadev' || k === 'ia') return ICONS.ia!;
  return ICONS[k] ?? ICONS.systemes!;
}

const SVG = 'http://www.w3.org/2000/svg';

function svgFrom(markup: string): SVGSVGElement {
  const tpl = document.createElement('template');
  tpl.innerHTML = markup.trim();
  const el = tpl.content.firstElementChild as SVGSVGElement;
  if (prefersReducedMotion()) el.querySelectorAll('animateMotion, animate').forEach((a) => a.remove());
  return el;
}

/** Paquets qui suivent un chemin, en boucle (SMIL, sans JavaScript). */
const flow = (path: string, dur: number, delay: number, cls = 'v-pkt') =>
  `<circle r="3.5" class="${cls}"><animateMotion dur="${dur}s" begin="${delay}s" repeatCount="indefinite" path="${path}" /></circle>`;

/** Research Radar : collecte, tri, diversité, puis le résumé sur Discord. */
function radarDiagram(): SVGSVGElement {
  const bars = [0.92, 0.81, 0.77, 0.64, 0.58];
  const titles = ['cs.CR · sécurité', 'cs.AI · IA', 'q-bio.NC · neurosciences', 'cs.RO · robotique', 'cs.LG · apprentissage'];
  return svgFrom(`<svg xmlns="${SVG}" viewBox="0 0 640 360" class="v-diagram" role="img" aria-label="Schéma de Research Radar : arXiv et bioRxiv sont collectés, notés, diversifiés, puis résumés sur Discord">
  <g class="v-box"><rect x="16" y="70" width="132" height="54" /><text x="30" y="94" class="v-t">arXiv</text><text x="30" y="112" class="v-s">9 catégories</text></g>
  <g class="v-box"><rect x="16" y="196" width="132" height="54" /><text x="30" y="220" class="v-t">bioRxiv</text><text x="30" y="238" class="v-s">via Europe PMC</text></g>
  <path d="M148 97 C 190 97, 190 160, 222 160 M148 223 C 190 223, 190 160, 222 160" class="v-line" />
  <g class="v-box"><rect x="222" y="132" width="122" height="56" /><text x="236" y="156" class="v-t">trier</text><text x="236" y="174" class="v-s">score + diversité</text></g>
  <path d="M344 160 H 392" class="v-line" />
  <g class="v-card">
    <rect x="392" y="40" width="232" height="280" />
    <rect x="392" y="40" width="3" height="280" class="v-accent" />
    <text x="410" y="68" class="v-t">Research Radar</text>
    <text x="410" y="86" class="v-s">top 5 du jour · Discord</text>
    ${bars
      .map(
        (b, i) => `<text x="410" y="${122 + i * 40}" class="v-s v-w">${titles[i]}</text>
    <rect x="410" y="${130 + i * 40}" width="196" height="5" class="v-track" />
    <rect x="410" y="${130 + i * 40}" width="${196 * b}" height="5" class="v-bar"><animate attributeName="width" from="0" to="${196 * b}" dur="1.2s" begin="${0.2 + i * 0.12}s" fill="freeze" /></rect>`,
      )
      .join('')}
  </g>
  ${flow('M148 97 C 190 97, 190 160, 222 160 H 344 H 392', 2.6, 0)}
  ${flow('M148 223 C 190 223, 190 160, 222 160 H 344 H 392', 2.6, 1.3)}
</svg>`);
}

/** DataBroke : une demande par service, puis le suivi du délai légal d'un mois. */
function rgpdDiagram(): SVGSVGElement {
  const rows: [string, string, string][] = [
    ['réseau social', 'art. 17', 'v-ok'],
    ['site de e-commerce', 'art. 21', 'v-ok'],
    ['courtier en données', 'art. 15', 'v-warn'],
    ['appli de fitness', 'art. 17', 'v-err'],
  ];
  const labels: Record<string, string> = { 'v-ok': 'répondu', 'v-warn': 'en attente', 'v-err': 'délai dépassé' };
  return svgFrom(`<svg xmlns="${SVG}" viewBox="0 0 640 360" class="v-diagram" role="img" aria-label="Schéma de DataBroke : une demande RGPD par service, envoyée par e-mail, puis le suivi du délai légal d'un mois">
  ${rows
    .map(
      ([name, art], i) => `<g class="v-box"><rect x="16" y="${36 + i * 72}" width="196" height="52" /><text x="30" y="${58 + i * 72}" class="v-t">${name}</text><text x="30" y="${76 + i * 72}" class="v-s">${art}</text></g>
  <path d="M212 ${62 + i * 72} C 250 ${62 + i * 72}, 250 180, 288 180" class="v-line" />
  ${flow(`M212 ${62 + i * 72} C 250 ${62 + i * 72}, 250 180, 288 180`, 2.2, i * 0.55)}`,
    )
    .join('')}
  <g class="v-box"><rect x="288" y="152" width="88" height="56" /><text x="302" y="176" class="v-t">SMTP</text><text x="302" y="194" class="v-s">envoi</text></g>
  <path d="M376 180 H 410" class="v-line" />
  <g class="v-card">
    <rect x="410" y="36" width="214" height="288" />
    <rect x="410" y="36" width="3" height="288" class="v-accent" />
    <text x="428" y="64" class="v-t">suivi du délai</text>
    <text x="428" y="82" class="v-s">1 mois pour répondre</text>
    ${rows
      .map(
        ([, , st], i) => `<rect x="428" y="${110 + i * 52}" width="178" height="6" class="v-track" />
    <rect x="428" y="${110 + i * 52}" width="${[64, 110, 132, 178][i]}" height="6" class="${st}"><animate attributeName="width" from="0" to="${[64, 110, 132, 178][i]}" dur="1.4s" begin="${0.3 + i * 0.15}s" fill="freeze" /></rect>
    <text x="428" y="${134 + i * 52}" class="v-s">${labels[st]}</text>`,
      )
      .join('')}
    <path d="M606 100 V 300" class="v-deadline" /><text x="604" y="314" class="v-s" text-anchor="end">J+30</text>
  </g>
</svg>`);
}

const DIAGRAMS: Record<string, () => SVGSVGElement> = { radar: radarDiagram, rgpd: rgpdDiagram };

/** Le visuel d'un projet : capture d'écran réelle, ou schéma de fonctionnement. */
export function projectMedia(media: Media | undefined): HTMLElement | null {
  if (!media) return null;
  if (media.kind === 'image') {
    return h('figure', { class: 'p-media' }, h('img', { src: media.src, alt: media.alt, loading: 'lazy', decoding: 'async', width: '1280', height: '720' }), h('figcaption', {}, 'capture d’écran'));
  }
  const make = DIAGRAMS[media.src];
  if (!make) return null;
  const fig = h('figure', { class: 'p-media p-diagram' }, h('figcaption', {}, 'schéma de fonctionnement'));
  fig.prepend(make() as unknown as HTMLElement);
  return fig;
}
