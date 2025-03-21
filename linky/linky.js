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

    const nodeStatus = {
        WAIT: "Waiting...",
        FETCH: "Fetching...",
        OK: "OK",
        ERROR: "Error"
    };

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
                "options_retry_limit": msg.payload?.options_retry_limit || 2,
                "options_timeout_lookup": msg.payload?.options_timeout_lookup || 500,
                "options_timeout_connect": msg.payload?.options_timeout_connect || 500,
                "options_timeout_secureconnect": msg.payload?.options_timeout_secureconnect || 500,
                "options_timeout_socket": msg.payload?.options_timeout_socket || 5000,
                "options_timeout_send": msg.payload?.options_timeout_send || 10000,
                "options_timeout_response": msg.payload?.options_timeout_response || 10000,
                "random_delay": msg.payload?.random_delay || 5000,
                "endpoint": msg.payload?.endpoint || 'https://conso.boris.sh/api/',
                "debug": msg.payload?.debug === true || msg.payload?.debug == "true"
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

            !_p.type ? (done ? done('api type not set (ex. daily_consumption) see documentation') : node.error('api type not set (ex. daily_consumption) see documentation')) : null;
            !_p.token ? (done ? done('token not set') : node.error('token not set')) : null;
            !_p.prm ? (done ? done('PRM not set') : node.error('PRM not set')) : null;
            !_p.start ? (done ? done('start not set') : node.error('start not set')) : null;
            !_p.end ? (done ? done('end not set') : node.error('end not set')) : null;

            if (_p.type && _p.token && _p.prm && _p.start && _p.end) {
                let wait = Math.floor(Math.random() * _p.random_delay);
                let msg_wait = nodeStatus.WAIT + Math.ceil(wait / 1000) + 's';
                node.status({ fill: 'grey', shape: 'ring', text: msg_wait });
                setTimeout(() => {
                    node.status({ fill: 'grey', shape: 'ring', text: nodeStatus.FETCH });
                    let request;
                    try {
                        let url = new URL(_p.endpoint);
                        url.pathname += _p.type;
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
                    _p.debug && options && node.warn('Options:' + JSON.stringify(options));

                    request && options && got(request, options)
                        .then(res => {
                            if (res.statusCode == '200') {
                                try {
                                    msg.payload = JSON.parse(res.body);
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
            }
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