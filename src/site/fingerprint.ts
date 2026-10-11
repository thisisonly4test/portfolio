/**
 * Ce que n'importe quel site peut lire sur un visiteur, sans cookie ni
 * autorisation. Tout est calculé dans le navigateur : rien n'est envoyé.
 */

export interface Fact {
  label: string;
  value: string;
}

export function parseBrowser(ua: string): string {
  const rules: [RegExp, string][] = [
    [/Edg\/(\d+)/, 'Edge'],
    [/OPR\/(\d+)/, 'Opera'],
    [/Firefox\/(\d+)/, 'Firefox'],
    [/Chrome\/(\d+)/, 'Chrome'],
    [/Version\/(\d+).*Safari/, 'Safari'],
  ];
  for (const [re, name] of rules) {
    const m = re.exec(ua);
    if (m) return `${name} ${m[1]}`;
  }
  return 'Navigateur inconnu';
}

export function parseOS(ua: string): string {
  if (/Android (\d+)/.test(ua)) return `Android ${/Android (\d+)/.exec(ua)![1]}`;
  if (/iPhone|iPad/.test(ua)) return 'iOS';
  if (/Windows NT 10/.test(ua)) return 'Windows 10/11';
  if (/Windows/.test(ua)) return 'Windows';
  if (/Mac OS X/.test(ua)) return 'macOS';
  if (/CrOS/.test(ua)) return 'ChromeOS';
  if (/Linux/.test(ua)) return 'Linux';
  return 'Système inconnu';
}

interface Env {
  userAgent: string;
  language: string;
  languages: readonly string[];
  timeZone: string;
  screen: { width: number; height: number; dpr: number };
  cores?: number;
  memory?: number;
  touch: boolean;
  darkMode: boolean;
  cookies: boolean;
  doNotTrack: boolean;
  gpc: boolean;
}

export function readEnv(): Env {
  const nav = navigator as Navigator & { deviceMemory?: number; globalPrivacyControl?: boolean };
  return {
    userAgent: nav.userAgent,
    language: nav.language,
    languages: nav.languages ?? [nav.language],
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    screen: { width: screen.width, height: screen.height, dpr: window.devicePixelRatio || 1 },
    cores: nav.hardwareConcurrency,
    memory: nav.deviceMemory,
    touch: 'ontouchstart' in window || nav.maxTouchPoints > 0,
    darkMode: typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches,
    cookies: nav.cookieEnabled,
    doNotTrack: nav.doNotTrack === '1',
    gpc: nav.globalPrivacyControl === true,
  };
}

export function facts(env: Env): Fact[] {
  const out: Fact[] = [
    { label: 'Navigateur', value: parseBrowser(env.userAgent) },
    { label: 'Système', value: parseOS(env.userAgent) },
    { label: 'Langues', value: env.languages.slice(0, 3).join(', ') },
    { label: 'Fuseau', value: env.timeZone },
    { label: 'Écran', value: `${env.screen.width}×${env.screen.height} @${env.screen.dpr}x` },
  ];
  if (env.cores) out.push({ label: 'Cœurs CPU', value: String(env.cores) });
  if (env.memory) out.push({ label: 'Mémoire', value: `≈ ${env.memory} Go` });
  out.push(
    { label: 'Tactile', value: env.touch ? 'oui' : 'non' },
    { label: 'Thème', value: env.darkMode ? 'sombre' : 'clair' },
    { label: 'Do Not Track', value: env.doNotTrack || env.gpc ? 'activé' : 'désactivé' },
  );
  return out;
}

/**
 * Estimation grossière de l'entropie de l'empreinte, en bits. Les poids de
 * l'agent utilisateur (≈ 10), de l'écran (≈ 4,8) et du fuseau (≈ 3) suivent
 * les ordres de grandeur publiés par l'EFF (Panopticlick, 2010) ; les autres
 * sont des estimations. Indicatif : ce n'est pas une mesure.
 */
export function entropyBits(list: Fact[]): number {
  const weights: Record<string, number> = {
    Navigateur: 10,
    Système: 3,
    Langues: 5,
    Fuseau: 3,
    Écran: 4.8,
    'Cœurs CPU': 2,
    Mémoire: 1.5,
    Tactile: 0.5,
    Thème: 0.8,
    'Do Not Track': 0.9,
  };
  return Math.round(list.reduce((sum, f) => sum + (weights[f.label] ?? 0), 0) * 10) / 10;
}
