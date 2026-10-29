/*
Copyright 2023, François Lecoufle

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files(the "Software"), to deal in
    the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and / or sell copies of
the Software, and to permit persons to whom the Software is furnished to do so,
    subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.IN NO EVENT SHALL THE AUTHORS OR
COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

"use strict";

module.exports = async function (RED) {
    const { got } = await import('got');
    const crypto = await import('crypto');

    const nodeStatus = {
        WAIT: "Waiting...",
        FETCH: "Fetching..."
    };

    // API Mesure synchrone V2 (Enedis, remplace Metering data V5 depuis 2026)
    const API_TYPES = {
        index_consommation: {},
        index_production: {},
        consommation_quotidienne: {},
        production_quotidienne: {},
        puissance_conso_max_quotidienne: { maxPower: true },
        courbe_de_charge_consommation: {},
        courbe_de_charge_production: {}
    };

    // Anciens types Metering data V5 -> types Mesure synchrone V2
    const LEGACY_TYPE_ALIASES = {
        daily_consumption: 'consommation_quotidienne',
        consumption_load_curve: 'courbe_de_charge_consommation',
        consumption_max_power: 'puissance_conso_max_quotidienne',
        daily_production: 'production_quotidienne',
        production_load_curve: 'courbe_de_charge_production'
    };

    const MEASURE_STEPS = new Set(['P1D', 'P1M']);
    const PHYSICAL_QUANTITIES = new Set(['PMA', 'TOUT']);
    const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
    const PRM_PATTERN = /^\d{14}$/;
    const LOAD_CURVE_TYPES = new Set([
        'courbe_de_charge_consommation',
        'courbe_de_charge_production'
    ]);
    const LOAD_CURVE_MAX_DAYS = 7;
    const MS_PER_DAY = 24 * 60 * 60 * 1000;

    // Fonction pour obtenir la clé du jour (YYYY-MM-DD)
    function getTodayKey() {
        return new Date().toISOString().split('T')[0];
    }

    // Retourne la première valeur définie et non vide
    function firstDefined(...values) {
        return values.find(value => value !== undefined && value !== null && value !== '');
    }

    // Normalise une valeur texte (espaces superflus, slash final de l'endpoint)
    function normalizeText(value, stripTrailingSlash = false) {
        if (value === undefined || value === null) {
            return '';
        }
        let text = String(value).trim();
        if (stripTrailingSlash) {
            text = text.replace(/\/+$/, '');
        }
        return text;
    }

    // Convertit une option numérique sans casser les valeurs absentes
    function toNumber(value, fallback) {
        if (value === undefined || value === null || value === '') {
            return fallback;
        }
        return Number(value);
    }

    function normalizeType(type) {
        return LEGACY_TYPE_ALIASES[type] || type;
    }

    function isMaxPowerType(type) {
        return API_TYPES[type]?.maxPower === true;
    }

    // Normalise le payload (nouveaux noms V2 + alias des anciens noms)
    function buildRequest(msg, node) {
        const payload = msg.payload || {};
        const type = normalizeType(payload.type || '');
        const isMaxPower = isMaxPowerType(type);

        return {
            type,
            token: normalizeText(firstDefined(payload.token, node.credentials?.token, node.config?.token, node.token)),
            pointId: normalizeText(firstDefined(payload.pointId, payload.prm, node.credentials?.prm, node.config?.prm, node.prm)),
            dateDebut: normalizeText(firstDefined(payload.dateDebut, payload.start)),
            dateFin: normalizeText(firstDefined(payload.dateFin, payload.end)),
            mesuresPas: isMaxPower ? normalizeText(firstDefined(payload.mesuresPas)) || 'P1D' : undefined,
            grandeurPhysique: isMaxPower ? normalizeText(firstDefined(payload.grandeurPhysique)) || 'PMA' : undefined,
            options_api_daily_limit: toNumber(payload.options_api_daily_limit, 3),
            options_retry_limit: toNumber(payload.options_retry_limit, 2),
            options_timeout_lookup: toNumber(payload.options_timeout_lookup, 500),
            options_timeout_connect: toNumber(payload.options_timeout_connect, 500),
            options_timeout_secureconnect: toNumber(payload.options_timeout_secureconnect, 500),
            options_timeout_socket: toNumber(payload.options_timeout_socket, 5000),
            options_timeout_send: toNumber(payload.options_timeout_send, 10000),
            options_timeout_response: toNumber(payload.options_timeout_response, 10000),
            random_delay: toNumber(payload.random_delay, 5000),
            endpoint: normalizeText(firstDefined(payload.endpoint), true) || 'https://conso.boris.sh/api',
            debug: String(payload.debug).toLowerCase() === "true"
        };
    }

    function validateRequest(params) {
        if (!params.type) {
            return 'api type not set (ex. consommation_quotidienne) see documentation';
        }
        if (!API_TYPES[params.type]) {
            return `unknown api type "${params.type}" (expected one of: ${Object.keys(API_TYPES).join(', ')})`;
        }
        if (!params.token) {
            return 'token not set';
        }
        if (!params.pointId) {
            return 'pointId/PRM not set';
        }
        if (!PRM_PATTERN.test(params.pointId)) {
            return 'pointId/PRM must contain 14 digits';
        }
        if (!params.dateDebut) {
            return 'dateDebut/start not set';
        }
        if (!params.dateFin) {
            return 'dateFin/end not set';
        }
        if (!DATE_PATTERN.test(params.dateDebut)) {
            return 'dateDebut/start must use YYYY-MM-DD format';
        }
        if (!DATE_PATTERN.test(params.dateFin)) {
            return 'dateFin/end must use YYYY-MM-DD format';
        }

        const startTime = Date.parse(params.dateDebut);
        const endTime = Date.parse(params.dateFin);
        if (Number.isNaN(startTime)) {
            return 'dateDebut/start is not a valid date';
        }
        if (Number.isNaN(endTime)) {
            return 'dateFin/end is not a valid date';
        }
        if (startTime >= endTime) {
            return 'dateDebut/start must be before dateFin/end';
        }
        if (LOAD_CURVE_TYPES.has(params.type) && (endTime - startTime) > LOAD_CURVE_MAX_DAYS * MS_PER_DAY) {
            return `load curve requests are limited to ${LOAD_CURVE_MAX_DAYS} days`;
        }
        if (!params.endpoint) {
            return 'endpoint not set';
        }
        if (isMaxPowerType(params.type)) {
            if (!MEASURE_STEPS.has(params.mesuresPas)) {
                return 'mesuresPas must be P1D or P1M';
            }
            if (!PHYSICAL_QUANTITIES.has(params.grandeurPhysique)) {
                return 'grandeurPhysique must be PMA or TOUT';
            }
        }
        if (!Number.isInteger(params.options_api_daily_limit) || params.options_api_daily_limit < 1) {
            return 'options_api_daily_limit must be a positive integer';
        }
        if (!Number.isInteger(params.options_retry_limit) || params.options_retry_limit < 0) {
            return 'options_retry_limit must be a non-negative integer';
        }
        for (const key of [
            'options_timeout_lookup',
            'options_timeout_connect',
            'options_timeout_secureconnect',
            'options_timeout_socket',
            'options_timeout_send',
            'options_timeout_response'
        ]) {
            if (!Number.isFinite(params[key]) || params[key] <= 0) {
                return `${key} must be a positive number`;
            }
        }
        if (!Number.isFinite(params.random_delay) || params.random_delay < 0) {
            return 'random_delay must be a non-negative number';
        }
        return null;
    }

    // Crée une clé unique basée sur les paramètres canoniques de la requête
    function createRequestSignature(params) {
        const requestIdentifier = {
            type: params.type,
            pointId: params.pointId,
            dateDebut: params.dateDebut,
            dateFin: params.dateFin,
            endpoint: params.endpoint,
            // Inclure les timeouts pour distinguer les requêtes avec configs différentes
            timeout: {
                lookup: params.options_timeout_lookup,
                connect: params.options_timeout_connect,
                secureConnect: params.options_timeout_secureconnect,
                socket: params.options_timeout_socket,
                send: params.options_timeout_send,
                response: params.options_timeout_response
            },
            retry_limit: params.options_retry_limit
        };

        if (isMaxPowerType(params.type)) {
            requestIdentifier.mesuresPas = params.mesuresPas;
            requestIdentifier.grandeurPhysique = params.grandeurPhysique;
        }

        // Créer un hash SHA256 pour avoir une clé courte et unique
        const hash = crypto.createHash('sha256');
        hash.update(JSON.stringify(requestIdentifier));
        return hash.digest('hex').substring(0, 16); // Utiliser les 16 premiers caractères
    }

    // Construit l'URL de l'API Mesure synchrone V2
    function buildRequestURL(params) {
        const url = new URL(params.endpoint);
        url.pathname = url.pathname.replace(/\/$/, '') + '/' + params.type;

        const search = new URLSearchParams({
            pointId: params.pointId,
            dateDebut: params.dateDebut,
            dateFin: params.dateFin
        });

        if (isMaxPowerType(params.type)) {
            search.set('mesuresPas', params.mesuresPas);
            search.set('grandeurPhysique', params.grandeurPhysique);
        }

        url.search = search.toString();
        return url.toString();
    }

    // Clone une valeur JSON (le cache ne doit pas partager de références avec msg.payload)
    function clone(value) {
        return value === undefined ? value : JSON.parse(JSON.stringify(value));
    }

    function formatHttpError(statusCode, body) {
        const text = typeof body === 'string' ? body : body === undefined ? '' : JSON.stringify(body);
        return `statusCode ${statusCode}${text ? ': ' + text : ''}`;
    }

    // État du nœud (cache + compteurs) réinitialisé chaque jour
    function getState(node) {
        const today = getTodayKey();
        let state = node.context().get('state');

        if (!state || state.date !== today) {
            state = { date: today, cache: {}, counters: {} };
            node.context().set('state', state);
        }

        return state;
    }

    function getCounterInfo(node, requestSignature, dailyLimit) {
        const state = getState(node);
        const count = state.counters[requestSignature] || 0;
        return {
            count,
            isLimited: count >= dailyLimit
        };
    }

    function incrementCounter(node, requestSignature) {
        const state = getState(node);
        const count = (state.counters[requestSignature] || 0) + 1;
        state.counters[requestSignature] = count;
        node.context().set('state', state);
        return count;
    }

    function LinkyMetering(config) {
        RED.nodes.createNode(this, config);
        var node = this;

        // Valeurs saisies directement dans le noeud (compatibilité flows existants)
        node.token = config.token;
        node.prm = config.prm;

        // config node
        node.config = RED.nodes.getNode(config.config);

        node.on('input', function (msg, send, done) {
            // Réinitialise le cache et les compteurs au changement de jour
            getState(node);

            const reportError = (err, statusText) => {
                if (statusText !== undefined) {
                    node.status({ fill: 'red', shape: 'ring', text: statusText });
                }
                done ? done(err) : node.error(err, msg);
            };

            const complete = () => {
                if (done) done();
            };

            const _p = buildRequest(msg, node);

            const validationError = validateRequest(_p);
            if (validationError) {
                reportError(validationError);
                return;
            }

            let request;
            try {
                request = buildRequestURL(_p);
            } catch (err) {
                reportError('url ' + err, 'error');
                return;
            }

            const options = {
                headers: {
                    'Authorization': `Bearer ${_p.token}`,
                    'Accept': 'application/json',
                    'User-Agent': 'github.com/flecoufle/node-red-linky'
                },
                retry: {
                    limit: _p.options_retry_limit,
                    errorCodes: [
                        'ETIMEDOUT'
                    ],
                },
                timeout: {
                    lookup: _p.options_timeout_lookup,
                    connect: _p.options_timeout_connect,
                    secureConnect: _p.options_timeout_secureconnect,
                    socket: _p.options_timeout_socket,
                    send: _p.options_timeout_send,
                    response: _p.options_timeout_response
                },
                responseType: 'json',
                // Les erreurs HTTP sont traitées dans .then pour remonter le corps de la réponse
                throwHttpErrors: false
            };

            // Créer une signature unique de la requête
            const requestSignature = createRequestSignature(_p);

            // Vérifier si cette requête spécifique a dépassé la limite
            const counterInfo = getCounterInfo(node, requestSignature, _p.options_api_daily_limit);
            if (counterInfo.isLimited) {
                const cachedResponse = getState(node).cache[requestSignature];

                if (cachedResponse) {
                    // Retourner la réponse en cache
                    const statusMsg = `Limit reached - Returning cached response (${counterInfo.count}/${_p.options_api_daily_limit}) - Sig: ${requestSignature}`;
                    node.status({ fill: 'yellow', shape: 'ring', text: statusMsg });
                    msg.payload = clone(cachedResponse);
                    node.send(msg);
                    complete();
                } else {
                    // Pas de cache disponible
                    const statusMsg = `Error limit reached (${counterInfo.count}/${_p.options_api_daily_limit}) - Sig: ${requestSignature}`;
                    node.status({ fill: 'red', shape: 'ring', text: statusMsg });
                    reportError(`Daily limit of ${_p.options_api_daily_limit} calls for this request reached. No cache available.`);
                }
                return;
            }

            // Incrémenter le compteur pour cette requête spécifique MAINTENANT (avant l'appel)
            const newCount = incrementCounter(node, requestSignature);
            _p.debug && node.warn(`Request ${requestSignature} - Call ${newCount}/${_p.options_api_daily_limit} - Remaining: ${_p.options_api_daily_limit - newCount}`);

            const wait = Math.floor(Math.random() * _p.random_delay);
            node.status({ fill: 'grey', shape: 'ring', text: nodeStatus.WAIT + Math.ceil(wait / 1000) + 's' });
            setTimeout(() => {
                node.status({ fill: 'grey', shape: 'ring', text: nodeStatus.FETCH });

                _p.debug && node.warn('Request URL:' + request);
                if (_p.debug) {
                    const debugOptions = { ...options, headers: { ...options.headers } };
                    if (debugOptions.headers && debugOptions.headers['Authorization']) {
                        debugOptions.headers['Authorization'] = 'Bearer [HIDDEN]';
                    }
                    node.warn('Options:' + JSON.stringify(debugOptions));
                }

                let requestPromise;
                try {
                    requestPromise = got(request, options);
                } catch (err) {
                    // got valide ses options de façon synchrone
                    reportError(err, 'error');
                    return;
                }

                requestPromise
                    .then(res => {
                        if (res.statusCode >= 200 && res.statusCode < 300) {
                            msg.payload = res.body;

                            // Stocker la réponse en cache (clonée pour ne pas partager de référence)
                            const state = getState(node);
                            state.cache[requestSignature] = clone(msg.payload);
                            node.context().set('state', state);

                            node.send(msg);
                            node.status({ fill: 'blue', shape: 'dot', text: 'OK' });

                            setTimeout(() => {
                                node.status({});
                                complete();
                            }, 1000);
                        } else {
                            reportError(formatHttpError(res.statusCode, res.body), res.statusCode);
                        }
                    })
                    .catch(err => {
                        const statusCode = err.response?.statusCode;
                        if (statusCode) {
                            reportError(formatHttpError(statusCode, err.response.body), statusCode);
                        } else {
                            reportError(err, 'error');
                        }
                    });
            }, wait);
        })
    }
    RED.nodes.registerType("linky-api", LinkyMetering, {
        credentials: {
            prm: {
                type: "text"
            },
            token: {
                type: "password"
            }
        }
    });
}
