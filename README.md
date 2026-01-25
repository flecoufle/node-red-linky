# node-red-linky

Package Node-RED **Linky** pour récupérer les données de **consommation** et **production** d'énergie via l'API Enedis.

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
- [Documentation](https://datahub-enedis.fr/services-api/data-connect/documentation/) de Enedis API Data-Connect (pour information uniquement)
  
## ⚠️ Important - Mise en cache des appels

À partir de la version **1.4.0**, le node limite les appels pour respecter les quotas de l'API et éviter le bannissement de votre IP, une mise en cache est mise en place pour permettre la continuité de service. Cette fonction est appliquée par requête unique (l'API sous-jacente elle-même renvoie déjà des données qui ne changent pas, donc cette fonction ne modifie en rien les informations retournées). 

Pour les utilisateurs des versions antérieures: **veuillez mettre à jour** pour bénéficier de cette protection.

## Configuration et Paramètres

### Paramètres obligatoires (peuvent être passés via le payload)

| Paramètre | Type | Description |
|-----------|------|-------------|
| `type` | string | Type de mesure (daily_consumption, daily_production, consumption_load_curve, consumption_max_power, production_load_curve) |
| `token` | string | Token d'authentification Enedis (via le payload ou noeud ou config) |
| `prm` | string | Point de livraison (numéro PRM) (via le payload ou noeud ou config)|
| `start` | string | Date de début (format YYYY-MM-DD) |
| `end` | string | Date de fin (format YYYY-MM-DD) |

### Paramètres optionnels (uniquement via le payload)

| Paramètre | Type | Défaut | Description |
|-----------|------|--------|-------------|
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

### Consommation

- **`daily_consumption`** - Récupération de la consommation énergétique quotidienne
  - Période demandée [start;end[ en Wh
  - Historique: jusqu'à 36 mois et 15 jours avant la date d'appel
  - Chaque valeur est datée

- **`consumption_load_curve`** - Récupération de la courbe de charge en soutirage
  - Intervalle [start;end[ 
  - Profondeur: une semaine maximum par appel
  - Valeurs: puissances moyennes de consommation en W (intervalle par défaut 30mn)
  - Historique: jusqu'à 24 mois et 15 jours avant la date d'appel
  - Journées complètes de minuit à minuit (heures locales)

- **`consumption_max_power`** - Récupération de la puissance maximale soutirée quotidienne
  - Période demandée [start;end[ en VA
  - Historique: jusqu'à 36 mois et 15 jours avant la date d'appel
  - Chaque valeur est datée

### Production

- **`daily_production`** - Récupération de la production énergétique quotidienne
  - Période demandée [start;end[ en Wh
  - Historique: jusqu'à 36 mois et 15 jours avant la date d'appel
  - Chaque valeur est datée

- **`production_load_curve`** - Récupération de la courbe de charge de production
  - Intervalle [start;end[
  - Profondeur: une semaine maximum par appel
  - Valeurs: puissances moyennes de production en W (intervalle par défaut 30mn)
  - Historique: jusqu'à 24 mois et 15 jours avant la date d'appel
  - Journées complètes de minuit à minuit (heures locales)

## Limitation quotidienne des appels et système de cache

Un système de limitation quotidienne est mis en place pour éviter les appels API excessifs pour une même requête identique. **Les réponses sont mises en cache**, permettant de servir les données en cache quand la limite est atteinte.
Cette fonctionnalité permet d'éviter le blocage d'IP, voir "Conseils d'utilisation" sur [Conso API](https://github.com/bokub/conso-api?tab=readme-ov-file#conseils-dutilisation)

### Fonctionnement de la limitation

- **Limite par défaut**: 3 appels par jour pour une requête identique
- **Configuration**: La limite peut être ajustée via le paramètre `options_api_daily_limit` (en cas de besoin spécifique peut être modifiée, attention au risque de bannissement)
- **Signature de requête**: Chaque requête est identifiée par une signature unique (hash SHA256) et **mis en cache** (cache de votre instance Node-RED dans une variable de contexte du noeud, donc reste chez vous) basée sur:
  - Le jour de l'appel
  - Le type d'API (`type`)
  - Le point de livraison (`prm`)
  - Les dates de début et fin (`start`, `end`)
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