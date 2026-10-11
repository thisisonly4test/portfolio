/**
 * Découpe une ligne de commande façon shell : guillemets simples et doubles,
 * antislash d'échappement, et enchaînement avec `;` ou `&&`.
 */

export interface Pipeline {
  argv: string[];
  /** Opérateur qui relie cette commande à la suivante. */
  next: ';' | '&&' | null;
}

export class ParseError extends Error {}

export function parse(line: string): Pipeline[] {
  const commands: Pipeline[] = [];
  let argv: string[] = [];
  let current = '';
  let hasToken = false;
  let quote: '"' | "'" | null = null;

  const pushToken = () => {
    if (hasToken) argv.push(current);
    current = '';
    hasToken = false;
  };
  const pushCommand = (next: Pipeline['next']) => {
    pushToken();
    if (argv.length) commands.push({ argv, next });
    else if (next === '&&') throw new ParseError("erreur de syntaxe près du symbole inattendu « && »");
    argv = [];
  };

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (quote) {
      if (ch === quote) quote = null;
      else if (ch === '\\' && quote === '"' && i + 1 < line.length) current += line[++i];
      else current += ch;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      hasToken = true;
    } else if (ch === '\\' && i + 1 < line.length) {
      current += line[++i];
      hasToken = true;
    } else if (ch === ' ' || ch === '\t') {
      pushToken();
    } else if (ch === ';') {
      pushCommand(';');
    } else if (ch === '&' && line[i + 1] === '&') {
      i++;
      pushCommand('&&');
    } else {
      current += ch;
      hasToken = true;
    }
  }
  if (quote) throw new ParseError(`fin de fichier inattendue en cherchant le « ${quote} » correspondant`);
  pushCommand(null);
  const last = commands[commands.length - 1];
  if (last) last.next = null;
  return commands;
}

/** Sépare les options courtes (-la) des arguments. */
export function splitFlags(args: string[]): { flags: Set<string>; rest: string[] } {
  const flags = new Set<string>();
  const rest: string[] = [];
  for (const arg of args) {
    if (arg.startsWith('--') && arg.length > 2) flags.add(arg.slice(2));
    else if (arg.startsWith('-') && arg.length > 1) for (const f of arg.slice(1)) flags.add(f);
    else rest.push(arg);
  }
  return { flags, rest };
}
