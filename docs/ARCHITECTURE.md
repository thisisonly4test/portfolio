# Architecture

TypeScript sans framework, construit avec Vite.

```
main.ts
  ├─ site/page.ts ......... rend la page : navigation, carte, sauts, pied de page
  ├─ scene/scene.ts ....... monde 3D (three.js), chargé à part avec import()
  ├─ site/effects.ts ...... défilement → avancement du paquet, apparitions
  ├─ site/console.ts ...... terminal déroulant (² ou `)
  └─ intro/intro.ts ....... démarrage puis connexion, par-dessus la page
```

La page est rendue tout de suite, sous l'intro : elle est prête quand l'intro se retire.

## Dossiers

| Dossier | Rôle | Dépend du DOM ? |
|---|---|---|
| `src/data/` | Contenu (profil, projets, sections) | non |
| `src/shell/` | Shell virtuel : parseur, système de fichiers, commandes | non |
| `src/intro/sequence.ts` | Script du démarrage, déterministe | non |
| `src/intro/intro.ts` | Rendu de l'intro | oui |
| `src/site/hops.ts` | Les sauts : section, nom affiché, équipement, commande | non |
| `src/scene/path.ts` | Positions des équipements, avancement vers paramètre de courbe, amortissement, aléatoire déterministe | non |
| `src/scene/scene.ts` | Scène three.js : décor, équipements, paquet, caméra, bloom, qualité adaptative | oui (WebGL) |
| `src/site/visuals.ts` | Icônes au trait, schémas animés des projets, visuel de chaque projet | oui |
| `src/site/fingerprint.ts` | Lecture de l'environnement du navigateur | `readEnv` seulement |
| `src/site/` (reste) | Page, terminal, effets | oui |

## Le trajet

1. `hopsFor(profile)` donne la liste des sauts qui ont du contenu (un parcours vide retire `srv-ad`).
2. `createWorld` (`scene/scene.ts`) construit une courbe CatmullRom qui passe par la position de chaque équipement (`STATION_POSITIONS`, `scene/path.ts`). Paramétrée par index, elle place le saut i en t = i / (n − 1).
3. `setupJourney` mesure la position de chaque section et convertit le défilement en avancement continu avec `progressFrom()` : le paquet reste sur l'équipement pendant 55 % de la section, puis voyage. `main.ts` transmet l'avancement à la scène, et l'écrit dans `<html data-hop>`.
4. À chaque image, la scène amortit l'avancement (`damp`), place le paquet et sa traînée, puis met la caméra derrière lui et légèrement au-dessus. La souris ajoute un peu de parallaxe. Sur grand écran, `setViewOffset` décale le sujet vers la droite, loin du texte.
5. Qualité adaptative : après plus d'une seconde d'images lentes (> 34 ms), le bloom se coupe, puis la résolution baisse par paliers (`canvas.dataset.quality`).

Le module 3D est importé dynamiquement : le contenu et le terminal fonctionnent sans lui (absence de WebGL, `?world=off`, ou bouton « Désactiver la 3D »).

### Ajouter un saut

1. Ajouter la section dans `SECTIONS` (`src/data/profile.ts`).
2. Ajouter le saut dans `ALL` (`src/site/hops.ts`) avec son nom, son équipement et sa commande.
3. Si l'équipement n'existe pas, lui donner une position dans `STATION_POSITIONS` (`src/scene/path.ts`, toujours plus loin vers −z) et une forme dans le `switch` de `createWorld`.
4. Écrire son rendu dans `renderHop` (`src/site/page.ts`).

## Sécurité : dissecteur, SIEM

- `site/dissect.ts` (pur) : `buildPacket()` assemble la trame et la liste des champs avec leurs plages d'octets ; `internetChecksum()` suit la RFC 1071. Le rendu interactif est dans `widgets.ts` (`renderDissector`).
- `site/events.ts` : `EventLog`, journal en mémoire avec abonnés ; `classifyCommand()` (pur) associe une commande à une règle et un niveau. `main.ts` journalise l'arrivée, les sauts atteints (`onReach` de `setupJourney`) et les commandes (`onCommand` du terminal). `renderSiem` affiche compteurs, histogramme sur 2 minutes et flux.

## Le shell

- `parser.ts` découpe une ligne (guillemets, `\`, `;`, `&&`).
- `vfs.ts` construit un arbre en lecture seule à partir du profil et résout les chemins.
- `commands.ts` contient les commandes. Une commande ne touche jamais la page : elle renvoie des **effets** (`goto`, `clear`, `exit`, `reboot`, voir `src/types.ts`) que `main.ts` applique.
- Toute la sortie passe par `esc()` (`shell/format.ts`) : ce que tape le visiteur ne peut pas injecter de HTML.

## Tests

- `tests/unit/` (Vitest) : sommes de contrôle et trame, journal SIEM, DNS, parseur, système de fichiers, shell et complétion, séquence de démarrage, graphe et avancement du trajet, empreinte du navigateur, stockage, et avec jsdom le rendu de la page et le terminal.
- `tests/e2e/` (Playwright, Chrome bureau et Pixel 7). Le rendu WebGL logiciel des navigateurs de test est très lent : la 3D y est désactivée, sauf dans le test `[3d]` (chargement, suivi du défilement, bouton de désactivation). Le reste couvre : intro complète, connexion au clic et au clavier, saut de l'intro, rejouer l'intro, traversée de tous les équipements, empreinte, projets dépliables, terminal (bouton, touche, `goto`, Échap), dissecteur et chiffrement, alertes SIEM, menu mobile, absence d'erreur et de défilement horizontal.
