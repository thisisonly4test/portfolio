/**
 * Le shell du moniteur whiterose : quelques commandes, une voix. Pur et sans
 * DOM, pour les tests. Les lignes sont du texte brut ; la vue les échappe.
 */

export interface CrtContext {
  now: Date;
  /** Temps passé sur le site, en millisecondes. */
  elapsedMs: number;
  /** Ville déduite du fuseau horaire, pour `trace`. */
  city: string;
  /** Tirage pour `rose` : un nombre dans [0, 1). */
  random: number;
}

export type CrtAction = 'clear' | 'exit' | 'trace';

export interface CrtResult {
  lines: string[];
  action?: CrtAction;
  /** Lignes « dites » : tapées lettre à lettre plutôt qu'affichées d'un coup. */
  voice?: boolean;
}

export const QUOTES = [
  'Le temps est la seule chose qu’on ne rend jamais.',
  'Je ne suis jamais en retard. Ce sont les autres qui arrivent trop tôt pour comprendre.',
  'Une seconde perdue ne se rattrape pas. Elle s’ajoute simplement à la liste.',
  'Tu crois choisir où tu cliques. C’est mignon.',
  'Les gens fuient le silence. Moi, j’y entends les horloges.',
  'Chaque système a une faille. Chaque personne aussi. La tienne, c’est la curiosité.',
  'La patience n’est pas de l’attente. C’est de la préparation.',
];

export const BOOT = [
  'WR-OS 0.9 :: liaison chiffrée',
  '[ ok ] canal ouvert, 4 relais',
  '[ ok ] horloge synchronisée à la milliseconde',
  '[ ok ] journal local : rien ne sort d’ici',
  '',
  'Bonsoir.',
  'Tu as trouvé la porte. Peu de gens lisent jusqu’à la fin.',
  'Ne me fais pas perdre mon temps : tape help.',
];

export const IDLE = ['bip. bip.', 'Tu attends quelque chose ? Le temps, lui, n’attend pas.'];

const pad = (n: number, w = 2) => String(n).padStart(w, '0');

export function clock(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}

export function duration(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const parts = [h && `${h} h`, (h || m) && `${m} min`, `${s % 60} s`].filter(Boolean);
  return parts.join(' ');
}

export const CRT_COMMANDS: Record<string, string> = {
  help: 'cette liste',
  time: 'l’heure exacte, et ce que tu as dépensé',
  trace: 'suivre ta connexion sur la carte',
  rose: 'une pensée',
  whoami: 'ce que je sais de toi',
  clear: 'effacer l’écran',
  exit: 'revenir au site',
};

export function runCrt(line: string, ctx: CrtContext): CrtResult {
  const [cmd = '', ...args] = line.trim().split(/\s+/);
  switch (cmd.toLowerCase()) {
    case '':
      return { lines: [] };
    case 'help':
    case '?':
      return { lines: Object.entries(CRT_COMMANDS).map(([k, v]) => `${k.padEnd(8)} ${v}`) };
    case 'time':
    case 'date':
      return {
        lines: [
          `Il est ${clock(ctx.now)}.`,
          `Tu es ici depuis ${duration(ctx.elapsedMs)}.`,
          'Je les ai toutes comptées.',
        ],
        voice: true,
      };
    case 'trace':
    case 'traceroute':
      return { lines: [`Traçage depuis ${ctx.city}…`], action: 'trace' };
    case 'rose':
      return { lines: [`« ${QUOTES[Math.floor(ctx.random * QUOTES.length) % QUOTES.length]} »`], voice: true };
    case 'whoami':
      return {
        lines: [
          `Un visiteur, quelque part près de ${ctx.city}.`,
          'Ton navigateur me l’a dit. Ton fuseau horaire, du moins.',
          'Pour le reste, j’ai le temps.',
        ],
        voice: true,
      };
    case 'sudo':
      return { lines: ['Ici, personne n’a les droits. Pas même toi.'], voice: true };
    case 'whiterose':
      return { lines: ['Tu y es déjà.'] };
    case 'clear':
      return { lines: [], action: 'clear' };
    case 'exit':
    case 'quit':
    case 'logout':
      return { lines: ['Au revoir. À l’heure, la prochaine fois.'], action: 'exit', voice: true };
    default:
      return { lines: [`${[cmd, ...args].join(' ').slice(0, 40)} : inconnu. Le temps, lui, continue.`] };
  }
}
