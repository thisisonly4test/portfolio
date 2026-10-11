# aurele — portfolio

Portfolio d'un étudiant BTS SIO option SISR : systèmes, réseaux, cybersécurité et IA.

Le site ne se lit pas comme une page, il se **traverse**. Le visiteur est un paquet réseau. Il entre par Internet, passe le pare-feu, puis rebondit d'équipement en équipement dans une petite infrastructure. Chaque section du portfolio est un saut (*hop*) sur une machine, et chaque machine présente son contenu avec sa propre commande :

| Saut | Équipement | Commande | Contenu |
|---|---|---|---|
| 00 | ton navigateur | `traceroute aurele` | Présentation, et ce que ton navigateur révèle de toi |
| 01 | `fw-01` (pare-feu) | `nft list ruleset` | À propos, principes écrits comme des règles `accept` / `drop` |
| 02 | `web-01` (DMZ) | `systemctl list-units` | Projets, présentés comme des services |
| 03 | `sw-core` (switch) | `show vlan brief` | Compétences : un VLAN par domaine, un port par compétence |
| 04 | `srv-ad` (Active Directory) | `ldapsearch` | Parcours, sous forme d'entrées d'annuaire |
| 05 | `siem` (Wazuh) | `wazuh-control status` | Veille technologique : sources et chaîne de traitement |
| 06 | `wg0` (VPN) | `wg show` | Contact : le tunnel est prêt |

Derrière le contenu, **un monde en 3D** (three.js) : une infrastructure dans le noir, une ville de serveurs en fil de fer qui se perd dans le brouillard. Le paquet du visiteur, une lumière ambrée, avance sur une fibre où circulent des impulsions, au rythme du défilement. La caméra le suit et chaque équipement a sa forme :

- Internet : un globe en fil de fer, d'où part le paquet ;
- `fw-01` : un mur de lignes et trois anneaux qui inspectent ; ils passent au vert quand le paquet franchit le portique ;
- `web-01` : des baies de serveurs aux diodes qui clignotent ;
- `sw-core` : un commutateur 48 ports, câbles en éventail ;
- `srv-ad` : l'arbre de l'annuaire (domaine, OU, objets) qui tourne lentement ;
- `siem` : un cercle d'histogrammes qui réagit aux **vrais événements** du site (une commande dangereuse dans le terminal fait monter une barre rouge) ;
- `wg0` : un tunnel d'anneaux à traverser avant le contact.

La scène se charge à part : le texte s'affiche tout de suite. La qualité s'adapte : si la machine peine, le flou lumineux (bloom) se coupe, puis la résolution baisse. Sans WebGL, le site garde une grille statique. Le bouton « Désactiver la 3D » en pied de page s'en souvient (`localStorage`).

Chaque section affiche son nom en clair (« Projets », « Compétences »…), avec la machine et la commande en discret. Le détail technique (empreinte du navigateur, dissection du paquet, SIEM) est replié par défaut : la page se lit d'abord comme un portfolio, et se creuse pour qui le veut. Chaque projet a un visuel : capture d'écran réelle (CHIMERA, HumanLearning) ou schéma animé de son fonctionnement (Research Radar, DataBroke).

## Les quatre pièces maîtresses

- **Ton paquet, disséqué** (saut `fw-01`) : la trame que ton navigateur envoie, octet par octet, façon Wireshark. Ethernet II, IPv4, TCP, puis une requête HTTP faite de tes vraies valeurs (agent utilisateur, langue). Les sommes de contrôle IPv4 et TCP sont réellement calculées (RFC 1071, pseudo-en-tête compris). Survoler un champ allume ses octets, et l'inverse. Le bouton « Chiffrer avec TLS » remplace la charge par du bruit, octet par octet : on voit ce que le chiffrement cache, et ce qu'il laisse visible.
- **Le SIEM te regarde** (saut `siem`) : un tableau de bord façon Wazuh qui journalise en direct ce que fait le visiteur sur le site. Sauts atteints, commandes tapées, flags trouvés. `sudo`, `nmap`, `cat /etc/shadow` ou `rm -rf /` déclenchent des règles de niveau croissant, et une alerte s'affiche au-delà du niveau 10. Tout reste en mémoire dans le navigateur.
- **Un mini-CTF caché** : cinq flags `FLAG{...}` dispersés dans le site, chacun derrière un réflexe de sécurité différent (fichiers cachés, code source, `robots.txt`, DNS, console du navigateur). On les valide avec `submit FLAG{...}`. La pastille ⚑ de la navigation compte les points et donne des indices. Seules les empreintes SHA-256 des flags sont dans le code de validation. Le test `tests/unit/security.test.ts` vérifie que chaque flag planté correspond bien à un défi.
- **La traversée** elle-même : la carte, la caméra qui suit le paquet, la traînée, l'inclinaison en gros plan. Les nœuds de la carte sont cliquables.

## Ce qu'il y a aussi

