/**
 * Géométrie de la scène whiterose, en unités de l'image (640 × 361).
 *
 * La « caméra » est un cadrage : un point de l'image à mettre au centre de
 * la fenêtre et un facteur de zoom. L'écran du moniteur est un quadrilatère
 * légèrement en perspective : on y projette un vrai élément HTML avec une
 * homographie (`matrix3d`), pour que le texte reste net.
 */

export interface Pt {
  x: number;
  y: number;
}

/** Coins dans l'ordre : haut gauche, haut droite, bas droite, bas gauche. */
export type Quad = [Pt, Pt, Pt, Pt];

export interface View {
  cx: number;
  cy: number;
  z: number;
}

export const IMAGE = { w: 640, h: 361 };

/** Verre de l'écran du moniteur, mesuré sur l'image. */
export const SCREEN: Quad = [
  { x: 453, y: 139 },
  { x: 561, y: 132 },
  { x: 559, y: 257 },
  { x: 449, y: 242 },
];

/** Abat-jour de la lampe : source de la lueur chaude. */
export const LAMP: Pt = { x: 362, y: 165 };

const SCREEN_CENTER: Pt = {
  x: SCREEN.reduce((s, p) => s + p.x, 0) / 4,
  y: SCREEN.reduce((s, p) => s + p.y, 0) / 4,
};
const SCREEN_W = (SCREEN[1].x - SCREEN[0].x + SCREEN[2].x - SCREEN[3].x) / 2;
const SCREEN_H = (SCREEN[3].y - SCREEN[0].y + SCREEN[2].y - SCREEN[1].y) / 2;

const clamp = (v: number, lo: number, hi: number) => (lo > hi ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, v)));

/** Zoom minimal pour que l'image couvre toute la fenêtre. */
export function coverZoom(vw: number, vh: number): number {
  return Math.max(vw / IMAGE.w, vh / IMAGE.h);
}

/** Plan large : toute la pièce, recentrée vers le moniteur sur un écran étroit. */
export function roomView(vw: number, vh: number): View {
  const z = coverZoom(vw, vh) * 1.04;
  return {
    cx: clamp(SCREEN_CENTER.x, vw / (2 * z), IMAGE.w - vw / (2 * z)),
    cy: IMAGE.h / 2,
    z,
  };
}

/** Plan serré : l'écran du moniteur occupe l'essentiel de la fenêtre. */
export function screenView(vw: number, vh: number): View {
  const z = Math.min((0.7 * vh) / SCREEN_H, (0.9 * vw) / SCREEN_W);
  return { cx: SCREEN_CENTER.x, cy: SCREEN_CENTER.y - 2, z };
}

/** Plan sur la carte du mur, assez bas pour garder le haut de l'écran dans le cadre. */
export function wallView(vw: number, vh: number): View {
  const z = Math.max(coverZoom(vw, vh), Math.min(vw / 220, vh / 230));
  return { cx: clamp(508, vw / (2 * z), IMAGE.w - vw / (2 * z)), cy: clamp(112, vh / (2 * z), IMAGE.h - vh / (2 * z)), z };
}

/** Taille naturelle de l'élément écran : sa taille à l'arrivée, pour un texte à l'échelle 1. */
export function screenBox(vw: number, vh: number): { w: number; h: number } {
  const { z } = screenView(vw, vh);
  return { w: Math.round(SCREEN_W * z), h: Math.round(SCREEN_H * z) };
}

/** Point de l'image vers la fenêtre, pour un cadrage donné. */
export function project(p: Pt, v: View, vw: number, vh: number): Pt {
  return { x: vw / 2 + (p.x - v.cx) * v.z, y: vh / 2 + (p.y - v.cy) * v.z };
}

/** Transformation CSS de l'image (origine en haut à gauche). */
export function stageTransform(v: View, vw: number, vh: number): string {
  return `translate3d(${vw / 2 - v.cx * v.z}px, ${vh / 2 - v.cy * v.z}px, 0) scale(${v.z})`;
}

/**
 * Homographie qui envoie le rectangle (0,0)-(w,h) sur le quadrilatère `q`,
 * en `matrix3d` CSS (ordre par colonnes, origine en haut à gauche).
 */
export function quadMatrix(w: number, h: number, q: Quad): string {
  const [p0, p1, p2, p3] = q;
  const dx1 = p1.x - p2.x;
  const dx2 = p3.x - p2.x;
  const dx3 = p0.x - p1.x + p2.x - p3.x;
  const dy1 = p1.y - p2.y;
  const dy2 = p3.y - p2.y;
  const dy3 = p0.y - p1.y + p2.y - p3.y;
  const den = dx1 * dy2 - dx2 * dy1 || 1e-9;
  const g = (dx3 * dy2 - dx2 * dy3) / den;
  const hh = (dx1 * dy3 - dx3 * dy1) / den;
  const a = p1.x - p0.x + g * p1.x;
  const b = p3.x - p0.x + hh * p3.x;
  const d = p1.y - p0.y + g * p1.y;
  const e = p3.y - p0.y + hh * p3.y;
  const m = [a / w, d / w, 0, g / w, b / h, e / h, 0, hh / h, 0, 0, 1, 0, p0.x, p0.y, 0, 1];
  return `matrix3d(${m.map((n) => +n.toFixed(8)).join(',')})`;
}

