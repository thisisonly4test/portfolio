import type { Profile } from '../data/profile';
import type { Effect } from '../types';
import { commands } from './commands';
import { c } from './format';
import { parse, ParseError } from './parser';
import { prettyPath, resolvePath, type VirtualFS } from './vfs';

export interface ShellResult {
  /** Lignes HTML déjà échappées. */
  lines: string[];
  effects: Effect[];
}

export interface CommandContext {
  shell: Shell;
  fs: VirtualFS;
  profile: Profile;
  out: (...lines: string[]) => void;
  effect: (e: Effect) => void;
}

export interface Command {
  summary: string;
  usage?: string;
  /** Masquée de `help` (œufs de Pâques). */
  hidden?: boolean;
  /** Code de retour : 0 = succès. */
  run: (args: string[], ctx: CommandContext) => number | void;
}

export interface ShellOptions {
  now?: () => number;
  bootedAt?: number;
}

export class Shell {
  cwd: string;
  /** Dossier précédent, pour `cd -`. */
  oldCwd: string;
  readonly history: string[] = [];
  readonly now: () => number;
  readonly bootedAt: number;

  constructor(
    readonly fs: VirtualFS,
    readonly profile: Profile,
    options: ShellOptions = {},
  ) {
    this.cwd = fs.home;
    this.oldCwd = fs.home;
    this.now = options.now ?? (() => Date.now());
    this.bootedAt = options.bootedAt ?? this.now();
  }

  resolve(target: string): string {
    return resolvePath(this.cwd, target, this.fs.home);
  }

  /** Invite colorée, au format HTML. */
  promptHtml(): string {
    const { username, hostname } = this.profile;
    return `${c('accent', `${username}@${hostname}`)}:${c('dir', prettyPath(this.cwd, this.fs.home))}$`;
  }

  promptText(): string {
    const { username, hostname } = this.profile;
    return `${username}@${hostname}:${prettyPath(this.cwd, this.fs.home)}$`;
  }

  run(input: string): ShellResult {
    const lines: string[] = [];
    const effects: Effect[] = [];
    const trimmed = input.trim();
    if (!trimmed) return { lines, effects };
    if (this.history[this.history.length - 1] !== trimmed) this.history.push(trimmed);

    let pipelines;
    try {
      pipelines = parse(this.expandHistory(trimmed));
    } catch (err) {
      if (err instanceof ParseError) return { lines: [c('err', `bash: ${err.message}`)], effects };
      throw err;
    }

    const ctx: CommandContext = {
      shell: this,
      fs: this.fs,
      profile: this.profile,
      out: (...l) => lines.push(...l),
      effect: (e) => effects.push(e),
    };

    let status = 0;
    for (const { argv, next } of pipelines) {
      const [name, ...args] = argv as [string, ...string[]];
      const cmd = Object.prototype.hasOwnProperty.call(commands, name) ? commands[name] : undefined;
      if (!cmd) {
        lines.push(...notFound(name));
        status = 127;
      } else {
        status = cmd.run(args, ctx) ?? 0;
      }
      if (next === '&&' && status !== 0) break;
    }
    return { lines, effects };
  }

  /** `!!` rejoue la commande précédente, comme dans bash. */
  private expandHistory(line: string): string {
    if (!line.includes('!!')) return line;
    const previous = this.history[this.history.length - 2] ?? '';
    return line.replace(/!!/g, previous);
  }

  /** Complétion par Tab : noms de commandes puis chemins. */
  complete(input: string): { value: string; options: string[] } {
    const lastSpace = input.lastIndexOf(' ');
    const head = input.slice(0, lastSpace + 1);
    const word = input.slice(lastSpace + 1);

    let candidates: string[];
    if (lastSpace === -1) {
      candidates = Object.entries(commands)
        .filter(([name, cmd]) => !cmd.hidden && name.startsWith(word))
        .map(([name]) => name + ' ');
    } else {
      const slash = word.lastIndexOf('/');
      const dirPart = slash === -1 ? '' : word.slice(0, slash + 1);
      const base = slash === -1 ? word : word.slice(slash + 1);
      const dirPath = this.resolve(dirPart || '.');
      candidates = this.fs
        .list(dirPath, base.startsWith('.'))
        .filter((n) => n.name.startsWith(base))
        .map((n) => dirPart + n.name + (n.type === 'dir' ? '/' : ' '));
    }

    if (candidates.length === 0) return { value: input, options: [] };
    if (candidates.length === 1) return { value: head + candidates[0], options: [] };
    const prefix = commonPrefix(candidates);
    return { value: head + prefix, options: candidates.map((x) => x.trimEnd()) };
  }
}

function commonPrefix(words: string[]): string {
  let prefix = words[0] ?? '';
  for (const w of words) while (!w.startsWith(prefix)) prefix = prefix.slice(0, -1);
  return prefix;
}

function levenshtein(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]!;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j]!;
      row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return row[b.length]!;
}

function notFound(name: string): string[] {
  const suggestion = Object.entries(commands)
    .filter(([, cmd]) => !cmd.hidden)
    .map(([n]) => ({ n, d: levenshtein(name, n) }))
    .filter((x) => x.d <= 2)
    .sort((a, b) => a.d - b.d)[0];
  const lines = [c('err', `${name} : commande introuvable`)];
  if (suggestion) lines.push(`Vouliez-vous dire ${c('accent', suggestion.n)} ? Tape ${c('accent', 'help')} pour la liste.`);
  else lines.push(`Tape ${c('accent', 'help')} pour voir les commandes disponibles.`);
  return lines;
}
