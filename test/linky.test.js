'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');

const linkyFactory = require(path.join(__dirname, '..', 'linky', 'linky.js'));

const requests = [];
let server;
let port;
let ctor;

function createRED() {
    return {
        nodes: {
            createNode(node, config) {
                const store = {};
                node.id = config.id;
                node.type = config.type;
                node.name = config.name;
                node.wires = config.wires || [];
                node.handlers = {};
                node.credentials = config.__credentials || {};
                node.context = () => ({
                    get: (key) => store[key],
                    set: (key, value) => { store[key] = value; }
                });
                node.statusCalls = [];
                node.status = (value) => { node.statusCalls.push(value); };
                node.sent = [];
                node.send = (msg) => { node.sent.push(msg); };
                node.warnings = [];
                node.warn = (message) => { node.warnings.push(String(message)); };
                node.errors = [];
                node.error = (err) => { node.errors.push(err); };
                node.on = (event, handler) => { node.handlers[event] = handler; };
            },
            getNode(id) {
                if (id === 'linked-config') {
                    return { token: 'config-token', prm: '12345678901234' };
                }
                return null;
            },
            registerType(name, constructor) {
                ctor = constructor;
            }
        }
    };
}

before(async () => {
    server = http.createServer((req, res) => {
        requests.push({
            url: req.url,
            auth: req.headers.authorization,
            accept: req.headers.accept
        });

        if (req.url.includes('dateDebut=2026-10-02')) {
            res.writeHead(401, { 'content-type': 'application/json' });
            res.end(JSON.stringify({ status: 401, message: 'token invalide' }));
            return;
        }

        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({
            idPrm: '12345678901234',
            periode: { dateDebut: '2026-10-01', dateFin: '2026-10-02' },
            pas: 'P1D',
            grandeur: [{
                grandeurMetier: 'CONS',
                grandeurPhysique: 'EA',
                unite: 'Wh',
                points: [{ v: '1000', d: '2026-10-01' }],
                calendrier: []
            }],
            contexte: []
        }));
    });

    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    port = server.address().port;
    await linkyFactory(createRED());
    assert.ok(ctor, 'linky-api node type is registered');
});

after(() => new Promise((resolve) => server.close(resolve)));

function createNode(config = {}) {
    return new ctor({
        id: 'test-node',
        type: 'linky-api',
        name: '',
        config: '',
        wires: [],
        ...config
    });
}

function baseConfig(overrides = {}) {
    return {
        token: 'node-token',
        prm: '12345678901234',
        ...overrides
    };
}

function payload(overrides = {}) {
    return {
        type: 'consommation_quotidienne',
        dateDebut: '2026-10-01',
        dateFin: '2026-10-02',
        endpoint: `http://127.0.0.1:${port}/api/`,
        random_delay: 0,
        ...overrides
    };
}

function runNode(node, msg) {
    return new Promise((resolve) => {
        node.handlers.input(msg, () => {}, (err) => resolve({ err, msg }));
    });
}

function lastRequest() {
    return requests[requests.length - 1];
}

test('reads token and PRM entered on the node', async () => {
    const node = createNode(baseConfig());
    const msg = { payload: payload() };

    const { err } = await runNode(node, msg);
    assert.equal(err, undefined);
    assert.equal(msg.payload.grandeur[0].points[0].v, '1000');

    const request = lastRequest();
    assert.equal(request.auth, 'Bearer node-token');
    assert.equal(request.accept, 'application/json');

    const url = new URL(request.url, 'http://localhost');
    assert.equal(url.pathname, '/api/consommation_quotidienne');
    assert.equal(url.searchParams.get('pointId'), '12345678901234');
    assert.equal(url.searchParams.get('dateDebut'), '2026-10-01');
    assert.equal(url.searchParams.get('dateFin'), '2026-10-02');
});

test('translates legacy type and parameter aliases', async () => {
    const node = createNode(baseConfig());
    const msg = {
        payload: payload({
            type: 'daily_consumption',
            dateDebut: undefined,
            dateFin: undefined,
            start: '2026-10-01',
            end: '2026-10-02'
        })
    };

    const { err } = await runNode(node, msg);
    assert.equal(err, undefined);

    const url = new URL(lastRequest().url, 'http://localhost');
    assert.equal(url.pathname, '/api/consommation_quotidienne');
    assert.equal(url.searchParams.get('dateDebut'), '2026-10-01');
    assert.equal(url.searchParams.get('dateFin'), '2026-10-02');
});