/** Applique une homographie `matrix3d` à un point : sert aux tests. */
export function applyMatrix(css: string, x: number, y: number): Pt {
  const m = css.slice(9, -1).split(',').map(Number);
  const X = m[0]! * x + m[4]! * y + m[12]!;
  const Y = m[1]! * x + m[5]! * y + m[13]!;
  const W = m[3]! * x + m[7]! * y + m[15]!;
  return { x: X / W, y: Y / W };
}

export const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/** Interpolation de cadrage : le zoom en logarithmique, pour un travelling régulier. */
export function mixView(a: View, b: View, t: number): View {
  const z = Math.exp(Math.log(a.z) + (Math.log(b.z) - Math.log(a.z)) * t);
  // Le point visé suit le zoom : la caméra « plonge » au lieu de glisser puis zoomer.
  const k = a.z === b.z ? t : (1 / a.z - 1 / z) / (1 / a.z - 1 / b.z);
  return { cx: a.cx + (b.cx - a.cx) * k, cy: a.cy + (b.cy - a.cy) * k, z };
}

// ---------------------------------------------------------------------------
// Carte murale : quelques villes, placées à l'œil sur les points de l'image
// ---------------------------------------------------------------------------

export const CITIES = {
  paris: { x: 500, y: 26, name: 'Paris' },
  londres: { x: 496, y: 21, name: 'Londres' },
  moscou: { x: 521, y: 17, name: 'Moscou' },
  newyork: { x: 461, y: 43, name: 'New York' },
  sanfrancisco: { x: 433, y: 47, name: 'San Francisco' },
  saopaulo: { x: 467, y: 100, name: 'São Paulo' },
  lagos: { x: 496, y: 69, name: 'Lagos' },
  johannesburg: { x: 508, y: 105, name: 'Johannesburg' },
  mumbai: { x: 538, y: 60, name: 'Mumbai' },
  singapour: { x: 556, y: 75, name: 'Singapour' },
  pekin: { x: 558, y: 30, name: 'Pékin' },
  tokyo: { x: 576, y: 28, name: 'Tokyo' },
  sydney: { x: 584, y: 100, name: 'Sydney' },
} satisfies Record<string, Pt & { name: string }>;

export type CityId = keyof typeof CITIES;

/** Ville la plus proche d'un fuseau IANA. Rien ne sort du navigateur. */
export function cityForTimeZone(tz: string): CityId {
  const rules: [RegExp, CityId][] = [
    [/^Europe\/(London|Dublin|Lisbon)/, 'londres'],
    [/^Europe\/(Moscow|Minsk|Kiev|Kyiv)/, 'moscou'],
    [/^Europe\//, 'paris'],
    [/^America\/(Sao_Paulo|Argentina|Buenos_Aires|Bogota|Lima|Santiago|Caracas|Montevideo)/, 'saopaulo'],
    [/^America\/(Los_Angeles|Vancouver|Tijuana|Phoenix|Denver|Edmonton)/, 'sanfrancisco'],
    [/^(America|Canada|US)\//, 'newyork'],
    [/^Africa\/(Johannesburg|Maputo|Harare|Windhoek|Lusaka)/, 'johannesburg'],
    [/^Africa\//, 'lagos'],
    [/^Asia\/(Tokyo|Seoul)/, 'tokyo'],
    [/^Asia\/(Kolkata|Calcutta|Dubai|Karachi|Dhaka|Kathmandu|Colombo)/, 'mumbai'],
    [/^Asia\/(Singapore|Jakarta|Bangkok|Kuala_Lumpur|Manila|Ho_Chi_Minh)/, 'singapour'],
    [/^Asia\//, 'pekin'],
    [/^(Australia|Pacific)\//, 'sydney'],
  ];
  return rules.find(([re]) => re.test(tz))?.[1] ?? 'paris';
}

/** Trajet du traçage : le visiteur, trois relais qui l'éloignent, puis le nœud. */
export function traceRoute(from: CityId): CityId[] {
  const relays: CityId[] = ['saopaulo', 'lagos', 'moscou', 'singapour', 'sanfrancisco', 'johannesburg', 'mumbai', 'londres'];
  const picked = relays.filter((c) => c !== from);
  // Ordre stable pour un même visiteur : on part de la position du fuseau dans la liste.
  const start = Object.keys(CITIES).indexOf(from) % picked.length;
  const hops = [0, 3, 5].map((i) => picked[(start + i) % picked.length]!);
  return [from, ...hops, from === 'pekin' ? 'tokyo' : 'pekin'];
}