- **Une intro** façon démarrage Linux : messages du noyau (Secure Boot, AppArmor…), puis systemd qui lance `nftables`, `wg-quick@wg0`, `fail2ban`, `suricata`…, puis l'écran de connexion de **aurele**. À la première visite elle est courte (≈ 3 s) et automatique : un clic, une touche ou un défilement la passe aussitôt. Elle ne revient pas aux visites suivantes. « Rejouer l'intro », en pied de page, donne la version complète : clic sur le compte, mot de passe qui se tape tout seul, puis `traceroute aurele`.
- **L'empreinte du navigateur** au saut 00 : navigateur, système, langues, fuseau, écran, cœurs, mémoire… et une estimation de l'entropie en bits. Rien n'est envoyé, tout est calculé localement. C'est un argument de sécurité en soi : le visiteur voit ce qu'un site peut savoir sans cookie.
- **Un terminal déroulant** : touche `²` (AZERTY) ou `` ` `` (QWERTY), ou le bouton `>_`. Complétion `Tab`, historique, suggestions grisées, `Ctrl+L`, `Ctrl+C`, `;` et `&&`. Commandes : `help`, `about`, `projects [nom]`, `skills`, `contact`, `goto <section>`, `submit`, `ctf`, `ls -la`, `cd`, `cat`, `tree`… et d'autres non listées (`nmap localhost`, `ip a`, `dig`, `sudo -l`, `cat /etc/shadow`…). `ls -a` dans le dossier personnel met sur la piste.
- **Mobile** : la carte passe en bandeau fixe au-dessus du contenu, la navigation en menu.
- **Accessibilité** : navigation clavier, lien d'évitement, `prefers-reduced-motion` respecté (intro accélérée, carte sans animation), version texte sans JavaScript.

Pas de framework d'interface : TypeScript, CSS, SVG, et three.js pour la scène (chargée à part, ≈ 150 Ko compressés).

## Démarrer

Prérequis : Node.js 20.19 ou plus récent.

```bash
npm install
npm run dev        # http://localhost:5173
```

| Commande | Rôle |
|---|---|
| `npm run dev` | Serveur de développement |
| `npm run build` | Vérifie les types puis construit `dist/` |
| `npm run preview` | Sert `dist/` sur http://localhost:4173 |
| `npm test` | Tests unitaires (Vitest) |
| `npm run test:e2e` | Tests de bout en bout (Playwright, bureau et mobile) |
| `npm run check` | Types + tests unitaires + build |

Pour les tests de bout en bout, installe Chromium une fois : `npx playwright install chromium`.

Paramètres d'URL utiles : `?intro=skip` (pas d'intro), `?intro=full` (version complète), `?intro=fast` (version complète ×6, pour les tests), `?world=off` (sans la 3D).

## Personnaliser

**Tout le contenu est dans [`src/data/profile.ts`](src/data/profile.ts).** La page, le terminal et le système de fichiers virtuel (`~/about.txt`, `~/projets/*/README.md`…) sont générés à partir de ce fichier.

Règle : un champ vide (`''`) ou une liste vide (`[]`) est masqué. Rien d'inventé ne s'affiche.

À faire avant de mettre en ligne :

1. **Contacts** (`contact`) : e-mail, LinkedIn, GitHub, Root-Me, TryHackMe. Pour le CV, dépose le PDF dans `public/` et indique son nom dans `cv`.
2. **Parcours** : établissement et années dans `education`, stages dans `experience`, certifications dans `certifications` (par exemple la SecNumacadémie de l'ANSSI). Le saut `srv-ad` disparaît s'il n'y a rien.
3. **Compétences** (`skills`) : la liste suit le référentiel SISR. Garde seulement ce que tu sais vraiment faire.
4. **Disponibilité** (`availability`) : par exemple « Recherche une alternance en cybersécurité, septembre 2026 ». Elle s'affiche avec un voyant vert.
5. **Liens des projets** (`link`) pour afficher le bouton « Voir le projet ».
6. **Visuels des projets** (`media`) : une capture dans `public/projets/` (`{ kind: 'image', src: 'projets/x.jpg', alt: '…' }`), ou un schéma de `src/site/visuals.ts` (`{ kind: 'diagram', src: 'radar' }`).

Le bouton « Me contacter » de l'en-tête n'apparaît qu'une fois un contact renseigné : pas de lien vers une section vide.

Les sauts et leurs commandes sont dans [`src/site/hops.ts`](src/site/hops.ts), la scène 3D dans [`src/scene/`](src/scene/), les messages de démarrage dans [`src/intro/sequence.ts`](src/intro/sequence.ts).

## Mettre en ligne

`npm run build` produit un site statique dans `dist/`, avec des chemins relatifs.

- **GitHub Pages** : le workflow [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) lance les tests puis déploie à chaque push sur `main` (source *GitHub Actions* dans les réglages Pages).
- **Netlify, Vercel, Cloudflare Pages** : commande `npm run build`, dossier `dist`.

## Structure

Voir [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).
