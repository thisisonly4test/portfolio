import { describe, expect, it } from 'vitest';
import { profile } from '../../src/data/profile';
import { buildFS, prettyPath, resolvePath } from '../../src/shell/vfs';

const HOME = '/home/aurele';

describe('resolvePath', () => {
  it.each([
    ['/home/aurele', '', HOME],
    ['/', '~', HOME],
    ['/', '~/projets', `${HOME}/projets`],
    [HOME, 'projets/../about.txt', `${HOME}/about.txt`],
    [HOME, '../../..', '/'],
    [HOME, './.', HOME],
    ['/etc', '/var//log/', '/var/log'],
  ])('depuis %s, %s donne %s', (cwd, target, expected) => {
    expect(resolvePath(cwd, target, HOME)).toBe(expected);
  });
});

describe('prettyPath', () => {
  it('remplace le dossier personnel par ~', () => {
    expect(prettyPath(HOME, HOME)).toBe('~');
    expect(prettyPath(`${HOME}/projets`, HOME)).toBe('~/projets');
    expect(prettyPath('/home/aurelex', HOME)).toBe('/home/aurelex');
    expect(prettyPath('/etc', HOME)).toBe('/etc');
  });
});

describe('buildFS', () => {
  const fs = buildFS(profile);

  it('crée un dossier par projet avec son README', () => {
    const names = fs.list(`${HOME}/projets`).map((n) => n.name);
    expect(names).toEqual(profile.projects.map((p) => p.id).sort((a, b) => a.localeCompare(b, 'fr')));
    for (const p of profile.projects) {
      const readme = fs.get(`${HOME}/projets/${p.id}/README.md`);
      expect(readme?.type).toBe('file');
      expect(readme && readme.type === 'file' && readme.content).toContain(`# ${p.name}`);
    }
  });

  it('masque les fichiers cachés sauf demande', () => {
    expect(fs.list(HOME).some((n) => n.name === '.secret')).toBe(false);
    expect(fs.list(HOME, true).some((n) => n.name === '.secret')).toBe(true);
  });

  it('trie les dossiers avant les fichiers', () => {
    const types = fs.list(HOME).map((n) => n.type);
    expect(types).toEqual([...types].sort((a, b) => (a === b ? 0 : a === 'dir' ? -1 : 1)));
  });

  it('renvoie undefined pour un chemin inexistant ou traversant un fichier', () => {
    expect(fs.get('/nope')).toBeUndefined();
    expect(fs.get(`${HOME}/about.txt/plus`)).toBeUndefined();
  });
});
