# node-red-linky
Retreive linky power consumption and production from <a href="https://github.com/bokub/conso-api#readme">bokub/conso-api</a>

See Enedis documentation on <a href="https://datahub-enedis.fr/services-api/data-connect/documentation/">data-connect</a>

## consumption usage
- <b>Récupération de la consommation énergétique quotidienne</b>: <code>daily_consumption</code>

Permet de récupérer la consommation énergétique quotidienne de la période demandée [start;end[ en Wh pour le point de livraison renseigné et la personne titulaire authentifiée, ou dont l’indentifiant est donné en paramètre.

Chaque valeur est datée.
Un appel peut porter sur des données datant au maximum de 36 mois et 15 jours avant la date d’appel.

- <b>Récupération de la courbe de charge en soutirage</b>: <code>consumption_load_curve</code>

Permet de récupérer la courbe de charge en soutirage sur l’intervalle [start;end[ pour le point de livraison renseigné et la personne titulaire authentifiée, ou dont l’indentifiant est donné en paramètre.

La profondeur de données disponible en un appel est d’une semaine.
Les valeurs retournées sont des puissances moyennes de consommation en W sur l’intervalle de mesure du compteur (par défaut 30mn).
Chaque valeur est horodatée.
La courbe de charge s’obtient sur des journées complètes de minuit à minuit du jour suivant en heures locales.
Un appel peut porter sur des données datant au maximum de 24 mois et 15 jours avant la date d’appel.

- <b>Récupération de la puissance maximale soutirée quotidienne</b>: <code>consumption_max_power</code>

Permet de récupérer la puissance maximale soutirée quotidienne de la période demandée [start;end[, en VA pour le point de livraison renseigné et la personne titulaire authentifiée, ou dont l’indentifiant est donné en paramètre.

Chaque valeur est datée.
Un appel peut porter sur des données datant au maximum de 36 mois et 15 jours avant la date d’appel.

## production usage
- <b>Récupération de la production énergétique quotidienne</b>: <code>daily_production</code>

Permet de récupérer la production énergétique quotidienne de la période demandée pour le point de livraison renseigné et la personne titulaire authentifiée, ou dont l’indentifiant est donné en paramètre sur la période demandée [start;end[ en Wh. Un appel peut porter sur des données datant au maximum de 36 mois et 15 jours avant la date d’appel.

- <b>Récupération de la courbe de charge de production</b>: <code>production_load_curve</code>

Permet de récupérer la courbe de charge de production sur l’intervalle [start;end[ pour le point de livraison renseigné et la personne titulaire authentifiée, ou dont l’indentifiant est donné en paramètre.

La profondeur de données disponible en un appel est d’une semaine.
Les valeurs retournées sont des puissances moyennes de production en W sur l’intervalle de mesure du compteur (par défaut 30mn).
Chaque valeur est horodatée.
La courbe de charge s’obtient sur des journées complètes de minuit à minuit du jour suivant en heures locales.
Un appel peut porter sur des données datant au maximum de 24 mois et 15 jours avant la date d’appel.
