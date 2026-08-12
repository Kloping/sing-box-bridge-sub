const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { buildConfig } = require('./singbox.cjs');

test('builds a mixed unauthenticated local proxy from the default template', async () => {
  const nodes = [
    { id: 'node-1', type: 'ss', server: 'example.com', port: 443, proxyPort: 12080, raw: { cipher: 'chacha20-ietf-poly1305', password: 'secret' } },
    { id: 'node-2', type: 'ss', server: 'example.org', port: 443, proxyPort: 2081, raw: { cipher: 'aes-128-gcm', password: 'secret-2' } }
  ];
  const config = await buildConfig(nodes, path.join(__dirname, '..', 'test', 'config.json'));
  assert.deepEqual(config.inbounds, [
    { type: 'mixed', tag: 'mixed-in-1', listen: '127.0.0.1', listen_port: 12080 },
    { type: 'mixed', tag: 'mixed-in-2', listen: '127.0.0.1', listen_port: 2081 }
  ]);
  assert.equal(config.outbounds[0].type, 'shadowsocks');
  assert.equal(config.outbounds[0].password, 'secret');
  assert.equal(config.outbounds[1].server, 'example.org');
  assert.deepEqual(config.route.rules.slice(1), [
    { inbound: 'mixed-in-1', action: 'route', outbound: 'selected-node-1' },
    { inbound: 'mixed-in-2', action: 'route', outbound: 'selected-node-2' }
  ]);
  assert.equal(config.route.final, 'direct');
});
