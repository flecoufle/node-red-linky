## 1.5.0 - 20261029
migration vers l'API Enedis Mesure synchrone V2 (arrêt de Metering data V5)
nouveaux types: consommation_quotidienne, courbe_de_charge_consommation, puissance_conso_max_quotidienne, index_consommation, production_quotidienne, courbe_de_charge_production, index_production
anciens types et paramètres acceptés comme alias (prm/start/end -> pointId/dateDebut/dateFin)
options mesuresPas (P1D/P1M) et grandeurPhysique (PMA/TOUT) pour la puissance max
changement du format de réponse: payload.grandeur[].points[] (au lieu de payload.interval_reading)
header Accept, erreurs HTTP avec corps de réponse, cache cloné
fix lecture du token et du PRM saisis directement dans le noeud
validation locale: PRM sur 14 chiffres, dateDebut < dateFin, courbes de charge limitees a 7 jours
normalisation des espaces (token, PRM, dates, endpoint) et du slash final de l'endpoint
avertissement lorsque le token est stocke en clair dans flows.json
tests automatises (node:test + mock HTTP) et workflow CI
correction des exemples index_* (payload.contexte[].grandeur[]) et section depannage

## 1.4.3 - 20260126
clean cache in options_api_daily_limit

## 1.4.2 - 20260125
github action

## 1.4.1 - 20260125
add publishConfig registry

## 1.4.0 - 20260124
add options_api_daily_limit

## 1.3.0 - 20250321
add debug option

## 1.2.0 - 20240705
add config node
fix error handler

## 1.1.0 - 20231006
dependency: add got 13

## 1.0.0 - 20230701
initial stable release