test('applies max power defaults and explicit options', async () => {
    let node = createNode(baseConfig());
    let result = await runNode(node, { payload: payload({ type: 'puissance_conso_max_quotidienne' }) });
    assert.equal(result.err, undefined);

    let url = new URL(lastRequest().url, 'http://localhost');
    assert.equal(url.pathname, '/api/puissance_conso_max_quotidienne');
    assert.equal(url.searchParams.get('mesuresPas'), 'P1D');
    assert.equal(url.searchParams.get('grandeurPhysique'), 'PMA');

    node = createNode(baseConfig());
    result = await runNode(node, {
        payload: payload({
            type: 'puissance_conso_max_quotidienne',
            mesuresPas: 'P1M',
            grandeurPhysique: 'TOUT'
        })
    });
    assert.equal(result.err, undefined);

    url = new URL(lastRequest().url, 'http://localhost');
    assert.equal(url.searchParams.get('mesuresPas'), 'P1M');
    assert.equal(url.searchParams.get('grandeurPhysique'), 'TOUT');
});

test('falls back to the config node then to credentials', async () => {
    let node = createNode({ config: 'linked-config', token: '', prm: '' });
    let result = await runNode(node, { payload: payload({ type: 'index_consommation' }) });
    assert.equal(result.err, undefined);
    assert.equal(lastRequest().auth, 'Bearer config-token');

    node = createNode({
        token: '',
        prm: '',
        __credentials: { token: 'cred-token', prm: '12345678901234' }
    });
    result = await runNode(node, { payload: payload({ type: 'index_production' }) });
    assert.equal(result.err, undefined);
    assert.equal(lastRequest().auth, 'Bearer cred-token');
});

test('validates requests locally before calling the API', async () => {
    const cases = [
        [{ type: 'nope' }, /unknown api type/],
        [{ pointId: '123' }, /14 digits/],
        [{ dateDebut: '01/10/2026' }, /YYYY-MM-DD/],
        [{ dateDebut: '2026-10-02', dateFin: '2026-10-02' }, /before/],
        [{ dateDebut: '2026-10-03', dateFin: '2026-10-02' }, /before/],
        [{
            type: 'courbe_de_charge_consommation',
            dateDebut: '2026-10-01',
            dateFin: '2026-10-09'
        }, /limited to 7 days/],
        [{ type: 'puissance_conso_max_quotidienne', mesuresPas: 'P2D' }, /mesuresPas/]
    ];

    for (const [overrides, pattern] of cases) {
        const node = createNode(baseConfig());
        const { err } = await runNode(node, { payload: payload(overrides) });
        assert.match(String(err), pattern);
    }

    // Une semaine complète reste autorisée (dateFin exclue)
    const node = createNode(baseConfig());
    const { err } = await runNode(node, {
        payload: payload({
            type: 'courbe_de_charge_consommation',
            dateDebut: '2026-10-01',
            dateFin: '2026-10-08'
        })
    });
    assert.equal(err, undefined);
});

test('surfaces HTTP errors with the response body', async () => {
    const node = createNode(baseConfig());
    const { err } = await runNode(node, {
        payload: payload({ dateDebut: '2026-10-02', dateFin: '2026-10-03' })
    });

    assert.match(String(err), /statusCode 401/);
    assert.match(String(err), /token invalide/);
});

test('serves the cached response when the daily limit is reached', async () => {
    const node = createNode(baseConfig());
    const limitedPayload = payload({ type: 'production_quotidienne', options_api_daily_limit: 1 });

    const first = await runNode(node, { payload: { ...limitedPayload } });
    assert.equal(first.err, undefined);
    const requestCount = requests.length;

    const second = await runNode(node, { payload: { ...limitedPayload } });
    assert.equal(second.err, undefined);
    assert.equal(second.msg.payload.grandeur[0].points[0].v, '1000');
    assert.equal(requests.length, requestCount, 'no additional API call for a cached response');
});

test('normalizes whitespace and endpoint trailing slashes', async () => {
    const node = createNode(baseConfig());
    const firstPayload = payload({
        token: '  node-token  ',
        pointId: ' 12345678901234 ',
        dateDebut: ' 2026-10-01 ',
        dateFin: ' 2026-10-02 ',
        endpoint: `http://127.0.0.1:${port}/api///`,
        options_api_daily_limit: 1
    });

    const first = await runNode(node, { payload: firstPayload });
    assert.equal(first.err, undefined);
    assert.equal(lastRequest().auth, 'Bearer node-token');

    let url = new URL(lastRequest().url, 'http://localhost');
    assert.equal(url.pathname, '/api/consommation_quotidienne');
    assert.equal(url.searchParams.get('pointId'), '12345678901234');
    assert.equal(url.searchParams.get('dateDebut'), '2026-10-01');
    assert.equal(url.searchParams.get('dateFin'), '2026-10-02');

    const requestCount = requests.length;
    const secondPayload = payload({
        token: 'node-token',
        endpoint: `http://127.0.0.1:${port}/api`,
        options_api_daily_limit: 1
    });
    const second = await runNode(node, { payload: secondPayload });
    assert.equal(second.err, undefined);
    assert.equal(requests.length, requestCount, 'normalized endpoints share the same cache signature');
});