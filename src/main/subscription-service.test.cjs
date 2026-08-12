const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const fsp = require('node:fs/promises');
const zlib = require('node:zlib');
const { createSubscriptionService } = require('./subscription-service.cjs');

test('downloads with clash headers, handles gzip, persists nodes', async () => {
  const body = `proxies:
  - name: SG-1
    type: ss
    server: sg1.example.com
    port: 443
    cipher: aes-128-gcm
    password: secret
`;
  let seenHeaders = null;
  const server = http.createServer((req, res) => {
    seenHeaders = req.headers;
    res.writeHead(200, { 'content-type': 'text/yaml', 'content-encoding': 'gzip' });
    res.end(zlib.gzipSync(body));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}/sub?OwO=secret-token`;
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'sub-service-'));
  try {
    const service = createSubscriptionService(dir);
    const subscription = await service.addSubscription({ name: 'test', url });
    const refreshed = await service.refreshSubscription(subscription.id);
    assert.equal(refreshed.status, 'ok');
    assert.equal(refreshed.nodeCount, 1);
    assert.equal(seenHeaders['user-agent'], 'clash-verge/v2.5.2');
    assert.equal(seenHeaders.accept, '*/*');
    assert.equal(seenHeaders['accept-encoding'], 'gzip');
    const { nodes, selectedNodeId } = await service.listNodes();
    assert.equal(nodes.length, 1);
    assert.equal(nodes[0].name, 'SG-1');
    assert.equal(nodes[0].supported, true);
    await service.selectNode(nodes[0].id);
    assert.equal((await service.listNodes()).selectedNodeId, nodes[0].id);
    await service.removeSubscription(subscription.id);
    assert.equal((await service.listNodes()).nodes.length, 0);
  } finally {
    server.close();
    await fsp.rm(dir, { recursive: true, force: true });
  }
});

test('reports fetch errors on the subscription', async () => {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'sub-service-'));
  try {
    const service = createSubscriptionService(dir);
    const subscription = await service.addSubscription({ name: 'bad', url: 'http://127.0.0.1:1/sub' });
    await assert.rejects(() => service.refreshSubscription(subscription.id));
    const [after] = await service.listSubscriptions();
    assert.equal(after.status, 'error');
    assert.ok(after.error);
  } finally {
    await fsp.rm(dir, { recursive: true, force: true });
  }
});
