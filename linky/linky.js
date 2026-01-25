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

    // Fonction pour obtenir la clé du jour (YYYY-MM-DD)
    function getTodayKey() {
        return new Date().toISOString().split('T')[0];
    }

    // Fonction pour créer une clé unique basée sur les paramètres de la requête
    function createRequestSignature(params, options) {
        // Créer un objet avec les paramètres pertinents pour la requête
        const requestIdentifier = {
            day: getTodayKey(), // Inclure le jour pour avoir une signature par jour
            type: params.type,
            prm: params.prm,
            start: params.start,
            end: params.end,
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
        
        // Créer un hash SHA256 pour avoir une clé courte et unique
        const hash = crypto.createHash('sha256');
        hash.update(JSON.stringify(requestIdentifier));
        return hash.digest('hex').substring(0, 16); // Utiliser les 16 premiers caractères
    }

    // Fonction pour obtenir/réinitialiser le compteur si nécessaire
    function getOrResetRequestCounter(node, requestSignature) {
        const today = getTodayKey();
        let requestHistory = node.context().get('requestHistory') || {};
        
        if (!requestHistory[requestSignature]) {
            requestHistory[requestSignature] = {
                date: today,
                count: 0
            };
        } else if (requestHistory[requestSignature].date !== today) {
            // Nouveau jour, réinitialiser
            requestHistory[requestSignature] = {
                date: today,
                count: 0
            };
        }
        
        node.context().set('requestHistory', requestHistory);
        return requestHistory[requestSignature];
    }

    // Fonction pour incrémenter et retourner le nouveau count pour une requête spécifique
    function incrementAndGetRequestCount(node, requestSignature) {
        let requestCounter = getOrResetRequestCounter(node, requestSignature);
        requestCounter.count++;
        let requestHistory = node.context().get('requestHistory');
        requestHistory[requestSignature] = requestCounter;
        node.context().set('requestHistory', requestHistory);
        return requestCounter.count;
    }

    // Fonction pour obtenir les infos du compteur avec détails
    function getRequestCounterInfo(node, requestSignature, dailyLimit) {
        const requestCounter = getOrResetRequestCounter(node, requestSignature);
        return {
            count: requestCounter.count,
            date: requestCounter.date,
            signature: requestSignature,
            remaining: Math.max(0, dailyLimit - requestCounter.count),
            isLimited: requestCounter.count >= dailyLimit
        };
    }

    function LinkyMetering(config) {
        RED.nodes.createNode(this, config);
        var node = this;

        // config node
        node.config = RED.nodes.getNode(config.config);

        node.on('input', function (msg, send, done) {
            const _p = {
                "type": msg.payload?.type || '',
                "token": msg.payload?.token || node.credentials?.token || node.config?.token || '',
                "prm": msg.payload?.prm || node.credentials?.prm || node.config?.prm || '',
                "start": msg.payload?.start || '',
                "end": msg.payload?.end || '',
                "options_api_daily_limit": msg.payload?.options_api_daily_limit || 3,
                "options_retry_limit": msg.payload?.options_retry_limit ?? 2,
                "options_timeout_lookup": msg.payload?.options_timeout_lookup ?? 500,
                "options_timeout_connect": msg.payload?.options_timeout_connect ?? 500,
                "options_timeout_secureconnect": msg.payload?.options_timeout_secureconnect ?? 500,
                "options_timeout_socket": msg.payload?.options_timeout_socket ?? 5000,
                "options_timeout_send": msg.payload?.options_timeout_send ?? 10000,
                "options_timeout_response": msg.payload?.options_timeout_response ?? 10000,
                "random_delay": msg.payload?.random_delay ?? 5000,
                "endpoint": msg.payload?.endpoint || 'https://conso.boris.sh/api/',
                "debug": String(msg.payload?.debug).toLowerCase() === "true"
            }

            const options = {
                headers: {
                    'Authorization': `bearer ${_p.token}`,
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
                }
            };

            if (!_p.type) {
                const err = 'api type not set (ex. daily_consumption) see documentation';
                done ? done(err) : node.error(err, msg);
                return;
            }
            if (!_p.token) {
                const err = 'token not set';
                done ? done(err) : node.error(err, msg);
                return;
            }
            if (!_p.prm) {
                const err = 'PRM not set';
                done ? done(err) : node.error(err, msg);
                return;
            }
            if (!_p.start) {
                const err = 'start not set';
                done ? done(err) : node.error(err, msg);
                return;
            }
            if (!_p.end) {
                const err = 'end not set';
                done ? done(err) : node.error(err, msg);
                return;
            }

            // Créer une signature unique de la requête
            const requestSignature = createRequestSignature(_p, options);
            
            // Vérifier si cette requête spécifique a dépassé la limite
            const counterInfo = getRequestCounterInfo(node, requestSignature, _p.options_api_daily_limit);
            if (counterInfo.isLimited) {
                // Récupérer la réponse en cache
                let responseCache = node.context().get('responseCache') || {};
                const cachedResponse = responseCache[requestSignature];
                
                if (cachedResponse) {
                    // Retourner la réponse en cache
                    const statusMsg = `Limit reached - Returning cached response (${counterInfo.count}/${_p.options_api_daily_limit}) - Sig: ${requestSignature}`;
                    node.status({ fill: 'yellow', shape: 'ring', text: statusMsg });
                    msg.payload = cachedResponse;
                    node.send(msg);
                    if (done) done();
                } else {
                    // Pas de cache disponible
                    const statusMsg = `Error limit reached (${counterInfo.count}/${_p.options_api_daily_limit}) - Sig: ${requestSignature}`;
                    node.status({ fill: 'red', shape: 'ring', text: statusMsg });
                    const errorMsg = `Daily limit of ${_p.options_api_daily_limit} calls for this request reached. No cache available.`;
                    node.error(errorMsg, msg);
                    if (done) done(errorMsg);
                }
                return;
            }

            // Incrémenter le compteur pour cette requête spécifique MAINTENANT (avant l'appel)
            const newCount = incrementAndGetRequestCount(node, requestSignature);
            const remaining = _p.options_api_daily_limit - newCount;
            _p.debug && node.warn(`Request ${requestSignature} - Call ${newCount}/${_p.options_api_daily_limit} - Remaining: ${remaining}`);

            let wait = Math.floor(Math.random() * _p.random_delay);
            let msg_wait = nodeStatus.WAIT + Math.ceil(wait / 1000) + 's';
            node.status({ fill: 'grey', shape: 'ring', text: msg_wait });
            setTimeout(() => {
                node.status({ fill: 'grey', shape: 'ring', text: nodeStatus.FETCH });
                let request;
                try {
                    let url = new URL(_p.endpoint);
                    url.pathname = url.pathname.replace(/\/$/, '') + '/' + _p.type;
                    url.search = new URLSearchParams({
                        prm: _p.prm,
                        start: _p.start,
                        end: _p.end
                    }).toString();
                    request = url.toString();
                } catch (err) {
                    node.status({ fill: 'red', shape: 'ring', text: 'error' });
                    if (done) {
                        done('url ' + err);
                    } else {
                        node.error('url ' + err);
                    }
                }

                _p.debug && request && node.warn('Request URL:' + request);
                if (_p.debug && options) {
                    const debugOptions = { ...options, headers: { ...options.headers } };
                    if (debugOptions.headers && debugOptions.headers['Authorization']) {
                        debugOptions.headers['Authorization'] = 'Bearer [HIDDEN]';
                    }
                    node.warn('Options:' + JSON.stringify(debugOptions));
                }

                request && options && got(request, options)
                    .then(res => {
                        if (res.statusCode == '200') {
                            try {
                                msg.payload = JSON.parse(res.body);
                                
                                // Stocker la réponse en cache
                                let responseCache = node.context().get('responseCache') || {};
                                responseCache[requestSignature] = msg.payload;
                                node.context().set('responseCache', responseCache);
                                
                                node.send(msg);
                                node.status({ fill: 'blue', shape: 'dot', text: 'OK' });

                                setTimeout(() => {
                                    node.status({});
                                    if (done) {
                                        done();
                                    }
                                }, 1000);
                            } catch (err) {
                                node.status({ fill: 'red', shape: 'ring', text: 'error' });
                                if (done) {
                                    done('parsing ' + err);
                                } else {
                                    node.error('parsing ' + err, msg);
                                }
                            }
                        } else {
                            node.status({ fill: 'red', shape: 'ring', text: res.statusCode });
                            if (done) {
                                done(`statusCode ${res.statusCode}`);
                            } else {
                                node.error(`statusCode ${res.statusCode}`, msg);
                            }
                        }
                    })
                    .catch(err => {
                        node.status({ fill: 'red', shape: 'ring', text: 'error' });

                        if (done) {
                            done(err);
                        } else {
                            node.error(err, msg);
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