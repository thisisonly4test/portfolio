import type { SectionId } from './data/profile';

/** Actions qu'une commande demande à la page d'exécuter. */
export type Effect =
  | { type: 'clear' }
  | { type: 'exit' }
  | { type: 'goto'; section: SectionId }
  | { type: 'reboot' }
  | { type: 'submit'; flag: string }
  | { type: 'ctf' };
