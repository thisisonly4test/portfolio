import { describe, expect, it } from 'vitest';
import { parse, ParseError, splitFlags } from '../../src/shell/parser';

describe('parse', () => {
  it('découpe sur les espaces', () => {
    expect(parse('ls -la  /home')).toEqual([{ argv: ['ls', '-la', '/home'], next: null }]);
  });

  it('respecte les guillemets et les échappements', () => {
    expect(parse(`echo "a b" 'c d' e\\ f`)[0]!.argv).toEqual(['echo', 'a b', 'c d', 'e f']);
    expect(parse('echo ""')[0]!.argv).toEqual(['echo', '']);
  });

  it('enchaîne avec ; et &&', () => {
    expect(parse('cd /tmp && ls; pwd')).toEqual([
      { argv: ['cd', '/tmp'], next: '&&' },
      { argv: ['ls'], next: ';' },
      { argv: ['pwd'], next: null },
    ]);
  });

  it('signale les guillemets non fermés et les && orphelins', () => {
    expect(() => parse('echo "oups')).toThrow(ParseError);
    expect(() => parse('&& ls')).toThrow(ParseError);
  });

  it('ignore une ligne vide', () => {
    expect(parse('   ')).toEqual([]);
  });
});

describe('splitFlags', () => {
  it('sépare options courtes, longues et arguments', () => {
    const { flags, rest } = splitFlags(['-la', '--all', 'x', '-']);
    expect([...flags].sort()).toEqual(['a', 'all', 'l']);
    expect(rest).toEqual(['x', '-']);
  });
});
