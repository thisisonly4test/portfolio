/** Petits helpers pour produire la sortie HTML du terminal sans risque d'injection. */

export function esc(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export type Tone = 'accent' | 'dir' | 'muted' | 'ok' | 'warn' | 'err' | 'bold' | 'file' | 'hidden';

export function c(tone: Tone, text: string): string {
  return `<span class="t-${tone}">${esc(text)}</span>`;
}

/** Lien cliquable dans le terminal : exécute `command` au clic. */
export function cmdLink(command: string, label = command): string {
  return `<button type="button" class="t-link" data-cmd="${esc(command)}">${esc(label)}</button>`;
}

/** Retire les balises : utile pour les tests et les lecteurs d'écran. */
export function stripTags(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h) return `${h} h ${String(m).padStart(2, '0')} min`;
  if (m) return `${m} min ${String(s).padStart(2, '0')} s`;
  return `${s} s`;
}
