/**
 * Tout le contenu du portfolio vit ici : la page, le terminal et le système
 * de fichiers virtuel sont générés à partir de ces données.
 *
 * Règle simple : un champ texte vide ('') ou une liste vide ([]) est masqué.
 * Rien de faux ne s'affiche tant que tu n'as pas rempli le champ.
 */

export interface Media {
  kind: 'image' | 'diagram';
  /** Chemin de l'image dans public/ (ex. 'projets/chimera.jpg'), ou identifiant du schéma ('radar', 'rgpd'). */
  src: string;
  alt: string;
}

export interface Project {
  /** Identifiant court, utilisé comme nom de dossier dans ~/projets. */
  id: string;
  name: string;
  tagline: string;
  year: string;
  status: 'en cours' | 'stable' | 'expérimental';
  /** Domaine principal, affiché en étiquette. */
  domain: 'Cybersécurité' | 'IA' | 'Infrastructure' | 'Outils' | 'Web';
  problem: string;
  solution: string[];
  highlights: string[];
  stack: string[];
  /** Lien vers le dépôt ou la démo. Vide = pas de bouton. */
  link: string;
  /** Visuel affiché sur la carte du projet. */
  media?: Media;
}

export interface SkillGroup {
  id: string;
  title: string;
  /** Une phrase qui dit ce que tu sais faire dans ce domaine. */
  summary: string;
  items: string[];
}

export interface TimelineEntry {
  period: string;
  title: string;
  place: string;
  details: string[];
}

export interface Certification {
  name: string;
  issuer: string;
  year: string;
  link: string;
}

export interface Profile {
  username: string;
  displayName: string;
  hostname: string;
  /** Titre court sous le nom. */
  role: string;
  /** Phrase d'accroche de l'en-tête. */
  pitch: string;
  location: string;
  /** Ex. « Recherche une alternance en cybersécurité (sept. 2026) ». Vide = masqué. */
  availability: string;
  about: string[];
  /** Principes de travail, affichés comme les règles d'un pare-feu. */
  principles: { verdict: 'accept' | 'drop'; text: string }[];
  focus: { label: string; text: string }[];
  skills: SkillGroup[];
  projects: Project[];
  education: TimelineEntry[];
  experience: TimelineEntry[];
  certifications: Certification[];
  watch: {
    topic: string;
    intro: string;
    sources: { name: string; kind: string }[];
    pipeline: { step: string; text: string }[];
  };
  contact: {
    email: string;
    github: string;
    linkedin: string;
    rootme: string;
    tryhackme: string;
    /** Chemin du CV dans public/, ex. 'cv-aurele.pdf'. Vide = pas de bouton. */
    cv: string;
  };
}

