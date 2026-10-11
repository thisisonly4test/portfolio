import { contactLinks, SECTIONS, type SectionId } from '../data/profile';
import { c, cmdLink, esc, formatDuration } from './format';
import { splitFlags } from './parser';
import type { Command, CommandContext } from './shell';
import type { DirNode, VNode } from './vfs';

/** Coloration légère du Markdown pour `cat`. */
export function highlightMarkdown(line: string): string {
  if (/^#{1,6} /.test(line)) return c('accent', line);
  if (line.startsWith('> ')) return c('muted', line);
  if (line.startsWith('- ')) return `${c('muted', '·')} ${esc(line.slice(2))}`;
  if (line.startsWith('#')) return c('muted', line);
  return esc(line);
}

function nodeName(node: VNode): string {
  if (node.type === 'dir') return c(node.hidden ? 'hidden' : 'dir', node.name + '/');
  return c(node.hidden ? 'hidden' : 'file', node.name);
}

function lsLong(node: VNode, username: string): string {
  const perms = node.type === 'dir' ? 'drwxr-x---' : '-rw-r-----';
  const size = node.type === 'dir' ? 4096 : new TextEncoder().encode(node.content).length;
  return `${perms} 1 ${username} ${username} ${String(size).padStart(5)} oct. 10 21:36 ${nodeName(node)}`;
}

function treeLines(node: DirNode, prefix: string, ctx: CommandContext, counts: { d: number; f: number }): void {
  const children = [...node.children.values()].filter((n) => !n.hidden);
  children.forEach((child, i) => {
    const last = i === children.length - 1;
    ctx.out(`${c('muted', prefix + (last ? '└── ' : '├── '))}${nodeName(child)}`);
    if (child.type === 'dir') {
      counts.d++;
      treeLines(child, prefix + (last ? '    ' : '│   '), ctx, counts);
    } else counts.f++;
  });
}

const SECTION_ALIASES: Record<string, SectionId> = {
  about: 'apropos',
  apropos: 'apropos',
  skills: 'competences',
  competences: 'competences',
  projects: 'projets',
  projets: 'projets',
  parcours: 'parcours',
  cv: 'parcours',
  veille: 'veille',
  watch: 'veille',
  contact: 'contact',
};

export const commands: Record<string, Command> = {
  help: {
    summary: 'Affiche cette aide',
    run(_args, ctx) {
      ctx.out(c('bold', 'Commandes'), '');
      for (const [name, cmd] of Object.entries(commands).filter(([, x]) => !x.hidden)) {
        ctx.out(`  ${cmdLink(name, name.padEnd(10))} ${c('muted', cmd.summary)}`);
      }
      ctx.out(
        '',
        `${c('muted', 'Tab complète, ↑ ↓ parcourent l’historique, Ctrl+L efface, Échap ferme.')}`,
        `${c('muted', 'Certaines commandes ne sont pas listées. Un bon admin regarde les fichiers cachés.')}`,
      );
    },
  },

  whoami: {
    summary: "Nom d'utilisateur",
    run(_args, ctx) {
      ctx.out(esc(ctx.profile.username));
    },
  },

  about: {
    summary: 'Qui je suis',
    run(_args, ctx) {
      const p = ctx.profile;
      ctx.out(c('bold', `${p.displayName} — ${p.role}`), c('muted', p.location), '');
      for (const line of p.about) ctx.out(esc(line));
      if (p.availability) ctx.out('', `${c('ok', '●')} ${esc(p.availability)}`);
    },
  },

  skills: {
    summary: 'Compétences par domaine',
    run(_args, ctx) {
      const width = Math.max(...ctx.profile.skills.map((s) => s.title.length));
      for (const s of ctx.profile.skills) {
        ctx.out(`${c('accent', s.title.padEnd(width))}  ${s.items.map(esc).join(c('muted', ' · '))}`);
      }
    },
  },

  projects: {
    summary: 'Mes projets (projects <nom> pour le détail)',
    usage: 'projects [nom]',
    run(args, ctx) {
      const list = ctx.profile.projects;
      const id = args[0]?.toLowerCase();
      if (id) {
        const p = list.find((x) => x.id === id || x.name.toLowerCase() === id);
        if (!p) {
          ctx.out(c('err', `projects : « ${args[0]} » introuvable`));
          return 1;
        }
        ctx.out(`${c('bold', p.name)} ${c('muted', `${p.domain} · ${p.year} · ${p.status}`)}`, esc(p.tagline), '');
        ctx.out(c('accent', 'Problème'), esc(p.problem), '', c('accent', 'Solution'));
        for (const d of p.solution) ctx.out(`${c('muted', '·')} ${esc(d)}`);
        ctx.out('', `${c('muted', 'Stack')}  ${p.stack.map(esc).join(c('muted', ' · '))}`);
        if (p.link) ctx.out(`${c('muted', 'Lien ')}  <a class="t-a" href="${esc(p.link)}" target="_blank" rel="noopener">${esc(p.link)}</a>`);
        return 0;
      }
      const width = Math.max(...list.map((p) => p.id.length));
      for (const p of list) ctx.out(`  ${cmdLink(`projects ${p.id}`, p.id.padEnd(width))}  ${c('muted', p.domain.padEnd(14))} ${esc(p.tagline)}`);
    },
  },

  contact: {
    summary: 'Me contacter',
    run(_args, ctx) {
      const links = contactLinks(ctx.profile);
      if (!links.length) ctx.out(c('muted', 'Coordonnées bientôt en ligne.'));
      for (const l of links) {
        ctx.out(`  ${c('muted', l.label.padEnd(10))} <a class="t-a" href="${esc(l.href)}" target="_blank" rel="noopener">${esc(l.value)}</a>`);
      }
    },
  },

  goto: {
    summary: 'Aller à une section de la page',
    usage: `goto <${SECTIONS.map((s) => s.id).join('|')}>`,
    run(args, ctx) {
      const section = SECTION_ALIASES[(args[0] ?? '').toLowerCase()];
      if (!section) {
        ctx.out(`usage : goto <${SECTIONS.map((s) => s.id).join('|')}>`);
        return 1;
      }
      ctx.effect({ type: 'goto', section });
      ctx.effect({ type: 'exit' });
    },
  },

  ls: {
    summary: 'Liste les fichiers',
    usage: 'ls [-la] [dossier]',
    run(args, ctx) {
      const { flags, rest } = splitFlags(args);
      const showAll = flags.has('a') || flags.has('all');
      const long = flags.has('l');
      const targets = rest.length ? rest : ['.'];
      let status = 0;
      targets.forEach((t, i) => {
        const path = ctx.shell.resolve(t);
        const node = ctx.fs.get(path);
        if (!node) {
          ctx.out(c('err', `ls: impossible d'accéder à '${t}': Aucun fichier ou dossier de ce nom`));
          status = 2;
          return;
        }
        if (path === '/root') {
          ctx.out(c('err', `ls: impossible d'ouvrir le répertoire '${t}': Permission non accordée`));
          status = 2;
          return;
        }
        if (targets.length > 1) ctx.out(`${esc(t)} :`);
        const entries = node.type === 'dir' ? ctx.fs.list(path, showAll) : [node];
        if (long) {
          ctx.out(`total ${entries.length * 4}`);
          for (const e of entries) ctx.out(lsLong(e, ctx.profile.username));
        } else if (entries.length) ctx.out(entries.map(nodeName).join('  '));
        if (targets.length > 1 && i < targets.length - 1) ctx.out('');
      });
      return status;
    },
  },

  cd: {
    summary: 'Change de dossier',
    usage: 'cd [dossier]',
    run(args, ctx) {
      const target = args[0] === '-' ? ctx.shell.oldCwd : ctx.shell.resolve(args[0] ?? '~');
      const node = ctx.fs.get(target);
      if (!node) {
        ctx.out(c('err', `cd: ${args[0]}: Aucun fichier ou dossier de ce nom`));
        return 1;
      }
      if (node.type !== 'dir') {
        ctx.out(c('err', `cd: ${args[0]}: N'est pas un dossier`));
        return 1;
      }
      if (target === '/root') {
        ctx.out(c('err', `cd: ${args[0]}: Permission non accordée`));
        return 1;
      }
      ctx.shell.oldCwd = ctx.shell.cwd;
      ctx.shell.cwd = target;
      if (args[0] === '-') ctx.out(esc(target));
    },
  },

  cat: {
    summary: 'Affiche un fichier',
    usage: 'cat <fichier>',
    run(args, ctx) {
      if (!args.length) {
        ctx.out('usage : cat <fichier>');
        return 1;
      }
      let status = 0;
      for (const t of args) {
        const path = ctx.shell.resolve(t);
        const node = ctx.fs.get(path);
        if (path === '/etc/shadow') {
          ctx.out(c('err', `cat: ${t}: Permission non accordée`), c('muted', 'Bien tenté. Les empreintes restent où elles sont.'));
          status = 1;
        } else if (!node) {
          ctx.out(c('err', `cat: ${t}: Aucun fichier ou dossier de ce nom`));
          status = 1;
        } else if (node.type === 'dir') {
          ctx.out(c('err', `cat: ${t}: est un dossier`));
          status = 1;
        } else {
          for (const line of node.content.split('\n')) ctx.out(highlightMarkdown(line));
        }
      }
      return status;
    },
  },

  tree: {
    summary: 'Arborescence',
    run(args, ctx) {
      const path = ctx.shell.resolve(args[0] ?? '.');
      const node = ctx.fs.get(path);
      if (!node || node.type !== 'dir') {
        ctx.out(c('err', `${args[0] ?? '.'} [erreur à l'ouverture du dossier]`));
        return 1;
      }
      ctx.out(c('dir', args[0] ?? '.'));
      const counts = { d: 0, f: 0 };
      treeLines(node, '', ctx, counts);
      ctx.out('', `${counts.d} dossiers, ${counts.f} fichiers`);
    },
  },

  pwd: {
    summary: 'Dossier courant',
    run(_args, ctx) {
      ctx.out(esc(ctx.shell.cwd));
    },
  },

  echo: {
    summary: 'Affiche un texte',
    run(args, ctx) {
      const vars: Record<string, string> = {
        USER: ctx.profile.username,
        HOME: ctx.fs.home,
        PWD: ctx.shell.cwd,
        HOSTNAME: ctx.profile.hostname,
        SHELL: '/bin/bash',
      };
      ctx.out(esc(args.join(' ').replace(/\$(\w+)/g, (_m, v: string) => vars[v] ?? '')));
    },
  },

  history: {
    summary: 'Historique des commandes',
    run(_args, ctx) {
      ctx.shell.history.forEach((h, i) => ctx.out(`${c('muted', String(i + 1).padStart(4))}  ${esc(h)}`));
    },
  },

  clear: {
    summary: "Efface l'écran",
    run(_args, ctx) {
      ctx.effect({ type: 'clear' });
    },
  },

  exit: {
    summary: 'Ferme le terminal',
    run(_args, ctx) {
      ctx.effect({ type: 'exit' });
    },
  },

  reboot: {
    summary: "Rejoue l'intro",
    run(_args, ctx) {
      ctx.out('Broadcast message from root@portfolio: The system will reboot now!');
      ctx.effect({ type: 'reboot' });
    },
  },

  // ---------- commandes non listées ----------

  id: {
    summary: 'Identité',
    hidden: true,
    run(_args, ctx) {
      const u = ctx.profile.username;
      ctx.out(esc(`uid=1000(${u}) gid=1000(${u}) groupes=1000(${u}),4(adm),100(users)`));
    },
  },

  hostname: {
    summary: 'Nom de la machine',
    hidden: true,
    run(_args, ctx) {
      ctx.out(esc(ctx.profile.hostname));
    },
  },

  uname: {
    summary: 'Système',
    hidden: true,
    run(args, ctx) {
      ctx.out(args.includes('-a') ? esc(`Linux ${ctx.profile.hostname} 6.12.0-amd64 #1 SMP PREEMPT_DYNAMIC Debian 6.12.38-1 x86_64 GNU/Linux`) : 'Linux');
    },
  },

  uptime: {
    summary: 'Temps écoulé',
    hidden: true,
    run(_args, ctx) {
      ctx.out(`up ${esc(formatDuration(ctx.shell.now() - ctx.shell.bootedAt))}, 1 user, load average: 0.08, 0.03, 0.01`);
    },
  },

  date: {
    summary: 'Date',
    hidden: true,
    run(_args, ctx) {
      ctx.out(esc(new Date(ctx.shell.now()).toLocaleString('fr-FR', { dateStyle: 'full', timeStyle: 'medium' })));
    },
  },

  ip: {
    summary: 'Interfaces réseau',
    hidden: true,
    run(args, ctx) {
      if (!['a', 'addr', 'address'].includes(args[0] ?? '')) {
        ctx.out('Usage: ip [ OPTIONS ] OBJECT { COMMAND | help }', 'essaie : ip a');
        return 1;
      }
      ctx.out(
        ...[
          '1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536 qdisc noqueue state UNKNOWN',
          '    inet 127.0.0.1/8 scope host lo',
          '2: eno1: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc fq_codel state UP',
          '    link/ether 3c:7c:3f:a1:0e:42 brd ff:ff:ff:ff:ff:ff',
          '    inet 192.168.10.42/24 brd 192.168.10.255 scope global eno1',
          '3: wg0: <POINTOPOINT,NOARP,UP,LOWER_UP> mtu 1420 qdisc noqueue state UNKNOWN',
          '    inet 10.0.0.1/24 scope global wg0',
        ].map(esc),
      );
    },
  },

  nmap: {
    summary: 'Scan de ports',
    hidden: true,
    run(args, ctx) {
      const target = args.filter((a) => !a.startsWith('-'))[0];
      if (!target) {
        ctx.out('Nmap 7.95 ( https://nmap.org )', 'Usage: nmap [Scan Type(s)] [Options] {target specification}');
        return 1;
      }
      if (!['localhost', '127.0.0.1', ctx.profile.hostname].includes(target)) {
        ctx.out(c('warn', `Pas de scan vers ${target} : on ne scanne que ce qu'on est autorisé à scanner.`));
        return 1;
      }
      ctx.out(
        esc(`Nmap scan report for ${target} (127.0.0.1)`),
        'Host is up (0.000042s latency).',
        'Not shown: 997 filtered tcp ports (no-response)',
        c('muted', 'PORT    STATE SERVICE'),
        `22/tcp  ${c('ok', 'open ')} ssh       ${c('muted', 'OpenSSH 10.0 (clé uniquement)')}`,
        `443/tcp ${c('ok', 'open ')} https     ${c('muted', 'ce portfolio')}`,
        `51820/udp ${c('ok', 'open')} wireguard`,
        '',
        'Nmap done: 1 IP address (1 host up) scanned in 0.42 seconds',
      );
    },
  },

  dig: {
    summary: 'Requête DNS',
    hidden: true,
    run(args, ctx) {
      const words = args.filter((a) => !a.startsWith('+') && !a.startsWith('@'));
      const type = (words.find((w) => /^(A|AAAA|MX|TXT|NS|ANY)$/i.test(w)) ?? 'A').toUpperCase();
      const name = (words.find((w) => !/^(A|AAAA|MX|TXT|NS|ANY)$/i.test(w)) ?? '').replace(/\.$/, '');
      if (!name) {
        ctx.out('usage : dig [type] <nom>   ex. dig aurele.lan ANY');
        return 1;
      }
      const zone: Record<string, Record<string, string[]>> = {
        'aurele.lan': {
          A: ['10.0.20.10'],
          NS: ['srv-ad.aurele.lan.'],
          MX: ['10 mail.aurele.lan.'],
          TXT: ['"v=spf1 mx -all"'],
        },
        'web-01.aurele.lan': { A: ['172.16.0.10'] },
        'srv-ad.aurele.lan': { A: ['10.0.20.10'] },
        'siem.aurele.lan': { A: ['10.0.30.5'] },
      };
      const records = zone[name.toLowerCase()];
      ctx.out(c('muted', `; <<>> DiG 9.20 <<>> ${name} ${type}`), c('muted', ';; SERVER: 10.0.20.10#53 (srv-ad)'), '');
      if (!records) {
        ctx.out(c('muted', ';; ->>HEADER<<- status: NXDOMAIN'));
        return 1;
      }
      ctx.out(c('muted', ';; ANSWER SECTION:'));
      const types = type === 'ANY' ? Object.keys(records) : [type];
      let n = 0;
      for (const t of types) for (const v of records[t] ?? []) {
        ctx.out(esc(`${name}.\t3600\tIN\t${t}\t${v}`));
        n++;
      }
      if (!n) ctx.out(c('muted', '(aucun enregistrement de ce type)'));
    },
  },

  ping: {
    summary: 'Teste la connexion',
    hidden: true,
    run(args, ctx) {
      const host = args.filter((a) => !a.startsWith('-'))[0] ?? 'localhost';
      ctx.out(esc(`PING ${host} 56(84) bytes of data.`));
      [0.041, 0.038, 0.052].forEach((t, i) => ctx.out(esc(`64 bytes from ${host}: icmp_seq=${i + 1} ttl=64 time=${t} ms`)));
      ctx.out('', esc(`--- ${host} ping statistics ---`), '3 packets transmitted, 3 received, 0% packet loss');
    },
  },

  sudo: {
    summary: 'Super-utilisateur',
    hidden: true,
    run(args, ctx) {
      if (args[0] === '-l') {
        ctx.out(
          esc(`L'utilisateur ${ctx.profile.username} peut utiliser les commandes suivantes sur ${ctx.profile.hostname} :`),
          '    (root) NOPASSWD: /usr/bin/systemctl status *',
          '',
          c('muted', 'Principe du moindre privilège : rien de plus.'),
        );
        return 0;
      }
      if (!args.length) {
        ctx.out('usage : sudo <commande>');
        return 1;
      }
      if (args[0] === 'rm') return commands.rm!.run(args.slice(1), ctx);
      ctx.out(`[sudo] Mot de passe de ${esc(ctx.profile.username)} :`);
      ctx.out(c('err', `${ctx.profile.username} n'appartient pas au fichier sudoers. Cet incident sera signalé.`));
      return 1;
    },
  },

  rm: {
    summary: 'Supprime',
    hidden: true,
    run(args, ctx) {
      const { flags, rest } = splitFlags(args);
      if (flags.has('r') && rest.some((r) => r === '/' || r === '/*' || r === '~')) {
        ctx.out(c('ok', 'Non. Ce système est en lecture seule, et les sauvegardes sont hors ligne (règle 3-2-1).'));
        return 1;
      }
      ctx.out(c('err', `rm: impossible de supprimer '${rest[0] ?? ''}': Système de fichiers accessible en lecture seulement`));
      return 1;
    },
  },

  neofetch: {
    summary: 'Infos système',
    hidden: true,
    run(_args, ctx) {
      const p = ctx.profile;
      const info: [string, string][] = [
        ['OS', 'Debian GNU/Linux 13 (trixie) x86_64'],
        ['Kernel', '6.12.0-amd64'],
        ['Uptime', formatDuration(ctx.shell.now() - ctx.shell.bootedAt)],
        ['Shell', 'bash 5.2.37'],
        ['Rôle', p.role],
        ['Projets', String(p.projects.length)],
      ];
      ctx.out(c('accent', `${p.username}@${p.hostname}`), c('muted', '-'.repeat(p.username.length + p.hostname.length + 1)));
      for (const [k, v] of info) ctx.out(`${c('accent', k.padEnd(8))} ${esc(v)}`);
    },
  },

  vim: {
    summary: 'Éditeur',
    hidden: true,
    run(_args, ctx) {
      ctx.out(c('muted', 'Pas de vim ici, tu ne serais jamais ressorti. :q!'));
    },
  },

  ll: { summary: 'ls -la', hidden: true, run: (a, ctx) => commands.ls!.run(['-la', ...a], ctx) },
};
