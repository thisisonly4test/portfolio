/**
 * Mini-CTF caché dans le site. Cinq flags `FLAG{...}` sont dispersés : dans
 * le terminal, le code source, robots.txt, un enregistrement DNS et la
 * console du navigateur. On les valide avec `submit FLAG{...}`.
 *
 * Seules les empreintes SHA-256 sont stockées ici : lire ce fichier ne
 * donne pas les réponses.
 */

export interface Challenge {
  id: string;
  title: string;
  hint: string;
  sha256: string;
  points: number;
}

export const CHALLENGES: Challenge[] = [
  {
    id: 'hidden',
    title: 'Fichiers cachés',
    hint: 'Sur une machine inconnue, le premier réflexe : regarder ce qui ne s’affiche pas.',
    sha256: '3c23d993f42980011309d2ec252a9f7912eba17c4d74c0d05b4c0e589ac04a42',
    points: 10,
  },
  {
    id: 'source',
    title: 'Code source',
    hint: 'Le HTML garde parfois des commentaires. Et le base64 n’a jamais chiffré personne.',
    sha256: '24c61d5b20e356650ef686a482113647a20f21804fbf43a22e48fce35a9d8ab9',
    points: 20,
  },
  {
    id: 'robots',
    title: 'Ce qu’on ne doit pas indexer',
    hint: 'Les robots ont leurs consignes. Les humains peuvent les lire aussi.',
    sha256: '654dd230c29bc40b914505ae7d89ca56633e4ddc72ae76deb1ddb2067caef354',
    points: 20,
  },
  {
    id: 'dns',
    title: 'Enregistrement DNS',
    hint: 'Les zones DNS ne contiennent pas que des adresses. César aurait apprécié la suite.',
    sha256: 'ad0eca07923e45baafbd1550d337e677186e7d295f9f2219e9785231c76d17c4',
    points: 30,
  },
  {
    id: 'console',
    title: 'Console du navigateur',
    hint: 'F12. Le site t’y a laissé un message, et un objet à interroger.',
    sha256: 'a84ca93e00b52d4446e9cd7e518ee0ceb7888ba711de8e2e9ea478e1d26a2449',
    points: 30,
  },
];

export async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export type SubmitResult =
  | { status: 'ok'; challenge: Challenge; total: number }
  | { status: 'already'; challenge: Challenge }
  | { status: 'invalid' };

const KEY = 'aurele:flags';

function readStore(): string[] {
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function writeStore(ids: string[]) {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(ids));
  } catch {
    /* stockage indisponible : la progression vit le temps de la page */
  }
}

type Listener = (found: string[]) => void;

export class Ctf {
  private found: Set<string>;
  private listeners = new Set<Listener>();

  constructor(private readonly challenges: Challenge[] = CHALLENGES) {
    this.found = new Set(readStore().filter((id) => challenges.some((c) => c.id === id)));
  }

  get foundIds(): string[] {
    return this.challenges.filter((c) => this.found.has(c.id)).map((c) => c.id);
  }

  get score(): number {
    return this.challenges.filter((c) => this.found.has(c.id)).reduce((s, c) => s + c.points, 0);
  }

  get maxScore(): number {
    return this.challenges.reduce((s, c) => s + c.points, 0);
  }

  get complete(): boolean {
    return this.found.size === this.challenges.length;
  }

  async submit(raw: string): Promise<SubmitResult> {
    const flag = raw.trim();
    if (!/^FLAG\{[^}]{1,80}\}$/.test(flag)) return { status: 'invalid' };
    const hash = await sha256Hex(flag);
    const challenge = this.challenges.find((c) => c.sha256 === hash);
    if (!challenge) return { status: 'invalid' };
    if (this.found.has(challenge.id)) return { status: 'already', challenge };
    this.found.add(challenge.id);
    writeStore([...this.found]);
    for (const l of this.listeners) l(this.foundIds);
    return { status: 'ok', challenge, total: this.found.size };
  }

  reset(): void {
    this.found.clear();
    writeStore([]);
    for (const l of this.listeners) l([]);
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}

export function rot13(s: string): string {
  return s.replace(/[a-z]/gi, (ch) => {
    const base = ch <= 'Z' ? 65 : 97;
    return String.fromCharCode(((ch.charCodeAt(0) - base + 13) % 26) + base);
  });
}
