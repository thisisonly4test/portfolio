import { contactLinks, type Profile } from '../data/profile';

/**
 * Système de fichiers virtuel, en lecture seule, construit à partir du profil.
 * Le terminal et le gestionnaire de fichiers lisent le même arbre.
 */

export interface FileNode {
  type: 'file';
  name: string;
  content: string;
  /** Fichier caché par défaut (nom commençant par un point). */
  hidden: boolean;
}

export interface DirNode {
  type: 'dir';
  name: string;
  children: Map<string, VNode>;
  hidden: boolean;
}

export type VNode = FileNode | DirNode;

export function dir(name: string, children: VNode[] = []): DirNode {
  return {
    type: 'dir',
    name,
    hidden: name.startsWith('.'),
    children: new Map(children.map((c) => [c.name, c])),
  };
}

export function file(name: string, content: string): FileNode {
  return { type: 'file', name, content, hidden: name.startsWith('.') };
}

/** Résout `target` depuis `cwd` en chemin absolu normalisé (gère ~, ., ..). */
export function resolvePath(cwd: string, target: string, home: string): string {
  let raw = target.trim();
  if (raw === '' || raw === '~') return home;
  if (raw.startsWith('~/')) raw = home + raw.slice(1);
  const absolute = raw.startsWith('/') ? raw : `${cwd}/${raw}`;
  const parts: string[] = [];
  for (const part of absolute.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') parts.pop();
    else parts.push(part);
  }
  return '/' + parts.join('/');
}

/** Affiche un chemin absolu avec ~ à la place du dossier personnel. */
export function prettyPath(path: string, home: string): string {
  if (path === home) return '~';
  if (path.startsWith(home + '/')) return '~' + path.slice(home.length);
  return path;
}

export class VirtualFS {
  constructor(readonly root: DirNode, readonly home: string) {}

  get(path: string): VNode | undefined {
    if (path === '/') return this.root;
    let node: VNode = this.root;
    for (const part of path.split('/').filter(Boolean)) {
      if (node.type !== 'dir') return undefined;
      const next: VNode | undefined = node.children.get(part);
      if (!next) return undefined;
      node = next;
    }
    return node;
  }

  /** Liste triée : dossiers d'abord, puis ordre alphabétique. */
  list(path: string, showHidden = false): VNode[] {
    const node = this.get(path);
    if (!node || node.type !== 'dir') return [];
    return [...node.children.values()]
      .filter((c) => showHidden || !c.hidden)
      .sort((a, b) => {
        if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
        return a.name.localeCompare(b.name, 'fr');
      });
  }
}

function projectReadme(p: Profile['projects'][number]): string {
  return [
    `# ${p.name}`,
    '',
    `> ${p.tagline}`,
    '',
    '## Problème',
    p.problem,
    '',
    '## Solution',
    ...p.solution.flatMap((d) => [d, '']),
    '## Points forts',
    ...p.highlights.map((h) => `- ${h}`),
    '',
    '## Stack',
    p.stack.join(' · '),
    '',
    `Statut : ${p.status} · ${p.year} · ${p.domain}`,
    ...(p.link ? ['', `Lien : ${p.link}`] : []),
  ].join('\n');
}

function timeline(entries: Profile['education']): string[] {
  return entries.flatMap((e) => [
    `## ${e.title}`,
    [e.place, e.period].filter(Boolean).join(' · '),
    ...e.details.map((d) => `- ${d}`),
    '',
  ]);
}

export function buildFS(p: Profile): VirtualFS {
  const home = `/home/${p.username}`;
  const contacts = contactLinks(p);

  const about = [`${p.displayName} — ${p.role}`, p.location, '', ...p.about].join('\n');
  const skills = [
    '# Compétences',
    '',
    ...p.skills.flatMap((s) => [`## ${s.title}`, s.summary, ...s.items.map((i) => `- ${i}`), '']),
  ].join('\n');
  const parcours = [
    '# Parcours',
    '',
    ...timeline(p.education),
    ...(p.experience.length ? ['# Expériences', '', ...timeline(p.experience)] : []),
  ].join('\n');
  const watch = [
    '# Veille technologique',
    '',
    `Sujet : ${p.watch.topic}`,
    '',
    p.watch.intro,
    '',
    '## Sources',
    ...p.watch.sources.map((s) => `- ${s.name} (${s.kind})`),
    '',
    '## Méthode',
    ...p.watch.pipeline.map((s, i) => `${i + 1}. ${s.step} : ${s.text}`),
  ].join('\n');
  const contact = contacts.length
    ? contacts.map((c) => `${c.label.padEnd(10)} ${c.value}`).join('\n')
    : 'Coordonnées bientôt en ligne.';

  const homeFiles = [
    file('about.txt', about),
    file('competences.md', skills),
    file('parcours.md', parcours),
    file('veille.md', watch),
    file('contact.txt', contact),
    file(
      '.bashrc',
      ['# ~/.bashrc', "alias ll='ls -la'", 'export EDITOR=vim', 'umask 027'].join('\n'),
    ),
    dir('projets', p.projects.map((proj) => dir(proj.id, [file('README.md', projectReadme(proj))]))),
  ];
  if (p.certifications.length) {
    homeFiles.push(
      file('certifications.txt', p.certifications.map((c) => `${c.name} — ${c.issuer}${c.year ? ` (${c.year})` : ''}`).join('\n')),
    );
  }

  const root = dir('', [
    dir('bin'),
    dir('etc', [
      file('hostname', p.hostname),
      file(
        'os-release',
        ['PRETTY_NAME="Debian GNU/Linux 13 (trixie)"', 'NAME="Debian GNU/Linux"', 'VERSION_ID="13"', 'ID=debian'].join('\n'),
      ),
      file('motd', `Bienvenue sur ${p.hostname}. Tape \`help\` pour commencer.`),
      file('resolv.conf', ['# serveur DNS interne (srv-ad)', 'nameserver 10.0.20.10', 'search aurele.lan'].join('\n')),
      file('shadow', ''),
      file('passwd', [`root:x:0:0:root:/root:/bin/bash`, `${p.username}:x:1000:1000:${p.displayName}:${home}:/bin/bash`].join('\n')),
    ]),
    dir('home', [dir(p.username, homeFiles)]),
    dir('root'),
    dir('tmp'),
    dir('var', [dir('log', [file('auth.log', `sshd[812]: Accepted publickey for ${p.username} from 10.0.0.2 port 51022 ssh2: ED25519`)])]),
  ]);

  return new VirtualFS(root, home);
}
