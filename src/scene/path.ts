/**
 * Géométrie du trajet en 3D, sans dépendance au rendu : positions des
 * équipements, et conversion de l'avancement (0 = premier saut) en point
 * sur la courbe. Testable sans WebGL.
 */

export type Vec3 = [number, number, number];

/** Position de chaque équipement dans le monde. Le trajet avance vers -z. */
export const STATION_POSITIONS: Record<string, Vec3> = {
  client: [0, 0, 0],
  fw: [7, 1.5, -64],
  web: [-9, -0.5, -128],
  core: [5, -1.5, -192],
  ad: [13, 2, -256],
  siem: [-6, 0.5, -320],
  vpn: [0, 0, -396],
};

/** Points de passage du paquet, dans l'ordre des sauts. */
export function pathPoints(hopNodes: string[]): Vec3[] {
  return hopNodes.map((id) => {
    const p = STATION_POSITIONS[id];
    if (!p) throw new Error(`Équipement inconnu : ${id}`);
    return p;
  });
}

/**
 * Avancement continu (0 = premier saut, n-1 = dernier) vers le paramètre `t`
 * de la courbe. Une CatmullRom paramétrée par index place le point i en
 * t = i / (n - 1).
 */
export function progressToT(progress: number, count: number): number {
  if (count < 2) return 0;
  return Math.min(1, Math.max(0, progress / (count - 1)));
}

/** Interpolation exponentielle indépendante du nombre d'images par seconde. */
export function damp(current: number, target: number, lambda: number, dtSeconds: number): number {
  return current + (target - current) * (1 - Math.exp(-lambda * dtSeconds));
}

/** Pseudo-aléatoire déterministe (mulberry32), pour un décor identique à chaque visite. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