export const profile: Profile = {
  username: 'aurele',
  displayName: 'Aurele',
  hostname: 'portfolio',
  role: 'Étudiant BTS SIO · option SISR',
  pitch:
    "J'administre, je sécurise et j'automatise des infrastructures. Je m'intéresse à ce que l'IA change dans la défense des systèmes, et dans leur attaque.",
  location: 'France',
  availability: '',
  about: [
    "Je prépare un BTS SIO, option SISR : systèmes, réseaux et sécurité des infrastructures.",
    "Ce qui me motive, c'est comprendre comment un système tient debout, puis comment il tombe. Je monte des labs, je casse, je documente, je recommence.",
    "À côté, je construis mes propres outils : un bot de veille scientifique, un outil pour exercer ses droits RGPD, une plateforme d'apprentissage en 3D. Des projets finis, testés et documentés.",
  ],
  principles: [
    { verdict: 'accept', text: 'comprendre avant de configurer' },
    { verdict: 'accept', text: 'casser dans un lab, jamais en production' },
    { verdict: 'accept', text: 'documenter ce que je fais' },
    { verdict: 'accept', text: 'automatiser ce qui se répète' },
    { verdict: 'drop', text: '« ça marche, on n’y touche plus »' },
    { verdict: 'drop', text: 'les mots de passe dans un post-it' },
  ],
  focus: [
    { label: 'Infrastructure', text: 'Concevoir, déployer et maintenir des services fiables.' },
    { label: 'Cybersécurité', text: 'Durcir, surveiller, détecter, et comprendre les attaques.' },
    { label: 'IA', text: "Mesurer ce que l'IA apporte et ce qu'elle expose." },
  ],
  // À ajuster : garde seulement ce que tu sais vraiment faire.
  skills: [
    {
      id: 'systemes',
      title: 'Systèmes',
      summary: 'Installer, administrer et maintenir des serveurs Linux et Windows.',
      items: ['Debian / Ubuntu Server', 'Windows Server', 'Active Directory', 'GPO', 'DNS / DHCP', 'systemd'],
    },
    {
      id: 'reseaux',
      title: 'Réseaux',
      summary: 'Segmenter, router et relier des sites de manière sûre.',
      items: ['TCP/IP', 'VLAN', 'Routage', 'Cisco IOS', 'pfSense', 'VPN'],
    },
    {
      id: 'securite',
      title: 'Sécurité',
      summary: 'Réduire la surface d’attaque et garder une trace de ce qui se passe.',
      items: ['Durcissement', 'Pare-feu', 'Journalisation', 'Guides ANSSI', 'RGPD', 'Nmap'],
    },
    {
      id: 'virtualisation',
      title: 'Virtualisation',
      summary: 'Monter des labs reproductibles et isoler les services.',
      items: ['Proxmox VE', 'VirtualBox', 'Docker', 'Docker Compose'],
    },
    {
      id: 'automatisation',
      title: 'Automatisation',
      summary: 'Scripter ce qui se répète, tester ce qui compte.',
      items: ['Bash', 'Python', 'PowerShell', 'Git', 'GitHub Actions'],
    },
    {
      id: 'ia',
      title: 'IA & dev',
      summary: 'Construire des outils, du script au service complet.',
      items: ['Python', 'TypeScript', 'Node.js', 'React', 'Tests automatisés'],
    },
  ],
  projects: [
    {
      id: 'databroke',
      name: 'DataBroke',
      tagline: 'Exercer ses droits RGPD auprès de dizaines de services, et suivre les délais légaux.',
      year: '2026',
      status: 'stable',
      domain: 'Cybersécurité',
      problem:
        "Nos données personnelles sont dispersées chez des dizaines de services. Demander leur suppression un par un prend des heures, et personne ne suit les délais.",
      solution: [
        "Un outil en ligne de commande : pour chaque service, une touche choisit l'effacement (art. 17), l'opposition au marketing (art. 21) ou le droit d'accès (art. 15).",
        "Il envoie les demandes par SMTP, garde un historique en CSV et signale les services qui n'ont pas répondu dans le délai légal d'un mois.",
        "Un mode --test rejoue tout le parcours sans rien envoyer ni écrire.",
      ],
      highlights: ['Art. 15, 17 et 21', 'Suivi du délai d’un mois', 'Mode --test', 'Bibliothèque standard seule'],
      stack: ['Python 3.11', 'smtplib', 'TOML', 'CSV'],
      link: '',
      media: { kind: 'diagram', src: 'rgpd', alt: '' },
    },
    {
      id: 'research-radar',
      name: 'Research Radar',
      tagline: 'Un bot de veille scientifique : arXiv et bioRxiv, triés selon mon profil, livrés sur Discord.',
      year: '2026',
      status: 'stable',
      domain: 'IA',
      problem: "Des centaines d'articles paraissent chaque jour. Impossible de tout lire, facile de rater l'essentiel.",
      solution: [
        "Collecte large sur plusieurs catégories arXiv et sur bioRxiv, dédoublonnage, puis classement par signaux transparents et déterministes.",
        "La sélection finale applique une pénalité de diversité pour éviter cinq articles sur le même sujet.",
        "Pas de LLM dans la boucle : chaque explication vient des métadonnées. Un résumé audio est synthétisé avec Piper.",
      ],
      highlights: ['arXiv + bioRxiv', 'Top 5 diversifié', 'Résumé audio', 'Exécution planifiée'],
      stack: ['Python', 'unittest', 'Piper TTS', 'Discord Webhooks', 'GitHub Actions'],
      link: '',
      media: { kind: 'diagram', src: 'radar', alt: '' },
    },
    {
      id: 'humanlearning',
      name: 'HumanLearning',
      tagline: "Un journal d'apprentissage quotidien qui aide à retenir ce qu'on apprend.",
      year: '2026',
      status: 'stable',
      domain: 'Outils',
      problem: "On apprend une chose par jour, on l'a oubliée la semaine suivante.",
      solution: [
        "Chaque jour, une note. L'appli planifie ensuite les révisions avec FSRS-4.5, l'algorithme d'Anki, au moment où la probabilité de s'en souvenir tombe à 90 %.",
        "Tout tourne en local, sans dépendance : les données restent sur la machine, dans un fichier JSON lisible, avec sauvegardes automatiques.",
        "Démarrage automatique en service systemd utilisateur.",
      ],
      highlights: ['0 dépendance', 'FSRS-4.5', '77 tests', 'Service systemd'],
      stack: ['Node.js', 'JavaScript', 'node:test', 'systemd'],
      link: '',
      media: { kind: 'image', src: 'projets/humanlearning.jpg', alt: 'Écran d’accueil de HumanLearning : objectif du jour, série de jours, saisie rapide et note du jour' },
    },
    {
      id: 'chimera',
      name: 'CHIMERA',
      tagline: "Une plateforme en 3D pour apprendre l'IA, la robotique et les neurosciences.",
      year: '2026',
      status: 'en cours',
      domain: 'Web',
      problem: "Les ressources pour apprendre l'IA sont éparpillées et cloisonnées par discipline.",
      solution: [
        "Un garage en 3D où chaque objet ouvre un domaine : la tête du robot mène à l'IA, l'établi à la robotique, le cerveau aux neurosciences.",
        "Un parcours de 43 niveaux, avec fiches, démos interactives et révisions croisées entre domaines.",
        "Contenu validé par schéma au build, tests unitaires et de bout en bout, image Docker prête.",
      ],
      highlights: ['43 niveaux', '380 fiches', '32 démos interactives', 'Docker'],
      stack: ['TypeScript', 'React', 'three.js', 'Vite', 'Zod', 'Playwright', 'Docker'],
      link: '',
      media: { kind: 'image', src: 'projets/chimera.jpg', alt: 'Le garage en 3D de CHIMERA : un robot au centre, entouré des zones IA, robotique, biologie, neurosciences et psychologie' },
    },
  ],
  // À remplir : établissement, années, et tes stages.
  education: [
    {
      period: '',
      title: 'BTS Services Informatiques aux Organisations, option SISR',
      place: '',
      details: [
        'Administration systèmes et réseaux, sécurité des infrastructures.',
        'Projets en équipe, situations professionnelles, épreuve E5.',
      ],
    },
  ],
  experience: [],
  certifications: [],
  watch: {
    topic: "L'IA dans la cybersécurité : outil de défense, nouvelle surface d'attaque",
    intro:
      "Ma veille suit deux mouvements : les attaquants qui utilisent l'IA (hameçonnage, recherche de vulnérabilités, malwares) et les défenseurs qui l'intègrent (détection d'anomalies, tri des alertes), sans oublier les attaques contre les modèles eux-mêmes.",
    sources: [
      { name: 'CERT-FR', kind: 'Alertes et avis' },
      { name: 'ANSSI', kind: 'Guides et publications' },
      { name: 'CNIL', kind: 'Données personnelles' },
      { name: 'arXiv cs.CR', kind: 'Recherche' },
      { name: 'OWASP', kind: 'Top 10 LLM' },
    ],
    pipeline: [
      { step: 'Collecter', text: 'Flux RSS, bulletins et prépublications, chaque jour.' },
      { step: 'Trier', text: 'Research Radar note chaque article selon mon profil et retire les doublons.' },
      { step: 'Synthétiser', text: 'Un résumé court sur Discord, et une fiche pour ce qui compte.' },
      { step: 'Restituer', text: 'Une synthèse régulière, avec sources, pour le dossier de veille.' },
    ],
  },
  contact: {
    email: '',
    github: '',
    linkedin: '',
    rootme: '',
    tryhackme: '',
    cv: '',
  },
};

