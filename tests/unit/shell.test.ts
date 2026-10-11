import { describe, expect, it } from 'vitest';
import { profile } from '../../src/data/profile';
import { stripTags } from '../../src/shell/format';
import { Shell } from '../../src/shell/shell';
import { buildFS } from '../../src/shell/vfs';

function setup() {
  let now = 1_000_000;
  const shell = new Shell(buildFS(profile), profile, { now: () => now, bootedAt: now });
  const run = (cmd: string) => {
    const r = shell.run(cmd);
    return { text: r.lines.map(stripTags).join('\n'), effects: r.effects };
  };
  return { shell, run, tick: (ms: number) => (now += ms) };
}

describe('Shell', () => {
  it('whoami, pwd, hostname', () => {
    const { run } = setup();
    expect(run('whoami').text).toBe('aurele');
    expect(run('pwd').text).toBe('/home/aurele');
    expect(run('hostname').text).toBe('portfolio');
  });

  it('cd, cd - et invite', () => {
    const { shell, run } = setup();
    run('cd projets');
    expect(shell.cwd).toBe('/home/aurele/projets');
    expect(shell.promptText()).toBe('aurele@portfolio:~/projets$');
    run('cd /etc');
    expect(run('cd -').text).toBe('/home/aurele/projets');
    expect(run('cd nulle-part').text).toContain('Aucun fichier ou dossier');
    expect(run('cd ~/about.txt').text).toContain("N'est pas un dossier");
  });

  it('ls, ls -a et ls -l', () => {
    const { run } = setup();
    const plain = run('ls').text;
    expect(plain).toContain('projets/');
    expect(plain).toContain('veille.md');
    expect(plain).not.toContain('.bashrc');
    expect(run('ls -a').text).toContain('.bashrc');
    expect(run('ls -l projets').text).toMatch(/^drwxr-x--- .* databroke\/$/m);
    expect(run('ls /inexistant').text).toContain("impossible d'accéder");
  });

  it('cat affiche le contenu et signale les erreurs', () => {
    const { run } = setup();
    expect(run('cat about.txt').text).toContain(profile.about[0]);
    expect(run('cat projets/databroke/README.md').text).toContain('## Problème');
    expect(run('cat projets').text).toContain('est un dossier');
    expect(run('cat x').text).toContain('Aucun fichier');
  });

  it('protège les zones sensibles', () => {
    const { run } = setup();
    expect(run('cat /etc/shadow').text).toContain('Permission non accordée');
    expect(run('ls /root').text).toContain('Permission non accordée');
    expect(run('cd /root').text).toContain('Permission non accordée');
  });

  it('commande inconnue avec suggestion', () => {
    const { run } = setup();
    const out = run('whoamii').text;
    expect(out).toContain('whoamii : commande introuvable');
    expect(out).toContain('whoami');
  });

  it('&& s’arrête au premier échec, ; continue', () => {
    const { run } = setup();
    expect(run('cd nulle && whoami').text).not.toMatch(/^aurele$/m);
    expect(run('cd nulle ; whoami').text.split('\n').pop()).toBe('aurele');
  });

  it('echo développe les variables', () => {
    const { run } = setup();
    expect(run('echo $USER vit dans $HOME').text).toBe('aurele vit dans /home/aurele');
  });

  it('échappe le HTML saisi par le visiteur', () => {
    const { shell } = setup();
    const r = shell.run('echo <img src=x onerror=alert(1)>');
    expect(r.lines.join('')).not.toContain('<img');
    expect(r.lines.join('')).toContain('&lt;img');
  });

  it('historique et !!', () => {
    const { shell, run } = setup();
    run('whoami');
    run('pwd');
    run('pwd');
    expect(shell.history).toEqual(['whoami', 'pwd']);
    expect(run('!!').text).toBe('/home/aurele');
    expect(run('history').text).toContain('1  whoami');
  });

  it('projects liste et détaille', () => {
    const { run } = setup();
    const list = run('projects').text;
    for (const p of profile.projects) expect(list).toContain(p.id);
    expect(run('projects databroke').text).toContain('Problème');
    expect(run('projects inconnu').text).toContain('introuvable');
  });

  it('produit les effets attendus', () => {
    const { run } = setup();
    expect(run('clear').effects).toEqual([{ type: 'clear' }]);
    expect(run('exit').effects).toEqual([{ type: 'exit' }]);
    expect(run('reboot').effects).toEqual([{ type: 'reboot' }]);
    expect(run('goto projets').effects).toEqual([{ type: 'goto', section: 'projets' }, { type: 'exit' }]);
    expect(run('goto skills').effects[0]).toEqual({ type: 'goto', section: 'competences' });
    expect(run('goto nulle-part').effects).toEqual([]);
  });

  it('nmap ne scanne que la machine locale', () => {
    const { run } = setup();
    expect(run('nmap localhost').text).toContain('22/tcp');
    expect(run('nmap 8.8.8.8').text).toContain('autorisé');
  });

  it('commandes réseau et système', () => {
    const { run } = setup();
    expect(run('ip a').text).toContain('wg0');
    expect(run('sudo -l').text).toContain('moindre privilège');
    expect(run('uname -a').text).toContain('GNU/Linux');
  });

  it('sudo et rm -rf / refusés', () => {
    const { run } = setup();
    expect(run('sudo ls').text).toContain("n'appartient pas au fichier sudoers");
    expect(run('sudo rm -rf /').text).toContain('lecture seule');
  });

  it('uptime suit le temps écoulé', () => {
    const { run, tick } = setup();
    tick(125_000);
    expect(run('uptime').text).toContain('2 min 05 s');
  });

  it('help liste les commandes visibles seulement', () => {
    const { run } = setup();
    const out = run('help').text;
    expect(out).toContain('projects');
    expect(out).not.toMatch(/^\s+(sudo|nmap)\s/m);
  });

  it('erreurs de syntaxe', () => {
    const { run } = setup();
    expect(run('echo "a').text).toContain('fin de fichier inattendue');
  });
});

describe('complétion', () => {
  it('complète une commande unique', () => {
    const { shell } = setup();
    expect(shell.complete('whoa')).toEqual({ value: 'whoami ', options: [] });
  });

  it('propose plusieurs commandes avec leur préfixe commun', () => {
    const { shell } = setup();
    const r = shell.complete('c');
    expect(r.options).toEqual(expect.arrayContaining(['cat', 'cd', 'clear', 'contact']));
    expect(r.value).toBe('c');
  });

  it('complète les chemins, dossiers avec /', () => {
    const { shell } = setup();
    expect(shell.complete('cd pro').value).toBe('cd projets/');
    expect(shell.complete('cat projets/data').value).toBe('cat projets/databroke/');
    expect(shell.complete('cat ab').value).toBe('cat about.txt ');
  });

  it('montre les fichiers cachés quand le préfixe commence par un point', () => {
    const { shell } = setup();
    expect(shell.complete('cat .ba').value).toBe('cat .bashrc ');
  });

  it('ne change rien sans correspondance', () => {
    const { shell } = setup();
    expect(shell.complete('zzz')).toEqual({ value: 'zzz', options: [] });
  });
});
