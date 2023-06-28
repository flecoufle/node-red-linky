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

module.exports = function (RED) {
    const got = require('got');

    const nodeStatus = {
        WAIT: "Waiting...",
        FETCH: "Fetching...",
        OK: "OK",
        ERROR: "Error"
    };

    function LinkyMetering(config) {
        RED.nodes.createNode(this, config);
        var node = this;

        node.on('input', function (msg, send, done) {
            const _p = {
                "type": msg.payload.type || '',
                "token": msg.payload.token || node.credentials.token || '',
                "prm": msg.payload.prm || node.credentials.prm || '',
                "start": msg.payload.start || '',
                "end": msg.payload.end || '',
                "options_retry_limit": msg.payload.options_retry_limit || 2,
                "options_timeout_lookup": msg.payload.options_timeout_lookup || 500,
                "options_timeout_connect": msg.payload.options_timeout_connect || 500,
                "options_timeout_secureconnect": msg.payload.options_timeout_secureconnect || 500,
                "options_timeout_socket": msg.payload.options_timeout_socket || 5000,
                "options_timeout_send": msg.payload.options_timeout_send || 10000,
                "options_timeout_response": msg.payload.options_timeout_response || 10000,
                "random_delay" : msg.payload.random_delay || 5000,
                "endpoint": msg.payload.endpoint || 'https://conso.boris.sh/api/'
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

            _p.token || node.error('token not set');
            _p.prm || node.error('PRM not set');
            _p.start || node.error('start not set');
            _p.end || node.error('end not set');

            let wait = Math.floor(Math.random() * _p.random_delay);
            let msg_wait = nodeStatus.WAIT + Math.ceil(wait/1000) + 's';
            node.status({ fill: 'grey', shape: 'ring', text: msg_wait });
            setTimeout(() => {
                node.status({ fill: 'grey', shape: 'ring', text: nodeStatus.FETCH });
                let request = `${_p.endpoint}${_p.type}?prm=${_p.prm}&start=${_p.start}&end=${_p.end}`;
                got(request, options)
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
                    if (err instanceof got.HTTPError) {
                        node.warn(request);
                        if (err.response.statusCode == '400') {
                            node.error('Bad request: Check token and PRM or dates format');
                        } else if (err.response.statusCode == '401') {
                            node.error('Unauthorized: Check token and PRM');
                        } else if (err.response.statusCode == '403') {
                            node.error('Forbidden: Check token and PRM');
                        } else if (err.response.statusCode == '404') {
                            node.error('Not found: Check token and PRM or dates values');
                        }
                    } else if (err instanceof got.TimeoutError) {
                        node.warn('TimeoutError: adjust payload.options_timeout_*');
                    }
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