export interface ContactLink {
  label: string;
  value: string;
  href: string;
}

/** Les contacts renseignés, dans l'ordre d'affichage. */
export function contactLinks(p: Profile = profile): ContactLink[] {
  const strip = (url: string) => url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
  const links: ContactLink[] = [];
  const { email, github, linkedin, rootme, tryhackme } = p.contact;
  if (email) links.push({ label: 'E-mail', value: email, href: `mailto:${email}` });
  if (linkedin) links.push({ label: 'LinkedIn', value: strip(linkedin), href: linkedin });
  if (github) links.push({ label: 'GitHub', value: strip(github), href: github });
  if (rootme) links.push({ label: 'Root-Me', value: strip(rootme), href: rootme });
  if (tryhackme) links.push({ label: 'TryHackMe', value: strip(tryhackme), href: tryhackme });
  return links;
}

/** Sections de la page, dans l'ordre. Les sections vides sont retirées. */
export const SECTIONS = [
  { id: 'apropos', label: 'À propos' },
  { id: 'projets', label: 'Projets' },
  { id: 'competences', label: 'Compétences' },
  { id: 'parcours', label: 'Parcours' },
  { id: 'veille', label: 'Veille' },
  { id: 'contact', label: 'Contact' },
] as const;

export type SectionId = (typeof SECTIONS)[number]['id'];
