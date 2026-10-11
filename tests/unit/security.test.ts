// @vitest-environment jsdom
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { profile } from '../../src/data/profile';
import { stripTags } from '../../src/shell/format';
import { Shell } from '../../src/shell/shell';
import { buildFS } from '../../src/shell/vfs';
import { CHALLENGES, Ctf, rot13, sha256Hex } from '../../src/site/ctf';
import { buildPacket, hexRows, internetChecksum, ipBytes } from '../../src/site/dissect';
import { classifyCommand, EventLog } from '../../src/site/events';

describe('somme de contrôle Internet', () => {
  it('donne b861 sur l’exemple classique d’en-tête IPv4', () => {
    const header = Uint8Array.from([0x45, 0x00, 0x00, 0x73, 0x00, 0x00, 0x40, 0x00, 0x40, 0x11, 0x00, 0x00, 0xc0, 0xa8, 0x00, 0x01, 0xc0, 0xa8, 0x00, 0xc7]);
    expect(internetChecksum(header).toString(16)).toBe('b861');
  });

  it('une trame vérifiée donne 0 quand on inclut la somme', () => {
    const header = Uint8Array.from([0x45, 0x00, 0x00, 0x73, 0x00, 0x00, 0x40, 0x00, 0x40, 0x11, 0xb8, 0x61, 0xc0, 0xa8, 0x00, 0x01, 0xc0, 0xa8, 0x00, 0xc7]);
    expect(internetChecksum(header)).toBe(0);
  });

  it('refuse une IPv4 invalide', () => {
    expect(() => ipBytes('300.1.1.1')).toThrow();
    expect(ipBytes('10.0.0.1')).toEqual([10, 0, 0, 1]);
  });
});

describe('trame du visiteur', () => {
  const packet = buildPacket({
    srcIp: '192.168.1.37',
    dstIp: '203.0.113.1',
    srcPort: 51022,
    dstPort: 80,
    seq: 1000,
    ack: 2000,
    id: 0x1c46,
    host: 'portfolio',
    userAgent: 'TestAgent/1.0',
    language: 'fr-FR',
  });
  const b = packet.bytes;

  it('a des en-têtes de la bonne taille et une longueur IP cohérente', () => {
    expect(b[12]).toBe(0x08);
    expect(b[13]).toBe(0x00);
    expect(b[14]).toBe(0x45);
    expect((b[16]! << 8) | b[17]!).toBe(b.length - 14);
    expect(packet.payload.start).toBe(14 + 20 + 20);
  });

  it('a une somme IPv4 valide', () => {
    expect(internetChecksum(b.slice(14, 34))).toBe(0);
  });

  it('a une somme TCP valide sur le pseudo-en-tête', () => {
    const tcp = b.slice(34);
    const pseudo = Uint8Array.from([...b.slice(26, 30), ...b.slice(30, 34), 0, 6, tcp.length >> 8, tcp.length & 0xff, ...tcp]);
    expect(internetChecksum(pseudo)).toBe(0);
  });

  it('porte les vraies valeurs du visiteur dans la requête HTTP', () => {
    const http = new TextDecoder().decode(b.slice(packet.payload.start));
    expect(http.startsWith('GET / HTTP/1.1\r\n')).toBe(true);
    expect(http).toContain('User-Agent: TestAgent/1.0');
    expect(http).toContain('Accept-Language: fr-FR');
  });

  it('chaque champ pointe sur des octets existants, sans chevauchement', () => {
    const sorted = [...packet.fields].sort((x, y) => x.start - y.start);
    for (let i = 0; i < sorted.length; i++) {
      expect(sorted[i]!.end).toBeGreaterThan(sorted[i]!.start);
      expect(sorted[i]!.end).toBeLessThanOrEqual(b.length);
      if (i) expect(sorted[i]!.start).toBeGreaterThanOrEqual(sorted[i - 1]!.end);
    }
  });

  it('découpe le vidage hexadécimal en lignes de 16 octets', () => {
    const rows = hexRows(b);
    expect(rows[0]!.offset).toBe('0000');
    expect(rows[1]!.offset).toBe('0010');
    expect(rows.flatMap((r) => r.bytes)).toHaveLength(b.length);
  });
});

