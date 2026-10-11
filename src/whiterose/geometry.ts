/**
 * Géométrie pure de la pièce whiterose : homographie de l'écran, caméra,
 * carte murale. Sans three.js ni DOM, pour les tests.
 *
 * Repère de la pièce, en mètres : mur du fond en z = 0 (face vers +z),
 * sol en y = 0, x vers la droite.
 */

export interface Pt {
  x: number;
  y: number;
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Coins dans l'ordre : haut gauche, haut droite, bas droite, bas gauche. */
export type Quad = [Pt, Pt, Pt, Pt];

/** Un plan de caméra : position, point visé, champ vertical en degrés. */
export interface Shot {
  pos: Vec3;
  target: Vec3;
  fov: number;
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

const lerp = (a: number, b: number, t: number) => a * (1 - t) + b * t;
const lerp3 = (a: Vec3, b: Vec3, t: number): Vec3 => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), z: lerp(a.z, b.z, t) });

/** Travelling entre deux plans : position, visée et focale glissent ensemble. */
export function mixShot(a: Shot, b: Shot, t: number): Shot {
  return { pos: lerp3(a.pos, b.pos, t), target: lerp3(a.target, b.target, t), fov: lerp(a.fov, b.fov, t) };
}

/** Champ vertical qui garde un champ horizontal donné, quel que soit le format. */
export function fovFor(aspect: number, hfov: number, min = 30, max = 80): number {
  const v = (2 * Math.atan(Math.tan((hfov * Math.PI) / 360) / aspect) * 180) / Math.PI;
  return Math.min(max, Math.max(min, v));
}

/**
 * Distance qui fait occuper à un rectangle (w × h) au plus `fill` de la
 * hauteur et 90 % de la largeur de la vue.
 */
export function fitDistance(w: number, h: number, fov: number, aspect: number, fill = 0.7): number {
  const t = Math.tan((fov * Math.PI) / 360);
  return Math.max(h / (2 * fill * t), w / (2 * 0.9 * t * aspect));
}

// ---------------------------------------------------------------------------
// Carte murale : continents en points, comme sur l'affiche lumineuse
// ---------------------------------------------------------------------------

/** Contours grossiers des terres, en [longitude, latitude]. */
const LAND: [number, number][][] = [
  // Amérique du Nord
  [[-168, 66], [-162, 70], [-140, 70], [-120, 74], [-95, 72], [-80, 73], [-65, 62], [-56, 52], [-66, 45], [-76, 35], [-81, 25], [-90, 29], [-97, 26], [-97, 19], [-88, 15], [-80, 8], [-84, 10], [-92, 15], [-105, 20], [-112, 30], [-117, 32], [-124, 40], [-124, 48], [-135, 58], [-150, 60], [-165, 60]],
  // Groenland
  [[-55, 60], [-44, 60], [-20, 70], [-20, 80], [-60, 82], [-70, 77], [-58, 70]],
  // Amérique du Sud
  [[-80, 8], [-60, 10], [-50, 0], [-35, -6], [-40, -22], [-48, -28], [-58, -38], [-65, -55], [-72, -50], [-72, -35], [-71, -18], [-81, -5]],
  // Europe
  [[-10, 36], [-9, 43], [-2, 44], [-5, 48], [0, 50], [5, 53], [8, 57], [5, 62], [15, 69], [28, 71], [40, 67], [45, 60], [40, 48], [30, 45], [26, 40], [20, 40], [15, 38], [12, 44], [3, 43]],
  // Îles britanniques
  [[-6, 50], [2, 51], [0, 54], [-3, 59], [-7, 57], [-5, 54]],
  // Afrique
  [[-17, 15], [-17, 21], [-10, 30], [-6, 36], [10, 37], [20, 32], [32, 31], [35, 28], [43, 12], [51, 12], [42, 0], [40, -15], [35, -25], [20, -35], [12, -17], [9, -1], [5, 4], [-8, 4], [-15, 10]],
  // Madagascar
  [[44, -25], [50, -15], [49, -12], [43, -17]],
  // Asie
  [[26, 40], [36, 36], [35, 30], [44, 12], [56, 22], [60, 25], [67, 24], [72, 20], [77, 8], [80, 15], [90, 22], [98, 16], [100, 3], [104, 1], [105, 10], [109, 18], [121, 30], [122, 40], [130, 43], [142, 47], [142, 53], [160, 60], [180, 66], [180, 72], [140, 73], [110, 77], [80, 73], [68, 70], [60, 68], [45, 68], [40, 67], [45, 60], [40, 48], [30, 45]],
  // Insulinde
  [[95, 5], [105, -6], [120, -9], [140, -8], [150, -6], [130, 0], [118, 5], [108, 2], [100, 3]],
  // Japon
  [[130, 31], [140, 35], [142, 40], [141, 45], [139, 38], [132, 34]],
  // Australie
  [[114, -22], [122, -18], [131, -12], [137, -12], [142, -11], [146, -19], [153, -26], [150, -37], [140, -38], [132, -32], [115, -35]],
  // Nouvelle-Zélande
  [[166, -46], [174, -41], [178, -38], [173, -35], [171, -44]],
];

