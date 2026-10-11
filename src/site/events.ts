/**
 * Journal de sécurité du site. Ce que fait le visiteur (entrer, lire une
 * section, taper une commande, trouver un flag) devient un événement façon
 * SIEM, affiché au saut `siem`. Tout reste en mémoire, dans le navigateur.
 */

export interface SecEvent {
  id: number;
  time: Date;
  /** Niveau Wazuh, de 0 (info) à 15 (critique). */
  level: number;
  rule: number;
  text: string;
  agent: string;
}

type Listener = (e: SecEvent) => void;

export class EventLog {
  readonly events: SecEvent[] = [];
  private listeners = new Set<Listener>();
  private nextId = 1;

  constructor(private readonly now: () => Date = () => new Date()) {}

  log(level: number, rule: number, text: string, agent = 'portfolio'): SecEvent {
    const e: SecEvent = { id: this.nextId++, time: this.now(), level, rule, text, agent };
    this.events.push(e);
    if (this.events.length > 200) this.events.shift();
    for (const l of this.listeners) l(e);
    return e;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Nombre d'événements par tranche de niveau : bas (0-4), moyen (5-9), haut (10+). */
  counts(): { low: number; mid: number; high: number } {
    let low = 0;
    let mid = 0;
    let high = 0;
    for (const e of this.events) {
      if (e.level >= 10) high++;
      else if (e.level >= 5) mid++;
      else low++;
    }
    return { low, mid, high };
  }
}

/** Règle déclenchée par une commande du terminal, ou null si rien à signaler. */
export function classifyCommand(line: string): { level: number; rule: number; text: string } | null {
  const cmd = line.trim();
  if (!cmd) return null;
  const rules: [RegExp, number, number, string][] = [
    [/\brm\s+-\w*r\w*\s+(\/|~)/, 12, 100110, 'Tentative de suppression récursive de la racine'],
    [/\/etc\/shadow/, 10, 5710, 'Tentative de lecture des empreintes de mots de passe'],
    [/^(sudo|please)\b/, 5, 5401, 'Élévation de privilèges demandée (sudo)'],
    [/^nmap\b/, 6, 40101, 'Scan de ports détecté'],
    [/^submit\b/, 3, 100200, 'Soumission d’un flag'],
    [/^(cd|ls)\s+\/root\b/, 7, 5902, 'Accès refusé au dossier de root'],
    [/^ls\b.*-\w*a/, 2, 100301, 'Énumération des fichiers cachés'],
    [/^dig\b/, 2, 100302, 'Requête DNS'],
  ];
  for (const [re, level, rule, text] of rules) if (re.test(cmd)) return { level, rule, text };
  return { level: 1, rule: 100001, text: `Commande exécutée : ${cmd.slice(0, 48)}` };
}

export const events = new EventLog();