describe('CTF', () => {
  beforeEach(() => localStorage.clear());

  it('calcule le SHA-256 comme Node', async () => {
    expect(await sha256Hex('abc')).toBe(createHash('sha256').update('abc').digest('hex'));
  });

  it('chaque flag planté dans le site correspond à un défi', async () => {
    const html = readFileSync('index.html', 'utf8');
    const b64 = /debug: ([A-Za-z0-9+/=]+)/.exec(html)![1]!;
    const robots = readFileSync('public/backup-2024/notes.txt', 'utf8');
    const shell = new Shell(buildFS(profile), profile);
    const secret = stripTags(shell.run('cat ~/.secret').lines.join('\n'));
    const dns = stripTags(shell.run('dig aurele.lan TXT').lines.join('\n'));
    const main = readFileSync('src/main.ts', 'utf8');
    const hex = /return '([0-9a-f]{40,})'/.exec(main)![1]!;

    const flags = [
      /FLAG\{[^}]+\}/.exec(secret)![0],
      atob(b64),
      /FLAG\{[^}]+\}/.exec(robots)![0],
      rot13(/note=(SYNT\{[^}]+\})/.exec(dns)![1]!),
      new TextDecoder().decode(Uint8Array.from(hex.match(/../g)!.map((x) => parseInt(x, 16)))),
    ];
    const hashes = await Promise.all(flags.map(sha256Hex));
    expect(hashes).toEqual(CHALLENGES.map((c) => c.sha256));
  });

  it('valide, refuse et mémorise', async () => {
    const ctf = new Ctf();
    expect((await ctf.submit('n’importe quoi')).status).toBe('invalid');
    expect((await ctf.submit('FLAG{faux}')).status).toBe('invalid');
    const ok = await ctf.submit(' FLAG{ls_-a_est_un_reflexe} ');
    expect(ok).toMatchObject({ status: 'ok', total: 1 });
    expect((await ctf.submit('FLAG{ls_-a_est_un_reflexe}')).status).toBe('already');
    expect(ctf.score).toBe(10);
    expect(new Ctf().foundIds).toEqual(['hidden']);
    ctf.reset();
    expect(new Ctf().foundIds).toEqual([]);
  });

  it('ignore un stockage corrompu', () => {
    localStorage.setItem('aurele:flags', '{oups');
    expect(new Ctf().foundIds).toEqual([]);
    localStorage.setItem('aurele:flags', JSON.stringify(['hidden', 'inconnu', 42]));
    expect(new Ctf().foundIds).toEqual(['hidden']);
  });

  it('rot13 est sa propre réciproque', () => {
    expect(rot13(rot13('FLAG{Abc_xyz}'))).toBe('FLAG{Abc_xyz}');
    expect(rot13('FLAG')).toBe('SYNT');
  });
});

describe('journal SIEM', () => {
  it('classe les commandes sensibles', () => {
    expect(classifyCommand('cat /etc/shadow')?.level).toBe(10);
    expect(classifyCommand('sudo rm -rf /')?.level).toBe(12);
    expect(classifyCommand('nmap localhost')?.level).toBe(6);
    expect(classifyCommand('sudo -l')?.level).toBe(5);
    expect(classifyCommand('ls -la')?.level).toBe(2);
    expect(classifyCommand('whoami')).toMatchObject({ level: 1 });
    expect(classifyCommand('   ')).toBeNull();
  });

  it('compte par niveau et prévient les abonnés', () => {
    const log = new EventLog(() => new Date(0));
    const seen: number[] = [];
    log.subscribe((e) => seen.push(e.level));
    log.log(1, 1, 'a');
    log.log(6, 2, 'b');
    log.log(12, 3, 'c');
    expect(log.counts()).toEqual({ low: 1, mid: 1, high: 1 });
    expect(seen).toEqual([1, 6, 12]);
  });

  it('garde au plus 200 événements', () => {
    const log = new EventLog();
    for (let i = 0; i < 250; i++) log.log(1, i, 'x');
    expect(log.events).toHaveLength(200);
    expect(log.events[0]!.rule).toBe(50);
  });
});

describe('DNS', () => {
  const shell = new Shell(buildFS(profile), profile);
  const run = (cmd: string) => stripTags(shell.run(cmd).lines.join('\n'));
  it('répond aux types demandés', () => {
    expect(run('dig aurele.lan')).toContain('IN\tA\t10.0.20.10');
    expect(run('dig aurele.lan ANY')).toContain('MX');
    expect(run('dig inconnu.lan')).toContain('NXDOMAIN');
    expect(run('dig')).toContain('usage');
  });
  it('resolv.conf met sur la piste', () => {
    expect(run('cat /etc/resolv.conf')).toContain('aurele.lan');
  });
});
