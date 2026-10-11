import type { Profile, SectionId } from '../data/profile';

/** Un saut du trajet : une section de la page posée sur un équipement. */
export interface Hop {
  id: 'top' | SectionId;
  node: string;
  label: string;
  host: string;
  /** Commande affichée en tête de la section. */
  cmd: string;
}

const ALL: Hop[] = [
  { id: 'top', node: 'client', label: 'Toi', host: 'ton-navigateur', cmd: 'traceroute aurele' },
  { id: 'apropos', node: 'fw', label: 'À propos', host: 'fw-01', cmd: 'nft list ruleset' },
  { id: 'projets', node: 'web', label: 'Projets', host: 'web-01', cmd: 'systemctl list-units --type=service' },
  { id: 'competences', node: 'core', label: 'Compétences', host: 'sw-core', cmd: 'show vlan brief' },
  { id: 'parcours', node: 'ad', label: 'Parcours', host: 'srv-ad', cmd: 'ldapsearch -b "dc=aurele,dc=lan"' },
  { id: 'veille', node: 'siem', label: 'Veille', host: 'siem', cmd: 'wazuh-control status' },
  { id: 'contact', node: 'vpn', label: 'Contact', host: 'wg0', cmd: 'wg show' },
];

/** Sauts qui ont du contenu à montrer, dans l'ordre du trajet. */
export function hopsFor(p: Profile): Hop[] {
  return ALL.filter((h) => {
    if (h.id === 'parcours') return p.education.length + p.experience.length + p.certifications.length > 0;
    if (h.id === 'projets') return p.projects.length > 0;
    if (h.id === 'competences') return p.skills.length > 0;
    return true;
  });
}
