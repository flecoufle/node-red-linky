# node-red-linky

Package Node-RED **Linky** pour récupérer les données de **consommation** et **production** d'énergie via l'API Enedis **Mesure synchrone V2** (exposée par [Conso API](https://conso.boris.sh/)).

## Installation

Via la palette l'éditeur: @flecoufle/node-red-linky

ou via npm:
```bash
npm install @flecoufle/node-red-linky
```

## Prérequis

- **Node.js**: >= 14.0.0
- **Node-RED**: >= 0.17.0
- **Dépendances**:
  - `got` 13.0.0

## Mise en oeuvre
- Obtenir un accès API (le token) à votre compteur: [API Conso](https://github.com/bokub/conso-api#readme) vous redirigera vers [https://conso.boris.sh](https://conso.boris.sh/)
- [Exemples](examples/Examples.json) d'utilisation du noeud node-red-linky une fois le noeud installé
- [Documentation Conso API](https://conso.boris.sh/documentation) (type, paramètres et format de réponse)
- [Migration 2026](https://conso.boris.sh/migration-2026) (ancienne API Metering data V5 → Mesure synchrone V2)
- [Documentation](https://datahub-enedis.fr/services-api/data-connect/documentation/) de Enedis API Data-Connect (pour information uniquement)
  
## ⚠️ Important - Mise en cache des appels

À partir de la version **1.4.0**, le node limite les appels pour respecter les quotas de l'API et éviter le bannissement de votre IP, une mise en cache est mise en place pour permettre la continuité de service. Cette fonction est appliquée par requête unique (l'API sous-jacente elle-même renvoie déjà des données qui ne changent pas, donc cette fonction ne modifie en rien les informations retournées). 

Pour les utilisateurs des versions antérieures: **veuillez mettre à jour** pour bénéficier de cette protection.

## Configuration et Paramètres

### Paramètres obligatoires (peuvent être passés via le payload)

| Paramètre | Type | Description |
|-----------|------|-------------|
| `type` | string | Type de mesure (voir [Types d'API disponibles](#types-dapi-disponibles)) |
| `token` | string | Token d'authentification Enedis (via le payload ou noeud ou config) |
| `pointId` | string | Point de livraison / PRM (via le payload ou noeud ou config). Ancien nom accepté : `prm` |
| `dateDebut` | string | Date de début **incluse**, format `YYYY-MM-DD`. Ancien nom accepté : `start` |
| `dateFin` | string | Date de fin **exclue**, format `YYYY-MM-DD`. Ancien nom accepté : `end` |

### Paramètres optionnels (uniquement via le payload)

| Paramètre | Type | Défaut | Description |
|-----------|------|--------|-------------|
| `mesuresPas` | string | `P1D` | `P1D` ou `P1M`, uniquement pour `puissance_conso_max_quotidienne` |
| `grandeurPhysique` | string | `PMA` | `PMA` ou `TOUT`, uniquement pour `puissance_conso_max_quotidienne` |
| `options_api_daily_limit` | number | 3 | Limite d'appels par jour pour une requête identique |
| `options_retry_limit` | number | 2 | Nombre de tentatives en cas d'erreur |
| `options_timeout_lookup` | number | 500 | Timeout lookup DNS (ms) |
| `options_timeout_connect` | number | 500 | Timeout connexion (ms) |
| `options_timeout_secureconnect` | number | 500 | Timeout connexion sécurisée (ms) |
| `options_timeout_socket` | number | 5000 | Timeout socket (ms) |
| `options_timeout_send` | number | 10000 | Timeout envoi (ms) |
| `options_timeout_response` | number | 10000 | Timeout réponse (ms) |
| `random_delay` | number | 5000 | Délai aléatoire avant exécution (ms) |
| `endpoint` | string | https://conso.boris.sh/api/ | Endpoint API à utiliser |
| `debug` | boolean | false | Afficher les détails de débogage dans les logs |

## Types d'API disponibles

Les types ci-dessous correspondent à l'API **Mesure synchrone V2**. La date de fin (`dateFin`) est exclue.

### Consommation

- **`consommation_quotidienne`** - Consommation énergétique quotidienne (Wh)
  - Historique : jusqu'à 36 mois et 15 jours avant la date d'appel
  - Chaque valeur est datée

- **`courbe_de_charge_consommation`** - Courbe de charge en soutirage
  - Profondeur : une semaine maximum par appel
  - Valeurs : puissances moyennes de consommation en W (intervalle par défaut 30 mn)
  - Historique : jusqu'à 24 mois et 15 jours avant la date d'appel
  - Journées complètes de minuit à minuit (heures locales)

- **`puissance_conso_max_quotidienne`** - Puissance maximale soutirée quotidienne (VA)
  - Options : `mesuresPas` (`P1D`/`P1M`) et `grandeurPhysique` (`PMA`/`TOUT`)
  - Historique : jusqu'à 36 mois et 15 jours avant la date d'appel
  - Chaque valeur est datée

- **`index_consommation`** - Index de consommation (compteur)
  - Réponse structurée par `contexte`, `calendrier` et `cadranTotalisateur`

### Production

- **`production_quotidienne`** - Production énergétique quotidienne (Wh)
  - Historique : jusqu'à 36 mois et 15 jours avant la date d'appel
  - Chaque valeur est datée

- **`courbe_de_charge_production`** - Courbe de charge de production
  - Profondeur : une semaine maximum par appel
  - Valeurs : puissances moyennes de production en W (intervalle par défaut 30 mn)
  - Historique : jusqu'à 24 mois et 15 jours avant la date d'appel
  - Journées complètes de minuit à minuit (heures locales)

- **`index_production`** - Index de production (compteur)
  - Réponse structurée par `contexte`, `calendrier` et `cadranTotalisateur`

### Compatibilité avec les anciens types

Les anciens types *Metering data V5* restent acceptés comme alias et sont traduits automatiquement :

| Ancien type (V5) | Nouveau type (V2) |
|---|---|
| `daily_consumption` | `consommation_quotidienne` |
| `consumption_load_curve` | `courbe_de_charge_consommation` |
| `consumption_max_power` | `puissance_conso_max_quotidienne` |
| `daily_production` | `production_quotidienne` |
| `production_load_curve` | `courbe_de_charge_production` |

Les anciens noms de paramètres `prm`, `start` et `end` sont également acceptés en repli de `pointId`, `dateDebut` et `dateFin`.

## Format de réponse (V2)

Le noeud retourne le JSON **brut** de l'API Mesure synchrone V2, sans normalisation. Exemple pour `consommation_quotidienne` :

```json
{
  "idPrm": "12345678901234",
  "periode": { "dateDebut": "2026-09-01", "dateFin": "2026-10-01" },
  "pas": "P1D",
  "grandeur": [
    {
      "grandeurMetier": "CONS",
      "grandeurPhysique": "EA",
      "unite": "Wh",
      "points": [
        { "v": "6261", "d": "2026-09-01" },
        { "v": "4882", "d": "2026-09-02" }
      ],
      "calendrier": []
    }
  ],
  "contexte": []
}
```

> ⚠️ **Changement de format** : depuis la version **1.5.0**, les données ne sont plus dans `payload.interval_reading`. Utilisez `payload.grandeur[].points[]` dans les noeuds en aval (par exemple `payload.grandeur[0].points`). Les types `index_*` exposent leurs séries dans `payload.contexte[].grandeur[]`.

## Migration 2026

L'ancienne API Enedis *Metering data V5* a été arrêtée en octobre 2026. Depuis la version **1.5.0**, `node-red-linky` utilise l'API *Mesure synchrone V2* :

1. Remplacez le `type` de vos payloads par son équivalent V2 (voir le tableau ci-dessus).
2. Renommez si possible `prm` → `pointId`, `start` → `dateDebut`, `end` → `dateFin`.
3. Adaptez les noeuds en aval au nouveau format de réponse (`grandeur[].points[]`).
4. Pour `puissance_conso_max_quotidienne`, ajustez au besoin `mesuresPas` et `grandeurPhysique`.

Voir [https://conso.boris.sh/migration-2026](https://conso.boris.sh/migration-2026).

## Limitation quotidienne des appels et système de cache

Un système de limitation quotidienne est mis en place pour éviter les appels API excessifs pour une même requête identique. **Les réponses sont mises en cache**, permettant de servir les données en cache quand la limite est atteinte.
Cette fonctionnalité permet d'éviter le blocage d'IP, voir "Conseils d'utilisation" sur [Conso API](https://github.com/bokub/conso-api?tab=readme-ov-file#conseils-dutilisation)

### Fonctionnement de la limitation

- **Limite par défaut**: 3 appels par jour pour une requête identique
- **Configuration**: La limite peut être ajustée via le paramètre `options_api_daily_limit` (en cas de besoin spécifique peut être modifiée, attention au risque de bannissement)
- **Signature de requête**: Chaque requête est identifiée par une signature unique (hash SHA256) et **mis en cache** (cache de votre instance Node-RED dans une variable de contexte du noeud, donc reste chez vous) basée sur:
  - Le jour de l'appel
  - Le type d'API canonique (`type`, alias legacy traduits)
  - Le point de livraison (`pointId`)
  - Les dates de début et fin (`dateDebut`, `dateFin`)
  - Les options de puissance max (`mesuresPas`, `grandeurPhysique`) le cas échéant
  - L'endpoint API (`endpoint`)
  - Les configurations de timeout
  - La limite de retry
  
  Donc tout sauf `debug`

- **Réinitialisation automatique**: Le compteur se réinitialise automatiquement chaque jour à minuit

### Comportement avec cache

- **Appel réussi**: La réponse est automatiquement mise en cache avec la signature de la requête
- **Limite atteinte**:
  - Une réponse en cache est retournée (statut du noeud: **jaune**)
  - Si aucune réponse n'a pu être mise en cache (statut du noeud: **rouge**) cas de l'API en erreurs successives "_Daily limit of X calls for this request reached. No cache available._" sera affiché dans le log

## Développement (Docker Compose)

Le stack de développement ne nécessite que Docker et Docker Compose sur l'hôte.

```bash
make help        # liste des commandes
make doctor      # vérifie Docker, Compose et le port
make up          # installe les dépendances puis démarre Node-RED sur http://localhost:1880
make watch       # redémarre Node-RED à chaque modification de linky/
make down        # arrête le stack (les flows Node-RED sont conservés)
```

Le module est monté dans `/data/node_modules/@flecoufle/node-red-linky` : Node-RED le charge
comme une installation via la palette. Les dépendances npm (`got`) sont installées dans un
conteneur Node 22, sans nécessiter Node.js sur l'hôte.

Autres commandes utiles :

| Commande | Description |
|----------|-------------|
| `make shell` | Shell dans le conteneur d'outils (Node 22 / npm) |
| `make nr-shell` | Shell dans le conteneur Node-RED |
| `make logs` | Suit les logs Node-RED |
| `make test` / `make lint` | Lance `npm test` / `npm run lint` (si définis dans `package.json`) |
| `make check` | lint + tests |
| `make pack` | Construit l'archive npm (`.tgz`) |
| `make seed` | Remplace les flows Node-RED par `examples/Examples.json` |
| `make reset` | Supprime le volume Node-RED (flows, settings, credentials) |
| `make debug` | Lance Node-RED au premier plan avec l'inspecteur sur le port 9229 |

Les valeurs par défaut (port, fuseau horaire, versions des images) sont dans le `Makefile` et
peuvent être surchargées dans un fichier `.env` (voir `.env.example`, `make env`).