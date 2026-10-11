/**
 * Mémorise que le visiteur a déjà vu l'intro. Tout accès est protégé :
 * en navigation privée ou si le stockage est bloqué, l'intro se rejoue.
 */

const KEY = 'aurele:intro-seen';

function store(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function introSeen(): boolean {
  try {
    return store()?.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function markIntroSeen(): void {
  try {
    store()?.setItem(KEY, '1');
  } catch {
    /* stockage indisponible : l'intro se rejouera, ce n'est pas grave */
  }
}

export function forgetIntro(): void {
  try {
    store()?.removeItem(KEY);
  } catch {
    /* idem */
  }
}

const WORLD_KEY = 'aurele:world';

/** Le visiteur a-t-il désactivé la scène 3D (machine lente, préférence) ? */
export function worldDisabled(): boolean {
  try {
    return store()?.getItem(WORLD_KEY) === 'off';
  } catch {
    return false;
  }
}

export function setWorldDisabled(off: boolean): void {
  try {
    if (off) store()?.setItem(WORLD_KEY, 'off');
    else store()?.removeItem(WORLD_KEY);
  } catch {
    /* idem */
  }
}