function inside(lon: number, lat: number, poly: [number, number][]): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]!;
    const [xj, yj] = poly[j]!;
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

export const isLand = (lon: number, lat: number) => LAND.some((p) => inside(lon, lat, p));

/** Emprise de la carte sur le mur du fond, en mètres. */
export const MAP = { left: 0.5, right: 2.12, top: 2.16, latTop: 78, latBottom: -56, z: 0.004 };
const MAP_SCALE = (MAP.right - MAP.left) / 360;

/** Position sur le mur d'un point (longitude, latitude). */
export function wallPoint(lon: number, lat: number): Vec3 {
  return { x: MAP.left + (lon + 180) * MAP_SCALE, y: MAP.top - (MAP.latTop - lat) * MAP_SCALE, z: MAP.z };
}

/** Les points allumés de la carte : une grille régulière sur les terres. */
export function mapDots(step = 3.6): Vec3[] {
  const dots: Vec3[] = [];
  for (let lat = MAP.latTop; lat >= MAP.latBottom; lat -= step) {
    for (let lon = -180 + step / 2; lon < 180; lon += step) if (isLand(lon, lat)) dots.push(wallPoint(lon, lat));
  }
  return dots;
}

export const CITIES = {
  paris: { lon: 2.35, lat: 48.9, name: 'Paris' },
  londres: { lon: -0.1, lat: 51.5, name: 'Londres' },
  moscou: { lon: 37.6, lat: 55.75, name: 'Moscou' },
  newyork: { lon: -74, lat: 40.7, name: 'New York' },
  sanfrancisco: { lon: -122.4, lat: 37.8, name: 'San Francisco' },
  saopaulo: { lon: -46.6, lat: -23.5, name: 'São Paulo' },
  lagos: { lon: 3.4, lat: 6.5, name: 'Lagos' },
  johannesburg: { lon: 28, lat: -26.2, name: 'Johannesburg' },
  mumbai: { lon: 72.8, lat: 19, name: 'Mumbai' },
  singapour: { lon: 103.8, lat: 1.35, name: 'Singapour' },
  pekin: { lon: 116.4, lat: 39.9, name: 'Pékin' },
  tokyo: { lon: 139.7, lat: 35.7, name: 'Tokyo' },
  sydney: { lon: 151.2, lat: -33.9, name: 'Sydney' },
} satisfies Record<string, { lon: number; lat: number; name: string }>;

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

/** Arc entre deux points du mur, légèrement décollé : points à projeter à l'écran. */
export function wallArc(a: Vec3, b: Vec3, n = 24): Vec3[] {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const pts: Vec3[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const bump = Math.sin(Math.PI * t);
    pts.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t + bump * len * 0.22, z: a.z + bump * len * 0.12 });
  }
  return pts;
}
